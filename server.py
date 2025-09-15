import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import torch
import soundfile as sf
import os
import uuid
import json
import base64
import re
import numpy as np
from typing import List, Dict
import time
from datetime import datetime

from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

# Application State and Setup
projects: Dict[str, Dict] = {}
tasks: Dict[str, Dict] = {}
saved_audio: Dict[str, Dict] = {}

STORAGE_DIR = "generated_audio"
CLONED_VOICES_DIR = "cloned_voices"
SAVED_AUDIO_DIR = "saved_audio"
os.makedirs(STORAGE_DIR, exist_ok=True)
os.makedirs(CLONED_VOICES_DIR, exist_ok=True)
os.makedirs(SAVED_AUDIO_DIR, exist_ok=True)

SAVED_AUDIO_METADATA_FILE = "saved_audio_metadata.json"
if os.path.exists(SAVED_AUDIO_METADATA_FILE):
    try:
        with open(SAVED_AUDIO_METADATA_FILE, 'r') as f:
            saved_audio = json.load(f)
    except Exception as e:
        print(f"Could not load saved audio metadata: {e}")

def save_audio_metadata():
    try:
        with open(SAVED_AUDIO_METADATA_FILE, 'w') as f:
            json.dump(saved_audio, f, indent=2)
    except Exception as e:
        print(f"Could not save audio metadata: {e}")

app = FastAPI(title="Higgs Audio Generation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Initializing HiggsAudioServeEngine...")
device = "cpu"
serve_engine = HiggsAudioServeEngine(
    "bosonai/higgs-audio-v2-generation-3B-base",
    "bosonai/higgs-audio-v2-tokenizer",
    device=device,
)
print(f"Model loaded and running on device: {device}")

def normalize_text_for_tts(text: str) -> str:
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def split_text_into_chunks(text: str, words_per_chunk: int = 250):
    sentences = re.split(r'(?<=[.?!])\s+', text)
    chunks = []
    current_chunk = ""
    for sentence in sentences:
        if len(current_chunk.split()) + len(sentence.split()) > words_per_chunk and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = sentence
        else:
            current_chunk += " " + sentence
    if current_chunk:
        chunks.append(current_chunk.strip())
    return [c.strip() for c in chunks if c.strip()]

def update_task_progress(task_id: str, current_chunk: int, total_chunks: int, status: str = "processing"):
    if task_id in tasks:
        tasks[task_id].update({
            'current_chunk': current_chunk,
            'total_chunks': total_chunks,
            'progress_percent': int((current_chunk / total_chunks) * 100) if total_chunks > 0 else 0,
            'status': status
        })

def update_project_progress(project_id: str):
    project = projects.get(project_id)
    if not project:
        return
    
    completed_chunks = sum(1 for chunk in project['chunks'] if chunk['status'] == 'completed')
    total_chunks = len(project['chunks'])
    progress_percent = int((completed_chunks / total_chunks) * 100) if total_chunks > 0 else 0
    
    project.update({
        'completed_chunks': completed_chunks,
        'total_chunks': total_chunks,
        'progress_percent': progress_percent
    })

