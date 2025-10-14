FROM nvcr.io/nvidia/pytorch:25.02-py3

ENV CUDA_VISIBLE_DEVICES=0
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV CUDA_LAUNCH_BLOCKING=0
ENV CUDNN_BENCHMARK=1
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

WORKDIR /app

RUN apt-get update && \
    apt-get install -y build-essential git curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

COPY . .

RUN /usr/bin/python3 -m pip install -r requirements.txt && \
    /usr/bin/python3 -m pip install -e .

RUN /usr/bin/python3 -m pip uninstall -y flash-attn && \
    /usr/bin/python3 -m pip install flash-attn --no-build-isolation

WORKDIR /app/ui
RUN npm install && npm run build

WORKDIR /app

EXPOSE 8000

CMD ["/usr/bin/python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]