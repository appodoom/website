import librosa
import os
import random
# this file contains configuration for generator
paths = {
    "D": "./sounds/doums",
    "OTA": "./sounds/taks",
    "OTI": "./sounds/tiks",
    "PAA": "./sounds/pa2s",
    # "RA": "./sounds/ra.wav",
    # "T1": "./sounds/tik1.wav",
    # "T2": "./sounds/tik2.wav",
    "S": "./sounds/silence",
}

AUDIO_SOUNDS = {}


def save_audio_data(symbol, sr=48000):
    print("[FETCHING AUDIO] for", symbol)
    directory = paths.get(symbol)
    files = os.listdir(directory)
    ys = []
    for file in files:
        full_path = os.path.join(directory, file)
        y, _ = librosa.load(full_path, sr=sr)
        ys.append(y)
    return ys

def get_audio_data(symbol, sr=None):
    return random.choice(AUDIO_SOUNDS[symbol])


for sym in ["D", "OTA", "OTI", "PAA", "S"]:
    AUDIO_SOUNDS[sym] = save_audio_data(sym)