# Per higgs team, this is reccomended version (CRITICAL: Don't use versions below this one as it will ruin performance)
FROM nvcr.io/nvidia/pytorch:25.02-py3

# Setting variables for CUDA optimizations
ENV CUDA_VISIBLE_DEVICES=0
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV CUDA_LAUNCH_BLOCKING=0
ENV CUDNN_BENCHMARK=1
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Working directory
WORKDIR /app

# Install build tools, git, and Node.js v20
RUN apt-get update && \
    apt-get install -y build-essential git curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Copy all project files
COPY . .

# Install Python dependencies
# Use the absolute path to python3 for consistency
RUN /usr/bin/python3 -m pip install -r requirements.txt
RUN /usr/bin/python3 -m pip install -e .

# Flash attention fix
RUN /usr/bin/python3 -m pip uninstall -y flash-attn && \
    /usr/bin/python3 -m pip install flash-attn --no-build-isolation

# Building the React UI
WORKDIR /app/ui
RUN npm install
RUN npm run build

# Return to the root directory
WORKDIR /app

# Exposing the port
EXPOSE 8000

# The command to run, using the absolute path to python3
CMD ["/usr/bin/python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]