# algorithm.py
import numpy as np
import numpy.typing as npt
import soundfile as sf
import math
import logging
import random
import time
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from sample_manager import sample_manager
from exceptions import AudioGenerationError, ValidationError
import threading
from settings import settings

logger = logging.getLogger(__name__)

@dataclass
class GenerationResult:
    """Result of audio generation"""
    audio: npt.NDArray[np.float32]
    tokens: str
    generation_time: float
    num_hits: int

class ThreadSafeCounter:
    """Thread-safe counter for statistics"""
    def __init__(self):
        self._value = 0
        self._lock = threading.Lock()
    
    def increment(self, amount=1):
        with self._lock:
            self._value += amount
            return self._value
    
    @property
    def value(self):
        with self._lock:
            return self._value

class DerboukaGenerator:
    """
    Main generator class with thread-safe operations and improved performance.
    """
    
    SUPPORTED_NOTES = ["D", "OTA", "OTI", "PA2", "S"]
    
    def __init__(self):
        self.generation_stats = {
            "total_generations": ThreadSafeCounter(),
            "total_hits": ThreadSafeCounter(),
            "total_time": 0,
            "errors": ThreadSafeCounter()
        }
        self._lock = threading.Lock()
        self.SIZE_OF_CHUNK = 300_000 # around 1.1MB

    def apply_cross_fade(self, hit_y: npt.NDArray, fade_samples:int=500):
        if len(hit_y) <= fade_samples * 2:
            fade_samples = max(8, len(hit_y) // 4)
        fade_in = 0.5 * (1 - np.cos(np.linspace(0, np.pi, fade_samples)))
        fade_out = 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade_samples)))
        hit_audio = hit_y.copy()
        hit_audio[:fade_samples] *= fade_in
        hit_audio[-fade_samples:] *= fade_out
        return hit_audio

    def get_available_choices(self, current_tempo: float, initial_tempo: float, allowed_tempo_deviation: float) -> list[int]:
        lower = initial_tempo - allowed_tempo_deviation
        upper = initial_tempo + allowed_tempo_deviation
        choices = [1]  # keep
        if current_tempo <= lower:
            choices.append(2)  # increase
        elif current_tempo >= upper:
            choices.append(3)  # decrease
        else:
            choices.extend([2, 3])
        return choices

    def get_tempos(self, number_of_beats: int, initial_tempo: float, allowed_tempo_deviation: float) -> list[float]:
        tempos = []
        current_tempo = initial_tempo
        i = 0

        # for each beat, decide whether to increase, decrease or keep the same tempo as the beat before
        while i <= number_of_beats:
            choices = self.get_available_choices(
                current_tempo, initial_tempo, allowed_tempo_deviation
            )
            choice = random.choice(choices)
            if choice == 2:  # Increase
                deviation = random.uniform(
                    0, initial_tempo + allowed_tempo_deviation - current_tempo
                )
                tempos.append(current_tempo + deviation)
            elif choice == 3:  # Decrease
                deviation = random.uniform(
                    0, initial_tempo + allowed_tempo_deviation - current_tempo
                )
                tempos.append(max(1, current_tempo - deviation))
            else:  # Keep
                tempos.append(current_tempo)
            i += 1

        return tempos, " ".join([str(i) for i in tempos])

    def get_random_proba_list(self, weights: List):
        output = []
        for weight in weights:
            choice = random.uniform(0, weight)
            output.append(choice)
        return output

    def get_deviated_sample(
    self, start_of_window: int, end_of_window: int, expected_hit_timestamp: int, shift_proba: float
        ):
        if random.random() >= shift_proba:
            return expected_hit_timestamp
        return int(random.uniform(start_of_window, end_of_window))

    def get_window_by_beat(self, expected_hit_timestamp: int, beat_len: int) -> tuple[int, int]:
        half = int(0.05 * beat_len)
        start_of_window = max(0, expected_hit_timestamp - half)
        end_of_window = expected_hit_timestamp + half
        return (start_of_window, end_of_window)


    def get_audio_metadata(self, hit_type: str) -> Optional[npt.NDArray]:
        """
        Get audio for a hit type with error handling.
        """
        try:
            return sample_manager.get_random_sample(hit_type)
        except Exception as e:
            logger.error(f"Failed to get sample for {hit_type}: {e}")
            return None

    def get_audio_data(self, hit_type:str, sample_number:int, length:int):
        try:
            return sample_manager.get_y(hit_type, sample_number, length)
        except Exception as e:
            logger.error(f"Mismatched size for {hit_type}:{sample_number}, got length = {length}")

    def get_exact_length(self, skeleton: list[tuple[float, str]], num_cycles: int, tempos: list[float], shift_proba: float, sr:int=48000) -> tuple[int, list[tuple[int, str, int]], list[tuple[int, int]], list[str]]:
        # we simulate the entire process here
        # we return:
        # length
        # list of tuples containing (start_sample_index, file id)
        # skeleton hit intervals
        # token list
        current_tempo = tempos[0]
        beat_length_in_samples = int((60/current_tempo) * sr)
        skeleton_length = len(skeleton)
        num_of_beats_in_audio = num_cycles * sum(x[0] for x in skeleton)
        # output initialization
        total_length_in_samples = 0
        final_list = []
        skeleton_hits_intervals = []
        tokens = []

        expected_hit_timestamp = 0
        curr_beat = i = 0
        tempo_index = 0

        while curr_beat < num_of_beats_in_audio:
            beat_duration = skeleton[i % skeleton_length][0]
            curr_beat += beat_duration

            if int(curr_beat) > tempo_index and int(curr_beat) < len(tempos):
                tempo_index = int(curr_beat)
                new_tempo = tempos[tempo_index]
                tempo_diff = new_tempo - current_tempo
                current_tempo = new_tempo
                beat_length_in_samples = int(60 / current_tempo * sr)

            tokens.append(f"DELAY_{beat_duration}")
            curr_hit = skeleton[i%skeleton_length][1]

            _, sample_num, hit_length = self.get_audio_metadata(curr_hit)
            tokens.append(f"HIT_{curr_hit}")

            expected_hit_timestamp += int(beat_duration * beat_length_in_samples)

            start_of_window, end_of_window = self.get_window_by_beat(
                expected_hit_timestamp, beat_length_in_samples
            )

            adjusted_hit_timestamp = self.get_deviated_sample(
                start_of_window, end_of_window, expected_hit_timestamp, shift_proba
            )
            
            deviation_samples = adjusted_hit_timestamp - expected_hit_timestamp
            tokens.append(f"DEV_{deviation_samples}")
            
            total_length_in_samples = adjusted_hit_timestamp + hit_length
            
            final_list.append((adjusted_hit_timestamp,total_length_in_samples,curr_hit, sample_num))

            skeleton_hits_intervals.append((adjusted_hit_timestamp, total_length_in_samples))
            i+=1

        return total_length_in_samples, final_list, skeleton_hits_intervals, " ".join(tokens)

    def skeleton_generator(self, uuid:str, amplitude: float, skeleton: list[tuple[float, str]], num_cycles: int, tempos: list[float], shift_proba: float, sr:int=48000) -> tuple[npt.NDArray,int,list[tuple[int, int]], list[str]]:
        total_length_in_samples, final_list, skeleton_hits_intervals, tokens = self.get_exact_length(
                skeleton=skeleton,
                num_cycles = num_cycles,
                tempos = tempos,
                shift_proba = shift_proba,
                sr = sr
        )

        y = np.memmap(filename=f"./tmp/{uuid}.dat",dtype=np.float32, mode="w+", shape=(total_length_in_samples,))

        # write ~1MB = 300k samples
        nb_chunks = math.floor(total_length_in_samples / self.SIZE_OF_CHUNK)
        remainder = total_length_in_samples % self.SIZE_OF_CHUNK
        window = (0, self.SIZE_OF_CHUNK)
        for chunk in range(nb_chunks):
            inter_chunk_hits = []
            y_chunk = np.zeros(self.SIZE_OF_CHUNK)
            for start,end,sym,sample in final_list:
                if window[0] <= start and end <= window[1]:
                    newstart = start - window[0]
                    newend = end - window[0]
                    y_chunk[newstart:newend] = amplitude*self.get_audio_data(sym,sample,newend-newstart)
                elif start <= window[1] and end >= window[1]:
                    inter_chunk_hits.append((start,end,sym,sample))
                else:
                    continue
            y[window[0]:window[1]] = y_chunk
            for start,end,sym,sample in inter_chunk_hits:
                y[start:end] += amplitude*self.get_audio_data(sym,sample,end-start)

            if chunk != nb_chunks - 1:
                window = (window[1], window[1] + self.SIZE_OF_CHUNK)

        window = (window[1], total_length_in_samples)
        y_chunk = np.zeros(window[1] - window[0])
        for start,end,sym,sample in final_list:
                if window[0] <= start and end <= window[1]:
                    newstart = start - window[0]
                    newend = end - window[0]
                    y_chunk[newstart:newend] = amplitude*self.get_audio_data(sym,sample,newend-newstart)
                else:
                    continue
        
        y[window[0]:window[1]] = y_chunk
        return y, skeleton_hits_intervals, tokens

    def subdivisions_generator(self, y: npt.NDArray, maxsubd: int, 
                          added_hits_intervals: List[Tuple[int, int]], 
                          hit_probabilities: List[Dict[str, float]], 
                          subdiv_proba: List[float],
                          amplitudes: List[float], 
                          amplitudes_proba_list: List[float],
                          tempos: List[float], sr: int = 48000) -> Tuple[npt.NDArray, List[Tuple[int, int]], str]:
        subdiv_array = []
        tokens = []
        
        # Initialize tempo tracking
        current_tempo = tempos[0]
        
        for i in range(len(subdiv_proba)):
            subdiv_array.append(i)
            
        if sum(subdiv_proba) == 0:
            return y, [], ""
            
        maxsubdi = random.choices(population=subdiv_array, weights=subdiv_proba, k=1)[0]
        added_hits_intervals = sorted(added_hits_intervals, key=lambda x: x[0])

        curr_sample = 0
        tempo_index = 0
        beat_index = 0

        chosen_div = maxsubd - maxsubdi
        tokens.append(f"SUBD_{chosen_div}")
        
        # Calculate beat length for current tempo
        beat_length_in_samples = int(60 * sr / current_tempo)
        maxsubd_length_arr = [int(beat_length_in_samples / chosen_div) for _ in range(chosen_div - 1)]
        maxsubd_length_arr.append(beat_length_in_samples - sum(maxsubd_length_arr))
        
        hits = list(hit_probabilities[maxsubdi].keys())
        weights = list(hit_probabilities[maxsubdi].values())
        new_added_hits_intervals = []
        
        j = 0
        index_of_curr_subd_in_beat = 0
        sample_of_last_beat = 0
        
        while curr_sample < len(y):
            # Check if we need to update tempo (new beat)
            if curr_sample >= sample_of_last_beat + beat_length_in_samples:
                beat_index += 1
                index_of_curr_subd_in_beat = 0
                sample_of_last_beat = curr_sample
                
                # Update tempo if available
                if beat_index < len(tempos):
                    new_tempo = tempos[beat_index]
                    if new_tempo != current_tempo:
                        current_tempo = new_tempo
                    
                    beat_length_in_samples = int(60 * sr / current_tempo)
                
                # Get new random subdivision for the new beat
                maxsubdi = random.choices(population=subdiv_array, weights=subdiv_proba, k=1)[0]
                chosen_div = maxsubd - maxsubdi
                tokens.append(f"SUBD_{chosen_div}")
                maxsubd_length_arr = [int(beat_length_in_samples / chosen_div) for _ in range(chosen_div - 1)]
                maxsubd_length_arr.append(beat_length_in_samples - sum(maxsubd_length_arr))

                hits = list(hit_probabilities[maxsubdi].keys())
                weights = list(hit_probabilities[maxsubdi].values())
            
            remaining = len(y) - curr_sample
            random_proba_list = self.get_random_proba_list(weights)
            chosen_hit = random.choices(hits, weights=random_proba_list, k=1)[0]
            chosen_amplitude = random.choices(
                population=amplitudes, weights=amplitudes_proba_list, k=1
            )[0]
            
            if chosen_hit == "S":
                tokens.append(f"HIT_{chosen_hit}")
                tokens.append(f"AMP_{chosen_amplitude}")
                curr_sample += maxsubd_length_arr[index_of_curr_subd_in_beat]
            else:
                hit_metadata = self.get_audio_metadata(chosen_hit)
                hit_y_raw = self.get_audio_data(hit_metadata[0], hit_metadata[1], hit_metadata[2])
                
                add_len = min(hit_metadata[2], remaining)
                
                hit_y = self.apply_cross_fade(hit_y_raw)
                
                no_overlap = True
                for start, end in added_hits_intervals:
                    if start <= curr_sample < end:
                        curr_sample += maxsubd_length_arr[index_of_curr_subd_in_beat]
                        no_overlap = False
                        break
                        
                if no_overlap:
                    y[curr_sample:curr_sample + add_len] += (
                        chosen_amplitude * hit_y[:add_len]
                    )
                    new_added_hits_intervals.append(
                        (curr_sample, curr_sample + add_len)
                    )
                    curr_sample += maxsubd_length_arr[index_of_curr_subd_in_beat]
                    tokens.append(f"HIT_{chosen_hit}")
                    tokens.append(f"AMP_{chosen_amplitude}")
                else:
                    tokens.append(f"HIT_S")
                    tokens.append(f"AMP_{chosen_amplitude}")

            index_of_curr_subd_in_beat += 1

        new_added_hits_intervals.extend(added_hits_intervals)
        return y, new_added_hits_intervals, " ".join(tokens)

    def get_subdivision_hit_probabilities(self, maxsubd: int, number_of_hits: int, hits_list: list[str], probabilities_dict: dict[str, list]) -> list[dict[str, float]]:
        out = []

        for col_index in range(maxsubd):
            current_process = {}
            sum_of_probabilities = 0
            for j in range(number_of_hits):
                current_hit = hits_list[j]
                current_process[current_hit] = probabilities_dict[current_hit][col_index]
                sum_of_probabilities += probabilities_dict[current_hit][col_index]
            if sum_of_probabilities > 100:
                raise ValueError(
                    f"Column {col_index} probabilities sum to {sum_of_probabilities} (>100). "
                    "Reduce one or more values so that the sum ≤ 100."
                )
            # adding silence with other hits
            current_process["S"] = 100 - sum_of_probabilities
            out.append(current_process)

        return out

    def merge_skeleton_with_variations(
                                        self,
                                        uuid:str,
                                        maxsubd: int,
                                        probabilities_dict: dict[str, list],
                                        bpm: float,
                                        skeleton: list[tuple[float, str]],
                                        num_cycles: int,
                                        subdiv_proba: list[float],
                                        amplitudes: list[float],
                                        amplitudes_proba_list: list[float],
                                        cycle_length: float,
                                        shift_proba: float,
                                        allowed_tempo_deviation: float,
                                        sr:int = 48000 
                                    ) -> npt.NDArray:
        # calculating the total number of beats in the audio
        num_of_beats = num_cycles * sum(float(x[0]) for x in skeleton)

        # get the list of tempos for every beat
        tempos, tempo_tokens = self.get_tempos(
            number_of_beats=num_of_beats, initial_tempo=bpm, allowed_tempo_deviation=allowed_tempo_deviation
        )

        # getting the notes
        hits_list = list(probabilities_dict.keys())
        number_of_hits = len(hits_list)

        subdivision_hit_probabilities = self.get_subdivision_hit_probabilities(
            maxsubd=maxsubd,
            number_of_hits=number_of_hits,
            hits_list=hits_list,
            probabilities_dict=probabilities_dict,
        )


        y, added_hits_intervals, skeleton_tokens = self.skeleton_generator(
            uuid=uuid,
            shift_proba=shift_proba,
            amplitude=amplitudes[-1], # always play at highest amplitude
            skeleton=skeleton,
            num_cycles=num_cycles,
            sr=sr,
            tempos=tempos,
        )
        y, added_hits_intervals, var_tokens = self.subdivisions_generator(
            y=y,
            maxsubd=maxsubd,
            amplitudes=amplitudes,
            amplitudes_proba_list=amplitudes_proba_list,
            added_hits_intervals=added_hits_intervals,
            hit_probabilities=subdivision_hit_probabilities,
            subdiv_proba=subdiv_proba,
            tempos=tempos,
        )

        return y, str(tempos[0]) + "\n" + tempo_tokens + "\n" + skeleton_tokens + "\n" + var_tokens
    
    def generate(self, uuid: str, num_cycles: int, cycle_length: float, 
                bpm: float, maxsubd: int, shift_proba: float, 
                allowed_tempo_deviation: float, skeleton: List[Tuple[float, str]], 
                matrix: List, amplitude_variation: float) -> GenerationResult:
        """
        Main generation method with comprehensive error handling and statistics.
        """
        start_time = time.time()
        self.generation_stats["total_generations"].increment()
        
        try:
            # Amplitude bins
            amplitudes = [
                0.1015 * settings.AUDIO_VOLUME,
                0.5 * settings.AUDIO_VOLUME,
                1.0 * settings.AUDIO_VOLUME
            ]
            
            # Amplitude probabilities
            amplitudes_proba = [(1 - amplitude_variation) / 2, 
                               amplitude_variation, 
                               (1 - amplitude_variation) / 2]
            
            # Parse matrix
            subdiv_proba = matrix[0]
            matrix_data = matrix[1:]
            
            # Create probability dict
            probabilities_dict = dict(zip(self.SUPPORTED_NOTES, matrix_data))
            y, tokens = self.merge_skeleton_with_variations(
                    uuid=uuid,
                    amplitudes=amplitudes,
                    amplitudes_proba_list=amplitudes_proba,
                    shift_proba=shift_proba,
                    maxsubd=maxsubd,
                    bpm=bpm,
                    probabilities_dict=probabilities_dict,
                    skeleton=skeleton,
                    num_cycles=num_cycles,
                    subdiv_proba=subdiv_proba,
                    cycle_length=cycle_length,
                    allowed_tempo_deviation=allowed_tempo_deviation
                )
            # Normalize to prevent clipping
            # max_val = np.max(np.abs(y))
            # if max_val > 1.0:
            #     y = y / max_val * 0.95
            
            generation_time = time.time() - start_time
            # Count hits (approximate)
            num_hits = tokens.count("HIT_")
            self.generation_stats["total_hits"].increment(num_hits)
            
            return GenerationResult(
                audio=y,
                tokens=tokens,
                generation_time=generation_time,
                num_hits=num_hits
            )
            
        except Exception as e:
            self.generation_stats["errors"].increment()
            logger.error(f"Generation failed for {uuid}: {e}", exc_info=True)
            raise AudioGenerationError(f"Failed to generate audio: {e}") from e

# Global generator instance
generator = DerboukaGenerator()