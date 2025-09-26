import base64
import json
import time
import uuid
import asyncio
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
from app.normalization import normalize_text_for_tts, split_text_into_chunks, normalize_text_with_openai
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

def _read_project(project_id: str) -> Dict[str, Any]:
    p = PROJECTS_DIR / f"{project_id}.json"
    return json.loads(p.read_text())

def _write_project(project: Dict[str, Any]) -> None:
    p = PROJECTS_DIR / f"{project['id']}.json"
    p.write_text(json.dumps(project, indent=2))

def update_project_progress(project: Dict[str, Any]) -> None:
    completed = sum(1 for c in project["chunks"] if c["status"] == "completed")
    total = len(project["chunks"])
    project["completed_chunks"] = completed
    project["total_chunks"] = total
    project["progress_percent"] = int((completed / total) * 100) if total else 0

def cleanup_project_data(project_id: str) -> None:
    try:
        p = PROJECTS_DIR / f"{project_id}.json"
        if not p.exists():
            return
        project = json.loads(p.read_text())
        for c in project.get("chunks", []):
            fn = c.get("audio_filename")
            if not fn:
                continue
            fp = STORAGE_DIR / fn
            if fp.exists():
                try:
                    fp.unlink()
                except Exception:
                    pass
        p.unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"Cleanup failed for {project_id}: {e}")

def _context_messages(project: Dict[str, Any], chunk_index: int = 0) -> List[Message]:
    msgs: List[Message] = []
    is_smart = project.get("is_smart_voice", False)
    ref_path = project.get("voice_ref_path")

    def _audio_message_from_path(path: Path) -> List[Message]:
        raw = path.read_bytes()
        b64 = base64.b64encode(raw).decode("utf-8")
        return [
            Message(role="user", content="Reference audio"),
            Message(role="assistant", content=AudioContent(raw_audio=b64, audio_url="placeholder")),
        ]

    if is_smart:
        if chunk_index == 0:
            if ref_path and Path(ref_path).exists():
                msgs = _audio_message_from_path(Path(ref_path))
        else:
            first = project["chunks"][0]
            fn = first.get("audio_filename")
            if first.get("status") == "completed" and fn:
                fp = STORAGE_DIR / fn
                if fp.exists():
                    msgs = _audio_message_from_path(fp)
    else:
        if ref_path and Path(ref_path).exists():
            msgs = _audio_message_from_path(Path(ref_path))
    return msgs

def _generate_chunk(chunk_text: str, temperature: float, top_p: float, ctx: List[Message]) -> np.ndarray:
    out = serve_engine.generate(
        chat_ml_sample=ChatMLSample(messages=ctx + [Message(role="user", content=chunk_text)]),
        max_new_tokens=len(chunk_text) // 3 + min(2000, (len(chunk_text) // 3) * 10) + 256,
        stop_strings=["<|end_of_text|>", "<|eot_id|>"],
        temperature=temperature,
        top_p=top_p,
    )
    if out.audio is None or len(out.audio) == 0:
        raise ValueError("Model produced no audio.")
    return out.audio

async def process_project_background(project_id: str) -> None:
    async with generation_lock:
        path = PROJECTS_DIR / f"{project_id}.json"
        project = json.loads(path.read_text())
        src = project.get("original_text", "")

        if project.get("auto_normalize"):
            project["status"] = "normalizing"
            _write_project(project)
            norm = await normalize_text_with_openai(src)
            project["was_normalized"] = norm != src
            project["normalized_text"] = norm if project["was_normalized"] else None
            text_for_chunks = normalize_text_for_tts(norm)
        else:
            text_for_chunks = normalize_text_for_tts(src)

        project["chunks"] = [
            {"index": i, "text": c, "status": "pending"}
            for i, c in enumerate(split_text_into_chunks(text_for_chunks))
        ]
        
        project["status"] = "processing"
        _write_project(project)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _process_generation_sync, project_id)

