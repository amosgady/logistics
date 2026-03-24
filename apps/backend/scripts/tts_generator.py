"""
Hebrew TTS Generator - Nakdimon (nikud) + edge-tts
Usage: python tts_generator.py <text> <output_path> [--voice VOICE]
"""

import sys
import asyncio
import hashlib
import os
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
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    asyncio.run(generate_tts(nikud_text, args.output, args.voice))

    # Output result for the calling process
    print(f"OK|{args.output}|{nikud_text}")


if __name__ == "__main__":
    main()