def do_longform_generation(task_id: str, messages: List[Message], initial_text: str, generation_params: dict):
    temp_files = []
    start_time = time.time()
    try:
        tasks[task_id]['status'] = 'processing'
        tasks[task_id]['start_time'] = start_time
        
        normalized_text = normalize_text_for_tts(initial_text)
        text_chunks = split_text_into_chunks(normalized_text)
        
        if not text_chunks:
             raise ValueError("Input text was empty after normalization.")

        total_chunks = len(text_chunks)
        update_task_progress(task_id, 0, total_chunks, "processing")
        print(f"Starting generation for task {task_id}: {total_chunks} chunks")

        audio_chunks = []
        fixed_reference_audio_path = None
        
        print(f"Generating chunk 1/{total_chunks} for task {task_id} (establishing voice reference)...")
        update_task_progress(task_id, 1, total_chunks, "processing")
        
        first_chunk_messages = messages + [Message(role="user", content=text_chunks[0])]
        chat_ml_sample = ChatMLSample(messages=first_chunk_messages)
        
        output = serve_engine.generate(
            chat_ml_sample=chat_ml_sample,
            max_new_tokens=8192,
            stop_strings=["<|end_of_text|>", "<|eot_id|>"],
            **generation_params
        )

        if output.audio is None or len(output.audio) == 0:
            raise ValueError("Audio generation for the first chunk failed. Cannot proceed.")

        audio_chunks.append(output.audio)

        fixed_reference_audio_path = os.path.join(STORAGE_DIR, f"temp_{task_id}_ref.wav")
        sf.write(fixed_reference_audio_path, output.audio, serve_engine.audio_tokenizer.sampling_rate)
        temp_files.append(fixed_reference_audio_path)

        with open(fixed_reference_audio_path, "rb") as audio_file:
            audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')

        fixed_reference_messages = [
            Message(role="user", content="Reference audio for voice cloning."),
            Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
        ]

        for i, chunk in enumerate(text_chunks[1:], start=2):
            print(f"Generating chunk {i}/{total_chunks} for task {task_id}...")
            update_task_progress(task_id, i, total_chunks, "processing")

            current_messages = fixed_reference_messages + [Message(role="user", content=chunk)]
            chat_ml_sample = ChatMLSample(messages=current_messages)
            
            output = serve_engine.generate(
                chat_ml_sample=chat_ml_sample,
                max_new_tokens=8192,
                stop_strings=["<|end_of_text|>", "<|eot_id|>"],
                **generation_params
            )

            if output.audio is not None and len(output.audio) > 0:
                audio_chunks.append(output.audio)
            else:
                print(f"Warning: Chunk {i} produced no audio.")

        print(f"Finalizing audio for task {task_id}...")
        update_task_progress(task_id, total_chunks, total_chunks, "finalizing")
        
        final_audio = np.concatenate(audio_chunks)
        output_filename = f"{task_id}.wav"
        output_path = os.path.join(STORAGE_DIR, output_filename)
        sf.write(output_path, final_audio, serve_engine.audio_tokenizer.sampling_rate)

        elapsed_time = time.time() - start_time
        tasks[task_id]['status'] = 'completed'
        tasks[task_id]['result_path'] = output_filename
        tasks[task_id]['elapsed_time'] = elapsed_time
        tasks[task_id]['progress_percent'] = 100
        
        print(f"Task {task_id} completed in {elapsed_time:.2f} seconds")

    except Exception as e:
        print(f"Error during audio generation for task {task_id}: {e}")
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)
        tasks[task_id]['elapsed_time'] = time.time() - start_time
    finally:
        for f in temp_files:
            if os.path.exists(f):
                os.remove(f)

def do_project_chunk_generation(project_id: str, chunk_index: int):
    project = projects.get(project_id)
    if not project: 
        return
        
    chunk = project['chunks'][chunk_index]
    chunk['status'] = 'processing'
    chunk['start_time'] = time.time()
    
    print(f"Generating chunk {chunk_index + 1}/{len(project['chunks'])} for project {project_id}")
    
    try:
        messages = []
        voice_ref_path = project.get("voice_ref_path")
        
        if voice_ref_path and os.path.exists(voice_ref_path):
            with open(voice_ref_path, "rb") as audio_file:
                audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
            messages.extend([
                Message(role="user", content="Reference audio for voice cloning."),
                Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
            ])
        
        messages.append(Message(role="user", content=chunk['text']))
        chat_ml_sample = ChatMLSample(messages=messages)

        output = serve_engine.generate(
            chat_ml_sample=chat_ml_sample, max_new_tokens=8192,
            stop_strings=["<|end_of_text|>", "<|eot_id|>"],
            temperature=project['params']['temperature'], top_p=project['params']['top_p']
        )

        if output.audio is None or len(output.audio) == 0:
            raise ValueError("Model produced no audio for this chunk.")

        chunk_filename = f"{project_id}_chunk_{chunk_index}.wav"
        chunk_path = os.path.join(STORAGE_DIR, chunk_filename)
        sf.write(chunk_path, output.audio, serve_engine.audio_tokenizer.sampling_rate)

        elapsed_time = time.time() - chunk['start_time']
        chunk['status'] = 'completed'
        chunk['audio_filename'] = chunk_filename
        chunk['elapsed_time'] = elapsed_time
        
        update_project_progress(project_id)
        
        print(f"Chunk {chunk_index + 1} completed in {elapsed_time:.2f} seconds")
        
    except Exception as e:
        print(f"Error generating chunk {chunk_index} for project {project_id}: {e}")
        elapsed_time = time.time() - chunk['start_time']
        chunk['status'] = 'failed'
        chunk['error'] = str(e)
        chunk['elapsed_time'] = elapsed_time

