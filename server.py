import uvicorn
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse
import torch
import soundfile as sf
import io
import base64

from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
from boson_multimodal.data_types import ChatMLSample, Message, AudioContent

# --- Application Setup ---

app = FastAPI(title="Audio Generation API")

print("Initializing HiggsAudioServeEngine...")
device = "mps" if torch.backends.mps.is_available() else "cpu"
serve_engine = HiggsAudioServeEngine(
    "bosonai/higgs-audio-v2-generation-3B-base",
    "bosonai/higgs-audio-v2-tokenizer",
    device=device,
)
print(f"Model loaded and running on device: {device}")

# --- API Endpoints ---

def _create_audio_stream(audio_numpy, sample_rate):
    """Converts a NumPy audio array to a streaming WAV response."""
    buffer = io.BytesIO()
    sf.write(buffer, audio_numpy, sample_rate, format='WAV')
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="audio/wav")

@app.post("/generate/smart-voice", tags=["Generation"])
async def generate_smart_voice(text: str = Form(...)):
    """Generates audio from text using a model-selected voice."""
    messages = [Message(role="user", content=text)]
    chat_ml_sample = ChatMLSample(messages=messages)

    output = serve_engine.generate(
        chat_ml_sample=chat_ml_sample,
        max_new_tokens=2048,
        temperature=0.3,
        top_p=0.95
    )

    return _create_audio_stream(output.audio, output.sampling_rate)

@app.post("/generate/voice-clone", tags=["Generation"])
async def generate_voice_clone(text: str = Form(...), voice_sample: UploadFile = File(...)):
    """Generates audio by cloning a voice from an uploaded audio sample."""
    audio_bytes = await voice_sample.read()
    audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

    reference_transcript = "This is a reference audio for voice cloning."

    messages = [
        Message(role="user", content=reference_transcript),
        Message(role="assistant", content=AudioContent(raw_audio=audio_base64, audio_url="placeholder")),
        Message(role="user", content=text),
    ]
    chat_ml_sample = ChatMLSample(messages=messages)

    output = serve_engine.generate(
        chat_ml_sample=chat_ml_sample,
        max_new_tokens=2048,
        temperature=0.3,
        top_p=0.95
    )

    return _create_audio_stream(output.audio, output.sampling_rate)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)