from flask import Flask, send_file, request, abort, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv
from model import load_model, generate
from generate_sound import tokens_to_derbake
from dotderbake import play_from_dotderbake
import uuid
from pathlib import Path
import re

load_dotenv()
CTX_SIZE = 0

app = Flask(__name__)
# TODO CHANGE ORIGIN FOR PROD
CORS(app, resources={"*": {"origins": ["*.largepercussionmodel.com", "https://largepercussionmodel.com", "http://localhost:3000"]}})

def cleanup_files(session_id):
    """Delete temporary files for a session"""
    tmp_dir = Path("tmp")
    wav_file = tmp_dir / f"{session_id}.wav"
    derbake_file = tmp_dir / f"{session_id}.derbake"
    
    try:
        if wav_file.exists():
            wav_file.unlink()
        if derbake_file.exists():
            derbake_file.unlink()
    except Exception as e:
        app.logger.error(f"Error cleaning up files for session {session_id}: {e}")

@app.post("/")
def infer():
    global CTX_SIZE
    data = request.get_json()

    if not data or "tokens" not in data or data["tokens"] == "":
        abort(400, description="No prompt found")

    if "session_id" not in data or data["session_id"] == "":
        session_id = str(uuid.uuid4())  # Convert to string
    else:
        if not re.match(r'^[a-zA-Z0-9-]+$', data["session_id"]):
            abort(400, description="Invalid session ID format")
        session_id = data["session_id"]

    if "tempo" not in data or data["tempo"] == "":
        abort(400, description="Tempo not specified")

    prompt_tokens = data["tokens"]
    tempo = float(data["tempo"])
    # validate tokens exist in vocab
    for t in prompt_tokens:
        if t not in tok2id:
            abort(400, description=f"Unknown token: {t}")

    session_file_path = Path(f"sessions/{session_id}.session")
    session_data = []
    if session_file_path.exists():
        with open(session_file_path, "r") as f:
            content = f.read().strip()
            session_data = content.split(" ") if content else []
    else:
        # Create sessions directory if it doesn't exist
        Path("sessions").mkdir(exist_ok=True)
        session_file_path.touch()

    try:
        # Create tmp directory if it doesn't exist
        Path("tmp").mkdir(exist_ok=True)
        
        temp_session_data = session_data + prompt_tokens
        if len(temp_session_data) > CTX_SIZE:
            temp_session_data = temp_session_data[-CTX_SIZE:]

        output_tokens = generate(
            model,
            tok2id,
            id2tok,
            temp_session_data,
            max_new_tokens=data.get("max_new_tokens", 200),
            temperature=1.0,
        )
        
        # Define paths
        derbake_path = f"tmp/{session_id}.derbake"
        wav_path = Path(f"tmp/{session_id}.wav")  # Make sure this matches what play_from_dotderbake generates
        
        # Generate files
        tokens_to_derbake(tokens=output_tokens, output_path=derbake_path, tempo=tempo)
        play_from_dotderbake(file_path=derbake_path, uuid=session_id)
        
        # Update session
        full_session = session_data + prompt_tokens + output_tokens
        with open(session_file_path, "w") as f:
            f.write(" ".join(full_session))

        # Check if WAV file exists before streaming
        if not wav_path.exists():
            abort(500, description=f"WAV file not generated at {wav_path}")

        def generate_and_cleanup():
            try:
                # Stream the file in chunks
                with open(wav_path, 'rb') as f:
                    while chunk := f.read(8192):
                        yield chunk
            finally:
                # Clean up both files after streaming is complete
                cleanup_files(session_id)
        
        # Create response with custom headers
        response = Response(
            generate_and_cleanup(),
            mimetype='audio/wav',
            headers={
                'x-session-id': session_id,
                'Content-Disposition': f'attachment; filename="{session_id}.wav"',
                "access-control-expose-headers": "x-session-id"
            }
        )
        
        return response

    except Exception as e:
        # Clean up files if there's an error
        print(e)
        cleanup_files(session_id)
        abort(500, description=str(e))

@app.post("/sound")
def get_sound():
    data = request.get_json()
    if not data or "tokens" not in data or data["tokens"] == "":
        abort(400, description="No tokens found")
    if "tempo" not in data or data["tempo"] == "":
        abort(400, description="No specified tempo")
    tokens = data["tokens"]
    tempo = float(data["tempo"])
    temp_id = str(uuid.uuid4())
    tmp_dir = Path("tmp")
    temp_derbake_path = tmp_dir / f"{temp_id}.derbake"
    temp_wav_file = tmp_dir / f"{temp_id}.wav"
    tokens_to_derbake(tokens=tokens, output_path=temp_derbake_path, tempo=tempo)
    play_from_dotderbake(file_path=temp_derbake_path, uuid=temp_id)

    if not temp_wav_file.exists():
        abort(500, description=f"WAV file not generated at {temp_wav_file}")

    def generate_and_cleanup():
        try:
            # Stream the file in chunks
            with open(temp_wav_file, 'rb') as f:
                while chunk := f.read(8192):
                    yield chunk
        finally:
            # Clean up both files after streaming is complete
            cleanup_files(temp_id)
    
    # Create response with custom headers
    response = Response(
        generate_and_cleanup(),
        mimetype='audio/wav',
        headers={
            'Content-Disposition': f'attachment; filename="{temp_id}.wav"'
        }
    )
    
    return response

@app.get("/chat")
def export_chat():
    session_id = request.args.get("session")
    tempo = request.args.get("tempo")
    if not session_id or session_id == "":
        abort(400, "Session not found")

    if not tempo or tempo == "":
        abort(400, "Tempo not specified")
    else:
        tempo = float(tempo)

    session_path = Path("sessions")

    file_path = session_path / f"{session_id}.session"

    if not file_path.exists():
        abort(400, "Session not found")

    with open(file_path, "r") as f:
        tokens = f.read().split()

    tmp_dir = Path("tmp")
    temp_derbake_path = tmp_dir / f"{session_id}.derbake"
    temp_wav_file = tmp_dir / f"{session_id}.wav"

    tokens_to_derbake(tokens=tokens, output_path=temp_derbake_path, tempo=tempo)
    play_from_dotderbake(file_path=temp_derbake_path, uuid=session_id)

    if not temp_wav_file.exists():
        abort(500, f"WAV file not generated {temp_wav_file}")

    def generate_and_cleanup():
        try:
            # Stream the file in chunks
            with open(temp_wav_file, 'rb') as f:
                while chunk := f.read(8192):
                    yield chunk
        finally:
            # Clean up both files after streaming is complete
            cleanup_files(session_id)

    response = Response(
        generate_and_cleanup(),
        mimetype='audio/wav',
        headers={
            'Content-Disposition': f'attachment; filename="{session_id}.wav"'
        }
    )
    
    return response


if __name__ == "__main__":
    print("[INFER] Loading model...")
    model, tok2id, id2tok, CTX_SIZE = load_model("params.pt", device="cpu")
    print("[INFER] Model loaded")

    # Create necessary directories
    Path("sessions").mkdir(exist_ok=True)
    Path("tmp").mkdir(exist_ok=True)
    
    app.run(host="0.0.0.0",port=5000)
    print("[INFER] Server running on port 5000")