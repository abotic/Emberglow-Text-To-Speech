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
import shutil

from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

# --- Application State and Setup ---
projects: Dict[str, Dict] = {}
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

# --- Model Initialization with Auto Device Detection ---
print("Initializing HiggsAudioServeEngine...")

# Auto-detect best available device (CUDA for NVIDIA GPUs, MPS for Apple Silicon, CPU as fallback)
if torch.cuda.is_available():
    device = "cuda"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"

print(f"Auto-detected device: {device}")

serve_engine = HiggsAudioServeEngine(
    "bosonai/higgs-audio-v2-generation-3B-base",
    "bosonai/higgs-audio-v2-tokenizer",
    device=device,
)
print(f"Model loaded and running on device: {serve_engine.device}")


# --- Helper Functions ---
def normalize_text_for_tts(text: str) -> str:
    text = re.sub(r'\s+', ' ', text).strip()
    # Add more normalization rules here if needed
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

def update_project_progress(project_id: str, status_override: str = None):
    project = projects.get(project_id)
    if not project:
        return
    
    completed_chunks = sum(1 for chunk in project['chunks'] if chunk['status'] == 'completed')
    total_chunks = len(project['chunks'])
    progress_percent = int((completed_chunks / total_chunks) * 100) if total_chunks > 0 else 0
    
    update_data = {
        'completed_chunks': completed_chunks,
        'total_chunks': total_chunks,
        'progress_percent': progress_percent
    }
    if status_override:
        update_data['status'] = status_override

    project.update(update_data)


