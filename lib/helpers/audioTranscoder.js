/**
 * Audio Transcoder Helper
 *
 * Provides audio transcoding functionality for converting between formats.
 * Primarily used to convert Android's AAC (M4A) audio to PCM16 format
 * required by OpenAI's Realtime API.
 *
 * OpenAI Realtime API Audio Requirements:
 * - Format: PCM16 (raw 16-bit linear PCM)
 * - Sample Rate: 24,000 Hz
 * - Channels: 1 (Mono)
 * - Bit Depth: 16-bit
 * - Byte Order: Little-endian
 * - Encoding: Base64
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { Readable, PassThrough } = require('stream');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Transcode AAC (M4A) audio to PCM16 format
 *
 * @param {string} base64Aac - Base64 encoded AAC audio data
 * @returns {Promise<string>} - Base64 encoded PCM16 audio data
 * @throws {Error} - If transcoding fails
 *
 * @example
 * const pcm16Audio = await transcodeAacToPcm16(aacBase64Data);
 */
async function transcodeAacToPcm16(base64Aac) {
  return new Promise((resolve, reject) => {
    try {
      // Decode base64 to buffer
      const inputBuffer = Buffer.from(base64Aac, 'base64');

      // Validate input
      if (!inputBuffer || inputBuffer.length === 0) {
        reject(new Error('Empty audio data provided'));
        return;
      }

      // Create readable stream from buffer
      const inputStream = new Readable({
        read() {
          this.push(inputBuffer);
          this.push(null);
        },
      });

      // Output chunks collector
      const chunks = [];
      const outputStream = new PassThrough();

      outputStream.on('data', (chunk) => chunks.push(chunk));

      outputStream.on('end', () => {
        const pcm16Buffer = Buffer.concat(chunks);

        // Validate output
        if (pcm16Buffer.length === 0) {
          reject(new Error('Transcoding produced empty output'));
          return;
        }

        const base64Pcm16 = pcm16Buffer.toString('base64');
        resolve(base64Pcm16);
      });

      outputStream.on('error', (error) => {
        reject(new Error(`Output stream error: ${error.message}`));
      });

      // Transcode using FFmpeg
      const command = ffmpeg(inputStream)
        .inputFormat('m4a')
        .audioFrequency(24000) // 24kHz sample rate
        .audioChannels(1) // Mono
        .audioCodec('pcm_s16le') // 16-bit little-endian PCM
        .format('s16le') // Raw PCM output
        .on('error', (error) => {
          // FFmpeg error - provide more context
          const errorMessage = error.message || 'Unknown FFmpeg error';
          reject(new Error(`FFmpeg transcoding failed: ${errorMessage}`));
        })
        .on('stderr', (stderrLine) => {
          // Log FFmpeg stderr for debugging (only in development)
          if (process.env.NODE_ENV === 'dev') {
            console.log(`[AudioTranscoder] FFmpeg: ${stderrLine}`);
          }
        });

      // Pipe the output
      command.pipe(outputStream, { end: true });
    } catch (error) {
      reject(new Error(`Transcoding initialization failed: ${error.message}`));
    }
  });
}

/**
 * Transcode any audio format to PCM16 with auto-detection
 *
 * @param {string} base64Audio - Base64 encoded audio data
 * @param {string} inputFormat - Input format hint ('aac', 'm4a', 'mp3', 'wav', 'webm', etc.)
 * @returns {Promise<string>} - Base64 encoded PCM16 audio data
 * @throws {Error} - If transcoding fails
 */
