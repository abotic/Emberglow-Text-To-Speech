import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional
import openai
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv() 

STORAGE_DIR = BASE_DIR / "generated_audio"
CLONED_VOICES_DIR = BASE_DIR / "cloned_voices"
SAVED_AUDIO_DIR = BASE_DIR / "saved_audio"
PROJECTS_DIR = BASE_DIR / "projects"
for d in (STORAGE_DIR, CLONED_VOICES_DIR, SAVED_AUDIO_DIR, PROJECTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

SAVED_AUDIO_METADATA_FILE = BASE_DIR / "saved_audio_metadata.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("emberglow")

generation_lock = asyncio.Lock()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai_client: Optional[openai.AsyncOpenAI] = openai.AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

def load_saved_audio() -> Dict[str, Any]:
    if SAVED_AUDIO_METADATA_FILE.exists():
        try:
            return json.loads(SAVED_AUDIO_METADATA_FILE.read_text())
        except Exception:
            return {}
    return {}

def save_saved_audio(payload: Dict[str, Any]) -> None:
    try:
        SAVED_AUDIO_METADATA_FILE.write_text(json.dumps(payload, indent=2))
    except Exception:
        pass

saved_audio: Dict[str, Any] = load_saved_audio()
