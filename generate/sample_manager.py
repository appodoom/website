import random
import os
import librosa

class SampleManager():
    def __init__(self):
        self.NOTES = ["D","OTA","OTI","PA2","S"]
        self.PATHS = {
            "D":"./sounds/doums",
            "OTA":"./sounds/taks",
            "OTI": "./sounds/tiks",
            "PA2":"./sounds/pa2s",
            "S": "./sounds/silence"
        }
        self.AUDIO_SOUNDS = {}
        self.SAMPLE_RATE = 48000

    def preload_samples(self):
        for note in self.NOTES:
            counter = 0
            print("FETCHING AUDIO FOR ", note)
            directory = self.PATHS.get(note)
            files = os.listdir(directory)
            curr = {}
            for file in files:
                counter += 1
                full_path = os.path.join(directory, file)
                y, _ = librosa.load(full_path, sr=self.SAMPLE_RATE)
                curr[counter] = (len(y), y)
            self.AUDIO_SOUNDS[note] = curr

        print(self.AUDIO_SOUNDS)

    def get_random_sample(self, symbol:str):
        num = random.choice(list(self.AUDIO_SOUNDS[symbol].keys()))
        return symbol, num, self.AUDIO_SOUNDS[symbol][num][0]

    def get_y(self, symbol:str, num:int, length:int):
        y= self.AUDIO_SOUNDS[symbol][num][1]
        assert len(y)==length
        return y

sample_manager = SampleManager()