@app.post("/project", status_code=202, tags=["Project"])
async def create_project(
    background_tasks: BackgroundTasks, text: str = Form(...), voice_id: str = Form(...),
    temperature: float = Form(0.3), top_p: float = Form(0.95),
):
    project_id = f"proj_{uuid.uuid4().hex}"
    normalized_text = normalize_text_for_tts(text)
    text_chunks = split_text_into_chunks(normalized_text)

    if not text_chunks:
        raise HTTPException(status_code=400, detail="Input text is too short to create a project.")

    projects[project_id] = {
        "id": project_id, 
        "status": "processing",
        "start_time": time.time(),
        "params": {"temperature": temperature, "top_p": top_p},
        "chunks": [{"index": i, "text": chunk, "status": "pending"} for i, chunk in enumerate(text_chunks)],
        "voice_ref_path": None, 
        "final_audio_path": None,
        "completed_chunks": 0,
        "total_chunks": len(text_chunks),
        "progress_percent": 0
    }

    voice_ref_path = None
    if voice_id != "smart_voice":
        voice_ref_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
        if not os.path.exists(voice_ref_path):
            raise HTTPException(status_code=404, detail="Cloned voice sample not found.")
        projects[project_id]["voice_ref_path"] = voice_ref_path

    do_project_chunk_generation(project_id, 0)
    
    if voice_id == "smart_voice":
        first_chunk_path = projects[project_id]['chunks'][0].get('audio_filename')
        if first_chunk_path:
             projects[project_id]["voice_ref_path"] = os.path.join(STORAGE_DIR, first_chunk_path)
        else:
            projects[project_id].update({'status': 'failed', 'error': 'Failed to generate initial chunk for Smart Voice.'})
            return {"project_id": project_id, "status": "failed"}

    for i in range(1, len(text_chunks)):
        background_tasks.add_task(do_project_chunk_generation, project_id, i)

    return {"project_id": project_id, "status": "processing"}

@app.get("/project/{project_id}", tags=["Project"])
async def get_project_status(project_id: str):
    project = projects.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.post("/project/{project_id}/chunk/{chunk_index}/regenerate", status_code=202, tags=["Project"])
async def regenerate_chunk(project_id: str, chunk_index: int, background_tasks: BackgroundTasks):
    project = projects.get(project_id)
    if not project or chunk_index >= len(project['chunks']):
        raise HTTPException(status_code=404, detail="Project or chunk not found")
    
    if chunk_index == 0 and project.get('voice_ref_path', '').endswith("_chunk_0.wav"):
         raise HTTPException(status_code=400, detail="Cannot regenerate the reference chunk for a Smart Voice project.")

    background_tasks.add_task(do_project_chunk_generation, project_id, chunk_index)
    return {"message": f"Regeneration started for chunk {chunk_index}."}

@app.post("/project/{project_id}/stitch", tags=["Project"])
async def stitch_project_audio(project_id: str):
    project = projects.get(project_id)
    if not project: 
        raise HTTPException(status_code=404, detail="Project not found")

    audio_chunks = []
    for chunk in sorted(project['chunks'], key=lambda x: x['index']):
        if chunk['status'] != 'completed' or 'audio_filename' not in chunk:
            raise HTTPException(status_code=400, detail=f"Chunk {chunk['index'] + 1} is not ready.")
        
        chunk_path = os.path.join(STORAGE_DIR, chunk['audio_filename'])
        audio_data, _ = sf.read(chunk_path)
        audio_chunks.append(audio_data)

    final_audio = np.concatenate(audio_chunks)
    final_filename = f"{project_id}_final.wav"
    final_path = os.path.join(STORAGE_DIR, final_filename)
    
    # Fixed: Correct parameter order for soundfile.write
    sf.write(final_path, final_audio, serve_engine.audio_tokenizer.sampling_rate)
    
    project.update({'final_audio_path': final_filename, 'status': 'complete'})
    return {"final_audio_filename": final_filename}

@app.get("/voices", tags=["Voices"])
async def get_voices():
    default_voices = [{"id": "smart_voice", "name": "Smart Voice (Auto)"}]
    cloned_voices = []
    for filename in os.listdir(CLONED_VOICES_DIR):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(CLONED_VOICES_DIR, filename), 'r') as f:
                    cloned_voices.append(json.load(f))
            except Exception as e:
                print(f"Could not load voice metadata {filename}: {e}")
    return default_voices + cloned_voices

@app.post("/clone-voice", tags=["Voices"])
async def clone_voice(voice_sample: UploadFile = File(...), voice_name: str = Form(...)):
    voice_id = f"clone_{uuid.uuid4().hex[:8]}"
    wav_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
    with open(wav_path, "wb") as buffer:
        buffer.write(await voice_sample.read())
    metadata = {"id": voice_id, "name": voice_name, "tags": ["cloned"]}
    json_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.json")
    with open(json_path, 'w') as f:
        json.dump(metadata, f)
    return metadata

