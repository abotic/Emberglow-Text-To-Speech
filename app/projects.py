import asyncio
import base64
import json
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import soundfile as sf

from app.config import (
    STORAGE_DIR,
    CLONED_VOICES_DIR,
    SAVED_AUDIO_DIR,
    PROJECTS_DIR,
    saved_audio,
    save_saved_audio,
    generation_lock,
    logger,
)
from app.engine import serve_engine, SAMPLING_RATE
from app.normalization import (
    normalize_text_for_tts,
    split_text_into_chunks,
    normalize_text_with_openai
)
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent


def _read_project(project_id: str) -> Dict[str, Any]:
    path = PROJECTS_DIR / f"{project_id}.json"
    return json.loads(path.read_text())


def _write_project(project: Dict[str, Any]) -> None:
    path = PROJECTS_DIR / f"{project['id']}.json"
    path.write_text(json.dumps(project, indent=2))


def update_project_progress(project: Dict[str, Any]) -> None:
    completed = sum(1 for chunk in project["chunks"] if chunk["status"] == "completed")
    total = len(project["chunks"])
    project["completed_chunks"] = completed
    project["total_chunks"] = total
    project["progress_percent"] = int((completed / total) * 100) if total else 0


def cleanup_project_data(project_id: str) -> None:
    try:
        path = PROJECTS_DIR / f"{project_id}.json"
        if not path.exists():
            return
        
        project = json.loads(path.read_text())
        for chunk in project.get("chunks", []):
            filename = chunk.get("audio_filename")
            if not filename:
                continue
            
            filepath = STORAGE_DIR / filename
            if filepath.exists():
                try:
                    filepath.unlink()
                except Exception:
                    pass
        
        path.unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"Cleanup failed for {project_id}: {e}")


def _context_messages(project: Dict[str, Any], chunk_index: int = 0) -> List[Message]:
    messages: List[Message] = []
    ref_path = project.get("voice_ref_path")
    
    def _audio_message_from_path(path: Path) -> List[Message]:
        raw = path.read_bytes()
        b64 = base64.b64encode(raw).decode("utf-8")
        return [
            Message(role="user", content="Reference audio"),
            Message(role="assistant", content=AudioContent(raw_audio=b64, audio_url="placeholder")),
        ]
    
    if chunk_index == 0:
        if ref_path and Path(ref_path).exists():
            messages = _audio_message_from_path(Path(ref_path))
    else:
        first_chunk = project["chunks"][0]
        filename = first_chunk.get("audio_filename")
        if first_chunk.get("status") == "completed" and filename:
            filepath = STORAGE_DIR / filename
            if filepath.exists():
                messages = _audio_message_from_path(filepath)
    
    return messages


def _generate_chunk(
    chunk_text: str,
    temperature: float,
    top_p: float,
    context: List[Message]
) -> np.ndarray:
    output = serve_engine.generate(
        chat_ml_sample=ChatMLSample(
            messages=context + [Message(role="user", content=chunk_text)]
        ),
        max_new_tokens=len(chunk_text) // 3 + min(2000, (len(chunk_text) // 3) * 10) + 256,
        stop_strings=["<|end_of_text|>", "<|eot_id|>"],
        temperature=temperature,
        top_p=top_p,
    )
    
    if output.audio is None or len(output.audio) == 0:
        raise ValueError("Model produced no audio.")
    
    return output.audio


async def normalize_single_chunk(text: str) -> str:
    try:
        normalized = await normalize_text_with_openai(text)
        return normalize_text_for_tts(normalized)
    except Exception as e:
        logger.warning(f"Failed to normalize chunk: {e}")
        return normalize_text_for_tts(text)


async def process_project_background(project_id: str) -> None:
    async with generation_lock:
        path = PROJECTS_DIR / f"{project_id}.json"
        project = json.loads(path.read_text())
        source = project.get("original_text", "")
        
        if project.get("auto_normalize"):
            project["status"] = "normalizing"
            _write_project(project)
            normalized = await normalize_text_with_openai(source)
            project["was_normalized"] = normalized != source
            project["normalized_text"] = normalized if project["was_normalized"] else None
            text_for_chunks = normalize_text_for_tts(normalized)
        else:
            text_for_chunks = normalize_text_for_tts(source)
        
        project["chunks"] = [
            {
                "index": i,
                "text": chunk,
                "status": "pending",
                "original_text": chunk
            }
            for i, chunk in enumerate(split_text_into_chunks(text_for_chunks))
        ]
        
        project["status"] = "processing"
        _write_project(project)
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _process_generation_sync, project_id)


def _process_generation_sync(project_id: str) -> None:
    path = PROJECTS_DIR / f"{project_id}.json"
    project = json.loads(path.read_text())
    num_chunks = len(project.get("chunks", []))
    
    for i in range(num_chunks):
        project = json.loads(path.read_text())
        if project.get("status") == "cancelling":
            cleanup_project_data(project_id)
            return
        
        chunk = project["chunks"][i]
        if chunk.get("status") == "completed":
            continue
        
        chunk["status"] = "processing"
        chunk["start_time"] = time.time()
        _write_project(project)
        
        try:
            chunk_text = chunk["text"]
            if project.get("auto_normalize"):
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    normalized_text = loop.run_until_complete(normalize_single_chunk(chunk_text))
                    chunk["normalized_text"] = normalized_text
                    chunk_text = normalized_text
                finally:
                    loop.close()
            
            context = _context_messages(project, i)
            audio = _generate_chunk(
                chunk_text,
                project["params"]["temperature"],
                project["params"]["top_p"],
                context
            )
            
            filename = f"{project_id}_chunk_{i}.wav"
            sf.write((STORAGE_DIR / filename).as_posix(), audio, SAMPLING_RATE)
            
            project = json.loads(path.read_text())
            chunk = project["chunks"][i]
            chunk["status"] = "completed"
            chunk["audio_filename"] = filename
            chunk["error"] = None
            
            if i == 0:
                project["voice_ref_path"] = (STORAGE_DIR / filename).as_posix()
        
        except Exception as e:
            project = json.loads(path.read_text())
            project["chunks"][i]["status"] = "failed"
            project["chunks"][i]["error"] = str(e)
        
        finally:
            chunk = project["chunks"][i]
            chunk["elapsed_time"] = time.time() - chunk.get("start_time", time.time())
            update_project_progress(project)
            _write_project(project)
    
    project = json.loads(path.read_text())
    all_completed = all(c["status"] == "completed" for c in project["chunks"])
    project["status"] = "completed" if all_completed else "review"
    _write_project(project)


