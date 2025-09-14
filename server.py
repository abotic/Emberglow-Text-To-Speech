import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import torch
import soundfile as sf
import os
import uuid
import json
import base64
import re
import numpy as np
import io
from typing import List, Dict

from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

# --- Application Setup ---

tasks: Dict[str, Dict] = {}
CLONED_VOICES_DIR = "cloned_voices"
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
# Forcing CPU for local development on Mac to avoid MPS issues - I will get back to it before deploying on GPU
device = "cpu"
serve_engine = HiggsAudioServeEngine(
    "bosonai/higgs-audio-v2-generation-3B-base",
    "bosonai/higgs-audio-v2-tokenizer",
    device=device,
)
print(f"Model loaded and running on device: {device}")

# --- Text and Audio Processing Logic ---

def split_text_into_chunks(text: str, chunk_size: int = 1000):
    """Splits text into chunks, respecting sentence boundaries."""
    text = re.sub(r'\s+', ' ', text).strip()
    sentences = re.split(r'(?<=[.?!])\s+', text)
    chunks = []
    current_chunk = ""
    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 <= chunk_size:
            current_chunk += sentence + " "
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence + " "
    if current_chunk:
        chunks.append(current_chunk.strip())
    return chunks

def do_audio_generation(task_id: str, messages: List[Message], initial_text: str, generation_params: dict):
    """Background audio generation process with a fixed voice reference for maximum consistency."""
    temp_files = []
    try:
        tasks[task_id]['status'] = 'processing'
        text_chunks = split_text_into_chunks(initial_text)
        audio_chunks = []
        
        # This will hold the path to the FIRST generated audio chunk, used as a fixed reference.
        fixed_reference_audio_path = None
        base_messages = list(messages)

        for i, chunk in enumerate(text_chunks):
            print(f"Generating chunk {i+1}/{len(text_chunks)} for task {task_id}...")

            current_messages = base_messages + [Message(role="user", content=chunk)]
            chat_ml_sample = ChatMLSample(messages=current_messages)

            output = serve_engine.generate(
                chat_ml_sample=chat_ml_sample,
                max_new_tokens=8192,
                stop_strings=["<|end_of_text|>", "<|eot_id|>"],
                **generation_params
            )

            if output.audio is None or len(output.audio) == 0:
                print(f"Warning: Chunk {i+1} produced no audio.")
                continue

            audio_chunks.append(output.audio)

            # If this is the first chunk, save its audio as the fixed reference for all future chunks.
            if i == 0:
                # Save the first chunk's audio to a temporary file.
                temp_chunk_path = os.path.join(CLONED_VOICES_DIR, f"temp_{task_id}_ref.wav")
                sf.write(temp_chunk_path, output.audio, serve_engine.audio_tokenizer.sampling_rate)
                temp_files.append(temp_chunk_path)
                fixed_reference_audio_path = temp_chunk_path

                # Now, update the base messages to use this fixed reference.
                with open(fixed_reference_audio_path, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')

                found_audio = False
                for msg in reversed(base_messages):
                    if isinstance(msg.content, AudioContent):
                        msg.content.raw_audio = audio_base64
                        found_audio = True
                        break
                if not found_audio:
                     # This happens for the first "Smart Voice" chunk.
                    base_messages.insert(0, Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")))
                    base_messages.insert(0, Message(role="user", content="Reference audio for voice cloning."))

        if not audio_chunks:
            raise ValueError("No audio was generated.")

        final_audio = np.concatenate(audio_chunks)
        output_filename = f"{task_id}.wav"
        output_path = os.path.join(CLONED_VOICES_DIR, output_filename)
        sf.write(output_path, final_audio, serve_engine.audio_tokenizer.sampling_rate)

        tasks[task_id]['status'] = 'completed'
        tasks[task_id]['result_path'] = output_filename

    except Exception as e:
        print(f"Error during audio generation for task {task_id}: {e}")
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)
    finally:
        # Clean up temporary chunk files
        for f in temp_files:
            if os.path.exists(f):
                os.remove(f)

# --- API Endpoints ---

@app.get("/voices", tags=["Voices"])
async def get_voices():
    default_voices = [
        {"id": "smart_voice", "name": "Smart Voice (Auto)", "description": "Model selects a suitable voice", "tags": ["professional", "clear"]},
    ]
    cloned_voices = []
    for filename in os.listdir(CLONED_VOICES_DIR):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(CLONED_VOICES_DIR, filename), 'r') as f:
                    metadata = json.load(f)
                    cloned_voices.append({
                        "id": metadata["id"], "name": metadata["name"],
                        "description": "A custom cloned voice", "tags": ["cloned"]
                    })
            except Exception as e:
                print(f"Could not load voice metadata {filename}: {e}")
    return default_voices + cloned_voices

@app.post("/clone-voice", status_code=200, tags=["Voices"])
async def clone_voice(voice_sample: UploadFile = File(...), voice_name: str = Form(...)):
    voice_id = f"clone_{uuid.uuid4().hex[:8]}"
    wav_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
    with open(wav_path, "wb") as buffer:
        buffer.write(await voice_sample.read())
        
    metadata = {"id": voice_id, "name": voice_name}
    json_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.json")
    with open(json_path, 'w') as f:
        json.dump(metadata, f)
        
    return {"id": voice_id, "name": voice_name, "message": "Voice successfully saved to library."}

@app.post("/generate/test-clone", tags=["Generation"])
async def test_clone(
    voice_sample: UploadFile = File(...),
    text: str = Form("Was the final report from NASA really published in 2024? Siobhán, the project lead, couldn’t believe her eyes. ‘It’s a complete success!’ she exclaimed, her voice filled with genuine excitement. The data was unequivocal."),
    temperature: float = Form(0.3)
):
    audio_bytes = await voice_sample.read()
    audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
    
    messages = [
        Message(role="user", content="Reference audio for voice cloning."),
        Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
        Message(role="user", content=text),
    ]
    chat_ml_sample = ChatMLSample(messages=messages)

    output = serve_engine.generate(
        chat_ml_sample=chat_ml_sample,
        max_new_tokens=2048,
        temperature=temperature,
        top_p=0.95,
        stop_strings=["<|end_of_text|>", "<|eot_id|>"]
    )

    if output.audio is None:
        raise HTTPException(status_code=500, detail="Audio generation failed.")

    buffer = io.BytesIO()
    sf.write(buffer, output.audio, output.sampling_rate, format='WAV')
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="audio/wav")


@app.post("/generate/speech", status_code=202, tags=["Generation"])
async def generate_speech(
    background_tasks: BackgroundTasks, 
    text: str = Form(...), 
    voice_id: str = Form(...),
    temperature: float = Form(0.3),
    top_p: float = Form(0.95)
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
    background_tasks.add_task(do_audio_generation, task_id, initial_messages, text, generation_params)
    
    return {"task_id": task_id, "status": "processing"}

@app.get("/generation-status/{task_id}", tags=["Generation"])
async def get_generation_status(task_id: str):
    task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.get("/audio/{filename}", tags=["Generation"])
async def get_audio_file(filename: str):
    path = os.path.join(CLONED_VOICES_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="audio/wav")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)