"""
Hebrew TTS Generator - Nakdimon (nikud) + edge-tts
Usage: python tts_generator.py <text> <output_path> [--voice VOICE]
"""

import sys
import asyncio
import hashlib
import os
import subprocess
import argparse

from nakdimon_ort import Nakdimon
import edge_tts

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "nakdimon.onnx")
DEFAULT_VOICE = "he-IL-AvriNeural"


def add_nikud(text: str, nakdimon: Nakdimon) -> str:
    """Add Hebrew diacritics (nikud) to text."""
    return nakdimon.compute(text)


async def generate_tts(text: str, output_path: str, voice: str) -> None:
    """Generate MP3 from text using edge-tts."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)


def main():
    parser = argparse.ArgumentParser(description="Hebrew TTS with Nakdimon nikud")
    parser.add_argument("text", help="Hebrew text to convert to speech")
    parser.add_argument("output", help="Output MP3 file path")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"TTS voice (default: {DEFAULT_VOICE})")
    parser.add_argument("--no-nikud", action="store_true", help="Skip nikud step")
    args = parser.parse_args()

    # Add nikud
    if args.no_nikud:
        nikud_text = args.text
    else:
        nakdimon = Nakdimon(MODEL_PATH)
        nikud_text = add_nikud(args.text, nakdimon)

    # Generate TTS
    output_dir = os.path.dirname(os.path.abspath(args.output))
    os.makedirs(output_dir, exist_ok=True)

    raw_path = args.output + ".raw.mp3"
    asyncio.run(generate_tts(nikud_text, raw_path, args.voice))

    # Trim leading silence with ffmpeg
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", raw_path,
                "-af", "silenceremove=start_periods=1:start_duration=0:start_threshold=-30dB",
                "-codec:a", "libmp3lame", "-b:a", "128k",
                args.output,
            ],
            capture_output=True, timeout=10,
        )
        os.remove(raw_path)
    except Exception:
        # If ffmpeg fails, use the raw file as-is
        os.rename(raw_path, args.output)

    # Output result for the calling process
    print(f"OK|{args.output}|{nikud_text}")


if __name__ == "__main__":
    main()