async function transcodeToOpenAIPcm16(base64Audio, inputFormat = 'aac') {
  return new Promise((resolve, reject) => {
    try {
      const inputBuffer = Buffer.from(base64Audio, 'base64');

      if (!inputBuffer || inputBuffer.length === 0) {
        reject(new Error('Empty audio data provided'));
        return;
      }

      const inputStream = new Readable({
        read() {
          this.push(inputBuffer);
          this.push(null);
        },
      });

      const chunks = [];
      const outputStream = new PassThrough();

      outputStream.on('data', (chunk) => chunks.push(chunk));

      outputStream.on('end', () => {
        const pcm16Buffer = Buffer.concat(chunks);
        if (pcm16Buffer.length === 0) {
          reject(new Error('Transcoding produced empty output'));
          return;
        }
        resolve(pcm16Buffer.toString('base64'));
      });

      outputStream.on('error', (error) => {
        reject(new Error(`Output stream error: ${error.message}`));
      });

      // Map common format aliases
      const formatMap = {
        aac: 'm4a',
        m4a: 'm4a',
        mp4: 'mp4',
        mp3: 'mp3',
        wav: 'wav',
        webm: 'webm',
        ogg: 'ogg',
      };

      const ffmpegFormat = formatMap[inputFormat.toLowerCase()] || inputFormat;

      ffmpeg(inputStream)
        .inputFormat(ffmpegFormat)
        .audioFrequency(24000)
        .audioChannels(1)
        .audioCodec('pcm_s16le')
        .format('s16le')
        .on('error', (error) => {
          reject(new Error(`FFmpeg transcoding failed: ${error.message}`));
        })
        .pipe(outputStream, { end: true });
    } catch (error) {
      reject(new Error(`Transcoding initialization failed: ${error.message}`));
    }
  });
}

/**
 * Check if audio needs transcoding based on format and platform
 *
 * @param {Object} options - Audio metadata
 * @param {string} options.format - Audio format ('pcm16', 'aac', 'mp3', etc.)
 * @param {string} options.platform - Platform ('ios', 'android', 'web')
 * @param {boolean} options.needsTranscode - Explicit transcode flag from client
 * @returns {boolean} - Whether transcoding is needed
 */
function shouldTranscode(options = {}) {
  const { format, platform, needsTranscode } = options;

  // If client explicitly says transcode is needed
  if (needsTranscode === true) {
    return true;
  }

  // If format is already PCM16, no transcoding needed
  if (format && format.toLowerCase() === 'pcm16') {
    return false;
  }

  // Android typically sends AAC
  if (platform === 'android' && format && format.toLowerCase() === 'aac') {
    return true;
  }

  // Formats that need transcoding
  const transcodingFormats = ['aac', 'm4a', 'mp3', 'mp4', 'webm', 'ogg'];
  if (format && transcodingFormats.includes(format.toLowerCase())) {
    return true;
  }

  // Default: no transcoding
  return false;
}

/**
 * Get audio format info from Base64 data by checking magic bytes
 *
 * @param {string} base64Audio - Base64 encoded audio data
 * @returns {string|null} - Detected format or null
 */
function detectAudioFormat(base64Audio) {
  try {
    const buffer = Buffer.from(base64Audio, 'base64');
    if (buffer.length < 12) {
      return null;
    }

    // Check for common audio format signatures
    const hex = buffer.slice(0, 12).toString('hex');

    // AAC/M4A: starts with 'ftyp' at byte 4
    if (hex.slice(8, 16) === '66747970') {
      return 'aac';
    }

    // MP3: starts with ID3 or 0xFF 0xFB
    if (hex.slice(0, 6) === '494433' || hex.slice(0, 4) === 'fffb') {
      return 'mp3';
    }

    // WAV: starts with RIFF
    if (hex.slice(0, 8) === '52494646') {
      return 'wav';
    }

    // OGG: starts with OggS
    if (hex.slice(0, 8) === '4f676753') {
      return 'ogg';
    }

    // WebM: starts with 0x1A 0x45 0xDF 0xA3
    if (hex.slice(0, 8) === '1a45dfa3') {
      return 'webm';
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = {
  transcodeAacToPcm16,
  transcodeToOpenAIPcm16,
  shouldTranscode,
  detectAudioFormat,
};
