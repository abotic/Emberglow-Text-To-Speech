import base64
import json
import uuid
from datetime import datetime
from pathlib import Path

import soundfile as sf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import (
    STORAGE_DIR,
    CLONED_VOICES_DIR,
    SAVED_AUDIO_DIR,
    PROJECTS_DIR,
    OPENAI_API_KEY,
    saved_audio,
    save_saved_audio,
    generation_lock,
)
from app.projects import (
    create_project,
    process_project_background,
    stitch_project_audio,
    cleanup_project_data,
    regenerate_chunk_async,
    register_saved_audio,
)
from app.engine import SAMPLING_RATE, serve_engine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent


def create_app() -> FastAPI:
    app = FastAPI(title="Emberglow-TTS API")
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    @app.get("/config", tags=["System"])
    async def get_config():
        return {"is_openai_enabled": bool(OPENAI_API_KEY)}
    
    @app.post("/project", status_code=202, tags=["Project"])
    async def start_project(
        background_tasks: BackgroundTasks,
        text: str = Form(...),
        voice_id: str = Form(...),
        temperature: float = Form(0.2),
        top_p: float = Form(0.95),
        auto_normalize: bool = Form(True),
    ):
        try:
            payload = create_project(text, voice_id, temperature, top_p, auto_normalize)
            background_tasks.add_task(process_project_background, payload["id"])
            return {"project_id": payload["id"], "status": payload["status"]}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    
    @app.get("/project/{project_id}", tags=["Project"])
    async def get_project(project_id: str):
        path = PROJECTS_DIR / f"{project_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Project not found")
        
        try:
            data = json.loads(path.read_text())
            data.pop("original_text", None)
            data.pop("normalized_text", None)
            return data
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=503,
                detail="Project file is currently being updated. Please try again."
            )
    
    @app.get("/project/{project_id}/normalized-text", tags=["Project"])
    async def get_normalized_text(project_id: str):
        path = PROJECTS_DIR / f"{project_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Project not found")
        
        project = json.loads(path.read_text())
        if not project.get("was_normalized"):
            raise HTTPException(status_code=404, detail="No normalized text available")
        
        text = project.get("normalized_text") or ""
        if not text:
            raise HTTPException(status_code=404, detail="Normalized text not found")
        
        return Response(
            content=text,
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{project_id}_normalized.txt"'
            },
        )
    
    @app.get("/active-projects", tags=["Project"])
    async def list_active_projects():
        active = []
        for filepath in PROJECTS_DIR.glob("*.json"):
            try:
                project = json.loads(filepath.read_text())
                if project.get("status") in ["pending", "processing", "normalizing"]:
                    active.append({
                        "id": project["id"],
                        "name": project.get("name", "Unnamed Project"),
                        "status": project["status"]
                    })
            except Exception:
                continue
        return active
    
    @app.post("/project/{project_id}/stitch", tags=["Project"])
    async def stitch_audio(project_id: str):
        try:
            filename = stitch_project_audio(project_id)
            return {"final_audio_filename": filename}
        except (ValueError, FileNotFoundError) as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    @app.post("/project/{project_id}/cancel", status_code=200, tags=["Project"])
    async def cancel_project(project_id: str):
        path = PROJECTS_DIR / f"{project_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Project not found")
        
        data = json.loads(path.read_text())
        if data.get("status") not in ["pending", "processing", "normalizing"]:
            return {"message": "Project is not in a cancellable state."}
        
        data["status"] = "cancelling"
        path.write_text(json.dumps(data, indent=2))
        return {"message": "Project cancellation requested."}
    
    @app.post("/project/{project_id}/cleanup", status_code=200, tags=["Project"])
    async def cleanup_project(project_id: str, background_tasks: BackgroundTasks):
        path = PROJECTS_DIR / f"{project_id}.json"
        if not path.exists():
            return {"message": "Project not found, no action taken."}
        
        background_tasks.add_task(cleanup_project_data, project_id)
        return {"message": "Project cleanup has been scheduled."}
    
    @app.post("/project/{project_id}/chunk/{chunk_index}/regenerate", status_code=202, tags=["Project"])
    async def regenerate_chunk(
        project_id: str,
        chunk_index: int,
        background_tasks: BackgroundTasks
    ):
        path = PROJECTS_DIR / f"{project_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Project not found")
        
        project = json.loads(path.read_text())
        if not 0 <= chunk_index < len(project.get("chunks", [])):
            raise HTTPException(status_code=400, detail="Invalid chunk index")
        
        background_tasks.add_task(regenerate_chunk_async, project_id, chunk_index)
        return {"message": f"Regeneration for chunk {chunk_index} has been queued."}
    
    @app.get("/voices", tags=["Voices"])
    async def list_voices():
        defaults = [{"id": "smart_voice", "name": "Smart Voice (Auto)"}]
        clones = []
        
        if CLONED_VOICES_DIR.exists():
            for filepath in CLONED_VOICES_DIR.glob("*.json"):
                try:
                    clones.append(json.loads(filepath.read_text()))
                except Exception:
                    continue
        
        return defaults + clones
    
    @app.post("/clone-voice", tags=["Voices"])
    async def clone_voice(
        voice_sample: UploadFile = File(...),
        voice_name: str = Form(...)
    ):
        voice_id = f"clone_{_generate_id()}"
        wav_path = CLONED_VOICES_DIR / f"{voice_id}.wav"
        wav_path.write_bytes(await voice_sample.read())
        
        metadata = {
            "id": voice_id,
            "name": voice_name,
            "tags": ["cloned"],
            "created_at": _timestamp()
        }
        
        (CLONED_VOICES_DIR / f"{voice_id}.json").write_text(json.dumps(metadata, indent=2))
        return metadata
    
    @app.put("/voices/{voice_id}", tags=["Voices"])
    async def rename_voice(voice_id: str, voice_data: dict):
        json_path = CLONED_VOICES_DIR / f"{voice_id}.json"
        if not json_path.exists():
            raise HTTPException(status_code=404, detail="Voice not found")
        
        metadata = json.loads(json_path.read_text())
        if "name" in voice_data:
            metadata["name"] = voice_data["name"]
        
        json_path.write_text(json.dumps(metadata, indent=2))
        return metadata
    
    @app.delete("/voices/{voice_id}", tags=["Voices"])
    async def delete_voice(voice_id: str):
        json_path = CLONED_VOICES_DIR / f"{voice_id}.json"
        wav_path = CLONED_VOICES_DIR / f"{voice_id}.wav"
        
        if not json_path.exists():
            raise HTTPException(status_code=404, detail="Voice not found")
        
        try:
            json_path.unlink(missing_ok=True)
            wav_path.unlink(missing_ok=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete voice: {e}")
        
        return {"message": "Voice deleted successfully"}
    
    @app.post("/test-voice", tags=["Voices"])
    async def test_voice(
        audio: UploadFile = File(...),
        text: str = Form("This is a test of my cloned voice. How does it sound?"),
        temperature: float = Form(0.2)
    ):
        name = audio.filename.lower()
        if not name.endswith((".wav", ".mp3", ".m4a", ".ogg")):
            raise HTTPException(status_code=400, detail="Invalid audio format")
        
        async with generation_lock:
            temp_path = STORAGE_DIR / f"test_voice_{_generate_id()}.wav"
            temp_path.write_bytes(await audio.read())
            
            try:
                b64 = base64.b64encode(temp_path.read_bytes()).decode("utf-8")
                context = [
                    Message(role="user", content="Reference audio"),
                    Message(
                        role="assistant",
                        content=AudioContent(raw_audio=b64, audio_url="placeholder")
                    )
                ]
                
                output = serve_engine.generate(
                    chat_ml_sample=ChatMLSample(
                        messages=context + [Message(role="user", content=text)]
                    ),
                    max_new_tokens=len(text) // 3 + 256,
                    stop_strings=["<|end_of_text|>", "<|eot_id|>"],
                    temperature=float(temperature),
                    top_p=0.95,
                )
                
                if output.audio is None or len(output.audio) == 0:
                    raise ValueError("Model produced no audio.")
                
                result_path = STORAGE_DIR / f"test_result_{_generate_id()}.wav"
                sf.write(result_path.as_posix(), output.audio, SAMPLING_RATE)
                
                temp_path.unlink(missing_ok=True)
                return FileResponse(result_path.as_posix(), media_type="audio/wav")
            
            except Exception as e:
                temp_path.unlink(missing_ok=True)
                raise HTTPException(status_code=500, detail=f"Voice test failed: {e}")
    
    @app.post("/saved-audio", tags=["Saved Audio"])
    async def save_audio(
        audio_filename: str = Form(...),
        display_name: str = Form(...),
        audio_type: str = Form("standard")
    ):
        try:
            return register_saved_audio(audio_filename, display_name, audio_type)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    
    @app.get("/saved-audio", tags=["Saved Audio"])
    async def list_saved_audio():
        return list(saved_audio.values())
    
    @app.delete("/saved-audio/{saved_id}", tags=["Saved Audio"])
    async def delete_saved_audio(saved_id: str):
        if saved_id not in saved_audio:
            raise HTTPException(status_code=404, detail="Saved audio not found")
        
        filepath = SAVED_AUDIO_DIR / saved_audio[saved_id]["filename"]
        if filepath.exists():
            try:
                filepath.unlink()
            except Exception:
                pass
        
        del saved_audio[saved_id]
        save_saved_audio(saved_audio)
        return {"message": "Audio deleted successfully"}
    
    @app.get("/audio/{filename}", tags=["Audio"])
    async def get_audio(filename: str):
        if filename != Path(filename).name:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        for directory in (STORAGE_DIR, SAVED_AUDIO_DIR, CLONED_VOICES_DIR):
            path = directory / filename
            if path.exists() and _safe_inside(path, directory):
                return FileResponse(path.as_posix(), media_type="audio/wav")
        
        raise HTTPException(status_code=404, detail="File not found")
    
    ui_assets = Path("ui/dist/assets")
    if ui_assets.exists():
        app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index_path = Path("ui/dist/index.html")
        if index_path.exists():
            return FileResponse(index_path.as_posix())
        raise HTTPException(
            status_code=404,
            detail="UI not found. Please build the UI first."
        )
    
    return app


def _generate_id(length: int = 8) -> str:
    return uuid.uuid4().hex[:length]


def _timestamp() -> str:
    return datetime.now().isoformat()


def _safe_inside(path: Path, base: Path) -> bool:
    try:
        path.resolve().relative_to(base.resolve())
        return True
    except Exception:
        return False