@app.post("/generate/test-clone", tags=["Voices"])
async def test_cloned_voice(
    voice_sample: UploadFile = File(...),
    text: str = Form("This is a test of my cloned voice."),
    temperature: float = Form(0.3)
):
    try:
        temp_filename = f"temp_test_{uuid.uuid4().hex[:8]}.wav"
        temp_path = os.path.join(STORAGE_DIR, temp_filename)
        
        with open(temp_path, "wb") as buffer:
            buffer.write(await voice_sample.read())
        
        with open(temp_path, "rb") as audio_file:
            audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
        
        messages = [
            Message(role="user", content="Reference audio for voice cloning."),
            Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
            Message(role="user", content=text)
        ]
        
        chat_ml_sample = ChatMLSample(messages=messages)
        output = serve_engine.generate(
            chat_ml_sample=chat_ml_sample,
            max_new_tokens=8192,
            stop_strings=["<|end_of_text|>", "<|eot_id|>"],
            temperature=temperature,
            top_p=0.95
        )
        
        if output.audio is None or len(output.audio) == 0:
            raise ValueError("No audio generated")
        
        test_filename = f"test_{uuid.uuid4().hex[:8]}.wav"
        test_path = os.path.join(STORAGE_DIR, test_filename)
        sf.write(test_path, output.audio, serve_engine.audio_tokenizer.sampling_rate)
        
        os.remove(temp_path)
        
        return FileResponse(test_path, media_type="audio/wav")
        
    except Exception as e:
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Voice test failed: {str(e)}")

@app.get("/audio/{filename}", tags=["Audio"])
async def get_audio_file(filename: str):
    for directory in [STORAGE_DIR, SAVED_AUDIO_DIR]:
        path = os.path.join(directory, filename)
        if os.path.exists(path):
            return FileResponse(path, media_type="audio/wav")
    
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/generation-status/{task_id}", tags=["Legacy"])
async def get_generation_status(task_id: str):
    task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.post("/generate/speech/oneshot", status_code=202, tags=["Legacy"])
async def generate_speech_oneshot(
    background_tasks: BackgroundTasks, text: str = Form(...), voice_id: str = Form(...),
    temperature: float = Form(0.3), top_p: float = Form(0.95)
):
    task_id = f"gen_{uuid.uuid4().hex}"
    tasks[task_id] = {"status": "processing", "current_chunk": 0, "total_chunks": 0, "progress_percent": 0}

    initial_messages = []
    if voice_id != "smart_voice":
        ref_audio_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
        if not os.path.exists(ref_audio_path):
            raise HTTPException(status_code=404, detail="Cloned voice sample not found.")
        with open(ref_audio_path, "rb") as audio_file:
            audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
        initial_messages.extend([
            Message(role="user", content="Reference audio for voice cloning."),
            Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
        ])
    
    generation_params = {"temperature": temperature, "top_p": top_p}
    background_tasks.add_task(do_longform_generation, task_id, initial_messages, text, generation_params)
    
    return {"task_id": task_id, "status": "processing"}

@app.post("/saved-audio", tags=["Saved Audio"])
async def save_generated_audio(
    audio_filename: str = Form(...),
    display_name: str = Form(...),
    audio_type: str = Form("standard")
):
    source_path = os.path.join(STORAGE_DIR, audio_filename)
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Source audio file not found")
    
    saved_id = f"saved_{uuid.uuid4().hex[:8]}"
    saved_filename = f"{saved_id}.wav"
    saved_path = os.path.join(SAVED_AUDIO_DIR, saved_filename)
    
    import shutil
    shutil.copy2(source_path, saved_path)
    
    metadata = {
        "id": saved_id,
        "filename": saved_filename,
        "display_name": display_name,
        "audio_type": audio_type,
        "created_at": datetime.now().isoformat(),
        "source_filename": audio_filename
    }
    
    saved_audio[saved_id] = metadata
    save_audio_metadata()
    
    return metadata

@app.get("/saved-audio", tags=["Saved Audio"])
async def get_saved_audio():
    return list(saved_audio.values())

@app.delete("/saved-audio/{saved_id}", tags=["Saved Audio"])
async def delete_saved_audio(saved_id: str):
    if saved_id not in saved_audio:
        raise HTTPException(status_code=404, detail="Saved audio not found")
    
    filename = saved_audio[saved_id]["filename"]
    file_path = os.path.join(SAVED_AUDIO_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    del saved_audio[saved_id]
    save_audio_metadata()
    
    return {"message": "Audio deleted successfully"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)