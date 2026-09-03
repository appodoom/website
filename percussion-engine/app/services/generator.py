# generator.py
import numpy as np
import numpy.typing as npt
import math
import logging
import random
from typing import List, Tuple, Dict
from dataclasses import dataclass
from app.services.samples import sample_manager
from app.core.exceptions import AudioGenerationError, ValidationError
import threading
from app.core.config import settings

logger = logging.getLogger(__name__)

@dataclass
class GenerationResult:
    """Result of audio generation"""
    audio: npt.NDArray[np.float32]
    tokens: str
    generated_num_beats: float

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
    PROBABILITY_HIT_NOTES = ["D", "OTA", "OTI", "PA2"]
    
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

    def get_tempos(self, number_of_beats: int, initial_tempo: float, allowed_tempo_deviation: float):
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

    def validate_probability_matrices(
        self, matrices: List, skeleton_count: int, maxsubd: int
    ) -> None:
        """Validate the per-skeleton subdivision probability matrices.

        Each matrix has five rows: subdivision weights followed by the four
        explicit hit rows. Silence is derived as the remaining probability in
        each subdivision column, so explicit hit probabilities may not exceed
        100% in a column.
        """
        if not isinstance(matrices, list) or len(matrices) != skeleton_count:
            raise ValidationError(
                "Probability matrices must contain one matrix per skeleton"
            )
        if not isinstance(maxsubd, int) or maxsubd < 1:
            raise ValidationError("maxSubd must be a positive integer")

        for skeleton_index, matrix in enumerate(matrices):
            if not isinstance(matrix, list) or len(matrix) != 5:
                raise ValidationError(
                    f"Probability matrix for skeleton {skeleton_index + 1} must have 5 rows"
                )
            for row_index, row in enumerate(matrix):
                if not isinstance(row, list) or len(row) != maxsubd:
                    raise ValidationError(
                        f"Probability matrix for skeleton {skeleton_index + 1} "
                        f"row {row_index + 1} must have {maxsubd} columns"
                    )
                for value in row:
                    if isinstance(value, bool):
                        valid = False
                    else:
                        try:
                            valid = math.isfinite(float(value)) and 0 <= float(value) <= 100
                        except (TypeError, ValueError):
                            valid = False
                    if not valid:
                        raise ValidationError(
                            f"Probability matrix for skeleton {skeleton_index + 1} "
                            "must contain values between 0 and 100"
                        )

            for column in range(maxsubd):
                hit_total = sum(float(matrix[row][column]) for row in range(1, 5))
                if hit_total > 100.0001:
                    raise ValidationError(
                        f"Hit probabilities in skeleton {skeleton_index + 1}, "
                        f"column {column + 1} exceed 100%"
                    )

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


    def get_audio_metadata(self, hit_type: str) -> Tuple | None:
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

    def get_exact_length(self, skeletons_chosen: list[int], num_of_beats_in_audio: int, skeletons:List, tempos: list[float], shift_proba: float, sr:int=48000) -> Tuple:
        # we simulate the entire process here
        # we return:
        # length
        # list of tuples containing (start_sample_index, file id)
        # skeleton hit intervals
        # token list
        current_tempo = tempos[0]
        beat_length_in_samples = int((60/current_tempo) * sr)
        current_skeleton_index = skeletons_chosen[0]
        current_skeleton = skeletons[current_skeleton_index]
        # output initialization
        total_length_in_samples = 0
        final_list = []
        skeleton_hits_intervals = []
        tokens = []

        expected_hit_timestamp = 0
        curr_beat = 0
        tempo_index = 0
        skeleton_chosen_index = 0
        previous_cycle_length = 0
        previous_hit_beat = 0
        hit_index_in_cycle = 0
        while curr_beat < num_of_beats_in_audio:
            # i guess this is the delay of the next hit
            # it is equal to: 
            # if it is the first hit in skeleton: last cycle length - last hit beat + current beat
            # else it is : current hit beat - previous hit beat
            delay_in_beats = current_skeleton["hits"][hit_index_in_cycle]["beat"] - previous_hit_beat
            if hit_index_in_cycle == 0:
                delay_in_beats += previous_cycle_length
            
                
            curr_beat += delay_in_beats

            if int(curr_beat) > tempo_index and int(curr_beat) < len(tempos):
                tempo_index = int(curr_beat)
                new_tempo = tempos[tempo_index]
                current_tempo = new_tempo
                beat_length_in_samples = int(60 / current_tempo * sr)

            tokens.append(f"DELAY_{delay_in_beats}")
            curr_hit = current_skeleton["hits"][hit_index_in_cycle]["hit"]

            _, sample_num, hit_length = self.get_audio_metadata(curr_hit) or (None,None,None)
            if (sample_num is None or hit_length is None): 
                return None, None, None, None
            tokens.append(f"HIT_{curr_hit}")

            expected_hit_timestamp += int(delay_in_beats * beat_length_in_samples)

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
                
            previous_hit_beat = current_skeleton["hits"][hit_index_in_cycle]["beat"]
            
            hit_index_in_cycle += 1
            
            if hit_index_in_cycle >= len(current_skeleton["hits"]):
                previous_cycle_length = current_skeleton["length"]
                skeleton_chosen_index += 1
                
                if skeleton_chosen_index >= len(skeletons_chosen):
                    break
                
                current_skeleton_index = skeletons_chosen[skeleton_chosen_index]
                current_skeleton = skeletons[current_skeleton_index]
                
                hit_index_in_cycle = 0

        return total_length_in_samples, final_list, skeleton_hits_intervals, " ".join(tokens)

    def skeleton_generator(self, uuid:str, amplitude: float, skeletons_chosen: list[int], skeletons:List, num_of_beats_in_audio: int, tempos: list[float], shift_proba: float, sr:int=48000) -> tuple[npt.NDArray,int,list[tuple[int, int]], list[str]]:
        total_length_in_samples, final_list, skeleton_hits_intervals, tokens = self.get_exact_length(
                skeletons_chosen=skeletons_chosen,
                skeletons=skeletons,
                num_of_beats_in_audio=num_of_beats_in_audio,
                tempos = tempos,
                shift_proba = shift_proba,
                sr = sr
        )

        memmap_path = settings.AUDIO_MEMMAP_DIR / f"{uuid}.dat"
        y = np.memmap(filename=str(memmap_path), dtype=np.float32, mode="w+", shape=(total_length_in_samples,))

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

    def subdivisions_generator(
        self,
        y: npt.NDArray,
        maxsubd: int,
        added_hits_intervals: List[Tuple[int, int]],
        hit_probabilities: List[List[Dict[str, float]]],
        skeletons_chosen: List[int],
        skeletons: List[Dict],
        subdiv_proba: List[List[float]],
        amplitudes: List[float],
        amplitudes_proba_list: List[float],
        tempos: List[float],
        sr: int = 48000,
    ) -> Tuple[npt.NDArray, List[Tuple[int, int]], str]:
        """Add probabilistic subdivision hits using the active skeleton matrix.

        ``skeletons_chosen`` contains skeleton indices in Markov-chain order.
        A matrix is selected per beat using the skeleton whose cumulative cycle
        span contains that beat's start. Fractional cycle lengths therefore
        switch matrices at the first subsequent beat boundary.
        """
        if not y.size or not tempos or not skeletons_chosen:
            return y, list(added_hits_intervals), ""

        if len(subdiv_proba) != len(skeletons) or len(hit_probabilities) != len(skeletons):
            raise ValidationError("Probability matrices must contain one entry per skeleton")

        cycle_spans = []
        cycle_start = 0.0
        for skeleton_index in skeletons_chosen:
            if skeleton_index < 0 or skeleton_index >= len(skeletons):
                raise ValidationError(f"Invalid selected skeleton index: {skeleton_index}")
            cycle_length = float(skeletons[skeleton_index]["length"])
            if cycle_length <= 0:
                raise ValidationError("Skeleton lengths must be positive")
            cycle_spans.append((cycle_start, cycle_start + cycle_length, skeleton_index))
            cycle_start += cycle_length

        def skeleton_for_beat(beat: int) -> int:
            beat_start = float(beat)
            for start, end, skeleton_index in cycle_spans:
                if start <= beat_start < end:
                    return skeleton_index
            return cycle_spans[-1][2]

        subdiv_array = list(range(maxsubd))
        added_hits_intervals = sorted(added_hits_intervals, key=lambda x: x[0])
        new_added_hits_intervals = []
        tokens = []

        current_tempo = tempos[0]
        beat_length_in_samples = int(60 * sr / current_tempo)
        beat_index = 0
        curr_sample = 0
        sample_of_last_beat = 0
        index_of_curr_subd_in_beat = 0

        def configure_beat(active_skeleton_index: int):
            weights = subdiv_proba[active_skeleton_index]
            if len(weights) != maxsubd:
                raise ValidationError(
                    f"Subdivision matrix for skeleton {active_skeleton_index + 1} has invalid dimensions"
                )

            if sum(weights) <= 0:
                chosen_div = 1
                hits = ["S"]
                hit_weights = [100.0]
            else:
                maxsubdi = random.choices(population=subdiv_array, weights=weights, k=1)[0]
                chosen_div = maxsubd - maxsubdi
                column = hit_probabilities[active_skeleton_index][maxsubdi]
                hits = list(column.keys())
                hit_weights = list(column.values())

            tokens.append(f"SUBD_{chosen_div}")
            lengths = [int(beat_length_in_samples / chosen_div) for _ in range(chosen_div - 1)]
            lengths.append(beat_length_in_samples - sum(lengths))
            return chosen_div, lengths, hits, hit_weights

        active_skeleton_index = skeleton_for_beat(beat_index)
        chosen_div, subdivision_lengths, hits, weights = configure_beat(active_skeleton_index)

        while curr_sample < len(y):
            if curr_sample >= sample_of_last_beat + beat_length_in_samples:
                beat_index += 1
                index_of_curr_subd_in_beat = 0
                sample_of_last_beat += beat_length_in_samples

                if beat_index < len(tempos):
                    current_tempo = tempos[beat_index]
                    beat_length_in_samples = int(60 * sr / current_tempo)

                active_skeleton_index = skeleton_for_beat(beat_index)
                chosen_div, subdivision_lengths, hits, weights = configure_beat(active_skeleton_index)

            remaining = len(y) - curr_sample
            random_proba_list = self.get_random_proba_list(weights)
            chosen_hit = random.choices(hits, weights=random_proba_list, k=1)[0]
            chosen_amplitude = random.choices(
                population=amplitudes, weights=amplitudes_proba_list, k=1
            )[0]
            step_length = subdivision_lengths[index_of_curr_subd_in_beat]

            if chosen_hit == "S":
                tokens.append("HIT_S")
                tokens.append(f"AMP_{chosen_amplitude}")
                curr_sample += step_length
            else:
                hit_metadata = self.get_audio_metadata(chosen_hit)
                if hit_metadata is None:
                    raise AudioGenerationError(f"No sample metadata for {chosen_hit}")
                hit_y_raw = self.get_audio_data(hit_metadata[0], hit_metadata[1], hit_metadata[2])
                add_len = min(hit_metadata[2], remaining)
                hit_y = self.apply_cross_fade(hit_y_raw)

                no_overlap = True
                for start, end in added_hits_intervals:
                    if start <= curr_sample < end:
                        no_overlap = False
                        break
                if added_hits_intervals and curr_sample < added_hits_intervals[0][0]:
                    no_overlap = False

                if no_overlap:
                    y[curr_sample:curr_sample + add_len] += chosen_amplitude * hit_y[:add_len]
                    new_added_hits_intervals.append((curr_sample, curr_sample + add_len))
                    tokens.append(f"HIT_{chosen_hit}")
                else:
                    tokens.append("HIT_S")
                tokens.append(f"AMP_{chosen_amplitude}")
                curr_sample += step_length

            index_of_curr_subd_in_beat += 1

        new_added_hits_intervals.extend(added_hits_intervals)
        return y, new_added_hits_intervals, " ".join(tokens)

    def get_subdivision_hit_probabilities(self, maxsubd: int, number_of_hits: int, hits_list: list[str], probabilities_dict: list[dict[str, list]]) -> list[list[dict[str, float]]]:
        out = []

        for prob_dict in probabilities_dict:
            skeleton_out = []
            for col_index in range(maxsubd):
                current_process = {}
                sum_of_probabilities = 0
                for j in range(number_of_hits):
                    current_hit = hits_list[j]
                    if current_hit not in prob_dict or len(prob_dict[current_hit]) != maxsubd:
                        raise ValidationError(
                            f"Invalid probability row for {current_hit} in skeleton {len(out) + 1}"
                        )
                    current_process[current_hit] = prob_dict[current_hit][col_index]
                    sum_of_probabilities += prob_dict[current_hit][col_index]
                if sum_of_probabilities > 100:
                    raise ValidationError(
                        f"Column {col_index} probabilities sum to {sum_of_probabilities} (>100). "
                        "Reduce one or more values so that the sum ≤ 100."
                    )
                # adding silence with other hits
                current_process["S"] = 100 - sum_of_probabilities
                skeleton_out.append(current_process)
            out.append(skeleton_out)

        return out
    
    def chose_skeletons(self,
                        skeletons: List[Dict],
                        skeleton_matrix:List,
                        num_cycles: int):
        if num_cycles < 1:
            return 0
        number_of_skeletons = len(skeletons)
        current_skeleton_index = random.randrange(number_of_skeletons)
        cycles_chosen = 1
        total_number_of_beats = skeletons[current_skeleton_index]["length"]
        skeletons_chosen = [current_skeleton_index]
        while cycles_chosen < num_cycles:
            # chose next skeleton
            p = skeleton_matrix[current_skeleton_index] # this is a list of probabilities adding to 1, each p[i] is the probability that skeleton i comes next
            current_skeleton_index = random.choices(
                range(number_of_skeletons),
                weights=p,
                k=1
            )[0]
            skeletons_chosen = skeletons_chosen + [current_skeleton_index]
            total_number_of_beats += skeletons[current_skeleton_index]["length"]
            cycles_chosen += 1
        return total_number_of_beats, skeletons_chosen
            

    def merge_skeleton_with_variations(
                                        self,
                                        uuid:str,
                                        maxsubd: int,
                                        probabilities_dict: list[dict[str, list]],
                                        bpm: float,
                                        skeletons: List[Dict],
                                        skeleton_matrix: List,
                                        num_cycles: int,
                                        subdiv_proba: list[list[float]],
                                        amplitudes: list[float],
                                        amplitudes_proba_list: list[float],
                                        shift_proba: float,
                                        allowed_tempo_deviation: float,
                                        sr:int = 48000 
                                    ) -> npt.NDArray:
        # calculating the total number of beats in the audio
        num_of_beats, skeletons_chosen = self.chose_skeletons(skeletons, skeleton_matrix, num_cycles)

        # get the list of tempos for every beat
        tempos, tempo_tokens = self.get_tempos(
            number_of_beats=num_of_beats, initial_tempo=bpm, allowed_tempo_deviation=allowed_tempo_deviation
        )

        # getting the notes
        # Silence is derived from the four explicit hit rows below.
        hits_list = ["D", "OTA", "OTI", "PA2"]
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
            skeletons_chosen=skeletons_chosen,
            skeletons=skeletons,
            num_of_beats_in_audio=num_of_beats,
            sr=sr,
            tempos=tempos,
        )
        y, added_hits_intervals, var_tokens = self.subdivisions_generator(
            y=y,
            maxsubd=maxsubd,
            amplitudes=amplitudes,
            amplitudes_proba_list=amplitudes_proba_list,
            skeletons_chosen=skeletons_chosen,
            skeletons=skeletons,
            added_hits_intervals=added_hits_intervals,
            hit_probabilities=subdivision_hit_probabilities,
            subdiv_proba=subdiv_proba,
            tempos=tempos,
        )

        return y, str(tempos[0]) + "\n" + tempo_tokens + "\n" + skeleton_tokens + "\n" + var_tokens, num_of_beats
    
    def generate(self, uuid: str, num_cycles: int,
                bpm: float, maxsubd: int, shift_proba: float, 
                allowed_tempo_deviation: float, skeletons: List[Dict],
                matrices: List, skeleton_matrix: List, amplitude_variation: float) -> GenerationResult:
        """
        Main generation method with comprehensive error handling and statistics.
        """
        if not isinstance(skeletons, list) or not skeletons:
            raise ValidationError("At least one skeleton is required")
        self.validate_probability_matrices(matrices, len(skeletons), maxsubd)
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
            subdiv_proba = [matrix[0] for matrix in matrices]
            matrix_data = [matrix[1:] for matrix in matrices]
            
            # Create probability dict
            probabilities_dict = [
                dict(zip(self.PROBABILITY_HIT_NOTES, x)) for x in matrix_data
            ]
            y, tokens, generated_num_beats = self.merge_skeleton_with_variations(
                    uuid=uuid,
                    amplitudes=amplitudes,
                    amplitudes_proba_list=amplitudes_proba,
                    shift_proba=shift_proba,
                    maxsubd=maxsubd,
                    bpm=bpm,
                    probabilities_dict=probabilities_dict,
                    skeletons=skeletons,
                    skeleton_matrix=skeleton_matrix,
                    num_cycles=num_cycles,
                    subdiv_proba=subdiv_proba,
                    allowed_tempo_deviation=allowed_tempo_deviation
                )
                        
            return GenerationResult(
                audio=y,
                tokens=tokens,
                generated_num_beats=generated_num_beats
            )
            
        except ValidationError:
            self.generation_stats["errors"].increment()
            raise
        except Exception as e:
            self.generation_stats["errors"].increment()
            logger.error(f"Generation failed for {uuid}: {e}", exc_info=True)
            raise AudioGenerationError(f"Failed to generate audio: {e}") from e
        