async def regenerate_chunk_async(project_id: str, chunk_index: int) -> None:
    async with generation_lock:
        await _regenerate_chunk_sync(project_id, chunk_index)


async def _regenerate_chunk_sync(project_id: str, chunk_index: int) -> None:
    path = PROJECTS_DIR / f"{project_id}.json"
    project = json.loads(path.read_text())
    chunk = project["chunks"][chunk_index]
    
    old_filename = chunk.get("audio_filename")
    if old_filename:
        old_path = STORAGE_DIR / old_filename
        if old_path.exists():
            try:
                old_path.unlink()
            except Exception:
                pass
    
    chunk["status"] = "processing"
    chunk["start_time"] = time.time()
    chunk["error"] = None
    chunk["audio_filename"] = None
    _write_project(project)
    
    try:
        chunk_text = chunk.get("original_text", chunk["text"])
        
        if project.get("auto_normalize"):
            normalized_text = await normalize_single_chunk(chunk_text)
            chunk["normalized_text"] = normalized_text
            chunk_text = normalized_text
        
        context = _context_messages(project, chunk_index)
        audio = _generate_chunk(
            chunk_text,
            project["params"]["temperature"],
            project["params"]["top_p"],
            context
        )
        
        filename = f"{project_id}_chunk_{chunk_index}_regen_{int(time.time())}.wav"
        sf.write((STORAGE_DIR / filename).as_posix(), audio, SAMPLING_RATE)
        chunk["status"] = "completed"
        chunk["audio_filename"] = filename
        
        if chunk_index == 0:
            project["voice_ref_path"] = (STORAGE_DIR / filename).as_posix()
    
    except Exception as e:
        chunk["status"] = "failed"
        chunk["error"] = str(e)
    
    finally:
        chunk["elapsed_time"] = time.time() - chunk.get("start_time", time.time())
        all_completed = all(c["status"] == "completed" for c in project["chunks"])
        project["status"] = "completed" if all_completed else "review"
        update_project_progress(project)
        _write_project(project)


def stitch_project_audio(project_id: str) -> str:
    path = PROJECTS_DIR / f"{project_id}.json"
    if not path.exists():
        raise ValueError("Project not found")
    
    project = json.loads(path.read_text())
    ordered_chunks = [
        chunk for chunk in sorted(project["chunks"], key=lambda x: x["index"])
        if chunk.get("status") == "completed" and chunk.get("audio_filename")
    ]
    
    if not ordered_chunks:
        raise ValueError("No completed audio chunks to stitch.")
    
    arrays = []
    for chunk in ordered_chunks:
        data, _ = sf.read((STORAGE_DIR / chunk["audio_filename"]).as_posix())
        arrays.append(data)
    
    final = np.concatenate(arrays)
    filename = f"{project_id}_final.wav"
    sf.write((STORAGE_DIR / filename).as_posix(), final, SAMPLING_RATE)
    project["final_audio_path"] = filename
    _write_project(project)
    return filename


def create_project(
    text: str,
    voice_id: str,
    temperature: float,
    top_p: float,
    auto_normalize: bool
) -> Dict[str, Any]:
    project_id = f"proj_{uuid.uuid4().hex}"
    voice_ref = None
    
    if voice_id != "smart_voice":
        voice_ref = CLONED_VOICES_DIR / f"{voice_id}.wav"
        if not voice_ref.exists():
            raise FileNotFoundError("Cloned voice sample not found.")
        voice_ref = voice_ref.as_posix()
    
    initial_status = "normalizing" if auto_normalize else "processing"
    payload = {
        "id": project_id,
        "status": initial_status,
        "original_text": text,
        "auto_normalize": auto_normalize,
        "params": {"temperature": float(temperature), "top_p": float(top_p)},
        "chunks": [],
        "voice_ref_path": voice_ref,
        "is_smart_voice": voice_id == "smart_voice",
        "was_normalized": False,
        "normalized_text": None,
    }
    
    (PROJECTS_DIR / f"{project_id}.json").write_text(json.dumps(payload, indent=2))
    return payload


def register_saved_audio(
    source_filename: str,
    display_name: str,
    audio_type: str
) -> Dict[str, Any]:
    source = STORAGE_DIR / source_filename
    if not source.exists():
        raise FileNotFoundError("Source audio file not found")
    
    saved_id = f"saved_{uuid.uuid4().hex[:8]}"
    destination = SAVED_AUDIO_DIR / f"{saved_id}.wav"
    destination.write_bytes(source.read_bytes())
    
    metadata = {
        "id": saved_id,
        "filename": destination.name,
        "display_name": display_name,
        "audio_type": audio_type,
        "created_at": datetime.now().isoformat(),
        "source_filename": source_filename,
    }
    
    saved_audio[saved_id] = metadata
    save_saved_audio(saved_audio)
    return metadata