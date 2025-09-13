import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import torch
import soundfile as sf
import io
import base64
import os
import uuid
import json
from typing import List, Dict

from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

# --- Application Setup ---

# In-memory dictionary to track the status of background tasks
tasks: Dict[str, Dict] = {}

# Directory to store cloned voice samples
CLONED_VOICES_DIR = "cloned_voices"
os.makedirs(CLONED_VOICES_DIR, exist_ok=True)


app = FastAPI(title="Higgs Audio Generation API")

# TODO - handle CORS 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


print("Initializing HiggsAudioServeEngine...")
device = "mps" if torch.backends.mps.is_available() else "cpu"
serve_engine = HiggsAudioServeEngine(
    "bosonai/higgs-audio-v2-generation-3B-base",
    "bosonai/higgs-audio-v2-tokenizer",
    device=device,
)
print(f"Model loaded and running on device: {device}")


# --- Background Task Functions ---

def do_audio_generation(task_id: str, messages: List[Message]):
    """The actual audio generation process that runs in the background."""
    try:
        chat_ml_sample = ChatMLSample(messages=messages)
        output = serve_engine.generate(
            chat_ml_sample=chat_ml_sample,
            max_new_tokens=4096, # Increased for longer text
            temperature=0.3,
            top_p=0.95
        )
        
        # Save the generated audio to a temporary file
        output_filename = f"{task_id}.wav"
        output_path = os.path.join(CLONED_VOICES_DIR, output_filename)
        sf.write(output_path, output.audio, output.sampling_rate)

        tasks[task_id]['status'] = 'completed'
        tasks[task_id]['result_path'] = output_filename

    except Exception as e:
        print(f"Error during audio generation for task {task_id}: {e}")
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)


# --- API Endpoints ---

@app.get("/voices", tags=["Voices"])
async def get_voices():
    """Returns a list of available default and cloned voices."""
    default_voices = [
        {"id": "smart_voice", "name": "Smart Voice (Auto)", "description": "Model selects a suitable voice", "tags": ["professional", "clear"]},
    ]
    
    cloned_voices = []
    for filename in os.listdir(CLONED_VOICES_DIR):
        if filename.endswith(".json"):
            with open(os.path.join(CLONED_VOICES_DIR, filename), 'r') as f:
                metadata = json.load(f)
                cloned_voices.append({
                    "id": metadata["id"],
                    "name": metadata["name"],
                    "description": "A custom cloned voice",
                    "tags": ["cloned"]
                })
    
    return default_voices + cloned_voices

@app.post("/clone-voice", status_code=202, tags=["Voices"])
async def clone_voice(voice_sample: UploadFile = File(...), voice_name: str = Form(...)):
    """Saves a voice sample and its metadata."""
    voice_id = f"clone_{uuid.uuid4().hex[:8]}"
    
    # Save the audio file
    wav_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
    with open(wav_path, "wb") as buffer:
        buffer.write(await voice_sample.read())
        
    # Save the metadata
    metadata = {"id": voice_id, "name": voice_name}
    json_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.json")
    with open(json_path, 'w') as f:
        json.dump(metadata, f)
        
    return {"id": voice_id, "name": voice_name, "message": "Voice cloning successful."}

@app.post("/generate/speech", status_code=202, tags=["Generation"])
async def generate_speech(background_tasks: BackgroundTasks, text: str = Form(...), voice_id: str = Form(...)):
    """Accepts a text and voice ID, and starts a background task for audio generation."""
    task_id = f"gen_{uuid.uuid4().hex}"
    tasks[task_id] = {"status": "processing"}

    messages = []
    # If it's a cloned voice, find the reference audio and add it to the prompt
    if voice_id.startswith("clone_"):
        ref_audio_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
        if not os.path.exists(ref_audio_path):
            raise HTTPException(status_code=404, detail="Cloned voice sample not found.")
            
        with open(ref_audio_path, "rb") as audio_file:
            audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')

        messages.extend([
            Message(role="user", content="Reference audio for voice cloning."),
            Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
        ])
    
    messages.append(Message(role="user", content=text))
    
    background_tasks.add_task(do_audio_generation, task_id, messages)
    
    return {"task_id": task_id, "status": "processing"}

@app.get("/generation-status/{task_id}", tags=["Generation"])
async def get_generation_status(task_id: str):
    """Checks the status of a generation task."""
    task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.get("/audio/{filename}", tags=["Generation"])
async def get_audio_file(filename: str):
    """Serves the generated audio file."""
    path = os.path.join(CLONED_VOICES_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="audio/wav")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)