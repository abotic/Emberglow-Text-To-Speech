import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import torch
import soundfile as sf
import os
import uuid
import json
import base64
import re
import numpy as np
from typing import Dict
import time
from datetime import datetime
import shutil

from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

# --- Application State and Setup ---
saved_audio: Dict[str, Dict] = {}
STORAGE_DIR, CLONED_VOICES_DIR, SAVED_AUDIO_DIR, PROJECTS_DIR = "generated_audio", "cloned_voices", "saved_audio", "projects"
for d in [STORAGE_DIR, CLONED_VOICES_DIR, SAVED_AUDIO_DIR, PROJECTS_DIR]:
    os.makedirs(d, exist_ok=True)

SAVED_AUDIO_METADATA_FILE = "saved_audio_metadata.json"
if os.path.exists(SAVED_AUDIO_METADATA_FILE):
    try:
        with open(SAVED_AUDIO_METADATA_FILE, 'r') as f: saved_audio = json.load(f)
    except Exception as e: print(f"Could not load saved audio metadata: {e}")

def save_audio_metadata():
    try:
        with open(SAVED_AUDIO_METADATA_FILE, 'w') as f: json.dump(saved_audio, f, indent=2)
    except Exception as e: print(f"Could not save audio metadata: {e}")

app = FastAPI(title="Higgs Audio Generation API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- Model Initialization ---
print("Initializing HiggsAudioServeEngine...")
if torch.cuda.is_available():
    device = "cuda"
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    torch.backends.cudnn.benchmark = True
    torch.set_float32_matmul_precision('high')
    print(f"CUDA device detected with optimizations enabled")
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"

print(f"Auto-detected device: {device}")
serve_engine = HiggsAudioServeEngine("bosonai/higgs-audio-v2-generation-3B-base", "bosonai/higgs-audio-v2-tokenizer", device=device)
print(f"Model loaded and running on device: {serve_engine.device}")

# --- Helper Functions ---
def normalize_text_for_tts(text: str) -> str: return re.sub(r'\s+', ' ', text).strip()

def split_text_into_chunks(text: str, words_per_chunk: int = 100):
    sentences, chunks, current_chunk = re.split(r'(?<=[.?!])\s+', text), [], ""
    for sentence in sentences:
        if len(current_chunk.split()) + len(sentence.split()) > words_per_chunk and current_chunk:
            chunks.append(current_chunk.strip()); current_chunk = sentence
        else: current_chunk = (current_chunk + " " + sentence).strip()
    if current_chunk: chunks.append(current_chunk.strip())
    return [c for c in chunks if c]

def update_project_progress(project: Dict):
    if not project: return
    completed = sum(1 for c in project['chunks'] if c['status'] == 'completed')
    total = len(project['chunks'])
    project.update({'completed_chunks': completed, 'total_chunks': total, 'progress_percent': int((completed / total) * 100) if total > 0 else 0})

def cleanup_project_data(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    print(f"Starting cleanup for project {project_id}...")
    try:
        if not os.path.exists(project_path): return
        with open(project_path, 'r') as f: project = json.load(f)
        for chunk in project.get('chunks', []):
            if filename := chunk.get('audio_filename'):
                file_path = os.path.join(STORAGE_DIR, filename)
                if os.path.exists(file_path):
                    try: os.remove(file_path)
                    except Exception as e: print(f"Error deleting chunk {file_path}: {e}")
        os.remove(project_path)
        print(f"Cleaned up project {project_id} successfully.")
    except Exception as e: print(f"Error during cleanup for project {project_id}: {e}")

# --- Core Generation Logic ---
def generate_single_chunk(chunk_text: str, temperature: float, top_p: float, context_messages: list):
    output = serve_engine.generate(
        chat_ml_sample=ChatMLSample(messages=context_messages + [Message(role="user", content=chunk_text)]),
        max_new_tokens=len(chunk_text) // 3 + min(2000, (len(chunk_text) // 3) * 10) + 256,
        stop_strings=["<|end_of_text|>", "<|eot_id|>"], temperature=temperature, top_p=top_p
    )
    if output.audio is None or len(output.audio) == 0: raise ValueError("Model produced no audio.")
    return output.audio

def get_context_messages(project, chunk_index: int = 0):
    """Get appropriate context messages for a chunk based on project settings"""
    context_messages = []
    is_smart_voice = project.get("is_smart_voice", False)
    
    if is_smart_voice:
        # For smart voice, use the first completed chunk as reference (if available)
        # or the stored voice_ref_path for chunk 0 after it's completed
        if chunk_index == 0:
            # For first chunk, check if we have a stored reference from previous generation
            ref_path = project.get("voice_ref_path")
            if ref_path and os.path.exists(ref_path):
                with open(ref_path, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                context_messages = [Message(role="user", content="Reference audio"), 
                                  Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]
        else:
            # For subsequent chunks, use the first chunk as reference
            first_chunk = project['chunks'][0]
            if first_chunk.get('status') == 'completed' and first_chunk.get('audio_filename'):
                first_chunk_path = os.path.join(STORAGE_DIR, first_chunk['audio_filename'])
                if os.path.exists(first_chunk_path):
                    with open(first_chunk_path, "rb") as audio_file:
                        audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                    context_messages = [Message(role="user", content="Reference audio"), 
                                      Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]
    else:
        # For regular cloned voices, use the original voice file
        if ref_path := project.get("voice_ref_path"):
            if os.path.exists(ref_path):
                with open(ref_path, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                context_messages = [Message(role="user", content="Reference audio"), 
                                  Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]
    
    return context_messages

def process_project_generation(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    try:
        with open(project_path, 'r') as f:
            project = json.load(f)

        num_chunks = len(project.get('chunks', []))
        is_smart_voice = project.get("is_smart_voice", False)

        for i in range(num_chunks):
            # Check for cancellation before starting work on a chunk
            with open(project_path, 'r') as f:
                current_status = json.load(f).get('status')
            if current_status == 'cancelling':
                print(f"Cancellation detected for project {project_id}. Stopping.")
                cleanup_project_data(project_id)
                return

            chunk = project['chunks'][i]
            if chunk.get('status') == 'completed':
                continue

            print(f"Starting generation for chunk {i+1}/{num_chunks} of project {project_id}")
            
            # Update the status of the chunk IN MEMORY
            chunk.update({'status': 'processing', 'start_time': time.time()})

            try:
                # Get appropriate context messages for this chunk
                context_messages = get_context_messages(project, i)
                
                audio_data = generate_single_chunk(chunk['text'], project['params']['temperature'], project['params']['top_p'], context_messages)
                chunk_filename = f"{project_id}_chunk_{i}.wav"
                sf.write(os.path.join(STORAGE_DIR, chunk_filename), audio_data, serve_engine.audio_tokenizer.sampling_rate)
                chunk.update({'status': 'completed', 'audio_filename': chunk_filename})

                # For smart voice, update the reference path after first chunk
                if i == 0 and is_smart_voice:
                    project["voice_ref_path"] = os.path.join(STORAGE_DIR, chunk_filename)

            except Exception as e:
                print(f"Error on chunk {i} for {project_id}: {e}")
                chunk.update({'status': 'failed', 'error': str(e)})
            
            finally:
                chunk['elapsed_time'] = time.time() - chunk.get('start_time', time.time())
                update_project_progress(project)
                
                # Before writing, quickly check the on-disk status to avoid overwriting a cancellation.
                with open(project_path, 'r') as f:
                    if json.load(f).get('status') == 'cancelling':
                        project['status'] = 'cancelling'

                with open(project_path, 'w') as f:
                    json.dump(project, f, indent=2)

        if all(c['status'] == 'completed' for c in project['chunks']):
            project['status'] = 'completed'
        else:
            project['status'] = 'review'
        
        with open(project_path, 'w') as f:
            json.dump(project, f, indent=2)
        print(f"Generation for {project_id} finished with status: {project['status']}")

    # This is the main safety net. If anything outside the loop fails, this will catch it.
    except Exception as e:
        print(f"FATAL ERROR processing project {project_id}: {e}")
        try:
            with open(project_path, 'r+') as f:
                project_data = json.load(f)
                project_data['status'] = 'failed'
                project_data['error'] = f"A fatal error occurred: {str(e)}"
                f.seek(0)
                json.dump(project_data, f, indent=2)
                f.truncate()
        except Exception as write_error:
            print(f"Could not write failure status to project file {project_id}: {write_error}")

def regenerate_single_chunk_task(project_id: str, chunk_index: int):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    try:
        with open(project_path, 'r') as f:
            project = json.load(f)

        chunk = project['chunks'][chunk_index]

        context_messages = get_context_messages(project, chunk_index)
        is_smart = project.get("is_smart_voice", False)
        
        if not is_smart or (is_smart and chunk_index == 0):
            if ref_path := project.get("voice_ref_path"):
                if os.path.exists(ref_path):
                    with open(ref_path, "rb") as audio_file:
                        audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                    context_messages = [Message(role="user", content="This is reference audio for voice cloning."), Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]
        
        elif is_smart and chunk_index > 0:
            chunk_0_path = project.get("voice_ref_path") 
            if chunk_0_path and os.path.exists(chunk_0_path):
                with open(chunk_0_path, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                context_messages = [Message(role="user", content="This is reference audio for voice cloning."), Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]

        if old_filename := chunk.get('audio_filename'):
            old_filepath = os.path.join(STORAGE_DIR, old_filename)
            if os.path.exists(old_filepath):
                try:
                    os.remove(old_filepath)
                    print(f"Deleted old chunk file: {old_filepath}")
                except OSError as e:
                    print(f"Error deleting old file {old_filepath}: {e}")
        
        chunk.update({
            'status': 'processing', 'start_time': time.time(),
            'error': None, 'audio_filename': None
        })
        with open(project_path, 'w') as f: json.dump(project, f, indent=2)

        try:
            audio_data = generate_single_chunk(chunk['text'], project['params']['temperature'], project['params']['top_p'], context_messages)
            new_filename = f"{project_id}_chunk_{chunk_index}_regen_{int(time.time())}.wav"
            sf.write(os.path.join(STORAGE_DIR, new_filename), audio_data, serve_engine.audio_tokenizer.sampling_rate)
            chunk.update({'status': 'completed', 'audio_filename': new_filename})

            if is_smart and chunk_index == 0:
                project['voice_ref_path'] = os.path.join(STORAGE_DIR, new_filename)

        except Exception as e:
            print(f"Error regenerating chunk {chunk_index} for {project_id}: {e}")
            chunk.update({'status': 'failed', 'error': str(e)})

        finally:
            chunk['elapsed_time'] = time.time() - chunk.get('start_time', time.time())
            project['status'] = 'completed' if all(c['status'] == 'completed' for c in project['chunks']) else 'review'
            update_project_progress(project)
            with open(project_path, 'w') as f: json.dump(project, f, indent=2)
            print(f"Regeneration for chunk {chunk_index} finished with status: {chunk['status']}")

    # Catches any fatal error (e.g., initial file read fails) and prevents a "zombie" process
    except Exception as e:
        print(f"FATAL ERROR during regeneration for project {project_id}: {e}")
        try:
            with open(project_path, 'r+') as f:
                project_data = json.load(f)
                project_data['status'] = 'failed'
                if 0 <= chunk_index < len(project_data.get('chunks', [])):
                    project_data['chunks'][chunk_index]['status'] = 'failed'
                    project_data['chunks'][chunk_index]['error'] = f"A fatal error occurred: {str(e)}"
                f.seek(0)
                json.dump(project_data, f, indent=2)
                f.truncate()
        except Exception as write_error:
            print(f"Could not write failure status to project file {project_id}: {write_error}")

def stitch_project_audio_internal(project_id: str) -> str:
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    try:
        with open(project_path, 'r') as f: project = json.load(f)
    except FileNotFoundError: raise ValueError("Project not found")
    audio_data_list = [sf.read(os.path.join(STORAGE_DIR, c['audio_filename']))[0] for c in sorted(project['chunks'], key=lambda x: x['index']) if c.get('status') == 'completed' and 'audio_filename' in c and os.path.exists(os.path.join(STORAGE_DIR, c['audio_filename']))]
    if not audio_data_list: raise ValueError("No completed audio chunks to stitch.")
    final_audio = np.concatenate(audio_data_list)
    final_filename = f"{project_id}_final.wav"
    sf.write(os.path.join(STORAGE_DIR, final_filename), final_audio, serve_engine.audio_tokenizer.sampling_rate)
    project['final_audio_path'] = final_filename
    with open(project_path, 'w') as f: json.dump(project, f, indent=2)
    return final_filename

# --- API Endpoints ---
@app.post("/project", status_code=202, tags=["Project"])
async def create_project(background_tasks: BackgroundTasks, text: str = Form(...), voice_id: str = Form(...), temperature: float = Form(0.2), top_p: float = Form(0.95)):
    project_id = f"proj_{uuid.uuid4().hex}"
    voice_ref_path = None
    if voice_id != "smart_voice":
        voice_ref_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
        if not os.path.exists(voice_ref_path): raise HTTPException(status_code=404, detail="Cloned voice sample not found.")
    project_data = {"id": project_id, "status": "pending", "params": {"temperature": temperature, "top_p": top_p}, "chunks": [{"index": i, "text": chunk, "status": "pending"} for i, chunk in enumerate(split_text_into_chunks(normalize_text_for_tts(text)))], "voice_ref_path": voice_ref_path, "is_smart_voice": (voice_id == "smart_voice")}
    with open(os.path.join(PROJECTS_DIR, f"{project_id}.json"), 'w') as f: json.dump(project_data, f, indent=2)
    background_tasks.add_task(process_project_generation, project_id)
    return {"project_id": project_id, "status": "processing"}

@app.get("/project/{project_id}", tags=["Project"])
async def get_project_status(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        with open(project_path, 'r') as f:
            project_data = json.load(f)
        return project_data
    except json.JSONDecodeError:
        # This handles the rare case where the file is being written at this exact moment.
        raise HTTPException(status_code=503, detail="Project file is currently being updated. Please try again.")

@app.post("/project/{project_id}/stitch", tags=["Project"])
async def stitch_project_audio(project_id: str, background_tasks: BackgroundTasks):
    try:
        final_filename = stitch_project_audio_internal(project_id)
        return {"final_audio_filename": final_filename}
    except (ValueError, FileNotFoundError) as e: raise HTTPException(status_code=400, detail=str(e))

@app.post("/project/{project_id}/cleanup", status_code=200, tags=["Project"])
async def cleanup_project(project_id: str, background_tasks: BackgroundTasks):
    """
    Triggers a background task to delete a project's associated chunk files and metadata.
    """
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(project_path):
        # It's okay if the project is already gone. Return success.
        return {"message": "Project not found, no action taken."}
    
    background_tasks.add_task(cleanup_project_data, project_id)
    return {"message": "Project cleanup has been scheduled."}    

@app.post("/project/{project_id}/cancel", status_code=200, tags=["Project"])
async def cancel_project(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(project_path): raise HTTPException(status_code=404, detail="Project not found")
    with open(project_path, 'r+') as f:
        project = json.load(f)
        if project['status'] not in ['pending', 'processing']: return {"message": "Project is not in a cancellable state."}
        project['status'] = 'cancelling'; f.seek(0); json.dump(project, f, indent=2); f.truncate()
    return {"message": "Project cancellation requested."}

@app.post("/project/{project_id}/chunk/{chunk_index}/regenerate", status_code=202, tags=["Project"])
async def regenerate_chunk_endpoint(project_id: str, chunk_index: int, background_tasks: BackgroundTasks):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    with open(project_path, 'r') as f:
        project = json.load(f)
        if not 0 <= chunk_index < len(project['chunks']):
            raise HTTPException(status_code=400, detail="Invalid chunk index")

    background_tasks.add_task(regenerate_single_chunk_task, project_id, chunk_index)
    return {"message": f"Regeneration for chunk {chunk_index} has been queued."}

@app.get("/voices", tags=["Voices"])
async def get_voices():
    default_voices = [{"id": "smart_voice", "name": "Smart Voice (Auto)"}]
    cloned_voices = [json.load(open(os.path.join(CLONED_VOICES_DIR, f))) for f in os.listdir(CLONED_VOICES_DIR) if f.endswith(".json")]
    return default_voices + cloned_voices

@app.post("/clone-voice", tags=["Voices"])
async def clone_voice(voice_sample: UploadFile = File(...), voice_name: str = Form(...)):
    voice_id = f"clone_{uuid.uuid4().hex[:8]}"
    with open(os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav"), "wb") as buffer: buffer.write(await voice_sample.read())
    metadata = {"id": voice_id, "name": voice_name, "tags": ["cloned"]}
    with open(os.path.join(CLONED_VOICES_DIR, f"{voice_id}.json"), 'w') as f: json.dump(metadata, f)
    return metadata

@app.post("/saved-audio", tags=["Saved Audio"])
async def save_generated_audio(audio_filename: str = Form(...), display_name: str = Form(...), audio_type: str = Form("standard")):
    source_path = os.path.join(STORAGE_DIR, audio_filename)
    if not os.path.exists(source_path): raise HTTPException(status_code=404, detail="Source audio file not found")
    saved_id = f"saved_{uuid.uuid4().hex[:8]}"; saved_filename = f"{saved_id}.wav"
    shutil.copy2(source_path, os.path.join(SAVED_AUDIO_DIR, saved_filename))
    metadata = {"id": saved_id, "filename": saved_filename, "display_name": display_name, "audio_type": audio_type, "created_at": datetime.now().isoformat(), "source_filename": audio_filename}
    saved_audio[saved_id] = metadata; save_audio_metadata()
    return metadata

@app.get("/saved-audio", tags=["Saved Audio"])
async def get_saved_audio(): return list(saved_audio.values())

@app.delete("/saved-audio/{saved_id}", tags=["Saved Audio"])
async def delete_saved_audio(saved_id: str):
    if saved_id not in saved_audio: raise HTTPException(status_code=404, detail="Saved audio not found")
    if os.path.exists(fp := os.path.join(SAVED_AUDIO_DIR, saved_audio[saved_id]["filename"])): os.remove(fp)
    del saved_audio[saved_id]; save_audio_metadata()
    return {"message": "Audio deleted successfully"}

@app.get("/audio/{filename}", tags=["Audio"])
async def get_audio_file(filename: str):
    for directory in [STORAGE_DIR, SAVED_AUDIO_DIR, CLONED_VOICES_DIR]:
        if os.path.exists(path := os.path.join(directory, filename)): return FileResponse(path, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="File not found")

app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    if os.path.exists(index_path := "ui/dist/index.html"): return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="UI not found. Please build the UI first.")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)