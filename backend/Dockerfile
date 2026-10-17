# Sign Hero detection backend (FastAPI + PyTorch + MediaPipe).
# Build from the repository root:
#   docker build -f backend/Dockerfile -t signhero-api:local .
# Pick the CUDA wheel that matches the GPU:
#   GTX 1070 (Pascal):     --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu126   (default)
#   RTX 5090 (Blackwell):  --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu128
FROM python:3.11-slim

RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

ARG TORCH_INDEX=https://download.pytorch.org/whl/cu126
RUN pip install --no-cache-dir torch torchvision --index-url ${TORCH_INDEX}

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
COPY api_server_http.py ./
COPY ["Base test/Sign-Language-Recognition", "./Base test/Sign-Language-Recognition"]

EXPOSE 4001
CMD ["python", "api_server_http.py"]
