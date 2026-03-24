import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from '../config/env';

const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const TTS_SCRIPT = path.join(SCRIPTS_DIR, 'tts_generator.py');
const TTS_CACHE_DIR = path.join(__dirname, '../../uploads/ivr/tts');
const PYTHON_CMD = process.env.TTS_PYTHON_PATH || 'python';
const DEFAULT_VOICE = 'he-IL-AvriNeural';
const BASE = env.BASE_URL || 'https://log.perfectlinesite.com';

class TtsService {
  constructor() {
    if (!fs.existsSync(TTS_CACHE_DIR)) {
      fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Generate MP3 from Hebrew text using Nakdimon + edge-tts.
   * Returns the public URL for the generated file.
   */
  async generate(text: string, voice: string = DEFAULT_VOICE): Promise<string> {
    const hash = crypto.createHash('md5').update(`${text}|${voice}`).digest('hex');
    const filename = `tts_${hash}.mp3`;
    const outputPath = path.join(TTS_CACHE_DIR, filename);
    const publicUrl = `${BASE}/uploads/ivr/tts/${filename}`;

    // Return cached file if exists
    if (fs.existsSync(outputPath)) {
      return publicUrl;
    }

    return new Promise((resolve, reject) => {
      execFile(
        PYTHON_CMD,
        [TTS_SCRIPT, text, outputPath, '--voice', voice],
        { timeout: 30000, encoding: 'utf-8' },
        (error, stdout, stderr) => {
          if (error) {
            console.error('[TTS] Error generating audio:', error.message);
            if (stderr) console.error('[TTS] stderr:', stderr);
            reject(new Error(`TTS generation failed: ${error.message}`));
            return;
          }

          const result = stdout.trim();
          if (result.startsWith('OK|')) {
            console.log(`[TTS] Generated: ${filename}`);
            resolve(publicUrl);
          } else {
            reject(new Error(`TTS unexpected output: ${result}`));
          }
        }
      );
    });
  }

  /**
   * Clear the TTS cache.
   */
  clearCache(): number {
    if (!fs.existsSync(TTS_CACHE_DIR)) return 0;
    const files = fs.readdirSync(TTS_CACHE_DIR).filter((f) => f.endsWith('.mp3'));
    for (const file of files) {
      fs.unlinkSync(path.join(TTS_CACHE_DIR, file));
    }
    console.log(`[TTS] Cleared ${files.length} cached files`);
    return files.length;
  }
}

export const ttsService = new TtsService();
