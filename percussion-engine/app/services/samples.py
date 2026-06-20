# samples.py
import random
import os
import librosa
from app.core.config import settings

class SampleManager():
    def __init__(self):
        self.NOTES = list(settings.SAMPLE_PATHS.keys())
        self.PATHS = settings.SAMPLE_PATHS
        self.AUDIO_SOUNDS = {}
        self.SAMPLE_RATE = settings.AUDIO_SAMPLE_RATE

    def preload_samples(self):
        print(self.NOTES)
        for note in self.NOTES:
            counter = 0
            print("FETCHING AUDIO FOR ", note)
            directory = self.PATHS.get(note)
            if not os.path.exists(directory):
                print(f"Directory {directory} not found for note {note}")
                continue
                
            files = [f for f in os.listdir(directory) if f.endswith(('.wav', '.mp3'))]
            curr = {}
            for file in files:
                counter += 1
                full_path = os.path.join(directory, file)
                y, _ = librosa.load(full_path, sr=self.SAMPLE_RATE)
                curr[counter] = (len(y), y)
            self.AUDIO_SOUNDS[note] = curr


    def get_random_sample(self, symbol:str):
        if symbol not in self.AUDIO_SOUNDS or not self.AUDIO_SOUNDS[symbol]:
            raise ValueError(f"No samples loaded for {symbol}")
        num = random.choice(list(self.AUDIO_SOUNDS[symbol].keys()))
        return symbol, num, self.AUDIO_SOUNDS[symbol][num][0]

    def get_y(self, symbol:str, num:int, length:int):
        y = self.AUDIO_SOUNDS[symbol][num][1]
        assert len(y) == length
        return y

sample_manager = SampleManager()