def _process_generation_sync(project_id: str) -> None:
    path = PROJECTS_DIR / f"{project_id}.json"
    project = json.loads(path.read_text())
    n = len(project.get("chunks", []))
    is_smart = project.get("is_smart_voice", False)
    for i in range(n):
        project = json.loads(path.read_text())
        if project.get("status") == "cancelling":
            cleanup_project_data(project_id)
            return
            
        ch = project["chunks"][i]
        if ch.get("status") == "completed":
            continue
        ch["status"] = "processing"
        ch["start_time"] = time.time()
        _write_project(project)
        try:
            ctx = _context_messages(project, i)
            audio = _generate_chunk(ch["text"], project["params"]["temperature"], project["params"]["top_p"], ctx)
            fn = f"{project_id}_chunk_{i}.wav"
            sf.write((STORAGE_DIR / fn).as_posix(), audio, SAMPLING_RATE)
            project = json.loads(path.read_text())
            ch = project["chunks"][i]
            ch["status"] = "completed"
            ch["audio_filename"] = fn
            ch["error"] = None
            if is_smart and i == 0:
                project["voice_ref_path"] = (STORAGE_DIR / fn).as_posix()
        except Exception as e:
            project = json.loads(path.read_text())
            project["chunks"][i]["status"] = "failed"
            project["chunks"][i]["error"] = str(e)
        finally:
            ch = project["chunks"][i]
            ch["elapsed_time"] = time.time() - ch.get("start_time", time.time())
            update_project_progress(project)
            _write_project(project)

    project = json.loads(path.read_text())
    project["status"] = "completed" if all(c["status"] == "completed" for c in project["chunks"]) else "review"
    _write_project(project)

async def regenerate_chunk_async(project_id: str, chunk_index: int) -> None:
    async with generation_lock:
        await _regenerate_chunk_sync(project_id, chunk_index)

async def _regenerate_chunk_sync(project_id: str, chunk_index: int) -> None:
    path = PROJECTS_DIR / f"{project_id}.json"
    project = json.loads(path.read_text())
    ch = project["chunks"][chunk_index]
    ctx = _context_messages(project, chunk_index)
    old = ch.get("audio_filename")
    if old:
        op = STORAGE_DIR / old
        if op.exists():
            try:
                op.unlink()
            except Exception:
                pass
    ch["status"] = "processing"
    ch["start_time"] = time.time()
    ch["error"] = None
    ch["audio_filename"] = None
    _write_project(project)
    try:
        audio = _generate_chunk(ch["text"], project["params"]["temperature"], project["params"]["top_p"], ctx)
        fn = f"{project_id}_chunk_{chunk_index}_regen_{int(time.time())}.wav"
        sf.write((STORAGE_DIR / fn).as_posix(), audio, SAMPLING_RATE)
        ch["status"] = "completed"
        ch["audio_filename"] = fn
        if project.get("is_smart_voice") and chunk_index == 0:
            project["voice_ref_path"] = (STORAGE_DIR / fn).as_posix()
    except Exception as e:
        ch["status"] = "failed"
        ch["error"] = str(e)
    finally:
        ch["elapsed_time"] = time.time() - ch.get("start_time", time.time())
        project["status"] = "completed" if all(c["status"] == "completed" for c in project["chunks"]) else "review"
        update_project_progress(project)
        _write_project(project)

def stitch_project_audio(project_id: str) -> str:
    path = PROJECTS_DIR / f"{project_id}.json"
    if not path.exists():
        raise ValueError("Project not found")
    project = json.loads(path.read_text())
    ordered = [c for c in sorted(project["chunks"], key=lambda x: x["index"]) if c.get("status") == "completed" and c.get("audio_filename")]
    if not ordered:
        raise ValueError("No completed audio chunks to stitch.")
    arrays = []
    for c in ordered:
        data, _ = sf.read((STORAGE_DIR / c["audio_filename"]).as_posix())
        arrays.append(data)
    final = np.concatenate(arrays)
    fn = f"{project_id}_final.wav"
    sf.write((STORAGE_DIR / fn).as_posix(), final, SAMPLING_RATE)
    project["final_audio_path"] = fn
    _write_project(project)
    return fn

def create_project(text: str, voice_id: str, temperature: float, top_p: float, auto_normalize: bool) -> Dict[str, Any]:
    project_id = f"proj_{uuid.uuid4().hex}"
    voice_ref = None
    if voice_id != "smart_voice":
        voice_ref = (CLONED_VOICES_DIR / f"{voice_id}.wav")
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
        "is_smart_voice": True,
        "was_normalized": False,
        "normalized_text": None,
    }
    (PROJECTS_DIR / f"{project_id}.json").write_text(json.dumps(payload, indent=2))
    return payload

def register_saved_audio(source_filename: str, display_name: str, audio_type: str) -> Dict[str, Any]:
    src = STORAGE_DIR / source_filename
    if not src.exists():
        raise FileNotFoundError("Source audio file not found")
    saved_id = f"saved_{uuid.uuid4().hex[:8]}"
    dest = SAVED_AUDIO_DIR / f"{saved_id}.wav"
    dest.write_bytes(src.read_bytes())
    meta = {
        "id": saved_id,
        "filename": dest.name,
        "display_name": display_name,
        "audio_type": audio_type,
        "created_at": datetime.now().isoformat(),
        "source_filename": source_filename,
    }
    saved_audio[saved_id] = meta
    save_saved_audio(saved_audio)
    return meta
