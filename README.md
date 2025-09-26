# Emberglow-TTS 🔥🎙️

Professional long-form Text-to-Speech with per‑chunk review, voice cloning, and optional “smart” script normalization.

> Demo UI: React + Vite + Tailwind • API: FastAPI (Uvicorn) • TTS: HiggsAudio v2

---

## Features
- **Chunked long‑form generation** – generate, review, retry, and stitch segments.
- **Smart script prep** – optional OpenAI-powered normalization for cleaner TTS (numbers → words, punctuation, etc.).
- **Voice cloning** – upload or record a 10–30s voice sample and test instantly.
- **Saved audio library** – download or manage previously generated clips.
- **Modern UI** – React + Vite + Tailwind; responsive, accessible controls.

## Tech stack
- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** FastAPI, Uvicorn
- **TTS engine:** `boson_multimodal` HiggsAudio v2 (with optional OpenAI normalization)
- **Audio IO:** NumPy, SoundFile
- **Languages:** TypeScript (UI), Python 3.10+ (API)

---

## Quickstart

### 0) Prerequisites
- **Node.js** ≥ 18
- **Python** ≥ 3.10 (3.11+ recommended)
- (Optional) **CUDA GPU** for fastest generation
- (Optional) `OPENAI_API_KEY` if you want smart text normalization

### 1) Backend
```bash
# from repo root
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip

# Install runtime deps
pip install fastapi uvicorn numpy soundfile torch openai boson-multimodal
# If you need platform-specific torch, install from https://pytorch.org/get-started/locally/

# Run the API
export OPENAI_API_KEY=your_key_here   # optional, enables smart normalization
uvicorn app.server:app --reload --port 8000
```

### 2) Frontend (dev)
```bash
cd ui
npm i
# Tell the UI to hit /api in dev, which Vite will proxy to localhost:8000
printf "VITE_API_BASE=/api\n" > .env.local
npm run dev
```
- Open **http://localhost:5173**. Vite proxies `/api` → **http://localhost:8000**.

### 3) Single‑server production
Build the UI and let FastAPI serve it:
```bash
cd ui && npm run build && cd ..
uvicorn app.server:app --host 0.0.0.0 --port 8000
```
- The UI will be available at **http://localhost:8000**.
- Set `VITE_API_BASE=` (empty) for production builds **if your API has no `/api` prefix**.
- Alternatively, mount your FastAPI routes under `/api` and keep `VITE_API_BASE=/api`.

---

## Configuration

| Variable | Where | Default | Description |
|---|---|---:|---|
| `VITE_API_BASE` | UI env | `/api` (dev) | Base path/URL for API calls from the browser. Use relative paths in production. |
| `OPENAI_API_KEY` | Backend env | — | Enables “Smart Text Optimization” (OpenAI). If unset, the app falls back to minimal whitespace normalization. |
| `ALLOWED_ORIGINS` | Backend env | `*` | (Optional) Comma-separated CORS origins for production. |

**Directories (auto-created):**
```
generated_audio/   # temporary & generated chunk/final audio
cloned_voices/     # saved voice samples + metadata
saved_audio/       # user-saved final audio exports
projects/          # project JSON state
```

---

## Using the app

1. **Generate Audio**
   - Choose a voice (or `Smart Voice (Auto)`).
   - (Optional) Enable **Smart Text Optimization** to normalize the script via OpenAI.
   - Paste your script and click **Generate Audio**.
   - Watch each chunk progress; retry individual chunks as needed.
2. **Stitch & Save**
   - When all chunks complete, **Download** or **Save** the stitched WAV.
   - If normalization was used, you can also **download the normalized text**.
3. **Clone a Voice**
   - Upload or record a **10–30s** sample.
   - **Test Voice** to preview.
   - **Save Voice** to use it in future projects.
4. **Manage Saved Audio**
   - Browse, play, download, and delete saved exports.

---

## API (selected endpoints)

> Prefix your endpoints with `/api` if running behind a path prefix (dev proxy uses `/api`). If your production server exposes routes at root, call them without the prefix and set `VITE_API_BASE=` for the UI build.

### Projects
- `POST /project` – start generation  
  **Form fields:** `text`, `voice_id` (`smart_voice` or cloned id), `temperature`, `top_p`, `auto_normalize`  
  **Resp:** `{ project_id, status }`
- `GET /project/{id}` – get project status/progress (poll)
- `POST /project/{id}/chunk/{idx}/regenerate` – retry a specific chunk
- `POST /project/{id}/stitch` – stitch all completed chunks → `{ final_audio_filename }`
- `POST /project/{id}/cancel` – mark a running project for cancellation
- `GET /project/{id}/normalized-text` – download normalized script (if enabled)

### Voices
- `GET /voices` – list voices (`smart_voice` + cloned)
- `POST /clone-voice` – upload sample (`voice_sample`) + name (`voice_name`)
- `POST /test-voice` – try a voice: upload `audio` + `text`
- `PUT /voices/{id}` – rename cloned voice
- `DELETE /voices/{id}` – delete cloned voice

### Saved audio
- `POST /saved-audio` – save generated file: `audio_filename`, `display_name`, `audio_type`
- `GET /saved-audio` – list
- `DELETE /saved-audio/{saved_id}` – delete

### Static audio
- `GET /audio/{filename}` – stream a WAV by filename

---

## Architecture

```
React (Vite) ── axios ─────────────────────┐
                                           │
                               FastAPI (Uvicorn)
                                           │
                                  HiggsAudio v2
                                           │
                           NumPy / SoundFile (WAV IO)
```

- Long-running tasks are processed in-process with a coarse async lock; polling is client-side via `/project/{id}`.
- Optional OpenAI normalization runs before chunking.

---

## Security & Production notes

- Sanitize user input (filenames, uploads). Reject path traversal and ensure basenames only.
- Restrict CORS in production (`ALLOWED_ORIGINS`).
- Consider background cleanup of temporary test files and old projects.
- If exposing publicly, put it behind a reverse proxy (nginx) and serve over HTTPS.

---

## Development

- **Linting/Format:** ESLint + TypeScript. Run `npm run lint` in `/ui`.
- **Testing:** Add unit tests for chunking, normalization fallback, and API routes (`pytest` + `httpx`).

---

### Hardware & GPU

> **Recommended:** NVIDIA GPU with **≥ 24 GB VRAM** for smooth generation (e.g., RTX 4090 24GB, RTX A5000 24GB, RTX 6000 Ada 48GB, A6000 48GB).  
> **Works on lower VRAM** for shorter clips or with smaller decoding budgets, but throughput and max prompt lengths will drop.  
> **CPU-only** is not recommended (extremely slow).

We align with Higgs Audio’s guidance and use the official NGC PyTorch images:
- `nvcr.io/nvidia/pytorch:25.02-py3` (preferred)
- `nvcr.io/nvidia/pytorch:25.01-py3` (also verified)

---

## License

MIT © Emberglow

## Acknowledgements

- BosonAI HiggsAudio v2