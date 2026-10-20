FROM pytorch/pytorch:2.7.1-cuda12.6-cudnn9-runtime

WORKDIR /app

# System deps for OpenCV and audio
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
    ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy only what pip needs to resolve editable installs
COPY requirements.txt .
COPY app/sign/rtmlib-main ./app/sign/rtmlib-main
COPY app/tts ./app/tts

# Pip layer is now cached unless requirements.txt or the local packages change
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt && \
    sed -i 's/grouped_entities=False/aggregation_strategy="none"/g' \
    /opt/conda/lib/python3.11/site-packages/deepmultilingualpunctuation/punctuationmodel.py

# onnxruntime-gpu needs the CUDA/cuDNN libs shipped inside the torch pip wheels
ENV LD_LIBRARY_PATH=/opt/conda/lib/python3.11/site-packages/nvidia/cudnn/lib:/opt/conda/lib/python3.11/site-packages/nvidia/cublas/lib:/opt/conda/lib/python3.11/site-packages/nvidia/cuda_runtime/lib:/opt/conda/lib/python3.11/site-packages/nvidia/cuda_nvrtc/lib:/opt/conda/lib/python3.11/site-packages/nvidia/cufft/lib:/opt/conda/lib/python3.11/site-packages/nvidia/curand/lib:/opt/conda/lib/python3.11/site-packages/nvidia/cusolver/lib:/opt/conda/lib/python3.11/site-packages/nvidia/cusparse/lib:/opt/conda/lib/python3.11/site-packages/nvidia/nvjitlink/lib

# Copy remaining source — changes here don't invalidate the pip layer
COPY . .

CMD ["python", "main.py"]
