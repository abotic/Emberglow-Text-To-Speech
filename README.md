# Emberglow TTS

> Professional long-form text-to-speech generation powered by Higgs Audio V2

## Acknowledgments

This project is built on top of the incredible [Higgs Audio V2](https://github.com/boson-ai/higgs-audio) model by [Boson AI](https://www.boson.ai/). Their groundbreaking work in audio generation makes this application possible. Higgs Audio V2 is a state-of-the-art audio foundation model trained on over 10 million hours of audio data, achieving exceptional performance in emotional expressiveness and multi-speaker generation. Huge thanks to the Boson AI team for open-sourcing this technology and pushing the boundaries of what's possible in AI audio generation.

Check out their work:
- [Boson AI Website](https://www.boson.ai/)
- [Higgs Audio GitHub](https://github.com/boson-ai/higgs-audio)
- [Model on HuggingFace](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base)

## What is this?

Emberglow TTS is a production-ready application for generating high-quality, long-form audio content. Whether you're creating audiobooks, video narration, podcasts, or any voice content, this tool handles everything from script preparation to final audio output.

Unlike simple TTS tools that struggle with long scripts, Emberglow is built specifically for **long-form content**. It intelligently splits your script into manageable chunks, processes them with consistent voice characteristics, and gives you complete control over the final output. You can review each chunk individually, regenerate any section that doesn't sound quite right, and stitch everything together seamlessly.

**Why does this matter?** Most commercial TTS services charge per character or per minute of generated audio, which adds up fast for long-form content. A typical audiobook chapter can cost $50-200+ to generate with commercial APIs. With Emberglow, you run the model locally on your own hardware—the only cost is your OpenAI API usage for text normalization (typically $0.01-0.05 per project), making it dramatically more economical for content creators who need high-volume audio generation.

## Why did I build this?

Creating long-form audio content is challenging. Most TTS tools either:
- Limit you to short snippets (a few sentences)
- Produce inconsistent results across longer texts
- Don't handle complex formatting and pronunciation correctly
- Lack the ability to review and refine individual sections

I wanted a tool that could take a full script—whether it's a 20-minute video narration or a 2-hour audiobook chapter—and produce professional-quality audio with:
- **Consistent voice characteristics** throughout
- **Intelligent text normalization** to fix pronunciation issues automatically
- **Chunk-by-chunk review** so you can regenerate any part that needs adjustment
- **Voice cloning** for custom voices
- **Project management** to organize and save your work

The result is a system that bridges the gap between basic TTS tools and professional audio production.

---

### Demo video (click to start)
[![Emberglow TTS](https://img.youtube.com/vi/A7t4EBLahkk/maxresdefault.jpg)](https://www.youtube.com/watch?v=A7t4EBLahkk)

---

## Features

### Core Capabilities
- **Long-Form Generation**: Process scripts from a few paragraphs to entire books
- **Smart Text Optimization**: Automatic normalization using GPT-4o-mini to fix numbers, pronunciations, and formatting issues that cause TTS errors
- **Chunk-Based Processing**: Intelligent script splitting (~100 words per chunk) with seamless stitching
- **Zero-Shot Voice Cloning**: Upload a 10-30 second sample to create a custom voice
- **Smart Voice Mode**: Let the AI automatically select an appropriate voice based on your content

### Project Management
- **Real-Time Progress**: Watch your generation progress chunk-by-chunk with live updates
- **Chunk Review & Regeneration**: Listen to each chunk individually and regenerate any that need adjustment
- **Project Organization**: All your audio projects saved and organized in one place
- **Download Options**: Download individual chunks, final stitched audio, or normalized text

### Quality & Control
- **Temperature Control**: Adjust voice expressiveness from consistent (0.1) to creative (1.0)
- **Top-P Sampling**: Fine-tune generation diversity
- **Manual Override**: Disable auto-normalization and use custom script formatting
- **Batch Processing**: Queue and manage multiple projects

## Tech Stack

### Backend
- **Runtime**: Python 3.12+ with FastAPI
- **AI Model**: Higgs Audio V2 (3.6B parameters)
- **Text Processing**: OpenAI GPT-4o-mini for script normalization
- **Audio Processing**: PyTorch, soundfile, NumPy
- **Deployment**: Docker with NVIDIA GPU support

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **Build**: Vite
- **State Management**: React Context + Hooks

### Architecture
```
├── app/                  # Backend application
│   ├── config.py        # Configuration & environment
│   ├── engine.py        # Higgs Audio model initialization
│   ├── normalization.py # Text normalization & chunking
│   ├── projects.py      # Project & generation logic
│   └── routes.py        # FastAPI endpoints
│
├── ui/                  # Frontend application
│   └── src/
│       ├── components/  # React components
│       ├── services/    # API client
│       ├── hooks/       # Custom React hooks
│       └── utils/       # Helper functions
│
└── boson_multimodal/   # Higgs Audio V2 library
```

## Getting Started

### Prerequisites
- **GPU**: NVIDIA GPU with 24GB+ VRAM recommended (RTX 4090 or better for optimal performance)
  - *Note: Can run on CPU, but generation will be significantly slower (10-20x)*
- **API Keys**: 
  - OpenAI API key (for text normalization, optional but recommended)

### Option 1: One-Click Deployment on RunPod (Recommended)

The fastest way to get started is using our pre-built Docker image on RunPod:

1. **Create a Template**
   - Go to [RunPod Templates](https://www.runpod.io/console/user/templates)
   - Click "New Template"
   - Configure as follows:
     - **Template Name**: `Emberglow TTS Production`
     - **Template Type**: `Pod`
     - **Compute Type**: `Nvidia GPU`
     - **Container Image**: `antonio992/emberglow-tts-production`
     - **Container Disk**: `30 GB`
     - **Volume Disk**: `50 GB`
     - **Volume Mount Path**: `/workspace`
     - **HTTP Ports**: `8000`
   - Click "Save Template"

2. **Deploy a Pod**
   - Go to [RunPod Pods](https://www.runpod.io/console/pods)
   - Click "Deploy"
   - Select GPU: **RTX 4090** (or better)
   - Select your template: **Emberglow TTS Production**
   - Choose "On-Demand" or "Spot" (Spot is cheaper but can be interrupted)
   - Click "Deploy On-Demand" / "Deploy Spot"

3. **Configure Environment**
   - Once deployed, click on your pod
   - Click "Edit Pod"
   - Add environment variable:
     - `OPENAI_API_KEY` = `sk-...` (your OpenAI API key)
   - Save changes and restart the pod

4. **Access the Application**
   - Click "Connect" on your pod
   - Click the HTTP port link (8000)
   - The Emberglow UI will open in your browser

**Cost Estimate (RunPod):**
- RTX 4090: ~$0.69/hour on-demand, ~$0.34/hour spot
- Average project (30 minutes of audio): ~15-20 minutes generation time
- Cost per project: $0.23 on-demand, $0.11 spot

**Alternative Platforms:**
The same Docker image works on other GPU cloud providers:
- [Vast.ai](https://vast.ai) - Often cheaper, bid on spot instances
- [Lambda Labs](https://lambdalabs.com) - Premium GPUs, simple pricing
- [Google Cloud](https://cloud.google.com) / [AWS](https://aws.amazon.com) - Enterprise options with more flexibility

### Option 2: Quick Start with Docker (Local/VPS)

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/emberglow-tts.git
cd emberglow-tts
```

2. **Configure environment**

Create `.env` file in the root directory:
```env
OPENAI_API_KEY=sk-...
```

3. **Build and run**
```bash
docker build -t emberglow-tts .
docker run --gpus all -p 8000:8000 --env-file .env emberglow-tts
```

4. **Access the application**

Open http://localhost:8000 in your browser

### Option 3: Manual Installation (Development)

**Backend Setup:**
```bash
# Install Python dependencies
pip install -r requirements.txt
pip install -e .

# Configure environment
cp .env.example .env
# Edit .env with your OpenAI API key

# Run the server
python -m uvicorn server:app --host 0.0.0.0 --port 8000
```

**Frontend Setup (separate terminal):**
```bash
cd ui
npm install
npm run dev
```

The UI will be available at http://localhost:5173 (development) or served from the backend at http://localhost:8000 (production)

## Usage

### Generate Your First Audio

1. **Navigate to "Generate Audio" tab**

2. **Enter your project details:**
   - **Project Name**: Give your project a memorable name
   - **Voice**: Choose "Smart Voice" for auto-selection or select a cloned voice
   - **Script**: Paste your text (minimum 15 words)

3. **Adjust generation parameters (optional):**
   - **Temperature** (0.1-1.0): Lower = more consistent, Higher = more expressive
   - **Top-P** (0.1-1.0): Affects voice diversity
   - **Smart Text Optimization**: Recommended ON for best results

4. **Click "Generate Audio"**

The system will:
- Normalize your text if optimization is enabled
- Split into manageable chunks
- Generate each chunk with consistent voice
- Show real-time progress

5. **Review and refine:**
   - Listen to each chunk
   - Regenerate any chunk that needs adjustment
   - Download normalized text to see what was actually spoken

6. **Save your work:**
   - Click "Save" to keep the final audio in your library
   - Click "Download" to get the WAV file

### Clone a Custom Voice

1. **Go to "My Voices" tab**

2. **Upload or Record:**
   - **Upload File**: Choose a 10-30 second audio sample (WAV, MP3, M4A, OGG)
   - **Record Voice**: Use your microphone to record directly

3. **Test your voice (recommended):**
   - Click "Test Voice" to hear a sample
   - Listen and verify quality

4. **Name and save:**
   - Enter a unique name for your voice
   - Click "Save Voice"

5. **Use in projects:**
   - Your voice will appear in the voice selector
   - Select it when generating new audio

### Managing Projects

**Active Project Recovery:**
If you close your browser during generation, the system automatically detects active projects and offers to resume when you return.

**Saved Audio Library:**
- Access all your completed projects in the "Saved Audio" tab
- Download, replay, or delete saved audio
- Organized by creation date

## Environment Variables

### Backend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | OpenAI API key for text normalization (optional) |
| `CUDA_VISIBLE_DEVICES` | `0` | GPU device ID |
| `TORCH_CUDA_ARCH_LIST` | `8.9` | CUDA architecture version |

### Advanced Settings (Optional)

Create `app/config.py` overrides for:
- Custom chunk sizes
- Model parameters
- API timeouts
- Concurrency limits

## Architecture Highlights

### Intelligent Text Normalization

The normalization system uses GPT-4o-mini to transform raw scripts into TTS-optimized text:
- **Pronunciation fixes**: "café" → "kafay", "résumé" → "rezzoomay"
- **Number expansion**: "2025" → "twenty twenty-five"
- **Symbol conversion**: "$50" → "fifty dollars", "3.14" → "three point one four"
- **Punctuation cleanup**: Removes semicolons, em-dashes, ellipses
- **Quote handling**: Adds spaces around quotes to prevent parsing errors

### Smart Chunking Strategy

Scripts are split at natural boundaries:
1. Divide into ~100 word chunks at sentence breaks
2. Ensure no chunk starts with a quotation mark (prevents dialogue confusion)
3. Maintain narrative flow across chunk boundaries
4. Each chunk processed with context from surrounding chunks

### Consistent Voice Generation

For "Smart Voice" mode:
- First chunk: AI selects appropriate voice
- Subsequent chunks: Use first chunk as reference for consistency

For cloned voices:
- Reference audio embedded in every generation request
- Temperature and top-p settings applied consistently

### Real-Time Progress Tracking

- Server-Sent Events (SSE) for live updates
- Fallback to polling if SSE unavailable
- Graceful handling of connection issues
- Project state persisted across browser sessions

## Performance Considerations

**Hardware Requirements:**

**GPU (Recommended):**
- Minimum: 24GB VRAM (RTX 3090, RTX 4090, A5000, A6000)
- Recommended: **RTX 4090 or better** for optimal speed
- Generation speed: ~3-5 seconds per chunk (100 words)

**CPU (Fallback):**
- Can run on CPU without GPU
- Generation speed: ~30-50 seconds per chunk (100 words)
- Suitable for testing or low-volume generation
- Not recommended for production workloads

**Generation Speed Comparison:**
| Hardware | Time per Chunk (100 words) | Time for 30min Audio (~4500 words) |
|----------|---------------------------|-------------------------------------|
| RTX 4090 | ~3-5 seconds | ~12-15 minutes |
| RTX 3090 | ~5-7 seconds | ~15-20 minutes |
| CPU (32 cores) | ~30-50 seconds | ~90-120 minutes |

**Memory Usage:**
- Model: ~8GB VRAM (GPU) or ~12GB RAM (CPU)
- Audio buffers: ~2GB RAM
- Frontend: Minimal (<100MB)

**Notes:**
- First chunk takes longer (model loading: +10-20 seconds)
- Parallel chunk processing not currently supported (sequential for voice consistency)
- Longer scripts benefit more from GPU acceleration

## Development

### Backend Development
```bash
# Run with auto-reload
uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Type checking
mypy app/

# Format code
black app/
isort app/
```

### Frontend Development
```bash
cd ui

# Development server with HMR
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
```

### Docker Development
```bash
# Build with cache
docker build -t emberglow-tts .

# Or use the pre-built production image
docker pull antonio992/emberglow-tts-production

# Run with mounted volumes for development
docker run --gpus all -p 8000:8000 \
  -v $(pwd)/app:/app/app \
  -v $(pwd)/ui/dist:/app/ui/dist \
  --env-file .env \
  emberglow-tts
```

**Pre-built Docker Image:**
The production Docker image `antonio992/emberglow-tts-production` is automatically built and includes:
- Latest stable release
- All dependencies pre-installed
- Optimized for NVIDIA GPUs
- Ready for one-click deployment on platforms like RunPod, Vast.ai, or Lambda Labs

## Cost Comparison

**Why run your own TTS?**

Commercial TTS APIs charge per character or per audio minute, which becomes expensive for long-form content:

| Content Type | Typical Length | Commercial API Cost* | Emberglow Cost** |
|--------------|----------------|---------------------|------------------|
| Short video script | 500 words | $3-8 | $0.05 + compute |
| Podcast episode | 3,000 words | $20-50 | $0.20 + compute |
| Audiobook chapter | 8,000 words | $50-150 | $0.40 + compute |
| Full audiobook | 80,000 words | $500-1,500 | $4.00 + compute |

*Based on typical commercial pricing of $0.006-0.016 per character for premium voices  
**OpenAI normalization cost only; compute costs depend on your setup (RunPod: ~$0.11-0.23 per project)

**Break-even analysis:**
- If you generate 10+ hours of audio per month, self-hosting pays for itself
- For content creators producing regular audiobooks or video content, savings can be $500-2000/month
- One-time setup investment vs. ongoing per-character charges

**Additional benefits of self-hosting:**
- No per-character limits or quotas
- Full control over voice quality and generation parameters
- Privacy: your scripts never leave your infrastructure
- Offline generation capability (after initial model download)

## Troubleshooting

**"Model produced no audio"**
- Check GPU availability: `nvidia-smi`
- Verify CUDA version compatibility
- Try regenerating with different temperature
- If running on CPU, ensure sufficient RAM (16GB+)

**Generation is very slow**
- **Check if running on CPU**: Look at terminal output during generation
  - CPU: "Device: cpu"
  - GPU: "Device: cuda"
- **Solution**: Deploy on GPU (RTX 4090 recommended) or expect 10-20x longer generation times
- If on GPU: Check GPU utilization with `nvidia-smi` - should be 80-100% during generation

**Text normalization not working**
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API quotas and limits
- Normalization can be disabled if needed

**Audio quality issues**
- Try lower temperature (0.2-0.3) for clearer speech
- Use high-quality reference audio for voice cloning
- Ensure reference audio is 10-30 seconds, clear, no background noise

**Chunk regeneration slow**
- Expected: Each regeneration uses full model
- Optimize: Adjust chunk text before regenerating
- Workaround: Generate new project if many chunks need fixing

**RunPod deployment issues**
- **Forgot to add OPENAI_API_KEY**: Edit pod → Add environment variable → Restart pod
- **Port 8000 not accessible**: Check HTTP ports in template configuration
- **Pod stops unexpectedly**: Using spot instances? They can be interrupted - switch to on-demand
- **Out of memory**: Increase Container Disk (try 40-50GB) or Volume Disk size

## Frequently Asked Questions

**Q: Do I need an OpenAI API key?**  
A: Recommended but optional. Without it, you'll need to manually format your scripts according to TTS best practices. With it, GPT-4o-mini automatically fixes pronunciation, numbers, and formatting issues.

**Q: Can I run this on my local machine?**  
A: Yes! If you have an NVIDIA GPU with 24GB+ VRAM. Without a GPU, it will run on CPU but be much slower (10-20x).

**Q: How much does it cost to run?**  
A: OpenAI normalization: $0.01-0.05 per project. Compute: Free (local) or $0.11-0.69/hour (cloud GPU). See Cost Comparison section for details.

**Q: What's the audio quality like?**  
A: Comparable to premium commercial TTS. Higgs Audio V2 achieves 75.7% win rate over GPT-4o-mini-tts on emotion tests and state-of-the-art performance on traditional benchmarks.

**Q: Can I use my own voice?**  
A: Yes! Upload a 10-30 second clear audio sample to clone your voice. Works with any voice.

**Q: What languages are supported?**  
A: Primarily English. The model has some multilingual capability but is optimized for English content.

**Q: Can I generate background music or sound effects?**  
A: Not currently. The model focuses on speech generation. Background audio would need to be added in post-production.

## Future Enhancements

Planned features and improvements:

- [ ] Multiple voice profiles per project (dialogue/narration)
- [ ] Background music/ambiance mixing
- [ ] Batch project processing
- [ ] Custom normalization rules
- [ ] API access for programmatic generation
- [ ] Audio effects (reverb, EQ, compression)
- [ ] Export to video editor formats
- [ ] Webhook notifications for completed projects
- [ ] Multi-language support beyond English
- [ ] Voice style controls (whisper, shouting, etc.)

## Contributing

This is a personal / hobby project, but contributions are welcome! If you'd like to improve Emberglow:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commits
4. Test thoroughly (especially GPU compatibility)
5. Submit a pull request

**Areas where help is especially appreciated:**
- Performance optimizations
- Additional language support
- UI/UX improvements
- Documentation enhancements
- Bug fixes and error handling

## License

MIT License - see [LICENSE](LICENSE) file for details

## Credits & Thanks

**Powered by:**
- [Higgs Audio V2](https://github.com/boson-ai/higgs-audio) by [Boson AI](https://www.boson.ai/) - The foundation model that makes this possible
- [OpenAI](https://openai.com) - GPT-4o-mini for text normalization
- [FastAPI](https://fastapi.tiangolo.com/) - Modern, fast web framework
- [React](https://react.dev) - Frontend library
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [PyTorch](https://pytorch.org) - Deep learning framework

**Special Thanks:**
A massive thank you to the Boson AI team for creating and open-sourcing Higgs Audio V2. Their work in advancing audio generation technology is truly remarkable. This project wouldn't exist without their dedication to open research and their willingness to share such powerful technology with the community.

---

**Note**: This project requires significant GPU resources and may incur costs from OpenAI API usage for text normalization. Please review the system requirements and consider your usage before deployment.

For questions, issues, or feature requests, please open an issue on GitHub.
