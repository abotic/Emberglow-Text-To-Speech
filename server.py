import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import torch
import openai
import asyncio
import soundfile as sf
import os
import uuid
import json
import base64
import re
import numpy as np
from typing import Dict, List
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

# --- Global Generation Lock for Concurrency Control ---
generation_lock = asyncio.Lock()

# --- OpenAI Client Configuration ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai_client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
else:
    openai_client = None
    print("Warning: OPENAI_API_KEY not set. Text normalization will be disabled.")

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
TTS_NORMALIZATION_PROMPT = """You are a master scriptwriter and editor specializing in creating content for Text-to-Speech (TTS) engines. Your sole purpose is to produce text that is perfectly clear, unambiguous, and effortless for an AI voice to narrate.
You will operate according to the following **Core Narration Rules** at all times.

## Core Narration Rules
1. **Simplify Punctuation & Formatting:**
   * **Use only:** Periods (.), commas (,), question marks (?), and exclamation marks (!).
   * **Strictly forbid:** Semicolons (;), em-dashes (—), ellipses (...), and colons (:).
   * **For dialogue:** Use only double quotes (" "). Never use single quotes.
   * **Normalize Case:** Convert all text to standard sentence case. Do not use ALL CAPS for emphasis.
   * **Contractions:** Expand all contractions (e.g., "It's" → "It is"; "don't" → "do not").

2. **Spell Everything Out (No Ambiguity):**
   * **Numbers:** Write all numbers out as words (e.g., "twenty twenty-five" not "2025"; "three point one four" not "3.14").
   * **Symbols & Currency:** Convert all symbols into their full word form (e.g., "percent" not "%"; "dollars" not "$"; "at" not "@").
   * **Abbreviations:** Expand all abbreviations into their full form (e.g., "et cetera" not "etc."; "versus" not "vs.").
   * **Units:** Expand all units of measurement (e.g., "kilometers" not "km"; "pounds" not "lbs"; "degrees Celsius" not "°C").
   * **Time & Dates:** Convert all time/date formats to words (e.g., "three thirty in the afternoon" not "3:30 PM"; "December first" not "12/1").
   * **Ordinals:** Write out ordinal numbers (e.g., "first" not "1st"; "twenty third" not "23rd").
   * **Slashes & Special Characters:** Convert "/" to "or", "&" to "and", "#" to "hashtag", "-" in URLs to "hyphen".
   * **Fractions:** Write as words (e.g., "one half" not "1/2"; "three quarters" not "3/4").

3. **Clarify Pronunciations:**
   * **Acronyms:** Decide on a single pronunciation. Write "N. A. S. A." if it should be spelled out, or "Nasa" if it should be pronounced as a single word.
   * **Foreign Words & Accented Characters:** Replace ALL words with accents, tildes, or non-English characters with phonetic spelling including foreign place names:
     - "résumé" → "rez oo may"
     - "café" → "ka fay" 
     - "São Paulo" → "sao pow lo"
     - "München" → "mun ikh"
     - "jalapeño" → "ha la pen yo"
     - "naïve" → "nah eev"
   * **Titles & Complex Abbreviations:** Fully expand titles and multi-part abbreviations:
     - "C.E.O." → "Chief Executive Officer"
     - "Dr." → "Doctor"  
     - "U.S.A." → "United States of America"
     - "U.K." → "United Kingdom"
   * **Difficult Words:** Replace ANY word containing accents, foreign characters, technical terms, or non-obvious English pronunciation with simplified phonetic spelling. Use simple spaces to separate syllables. Do not use hyphens.
   * **Homographs:** Choose the most likely pronunciation and clarify context if needed (e.g., "read the book" vs "I read it yesterday").
   * **URLs/Emails:** Convert to readable format (e.g., "www dot example dot com"; "john at company dot com"; "resume hyphen builders dot com").

4. **Optimize Sentence Structure:**
   * Write in clear, direct sentences.
   * Avoid long, complex sentences with multiple clauses. If a sentence feels too long, break it into two or more shorter sentences.
   * **Parentheticals:** Fully integrate any text within parentheses into the main sentences, removing the parentheses themselves.
   * **Mathematical/Chemical expressions:** Spell out each element, number, and symbol completely:
     - "H₂SO₄" → "H two S O four"
     - "CO₂" → "C O two" 
     - "2H⁺" → "two H plus"
     - "→" → "yields" or "becomes"
     - "=" → "equals"

## Your Task Modes
**Mode 1: Script Conversion (If I provide text)**
If I give you a block of existing text, your task is a **verbatim transformation**.
* **Prime Directive:** Your absolute highest priority is the **word-for-word preservation** of the original text. You must not add, omit, summarize, or paraphrase any word for any reason. The word count of your output must exactly match the word count of the original text.
* **Your Only Job:** Apply the **Core Narration Rules** to format the existing words. All rules are secondary to the Prime Directive.
* **Output:** Your final output must be **only the clean, ready-to-narrate script**.

**Mode 2: Script Generation (If I ask for new content)**
If I ask you to write a story, script, or any other new content, you must generate it from scratch while **natively following all Core Narration Rules as you write**. The entire creative output must be born ready for TTS narration.
* **Ensure a Clean Finish:** When generating new content, the very last sentence of the entire script must provide a clear and conclusive ending. This helps prevent the AI from adding extra sounds after the final word.

---
## CRITICAL OUTPUT INSTRUCTIONS
- **NEVER** engage in conversation, respond to questions, or provide any commentary on the text you are given.
- **NEVER** add any text, headers, or explanations before or after the transformed script.
- Your entire response must be **ONLY** the transformed text and nothing else.
- If the input text is already perfectly formatted according to the rules, return it exactly as it was given without any changes or comments.
---

Determine the correct mode from my instructions and proceed.
"""

