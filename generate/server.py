# fastapi_server.py
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import jwt
import uuid
import os
import asyncio
import aiofiles
import json
import logging
import time
import soundfile as sf
from typing import Dict, Any, Optional
from functools import wraps
from contextlib import asynccontextmanager
import numpy as np

from settings import settings
from algorithm import generator
from db.schema import init_models
from exceptions import (
    DerboukaError, AuthenticationError, ValidationError,
    StorageError, AudioGenerationError
)
from storage import s3_manager, db_manager
from sample_manager import sample_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# FastAPI App - replaces Flask(__name__)
# ============================================================================
app = FastAPI()

# CORS - replaces CORS(app, resources={"*": {"origins": "*"}}, supports_credentials=True)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Middleware - replaces @app.before_request and @app.after_request
# ============================================================================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Before request - replaces @app.before_request
    logger.info(f"Request: {request.method} {request.url.path} from {request.client.host}")
    
    # Process request
    response = await call_next(request)
    
    # After request - replaces @app.after_request
    logger.info(f"Response: {response.status_code}")
    return response

# ============================================================================
# Error Handlers - replaces @app.errorhandler decorators
# ============================================================================
@app.exception_handler(DerboukaError)
async def handle_derbouka_error(request: Request, exc: DerboukaError):
    return JSONResponse(
        status_code=400,
        content={"error": str(exc), "type": exc.__class__.__name__}
    )

@app.exception_handler(HTTPException)
async def handle_http_error(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "type": exc.__class__.__name__}
    )

@app.exception_handler(Exception)
async def handle_generic_error(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )

# ============================================================================
# Authentication Dependency - replaces @require_auth decorator
# ============================================================================
async def get_current_user(request: Request) -> str:
    """Replaces the require_auth decorator functionality"""
    token = request.cookies.get("token")
    if not token:
        raise AuthenticationError("Missing token")
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("id")
        if not user_id:
            raise AuthenticationError("Invalid token payload")
        return user_id
    except jwt.InvalidTokenError as e:
        raise AuthenticationError(f"Invalid token: {e}")

# ============================================================================
# Test endpoint - replaces @app.get("/api/generate/test/")
# ============================================================================
@app.get("/api/generate/test/")
async def test():
    return {"status": "ok", "message": "Service is running"}  # FastAPI auto-converts to JSON with 200

# ============================================================================
# Publish endpoint - replaces @app.get("/api/generate/publish/") with @require_auth
# ============================================================================
@app.get("/api/generate/publish/")
async def publish(request: Request, user_id: str = Depends(get_current_user)):
    # user_id comes from the dependency, replaces request.user_id
    
    audio_id = request.query_params.get("id")  # replaces request.args.get("id")
    if not audio_id:
        raise ValidationError("Missing ?id parameter")
    
    data_dir = settings.AUDIO_TEMP_DIR
    json_path = os.path.join(data_dir, f"{audio_id}.json")
    derbake_path = os.path.join(data_dir, f"{audio_id}.derbake")
    
    # Check if files exist
    missing_files = []
    for path in [json_path, derbake_path]:
        if not os.path.exists(path):
            missing_files.append(os.path.basename(path))
    
    if missing_files:
        raise ValidationError(f"Files not found: {', '.join(missing_files)}")
    
    try:
        # Load metadata
        async with aiofiles.open(json_path, "r", encoding="utf-8") as f:
            metadata_str = await f.read()
            metadata = json.loads(metadata_str)
        
        # Upload to S3 in parallel
        upload_mappings = {
            derbake_path: f"{audio_id}.derbake"
        }
        
        urls = await s3_manager.upload_files_batch(upload_mappings)
        uploaded_url = f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{audio_id}.derbake"
        # Save to database
        await db_manager.save_sound(
            sound_id=audio_id,
            user_id=user_id,  # replaces request.user_id
            settings_dict=metadata,
            url=uploaded_url
        )
        
        # Delete local files
        delete_tasks = [
            asyncio.to_thread(os.remove, json_path),
            asyncio.to_thread(os.remove, derbake_path)
        ]
        await asyncio.gather(*delete_tasks, return_exceptions=True)
        
        logger.info(f"Published audio {audio_id} for user {user_id}")
        return {"status": "ok", "id": audio_id, "url": uploaded_url}  # Auto 200
        
    except Exception as e:
        logger.error(f"Publish failed for {audio_id}: {e}", exc_info=True)
        raise  # FastAPI will handle through exception handlers

