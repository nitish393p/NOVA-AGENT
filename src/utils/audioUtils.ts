/**
 * Audio encoding, decoding, and processing utilities for Gemini Live API
 */

/**
 * High-performance linear interpolation resampling from input rate to 16,000 Hz
 */
export function downsampleTo16k(
  buffer: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === 16000) {
    return buffer;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const indexFloor = Math.floor(srcIndex);
    const indexCeil = Math.min(buffer.length - 1, indexFloor + 1);
    const fraction = srcIndex - indexFloor;
    result[i] = buffer[indexFloor] * (1 - fraction) + buffer[indexCeil] * fraction;
  }
  return result;
}

/**
 * Converts Float32 audio buffer to 16-bit PCM little-endian Int16Array
 */
export function float32ToInt16(buffer: Float32Array): Int16Array {
  const l = buffer.length;
  const output = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * Fast zero-allocation base64 encoder for 16-bit PCM (eliminates massive Array.from GC pauses)
 */
export function int16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
  let binary = '';
  const len = bytes.length;
  const chunkSize = 1024;
  for (let i = 0; i < len; i += chunkSize) {
    const end = Math.min(i + chunkSize, len);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(bytes[j]);
    }
  }
  return btoa(binary);
}

/**
 * Complete pipeline: Float32 -> 16kHz -> Int16 -> Base64
 */
export function pcm16kToBase64(
  float32Data: Float32Array,
  currentSampleRate: number
): string {
  const resampled = downsampleTo16k(float32Data, currentSampleRate);
  const int16 = float32ToInt16(resampled);
  return int16ToBase64(int16);
}

/**
 * High-performance base64 16-bit PCM (24kHz from Gemini Live) decoding into Float32Array
 */
export function base64ToPcm24kFloat32(base64Data: string): Float32Array {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const numSamples = Math.floor(len / 2);
  const float32 = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const byte1 = binaryString.charCodeAt(i * 2);
    const byte2 = binaryString.charCodeAt(i * 2 + 1);
    let int16 = (byte2 << 8) | byte1;
    if (int16 >= 0x8000) int16 -= 0x10000;
    float32[i] = int16 / (int16 < 0 ? 32768 : 32767);
  }
  return float32;
}

/**
 * Computes root-mean-square (RMS) volume from Float32 array
 */
export function computeRmsVolume(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / (buffer.length || 1));
}