# --- Core Generation Logic (Sequential & Context-Aware) ---
def process_project_generation(project_id: str):
    project = projects.get(project_id)
    if not project:
        print(f"Project {project_id} not found for generation.")
        return

    print(f"Starting sequential generation for project {project_id}")
    project['status'] = 'processing'

    context_messages = []
    # Load initial voice reference if not a "Smart Voice" project
    if not project.get("is_smart_voice") and project.get("voice_ref_path") and os.path.exists(project["voice_ref_path"]):
        with open(project["voice_ref_path"], "rb") as audio_file:
            audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
        context_messages.extend([
            Message(role="user", content="Reference audio for voice cloning."),
            Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))
        ])

    temp_files_to_clean = []

    try:
        for i in range(len(project['chunks'])):
            chunk = project['chunks'][i]
            chunk['status'] = 'processing'
            chunk['start_time'] = time.time()
            update_project_progress(project_id)
            
            print(f"Generating chunk {i + 1}/{len(project['chunks'])} for project {project_id}")
            
            try:
                # Build messages for this chunk: context + current text
                messages_for_chunk = context_messages + [Message(role="user", content=chunk['text'])]
                chat_ml_sample = ChatMLSample(messages=messages_for_chunk)

                output = serve_engine.generate(
                    chat_ml_sample=chat_ml_sample,
                    max_new_tokens=8192,
                    stop_strings=["<|end_of_text|>", "<|eot_id|>"],
                    temperature=project['params']['temperature'],
                    top_p=project['params']['top_p'],
                    seed=42  # Fixed seed for deterministic and consistent voice
                )

                if output.audio is None or len(output.audio) == 0:
                    raise ValueError("Model produced no audio for this chunk.")

                chunk_filename = f"{project_id}_chunk_{i}.wav"
                chunk_path = os.path.join(STORAGE_DIR, chunk_filename)
                sf.write(chunk_path, output.audio, serve_engine.audio_tokenizer.sampling_rate)

                elapsed_time = time.time() - chunk['start_time']
                chunk.update({
                    'status': 'completed',
                    'audio_filename': chunk_filename,
                    'elapsed_time': elapsed_time
                })
                
                # CRITICAL: Add generated audio to the context for the next chunk
                with open(chunk_path, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                
                context_messages.append(Message(role="user", content=chunk['text']))
                context_messages.append(Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")))
                
                # Special handling for "Smart Voice": first chunk becomes the exclusive voice reference
                if i == 0 and project.get("is_smart_voice"):
                    project["voice_ref_path"] = chunk_path
                    temp_ref_path = os.path.join(STORAGE_DIR, f"temp_ref_{project_id}.wav")
                    shutil.copy2(chunk_path, temp_ref_path)
                    temp_files_to_clean.append(temp_ref_path)

                    # Now, reset the context to ONLY use this newly generated voice reference
                    with open(temp_ref_path, "rb") as audio_file:
                        ref_audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                    context_messages = [
                        Message(role="user", content="Reference audio for voice cloning."),
                        Message(role="assistant", content=AudioContent(raw_audio=ref_audio_base64, audio_url="placeholder"))
                    ]
                
            except Exception as e:
                print(f"Error generating chunk {i} for project {project_id}: {e}")
                elapsed_time = time.time() - chunk['start_time']
                chunk.update({
                    'status': 'failed', 'error': str(e), 'elapsed_time': elapsed_time
                })
                # For "Standard TTS", we fail the whole project if one chunk fails
                if project.get('is_oneshot'):
                    raise e
            finally:
                update_project_progress(project_id)
                print(f"Chunk {i + 1} finished with status: {chunk['status']}")

        # Finalize project status
        project['status'] = 'completed' if all(c['status'] == 'completed' for c in project['chunks']) else 'review'
        
        # If it was a "Standard TTS" (oneshot), stitch and finalize automatically
        if project.get('is_oneshot') and project['status'] == 'completed':
            print(f"Oneshot project {project_id} completed, now stitching...")
            final_audio_path = stitch_project_audio_internal(project_id)
            project['final_audio_path'] = final_audio_path
            project['elapsed_time'] = time.time() - project['start_time']

    except Exception as e:
        print(f"Project {project_id} failed catastrophically: {e}")
        project['status'] = 'failed'
        project['error'] = str(e)
        project['elapsed_time'] = time.time() - project['start_time']
    
    finally:
        for f in temp_files_to_clean:
            if os.path.exists(f):
                os.remove(f)
        print(f"Generation task for project {project_id} finished with final status: {project['status']}")


def stitch_project_audio_internal(project_id: str) -> str:
    project = projects.get(project_id)
    if not project:
        raise ValueError("Project not found for stitching")

    audio_chunks_data = []
    for chunk in sorted(project['chunks'], key=lambda x: x['index']):
        if chunk['status'] != 'completed' or 'audio_filename' not in chunk:
            raise ValueError(f"Chunk {chunk['index'] + 1} is not ready.")
        
        chunk_path = os.path.join(STORAGE_DIR, chunk['audio_filename'])
        if not os.path.exists(chunk_path):
            raise FileNotFoundError(f"Audio file for chunk {chunk['index'] + 1} not found.")
        
        audio_data, _ = sf.read(chunk_path)
        audio_chunks_data.append(audio_data)

    final_audio = np.concatenate(audio_chunks_data)
    final_filename = f"{project_id}_final.wav"
    final_path = os.path.join(STORAGE_DIR, final_filename)
    sf.write(final_path, final_audio, serve_engine.audio_tokenizer.sampling_rate)
    return final_filename


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

    is_smart_voice = (voice_id == "smart_voice")
    voice_ref_path = None
    if not is_smart_voice:
        voice_ref_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
        if not os.path.exists(voice_ref_path):
            raise HTTPException(status_code=404, detail="Cloned voice sample not found.")

    projects[project_id] = {
        "id": project_id,
        "status": "pending",
        "start_time": time.time(),
        "params": {"temperature": temperature, "top_p": top_p},
        "chunks": [{"index": i, "text": chunk, "status": "pending"} for i, chunk in enumerate(text_chunks)],
        "voice_ref_path": voice_ref_path,
        "is_smart_voice": is_smart_voice,
        "is_oneshot": False, # This is a project for review
    }
    
    background_tasks.add_task(process_project_generation, project_id)
    return {"project_id": project_id, "status": "processing"}


@app.get("/project/{project_id}", tags=["Project"])
async def get_project_status(project_id: str):
    project = projects.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.post("/project/{project_id}/stitch", tags=["Project"])
async def stitch_project_audio(project_id: str):
    try:
        final_filename = stitch_project_audio_internal(project_id)
        projects[project_id].update({'final_audio_path': final_filename, 'status': 'stitched'})
        return {"final_audio_filename": final_filename}
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/generate/speech/oneshot", status_code=202, tags=["Standard TTS"])
async def generate_speech_oneshot(
    background_tasks: BackgroundTasks, text: str = Form(...), voice_id: str = Form(...),
    temperature: float = Form(0.3), top_p: float = Form(0.95)
):
    # This endpoint now also uses the robust project system under the hood
    project_id = f"gen_{uuid.uuid4().hex}"
    normalized_text = normalize_text_for_tts(text)
    text_chunks = split_text_into_chunks(normalized_text)

    if not text_chunks:
        raise HTTPException(status_code=400, detail="Input text is too short.")

    is_smart_voice = (voice_id == "smart_voice")
    voice_ref_path = None
    if not is_smart_voice:
        voice_ref_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
        if not os.path.exists(voice_ref_path):
            raise HTTPException(status_code=404, detail="Cloned voice sample not found.")

    # Create a project that will be auto-finalized
    projects[project_id] = {
        "id": project_id,
        "status": "pending",
        "start_time": time.time(),
        "params": {"temperature": temperature, "top_p": top_p},
        "chunks": [{"index": i, "text": chunk, "status": "pending"} for i, chunk in enumerate(text_chunks)],
        "voice_ref_path": voice_ref_path,
        "is_smart_voice": is_smart_voice,
        "is_oneshot": True, # Mark for auto-stitching
        # Compatibility fields for frontend polling
        "result_path": None, 
    }
    
    background_tasks.add_task(process_project_generation, project_id)
    return {"task_id": project_id, "status": "processing"}


@app.get("/generation-status/{task_id}", tags=["Standard TTS"])
async def get_generation_status(task_id: str):
    # This now polls the projects dictionary
    task = projects.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Adapt project structure to legacy task structure for frontend compatibility
    if task.get('final_audio_path'):
        task['result_path'] = task['final_audio_path']

    return task


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
    temp_path = None
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
            top_p=0.95,
            seed=42 # Use seed for consistent testing
        )
        
        if output.audio is None or len(output.audio) == 0:
            raise ValueError("No audio generated")
        
        test_filename = f"test_{uuid.uuid4().hex[:8]}.wav"
        test_path = os.path.join(STORAGE_DIR, test_filename)
        sf.write(test_path, output.audio, serve_engine.audio_tokenizer.sampling_rate)
        
        return FileResponse(test_path, media_type="audio/wav", background=lambda: os.remove(test_path))
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice test failed: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/audio/{filename}", tags=["Audio"])
async def get_audio_file(filename: str):
    for directory in [STORAGE_DIR, SAVED_AUDIO_DIR]:
        path = os.path.join(directory, filename)
        if os.path.exists(path):
            return FileResponse(path, media_type="audio/wav")
    
    raise HTTPException(status_code=404, detail="File not found")

# --- Saved Audio Management ---
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