# ============================================================================
# Generate endpoint - replaces @app.post('/api/generate/') with streaming
# ============================================================================
@app.post('/api/generate/')
async def generate(request: Request):
    try:
        data = await request.json()  # replaces request.get_json()
        if not data:
            raise ValidationError("No JSON data provided")
        
        # Validate and parse parameters with defaults
        params = {
            "std": float(data.get("std", 0)),
            "tempoVariation": float(data.get("tempoVariation", 0)),
            "amplitudeVariation": float(data.get("amplitudeVariation", 100)),
            "numOfCycles": int(data.get("numOfCycles", 1)),
            "cycleLength": float(data.get("cycleLength", 4)),
            "tempo": float(data.get("tempo", 120)),
            "maxSubd": int(data.get("maxSubd", 4))
        }
        
        # Parse probabilities
        shift_proba = abs(100.0 - params["std"]) / 100.0
        amplitude_variation = params["amplitudeVariation"] / 100.0
        
        # Parse skeleton and matrix
        skeleton = data.get("skeleton")
        matrix = data.get("matrix")
        
        if not skeleton or not matrix:
            raise ValidationError("skeleton and matrix are required")
        
        if isinstance(skeleton, str):
            skeleton = json.loads(skeleton)
        if isinstance(matrix, str):
            matrix = json.loads(matrix)
        
        # Generate unique ID
        audio_id = str(uuid.uuid4())
        
        # Run generation in thread pool
        logger.info(f"Starting generation {audio_id}")
        
        result = await asyncio.to_thread(
            generator.generate,
            audio_id,
            params["numOfCycles"],
            params["cycleLength"],
            params["tempo"],
            params["maxSubd"],
            shift_proba,
            params["tempoVariation"],
            skeleton,
            matrix,
            amplitude_variation
        )
        
        logger.info(f"Generation {audio_id} completed in {result.generation_time:.2f}s")
        
        # Save metadata
        metadata = {
            "uuid": audio_id,
            "num_cycles": params["numOfCycles"],
            "cycle_length": params["cycleLength"],
            "bpm": params["tempo"],
            "maxsubd": params["maxSubd"],
            "shift_proba": shift_proba,
            "allowed_tempo_deviation": params["tempoVariation"],
            "skeleton": skeleton,
            "matrix": matrix,
            "amplitudeVariation": amplitude_variation,
            "generation_time": result.generation_time,
            "num_hits": result.num_hits
        }
        
        # Save files
        os.makedirs(settings.AUDIO_TEMP_DIR, exist_ok=True)
        
        # Save JSON metadata
        async with aiofiles.open(f"{settings.AUDIO_TEMP_DIR}/{audio_id}.json", "w") as f:
            await f.write(json.dumps(metadata, indent=2))
        
        # Save derbake tokens
        tokens = result.tokens
        async with aiofiles.open(f"{settings.AUDIO_TEMP_DIR}/{audio_id}.derbake", "w") as f:
            await f.write(tokens)
        
        # now we need to incrementally convert our .dat to .wav to stream to frontend

        chunk_size = settings.AUDIO_SAMPLE_RATE * 10 # 10 seconds chunks

        def wav_header_float32(sample_rate, num_samples):
            import struct

            num_channels = 1
            bits_per_sample = 32
            audio_format = 3  # IEEE float
            block_align = num_channels * bits_per_sample // 8
            byte_rate = sample_rate * block_align
            data_size = num_samples * block_align
            chunk_size = 36 + data_size

            return struct.pack(
                "<4sI4s4sIHHIIHH4sI",
                b"RIFF",
                chunk_size,
                b"WAVE",
                b"fmt ",
                16,
                audio_format,
                num_channels,
                sample_rate,
                byte_rate,
                block_align,
                bits_per_sample,
                b"data",
                data_size,
            )

        def stream_memmap_wav(memmap_audio, sample_rate=settings.AUDIO_SAMPLE_RATE):
            """Stream a float32 memmap as WAV (int16) in chunks."""
            import wave
            import io
            import numpy as np

            chunk_size = settings.AUDIO_SAMPLE_RATE * 10  # 10 seconds chunks

            # First, convert the entire audio to int16 to know total size
            # But we don't want to load everything into memory, so we'll create a proper header
            # that specifies the correct data size

            # Create a temporary buffer for the header with correct data size
            header_buffer = io.BytesIO()
            total_samples = len(memmap_audio)

            # Yield the complete header first
            yield wav_header_float32(sample_rate, total_samples)

            # Now stream the audio data in chunks
            for i in range(0, len(memmap_audio), chunk_size):
                chunk = memmap_audio[i:i + chunk_size]
                # Convert float32 [-1,1] to int16
                chunk_bytes = (chunk).astype(np.float32).tobytes()
                yield chunk_bytes

            try:
                os.remove(f"./tmp/{audio_id}.dat")
            except:
                pass

        headers = {
        "x-audio-id": audio_id,
        "access-control-expose-headers": "x-audio-id"
        }
        return StreamingResponse(
            stream_memmap_wav(result.audio, settings.AUDIO_SAMPLE_RATE),
            media_type="audio/wav",
            headers=headers
        )

    except Exception as e:
        logger.error(f"Generation failed: {e}", exc_info=True)
        raise
# ============================================================================
# Lifespan management - replaces create_app() and shutdown()
# ============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - replaces create_app()
    logger.info("Initializing application...")
    app.state.start_time = time.time()
    
    # Initialize database
    # await init_models()
    logger.info("Database initialized")
    
    # Preload common samples
    sample_manager.preload_samples()
    logger.info("Sample cache warmed up")
    
    yield
    
    # Shutdown - replaces shutdown()
    logger.info("Shutting down...")
    await s3_manager.close()
    logger.info("Shutdown complete")

# Attach lifespan to app
app.router.lifespan_context = lifespan

# ============================================================================
# Main entry point - replaces the if __name__ == "__main__" block
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    
    # Removed WsgiToAsgi because FastAPI is native ASGI
    uvicorn.run(
        "server:app",  # String reference instead of app object
        host=settings.HOST,
        port=settings.GENERATE_PORT,
        log_level="info",
        timeout_graceful_shutdown=30
    )