class DotderbakePlayer:
    SUPPORTED_NOTES = ["D", "OTA", "OTI", "PA2", "S"]
    
    def __init__(self):
        self._lock = threading.Lock()
        self.SIZE_OF_CHUNK = 300_000 # 1MB
    
    def apply_cross_fade(self, hit_y: npt.NDArray, fade_samples:int=500):
        if len(hit_y) <= fade_samples * 2:
            fade_samples = max(8, len(hit_y) // 4)
        fade_in = 0.5 * (1 - np.cos(np.linspace(0, np.pi, fade_samples)))
        fade_out = 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade_samples)))
        hit_audio = hit_y.copy()
        hit_audio[:fade_samples] *= fade_in
        hit_audio[-fade_samples:] *= fade_out
        return hit_audio
    
    def get_audio_metadata(self, hit_type: str):
        try:
            return sample_manager.get_random_sample(hit_type)
        except Exception as e:
            logger.error(f"Failed to get sample for {hit_type}: {e}")
            return None

    def get_audio_data(self, hit_type: str, sample_number: int, length: int):
        try:
            return sample_manager.get_y(hit_type, sample_number, length)
        except Exception as e:
            logger.error(f"Mismatched size for {hit_type}:{sample_number}, got length = {length}")

    def parse_dotderbake(self, data: str):
        lines = data.split("\n")
        if len(lines) != 4:
            return None
        initial_tempo = float(lines[0])
        tempos = [float(i) for i in lines[1].split(" ")]
        skeleton_line = lines[2].split(" ")
        variations_line = lines[3].split(" ")

        skeleton = []
        for i in range(0,len(skeleton_line),3):
            skeleton.append((
                float(skeleton_line[i].split("_")[1]),
                skeleton_line[i+1].split("_")[1],
                int(skeleton_line[i+2].split("_")[1])
            ))

        return (
            initial_tempo,
            tempos,
            skeleton,
            variations_line
        )
        
    def get_exact_length(self, initial_tempo:float, skeleton: list[tuple[float, str, int]], tempos:list[float], sr=48000):
        current_tempo = initial_tempo
        beat_length_in_samples = int( 60 / current_tempo * sr)

        num_of_beats_in_audio = sum(x[0] for x in skeleton)
        
        total_length_in_samples = 0
        final_list = []
        skeleton_hits_intervals = []
        
        expected_hit_timestamp = 0
        curr_beat = i = 0
        tempo_index = 0
        
        while curr_beat < num_of_beats_in_audio:
            beat_duration = skeleton[i][0]
            
            curr_beat += beat_duration
            
            if int(curr_beat) > tempo_index and int(curr_beat) < len(tempos):
                tempo_index = int(curr_beat)
                new_tempo = tempos[tempo_index]
                current_tempo = new_tempo
                beat_length_in_samples = int(60/current_tempo * sr)
            
            curr_hit = skeleton[i][1]
            
            _, sample_num, hit_length = self.get_audio_metadata(curr_hit)
            
            expected_hit_timestamp += int(beat_duration * beat_length_in_samples)
            adjusted_hit_timestamp = expected_hit_timestamp + skeleton[i][2]
            
            total_length_in_samples = adjusted_hit_timestamp + hit_length
            final_list.append((adjusted_hit_timestamp,total_length_in_samples,curr_hit,sample_num))
            
            skeleton_hits_intervals.append((adjusted_hit_timestamp,total_length_in_samples))
            i+=1
        
        return total_length_in_samples, final_list, skeleton_hits_intervals
    
    def skeleton_replayer(self, uuid: str, amplitude: float, skeleton, initial_tempo, tempos):
        total_length_in_samples, final_list, skeleton_hits_intervals = self.get_exact_length(
            initial_tempo,
            skeleton,
            tempos
        )
        
        memmap_path = settings.AUDIO_MEMMAP_DIR / f"{uuid}.dat"
        y = np.memmap(filename=str(memmap_path), dtype=np.float32, mode="w+", shape=(total_length_in_samples,))
        
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
                window = (window[1],window[1]+self.SIZE_OF_CHUNK)
        
        window = (window[1],total_length_in_samples)
        y_chunk = np.zeros(window[1] - window[0])
        
        for start,end,sym,sample in final_list:
            if window[0] <= start and end <= window[1]:
                newstart = start - window[0]
                newend = end - window[0]
                y_chunk[newstart:newend] = amplitude * self.get_audio_data(sym,sample,newend-newstart)
            else:
                continue
            
        y[window[0]:window[1]] = y_chunk
        
        return y, skeleton_hits_intervals
    
    def subdivision_replay(self, y, added_hits_intervals, variations, initial_tempo, tempos, sr=48000):
        current_tempo = initial_tempo
        
        curr_sample = 0
        tempo_index = 0
        beat_index = 0
        
        chosen_div = int(variations[0].split("_")[1])
        
        beat_length_in_samples = int(60 * sr / current_tempo)
        maxsubd_length_arr = [int(beat_length_in_samples / chosen_div) for _ in range (chosen_div - 1)]
        maxsubd_length_arr.append(beat_length_in_samples - sum(maxsubd_length_arr))
        
        new_added_hits_intervals = []
        j = 1
        index_of_curr_subd_in_beat = 0
        sample_of_last_beat = 0
        
        while curr_sample < len(y) and j < len(variations):
            if curr_sample >= sample_of_last_beat + beat_length_in_samples:
                beat_index += 1
                index_of_curr_subd_in_beat = 0
                sample_of_last_beat = curr_sample
                
                if beat_index < len(tempos):
                    new_tempo = tempos[beat_index]
                    current_tempo = new_tempo
                    beat_length_in_samples = int(60* sr / current_tempo)
                
                chosen_div = int(variations[j].split("_")[1])
                j+=1
                maxsubd_length_arr = [int(beat_length_in_samples / chosen_div) for _ in range(chosen_div - 1)]
                maxsubd_length_arr.append(beat_length_in_samples - sum(maxsubd_length_arr))
                
            remaining = len(y) - curr_sample
            
            chosen_hit = variations[j].split("_")[1]
            j+=1
            chosen_amplitude = float(variations[j].split("_")[1])
            j+=1
            
            if chosen_hit == "S":
                curr_sample += maxsubd_length_arr[index_of_curr_subd_in_beat]
            else:
                hit_metadata = self.get_audio_metadata(chosen_hit)
                hit_y_raw = self.get_audio_data(hit_metadata[0], hit_metadata[1], hit_metadata[2])
                
                add_len = min(hit_metadata[2],remaining)
                hit_y = self.apply_cross_fade(hit_y_raw)
                
                y[curr_sample:curr_sample + add_len] += (
                    chosen_amplitude * hit_y[:add_len]
                )

                new_added_hits_intervals.append(
                    (curr_sample, curr_sample + add_len)
                )
                
                curr_sample += maxsubd_length_arr[index_of_curr_subd_in_beat]
            
            index_of_curr_subd_in_beat += 1
            
        new_added_hits_intervals.extend(added_hits_intervals)
        
        return y, new_added_hits_intervals

    def play_file(self, uuid: str, data: str):
        try:
            amplitudes = [
                0.1015 * settings.AUDIO_VOLUME,
                0.5 * settings.AUDIO_VOLUME,
                1.0 * settings.AUDIO_VOLUME
            ]
            
            initial_tempo, tempos, skeleton, variations = self.parse_dotderbake(data)

            total_length = self.get_exact_length(
                initial_tempo=initial_tempo,
                skeleton=skeleton,
                tempos=tempos
            )
            
            y, added_hits_intervals = self.skeleton_replayer(
                uuid=uuid,
                amplitude=amplitudes[-1],
                skeleton=skeleton,
                initial_tempo=initial_tempo,
                tempos=tempos
            )
            
            y, added_hits_intervals = self.subdivision_replay(
                y=y,
                added_hits_intervals=added_hits_intervals,
                variations=variations,
                initial_tempo=initial_tempo,
                tempos=tempos
            )
            
            return GenerationResult(
                audio=y
            )
        except Exception as e:
            raise AudioGenerationError(f"Failed to generate audio: {e}") from e
        
# Global generator instance
generator = DerboukaGenerator()
player = DotderbakePlayer()
