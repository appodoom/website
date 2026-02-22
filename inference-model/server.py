from flask import Flask, send_file, request, abort, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from model import load_model, generate
from generate_sound import tokens_to_derbake
from dotderbake import play_from_dotderbake

load_dotenv()

app = Flask(__name__)
# TODO CHANGE ORIGIN FOR PROD
CORS(app, resources={"*": {"origins": "*"}})


@app.post("/")
def infer():
    data = request.get_json()

    if not data or "tokens" not in data or data["tokens"] is None:
        abort(400, description="No prompt found")

    prompt_tokens = data["tokens"]

    # validate tokens exist in vocab
    for t in prompt_tokens:
        if t not in tok2id:
            abort(400, description=f"Unknown token: {t}")

    try:
        output_tokens = generate(
            model,
            tok2id,
            id2tok,
            prompt_tokens,
            max_new_tokens=data.get("max_new_tokens", 200),
            temperature=1.0,
        )
        tokens_to_derbake(tokens=output_tokens, output_path="output.derbake")
        play_from_dotderbake(file_path="output.derbake")
    except Exception as e:
        abort(500, description=str(e))

    return jsonify({
        "status": "ok",
    })


if __name__ == "__main__":
	print("[INFER] Loading model...")
	model, tok2id, id2tok = load_model("params.pt", device="cpu")
	print("[INFER] Model loaded")
	app.run(port=3002)
	print("[INFER] Server running on port 3002")