from pathlib import Path
from typing import List, Optional, Tuple

TEMPO = 120.0
AMP = 1.5

SKELETON_HIT = "HIT_S"
SKELETON_DEV = 0


def hit_base(tok: str) -> str:
    """
    Convert token to base HIT name:
      HIT_OTA_4 -> HIT_OTA
      HIT_PA2_4 -> HIT_PA2
      HIT_D_1   -> HIT_D
      HIT_S_4   -> HIT_S
    If already base (e.g., HIT_D), keep it.
    """
    if not tok.startswith("HIT_"):
        return tok
    parts = tok.split("_")
    if parts and parts[-1].isdigit():
        n = int(parts[-1])
        if 1 <= n <= 8:
            return "_".join(parts[:-1])
    return tok


def load_tokens_from_generated_json(path: Path) -> List[str]:
    obj = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(obj, dict):
        raise ValueError(f"{path}: expected JSON object (dict), got {type(obj)}")

    tokens = obj["tokens"]
    return [str(t) for t in tokens]


def trim_to_last_eoc(tokens: List[str]):
    last = -1
    for i, t in enumerate(tokens):
        if t == "<EOC>":
            last = i
    if last == -1:
        return tokens

    return last, tokens[: last + 1]


def parse_subd_token(tok: str) -> Optional[int]:
    if not tok.startswith("SUBD_"):
        return None
    n = tok.split("_", 1)[1]
    if n.isdigit():
        v = int(n)
        if 1 <= v <= 64:
            return v
    return None


def parse_pos_token(tok: str) -> Optional[int]:
    if not tok.startswith("POS_"):
        return None
    n = tok.split("_", 1)[1]
    if n.isdigit():
        return int(n)
    return None


def parse_beats(tokens: List[str]) -> Tuple[List[List[str]], int]:
    """
    Keep ONLY complete beats: those that start with <SOB> and end with <EOB>.
    Inside a beat, keep SUBD_*, POS_*, HIT_* tokens (new JSON format).
    """
    beats: List[List[str]] = []
    cur: Optional[List[str]] = None
    skipped = 0

    for t in tokens:
        if t == "<SOB>":
            if cur is not None:
                skipped += 1  # previous beat never closed
            cur = []
            continue

        if t == "<EOB>":
            if cur is not None:
                beats.append(cur)
                cur = None
            continue

        if t in ("<SOC>", "<EOC>"):
            if cur is not None:
                skipped += 1
                cur = None
            continue

        if cur is not None:
            if t.startswith("SUBD_") or t.startswith("POS_") or t.startswith("HIT_"):
                cur.append(t)

    if cur is not None:
        skipped += 1

    return beats, skipped


def normalize_beats_to_derbake(
    beats: List[List[str]],
) -> Tuple[List[Tuple[int, List[str]]], int, List[int]]:
    out: List[Tuple[int, List[str]]] = []
    skipped_lines: List[int] = []

    for line_no, beat_tokens in enumerate(beats, start=1):
        if not beat_tokens:
            print(f"[mismatch] beat#{line_no} empty")
            skipped_lines.append(line_no)
            continue

        # Strict: first token must be SUBD_x
        subd = parse_subd_token(beat_tokens[0])
        if subd is None:
            print(
                f"[mismatch] beat#{line_no} missing/invalid SUBD first: {beat_tokens}"
            )
            skipped_lines.append(line_no)
            continue

        expected_len = 1 + 2 * subd  # SUBD + (POS,HIT)*subd
        if len(beat_tokens) != expected_len:
            print(
                f"[mismatch] beat#{line_no} subd={subd} expected_tokens={expected_len} got={len(beat_tokens)} "
                f"tokens={beat_tokens}"
            )
            skipped_lines.append(line_no)
            continue

        hits: List[str] = []
        ok = True

        # Validate exact sequence: POS_i then HIT_*
        idx = 1
        for i in range(subd):
            pos_tok = beat_tokens[idx]
            hit_tok = beat_tokens[idx + 1]

            pos = parse_pos_token(pos_tok)
            if pos != i:
                print(
                    f"[mismatch] beat#{line_no} subd={subd} expected POS_{i} got {pos_tok} "
                    f"tokens={beat_tokens}"
                )
                ok = False
                break

            if not hit_tok.startswith("HIT_"):
                print(
                    f"[mismatch] beat#{line_no} subd={subd} expected HIT_* after {pos_tok} got {hit_tok} "
                    f"tokens={beat_tokens}"
                )
                ok = False
                break

            # keep compatibility: if sometimes you still get HIT_XXX_4, strip suffix
            hits.append(hit_base(hit_tok))

            idx += 2

        if not ok:
            skipped_lines.append(line_no)
            continue

        out.append((subd, hits))

    return out, len(skipped_lines), skipped_lines