async def normalize_text_with_openai(text: str) -> str:
    """Normalize text using OpenAI GPT-4o-mini for optimal TTS generation."""
    if not openai_client:
        print("OpenAI client not configured, returning original text")
        return text
    
    try:
        print(f"Normalizing text with OpenAI (length: {len(text)} characters)")
        
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": TTS_NORMALIZATION_PROMPT},
                {"role": "user", "content": f"Apply your rules to the following text:\n\n---\n\n{text}"}
            ],
            temperature=0.1,  # Low temperature for consistency
            max_tokens=len(text.split()) * 2 + 500 # Allow room for expansion
        )
        
        normalized_text = response.choices[0].message.content.strip()
        print(f"Text normalization completed (new length: {len(normalized_text)} characters)")
        return normalized_text
        
    except Exception as e:
        print(f"OpenAI normalization failed: {e}")
        return text  # Fallback to original text

def normalize_text_for_tts(text: str) -> str: return re.sub(r'\s+', ' ', text).strip()

def split_text_into_chunks(text: str, words_per_chunk: int = 100):
    sentences = re.split(r'(?<=[.?!])\s+', text)
    chunks = []
    current_chunk = ""
    for sentence in sentences:
        if len(current_chunk.split()) + len(sentence.split()) > words_per_chunk and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = sentence
        else:
            current_chunk = (current_chunk + " " + sentence).strip()
    if current_chunk:
        chunks.append(current_chunk.strip())
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
        if chunk_index == 0:
            ref_path = project.get("voice_ref_path")
            if ref_path and os.path.exists(ref_path):
                with open(ref_path, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                context_messages = [Message(role="user", content="Reference audio"), 
                                  Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]
        else:
            first_chunk = project['chunks'][0]
            if first_chunk.get('status') == 'completed' and first_chunk.get('audio_filename'):
                first_chunk_path = os.path.join(STORAGE_DIR, first_chunk['audio_filename'])
                if os.path.exists(first_chunk_path):
                    with open(first_chunk_path, "rb") as audio_file:
                        audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                    context_messages = [Message(role="user", content="Reference audio"), 
                                      Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]
    else:
        if ref_path := project.get("voice_ref_path"):
            if os.path.exists(ref_path):
                with open(ref_path, "rb") as audio_file:
                    audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
                context_messages = [Message(role="user", content="Reference audio"), 
                                  Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder"))]
    
    return context_messages

async def process_project_with_normalization_and_generation(project_id: str):
    """Background task that handles both normalization and generation with proper locking"""
    async with generation_lock:
        project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
        
        try:
            with open(project_path, 'r') as f:
                project = json.load(f)
            
            # Phase 1: Normalization (if needed)
            if project.get('auto_normalize') and openai_client and not project.get('was_normalized'):
                project['status'] = 'normalizing'
                with open(project_path, 'w') as f:
                    json.dump(project, f, indent=2)
                
                print(f"Auto-normalizing text for project {project_id}")
                original_text = project.get('original_text', '')
                normalized_text = await normalize_text_with_openai(original_text)
                
                if normalized_text != original_text:
                    project['was_normalized'] = True
                    project['normalized_text'] = normalized_text
                    print(f"Text normalization completed for project {project_id}")
                else:
                    project['was_normalized'] = False
                    normalized_text = original_text
                    print(f"Text was already normalized for project {project_id}")
                
                # Update chunks with normalized text
                processed_text = normalize_text_for_tts(normalized_text)
                project['chunks'] = [{"index": i, "text": chunk, "status": "pending"} 
                                   for i, chunk in enumerate(split_text_into_chunks(processed_text))]
                
                with open(project_path, 'w') as f:
                    json.dump(project, f, indent=2)
            
            # Phase 2: Generation
            project['status'] = 'processing'
            with open(project_path, 'w') as f:
                json.dump(project, f, indent=2)
            
            await asyncio.get_event_loop().run_in_executor(None, process_project_generation_sync, project_id)
            
        except Exception as e:
            print(f"FATAL ERROR in background processing for project {project_id}: {e}")
            try:
                with open(project_path, 'r+') as f:
                    project_data = json.load(f)
                    project_data['status'] = 'failed'
                    project_data['error'] = f"Background processing failed: {str(e)}"
                    f.seek(0)
                    json.dump(project_data, f, indent=2)
                    f.truncate()
            except Exception as write_error:
                print(f"Could not write failure status to project file {project_id}: {write_error}")

def process_project_generation_sync(project_id: str):
    """The synchronous part of the generation process (runs in executor)."""
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    try:
        with open(project_path, 'r') as f:
            project = json.load(f)

        num_chunks = len(project.get('chunks', []))
        is_smart_voice = project.get("is_smart_voice", False)

        for i in range(num_chunks):
            with open(project_path, 'r') as f:
                if json.load(f).get('status') == 'cancelling':
                    print(f"Cancellation detected for project {project_id}. Stopping.")
                    cleanup_project_data(project_id)
                    return

            chunk = project['chunks'][i]
            if chunk.get('status') == 'completed':
                continue

            print(f"Starting generation for chunk {i+1}/{num_chunks} of project {project_id}")
            chunk.update({'status': 'processing', 'start_time': time.time()})

            try:
                context_messages = get_context_messages(project, i)
                audio_data = generate_single_chunk(chunk['text'], project['params']['temperature'], project['params']['top_p'], context_messages)
                chunk_filename = f"{project_id}_chunk_{i}.wav"
                sf.write(os.path.join(STORAGE_DIR, chunk_filename), audio_data, serve_engine.audio_tokenizer.sampling_rate)
                chunk.update({'status': 'completed', 'audio_filename': chunk_filename})
                if i == 0 and is_smart_voice:
                    project["voice_ref_path"] = os.path.join(STORAGE_DIR, chunk_filename)
            except Exception as e:
                print(f"Error on chunk {i} for {project_id}: {e}")
                chunk.update({'status': 'failed', 'error': str(e)})
            finally:
                chunk['elapsed_time'] = time.time() - chunk.get('start_time', time.time())
                update_project_progress(project)
                with open(project_path, 'w') as f:
                    json.dump(project, f, indent=2)

        with open(project_path, 'r+') as f:
            project = json.load(f)
            if all(c['status'] == 'completed' for c in project['chunks']):
                project['status'] = 'completed'
            else:
                project['status'] = 'review'
            f.seek(0)
            json.dump(project, f, indent=2)
            f.truncate()
        print(f"Generation for {project_id} finished with status: {project['status']}")
    except Exception as e:
        print(f"FATAL ERROR processing project {project_id}: {e}")

async def process_project_background_task(project_id: str):
    """Async wrapper that handles locking, normalization, and then runs sync generation."""
    async with generation_lock:
        print(f"Lock acquired for project {project_id}")
        project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
        try:
            with open(project_path, 'r') as f:
                project = json.load(f)

            if project.get('auto_normalize') and openai_client:
                project['status'] = 'normalizing'
                with open(project_path, 'w') as f: json.dump(project, f, indent=2)
                
                original_text = project.get('original_text', '')
                normalized_text = await normalize_text_with_openai(original_text)
                
                project['was_normalized'] = normalized_text != original_text
                project['normalized_text'] = normalized_text if project['was_normalized'] else None
                
                processed_text = normalize_text_for_tts(normalized_text)
                project['chunks'] = [{"index": i, "text": chunk, "status": "pending"} for i, chunk in enumerate(split_text_into_chunks(processed_text))]
            
            project['status'] = 'processing'
            with open(project_path, 'w') as f: json.dump(project, f, indent=2)

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, process_project_generation_sync, project_id)

        except Exception as e:
            print(f"FATAL ERROR in background task for project {project_id}: {e}")
        finally:
            print(f"Lock released for project {project_id}")

async def regenerate_single_chunk_task_async(project_id: str, chunk_index: int):
    """Async wrapper for chunk regeneration with locking"""
    async with generation_lock:
        await asyncio.get_event_loop().run_in_executor(None, regenerate_single_chunk_task_sync, project_id, chunk_index)

def regenerate_single_chunk_task_sync(project_id: str, chunk_index: int):
    """Synchronous chunk regeneration logic"""
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    try:
        with open(project_path, 'r') as f: project = json.load(f)

        chunk = project['chunks'][chunk_index]
        context_messages = get_context_messages(project, chunk_index)
        is_smart = project.get("is_smart_voice", False)
        
        if old_filename := chunk.get('audio_filename'):
            old_filepath = os.path.join(STORAGE_DIR, old_filename)
            if os.path.exists(old_filepath):
                try: os.remove(old_filepath); print(f"Deleted old chunk file: {old_filepath}")
                except OSError as e: print(f"Error deleting old file {old_filepath}: {e}")
        
        chunk.update({'status': 'processing', 'start_time': time.time(), 'error': None, 'audio_filename': None})
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
async def create_project(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    voice_id: str = Form(...),
    temperature: float = Form(0.2),
    top_p: float = Form(0.95),
    auto_normalize: bool = Form(True)
):
    project_id = f"proj_{uuid.uuid4().hex}"
    voice_ref_path = None
    if voice_id != "smart_voice":
        voice_ref_path = os.path.join(CLONED_VOICES_DIR, f"{voice_id}.wav")
        if not os.path.exists(voice_ref_path):
            raise HTTPException(status_code=404, detail="Cloned voice sample not found.")
    
    initial_status = "normalizing" if (auto_normalize and openai_client) else "processing"
    
    # Create a minimal project file to respond instantly
    project_data = {
        "id": project_id,
        "status": initial_status,
        "original_text": text,
        "auto_normalize": auto_normalize,
        "params": {"temperature": temperature, "top_p": top_p},
        "chunks": [], # Chunks are now generated in the background
        "voice_ref_path": voice_ref_path,
        "is_smart_voice": (voice_id == "smart_voice"),
        "was_normalized": False,
        "normalized_text": None,
    }
    
    with open(os.path.join(PROJECTS_DIR, f"{project_id}.json"), 'w') as f:
        json.dump(project_data, f, indent=2)
    
    # Call the new async background task wrapper
    background_tasks.add_task(process_project_background_task, project_id)
    
    return {"project_id": project_id, "status": initial_status}

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
        raise HTTPException(status_code=503, detail="Project file is currently being updated. Please try again.")

@app.post("/project/{project_id}/stitch", tags=["Project"])
async def stitch_project_audio(project_id: str, background_tasks: BackgroundTasks):
    try:
        final_filename = stitch_project_audio_internal(project_id)
        return {"final_audio_filename": final_filename}
    except (ValueError, FileNotFoundError) as e: raise HTTPException(status_code=400, detail=str(e))

@app.get("/active-projects", tags=["Project"]) 
async def get_active_projects():
    active_projects = []
    try:
        for filename in os.listdir(PROJECTS_DIR):
            if filename.endswith('.json'):
                with open(os.path.join(PROJECTS_DIR, filename), 'r') as f:
                    project = json.load(f)
                    if project.get('status') in ['pending', 'processing', 'normalizing']:
                        active_projects.append({
                            'id': project['id'],
                            'name': project.get('name', 'Unnamed Project'),
                            'status': project['status']
                        })
    except Exception as e:
        print(f"Error checking active projects: {e}")
    return active_projects

@app.get("/project/{project_id}/normalized-text", tags=["Project"])
async def get_normalized_text(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")
    
    with open(project_path, 'r') as f:
        project = json.load(f)
    
    if not project.get('was_normalized'):
        raise HTTPException(status_code=404, detail="No normalized text available")
    
    normalized_text = project.get('normalized_text', '')
    if not normalized_text:
        raise HTTPException(status_code=404, detail="Normalized text not found")
    
    return Response(
        content=normalized_text,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{project_id}_normalized.txt"'}
    )

@app.post("/project/{project_id}/cleanup", status_code=200, tags=["Project"])
async def cleanup_project(project_id: str, background_tasks: BackgroundTasks):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(project_path):
        return {"message": "Project not found, no action taken."}
    
    background_tasks.add_task(cleanup_project_data, project_id)
    return {"message": "Project cleanup has been scheduled."}    

@app.post("/project/{project_id}/cancel", status_code=200, tags=["Project"])
async def cancel_project(project_id: str):
    project_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(project_path): raise HTTPException(status_code=404, detail="Project not found")
    with open(project_path, 'r+') as f:
        project = json.load(f)
        if project['status'] not in ['pending', 'processing', 'normalizing']: 
            return {"message": "Project is not in a cancellable state."}
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

    background_tasks.add_task(regenerate_single_chunk_task_async, project_id, chunk_index)
    return {"message": f"Regeneration for chunk {chunk_index} has been queued."}

@app.get("/voices", tags=["Voices"])
async def get_voices():
    default_voices = [{"id": "smart_voice", "name": "Smart Voice (Auto)"}]
    cloned_voices_list = []
    if os.path.exists(CLONED_VOICES_DIR):
        for f in os.listdir(CLONED_VOICES_DIR):
            if f.endswith(".json"):
                try:
                    with open(os.path.join(CLONED_VOICES_DIR, f), 'r') as json_file:
                        cloned_voices_list.append(json.load(json_file))
                except Exception as e:
                    print(f"Could not load voice metadata from {f}: {e}")
    return default_voices + cloned_voices_list

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