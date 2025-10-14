import torch

from app.config import logger
from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine


def _detect_device() -> str:
    if torch.cuda.is_available():
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.backends.cudnn.benchmark = True
        torch.set_float32_matmul_precision("high")
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


DEVICE = _detect_device()
logger.info(f"Device: {DEVICE}")

serve_engine = HiggsAudioServeEngine(
    "bosonai/higgs-audio-v2-generation-3B-base",
    "bosonai/higgs-audio-v2-tokenizer",
    device=DEVICE,
)

logger.info(f"Model ready on {serve_engine.device}")
SAMPLING_RATE = serve_engine.audio_tokenizer.sampling_rate