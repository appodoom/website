FROM python:3.11-slim

# System dependencies for librosa / soundfile
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only requirements.txt for caching
COPY requirements.txt .

# Upgrade pip and install CPU PyTorch first, then the rest
RUN pip install --upgrade pip setuptools wheel && \
    pip install torch --index-url https://download.pytorch.org/whl/cpu --no-cache-dir && \
    pip install --no-cache-dir Flask==3.1.3 flask_cors==6.0.2 librosa==0.11.0 numpy==2.4.2 python-dotenv==1.2.2 soundfile==0.13.1

# Copy the rest of your project
COPY . .

EXPOSE 5000
CMD ["python3", "server.py"]
