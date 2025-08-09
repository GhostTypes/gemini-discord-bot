/**
 * @fileoverview Comprehensive WAV audio processing utilities for Discord bot audio handling.
 * 
 * Provides a complete suite of audio processing functions for handling WAV audio files within
 * the Discord bot ecosystem. Includes duration calculation, waveform visualization generation,
 * audio validation, format conversion, and text analysis utilities. All functions are designed
 * to work with raw audio buffers and handle Discord's file size and format constraints.
 * 
 * Key features:
 * - WAV header parsing and duration calculation from raw audio buffers
 * - Simple waveform visualization generation for Discord display (base64 encoded)
 * - Comprehensive audio validation with Discord's 8MB limit enforcement
 * - PCM to WAV format conversion with configurable sample rates and bit depths
 * - Text word counting utility for audio-related content analysis
 * - Error handling with graceful fallbacks for malformed audio data
 * 
 * All audio processing functions support standard WAV format with 16-bit PCM encoding
 * and handle both mono and stereo audio channels. The utilities are optimized for
 * Discord's audio attachment requirements and provide robust error handling.
 */

/**
 * Calculate the duration of a WAV audio buffer
 */
export function calculateWAVDuration(buffer: Buffer): number {
  try {
    // Parse WAV header manually for duration calculation
    if (buffer.length < 44) {
      throw new Error('Invalid WAV file - too short');
    }
    
    // Check RIFF header
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Invalid WAV file format');
    }
    
    // Read format chunk
    const sampleRate = buffer.readUInt32LE(24);
    const channels = buffer.readUInt16LE(22);
    const bitsPerSample = buffer.readUInt16LE(34);
    
    // Find data chunk
    let dataSize = 0;
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      
      if (chunkId === 'data') {
        dataSize = chunkSize;
        break;
      }
      
      offset += 8 + chunkSize;
    }
    
    if (dataSize === 0 || sampleRate === 0) {
      return 0;
    }
    
    const bytesPerSample = (bitsPerSample / 8) * channels;
    const duration = dataSize / (sampleRate * bytesPerSample);
    
    return duration;
  } catch (error) {
    console.error('Error calculating WAV duration:', error);
    return 0;
  }
}

/**
 * Generate a simple waveform visualization for Discord
 */
export function generateSimpleWaveform(buffer: Buffer, maxPoints: number = 256): string {
  try {
    // Find the data chunk in the WAV file
    let dataOffset = 44; // Standard WAV header size
    let dataSize = 0;
    
    // Find the actual data chunk
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      
      if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }
      
      offset += 8 + chunkSize;
    }
    
    if (dataSize === 0) {
      return '';
    }
    
    // Generate waveform from 16-bit PCM data
    const points: number[] = [];
    const samplesPerPoint = Math.ceil(dataSize / 2 / maxPoints); // 2 bytes per 16-bit sample
    
    for (let i = 0; i < maxPoints; i++) {
      const sampleStart = i * samplesPerPoint * 2 + dataOffset;
      const sampleEnd = Math.min(sampleStart + samplesPerPoint * 2, dataOffset + dataSize);
      
      let sum = 0;
      let count = 0;
      
      for (let j = sampleStart; j < sampleEnd; j += 2) {
        if (j + 1 < buffer.length) {
          const sample = buffer.readInt16LE(j);
          sum += Math.abs(sample);
          count++;
        }
      }
      
      const average = count > 0 ? sum / count : 0;
      points.push(Math.round((average / 32768) * 255)); // Normalize 16-bit to 8-bit
    }
    
    return Buffer.from(points).toString('base64');
  } catch (error) {
    console.error('Error generating waveform:', error);
    return '';
  }
}

/**
 * Validate an audio buffer
 */
export function validateAudioBuffer(buffer: Buffer): { valid: boolean; error?: string } {
  try {
    // Check file size (8MB Discord limit)
    if (buffer.length > 8 * 1024 * 1024) {
      return { valid: false, error: 'Audio file too large (max 8MB)' };
    }
    
    // Check minimum file size
    if (buffer.length < 44) {
      return { valid: false, error: 'Invalid WAV file - too short' };
    }
    
    // Check RIFF header
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
      return { valid: false, error: 'Invalid WAV file format' };
    }
    
    // Read format chunk
    const sampleRate = buffer.readUInt32LE(24);
    const channels = buffer.readUInt16LE(22);
    
    // Check for reasonable audio parameters
    if (sampleRate < 8000 || sampleRate > 48000) {
      return { valid: false, error: 'Invalid sample rate' };
    }
    
    if (channels < 1 || channels > 2) {
      return { valid: false, error: 'Invalid channel count' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Audio validation failed: ${error}` };
  }
}

/**
 * Convert PCM data to WAV format
 */
export function convertPCMToWAV(
  pcmBuffer: Buffer,
  sampleRate: number = 24000,
  channels: number = 1,
  bitDepth: number = 16
): Buffer {
  const dataLength = pcmBuffer.length;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;
  
  const buffer = Buffer.alloc(totalLength);
  let offset = 0;
  
  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(totalLength - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  
  // Format chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4; // Chunk size
  buffer.writeUInt16LE(1, offset); offset += 2; // Audio format (PCM)
  buffer.writeUInt16LE(channels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(sampleRate * channels * (bitDepth / 8), offset); offset += 4; // Byte rate
  buffer.writeUInt16LE(channels * (bitDepth / 8), offset); offset += 2; // Block align
  buffer.writeUInt16LE(bitDepth, offset); offset += 2;
  
  // Data chunk
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataLength, offset); offset += 4;
  
  // Copy PCM data
  pcmBuffer.copy(buffer, offset);
  
  return buffer;
}

/**
 * Count words in a text string
 */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}