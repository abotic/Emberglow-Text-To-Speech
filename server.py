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

from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

# --- Application State and Setup ---

# In-memory storage for projects and tasks. In a production scenario, this would be a database.
projects: Dict[str, Dict] = {}
tasks: Dict[str, Dict] = {}

STORAGE_DIR = "generated_audio"
CLONED_VOICES_DIR = "cloned_voices"
os.makedirs(STORAGE_DIR, exist_ok=True)
os.makedirs(CLONED_VOICES_DIR, exist_ok=True)

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

# --- Helper Functions ---

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


# --- UNIFIED Background Generation Logic ---

def do_longform_generation(task_id: str, messages: List[Message], initial_text: str, generation_params: dict):
    """
    Performs robust, chunked audio generation for any long-form text.
    This function now powers BOTH the Standard and Safe TTS tabs.
    """
    temp_files = []
    try:
        tasks[task_id]['status'] = 'processing'
        
        normalized_text = normalize_text_for_tts(initial_text)
        text_chunks = split_text_into_chunks(normalized_text)
        
        if not text_chunks:
             raise ValueError("Input text was empty after normalization.")

        audio_chunks = []
        
        # This will hold the path to the FIRST generated audio chunk, used as a fixed reference.
        fixed_reference_audio_path = None
        
        # --- Chunk 1: Establish the Voice Reference ---
        print(f"Generating chunk 1/{len(text_chunks)} for task {task_id} (establishing voice reference)...")
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

        # Save the first chunk's audio to a temporary file to act as the fixed reference.
        fixed_reference_audio_path = os.path.join(STORAGE_DIR, f"temp_{task_id}_ref.wav")
        sf.write(fixed_reference_audio_path, output.audio, serve_engine.audio_tokenizer.sampling_rate)
        temp_files.append(fixed_reference_audio_path)

        with open(fixed_reference_audio_path, "rb") as audio_file:
            audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')

        # This is now the ONLY reference that will be used for all subsequent chunks.
        fixed_reference_messages = [
            Message(role="user", content="Reference audio for voice cloning."),
            Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
        ]

        # --- Subsequent Chunks: Use the Fixed Reference ---
        for i, chunk in enumerate(text_chunks[1:], start=2):
            print(f"Generating chunk {i}/{len(text_chunks)} for task {task_id}...")

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

        # --- Finalization ---
        final_audio = np.concatenate(audio_chunks)
        output_filename = f"{task_id}.wav"
        output_path = os.path.join(STORAGE_DIR, output_filename)
        sf.write(output_path, final_audio, serve_engine.audio_tokenizer.sampling_rate)

        tasks[task_id]['status'] = 'completed'
        tasks[task_id]['result_path'] = output_filename

    except Exception as e:
        print(f"Error during audio generation for task {task_id}: {e}")
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)
    finally:
        # Clean up the temporary reference file
        for f in temp_files:
            if os.path.exists(f):
                os.remove(f)

def do_project_chunk_generation(project_id: str, chunk_index: int):
    """Generates audio for a single chunk of a project for the 'Safe Long-Form' tab."""
    project = projects.get(project_id)
    if not project: return
        
    chunk = project['chunks'][chunk_index]
    chunk['status'] = 'processing'
    
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

        chunk['status'] = 'completed'
        chunk['audio_filename'] = chunk_filename
    except Exception as e:
        print(f"Error generating chunk {chunk_index} for project {project_id}: {e}")
        chunk['status'] = 'failed'
        chunk['error'] = str(e)


# --- API Endpoints ---

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
        "id": project_id, "status": "processing",
        "params": {"temperature": temperature, "top_p": top_p},
        "chunks": [{"index": i, "text": chunk, "status": "pending"} for i, chunk in enumerate(text_chunks)],
        "voice_ref_path": None, "final_audio_path": None
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
    return projects.get(project_id, HTTPException(status_code=404, detail="Project not found"))

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
    if not project: raise HTTPException(status_code=404, detail="Project not found")

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
    metadata = {"id": voice_id, "name": voice_name}
    json_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.json")
    with open(json_path, 'w') as f:
        json.dump(metadata, f)
    return metadata

@app.get("/audio/{filename}", tags=["Audio"])
async def get_audio_file(filename: str):
    path = os.path.join(STORAGE_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="audio/wav")

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
    tasks[task_id] = {"status": "processing"}

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
    # THIS IS THE FIX: Call the robust, unified generation function
    background_tasks.add_task(do_longform_generation, task_id, initial_messages, text, generation_params)
    
    return {"task_id": task_id, "status": "processing"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