def build_tempo_lines(num_beats: int, tempo: float) -> Tuple[str, str]:
    t = f"{tempo:.1f}"
    if num_beats <= 0:
        num_beats = 1
    line1 = t
    line2 = " ".join([t] * num_beats)
    return line1, line2


def build_variations_line(beats: List[Tuple[int, List[str]]], amp: float) -> str:
    parts: List[str] = []
    amp_tok = f"AMP_{amp}"

    for subd, hits in beats:
        parts.append(f"SUBD_{subd}")
        for h in hits:
            parts.append(h)
            parts.append(amp_tok)

    return " ".join(parts)


def fmt_delay(x: float) -> str:
    if abs(x - round(x)) < 1e-9:
        return str(int(round(x)))
    return f"{x:.6f}".rstrip("0").rstrip(".")


def build_skeleton_line_silence(
    num_beats: int,
    hit: str,
    dev: int,
) -> str:
    """
    Create a skeleton line that is ALWAYS silence:
      DELAY_* HIT_S DEV_0 ...
    """
    if num_beats <= 0:
        num_beats = 1

    target = float(num_beats)
    parts: List[str] = []
    t = 0.0
    i = 0

    delay_pattern = [1.0]

    while t < target - 1e-9:
        d = delay_pattern[i % len(delay_pattern)]
        remaining = target - t

        if d > remaining:
            d = remaining

        if d <= 1e-9:
            break

        parts.append(f"DELAY_{fmt_delay(d)}")
        parts.append(hit)
        parts.append(f"DEV_{dev}")

        t += d
        i += 1

    return " ".join(parts)

def tokens_to_derbake(
    tokens: List[str],
    output_path: str,
    tempo: float = TEMPO,
    amp: float = AMP,
    skeleton_hit: str = SKELETON_HIT,
    skeleton_dev: int = SKELETON_DEV,
):
    """
    Convert a list of GPT-generated tokens into a .derbake file.
    """
    last_idx, tokens = trim_to_last_eoc(tokens)

    beats, skipped_beats = parse_beats(tokens)
    if skipped_beats > 0:
        print(f"[tokens_to_derbake] Skipped {skipped_beats} incomplete beats")

    normalized_beats, num_skipped, skipped_lines = normalize_beats_to_derbake(beats)
    if num_skipped > 0:
        print(f"[tokens_to_derbake] Skipped {num_skipped} invalid beats: {skipped_lines}")

    line1, line2 = build_tempo_lines(len(normalized_beats), tempo)

    skeleton_line = build_skeleton_line_silence(len(normalized_beats), skeleton_hit, skeleton_dev)

    variations_line = build_variations_line(normalized_beats, amp)

    output_path = Path(output_path)
    with output_path.open("w", encoding="utf-8") as f:
        f.write(line1 + "\n")
        f.write(line2 + "\n")
        f.write(skeleton_line + "\n")
        f.write(variations_line)

    print(f"[tokens_to_derbake] Wrote {len(normalized_beats)} beats to {output_path}")