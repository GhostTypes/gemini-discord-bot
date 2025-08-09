/**
 * @fileoverview Text-to-speech flow with multi-voice support and audio processing.
 * 
 * Provides high-quality text-to-speech generation using Google's AI models with
 * comprehensive audio processing capabilities. Key features include:
 * - Multiple voice personalities with distinct characteristics and descriptions
 * - Real-time audio generation with buffer processing and format conversion
 * - Audio validation, duration calculation, and waveform generation
 * - PCM to WAV conversion for Discord compatibility
 * - Content filtering and safety validation
 * - Structured input/output validation with detailed metadata
 * 
 * Voice Options:
 * - Charon: Deep, authoritative narrator voice
 * - Fenrir: Energetic, enthusiastic presentation style  
 * - Aoede: Calm, soothing storytelling voice
 * - Kore: Clear, professional announcement voice
 * 
 * Audio Processing Pipeline:
 * 1. Validate input text and voice selection
 * 2. Generate speech using Google's TTS service
 * 3. Process audio buffer and convert format for Discord
 * 4. Calculate duration, generate waveform visualization
 * 5. Return formatted audio data with metadata
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { botConfig } from '../config/environment.js';
import { calculateWAVDuration, generateSimpleWaveform, validateAudioBuffer, convertPCMToWAV, wordCount } from '../utils/audioUtils.js';
import { logger } from '../utils/logger.js';

// Input schema
const TTSInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  voice: z.string().min(1, 'Voice selection required'),
  userId: z.string().optional(),
  channelId: z.string().optional(),
});

// Output schema
const TTSOutputSchema = z.object({
  audioBuffer: z.instanceof(Buffer),
  duration: z.number(),
  waveform: z.string(),
  timestamp: z.string(),
  model: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type TTSInput = z.infer<typeof TTSInputSchema>;
export type TTSOutput = z.infer<typeof TTSOutputSchema>;

// Available voices with descriptions
export const TTS_VOICES = [
  { value: 'Zephyr', description: 'Bright and energetic' },
  { value: 'Autonoe', description: 'Bright and energetic' },
  { value: 'Kore', description: 'Firm and authoritative' },
  { value: 'Orus', description: 'Firm and authoritative' },
  { value: 'Alnilam', description: 'Firm and authoritative' },
  { value: 'Puck', description: 'Upbeat and cheerful' },
  { value: 'Laomedeia', description: 'Upbeat and cheerful' },
  { value: 'Charon', description: 'Professional' },
  { value: 'Rasalgethi', description: 'Professional' },
  { value: 'Iapetus', description: 'Clear and articulate' },
  { value: 'Erinome', description: 'Clear and articulate' },
  { value: 'Algieba', description: 'Smooth and calm' },
  { value: 'Despina', description: 'Smooth and calm' },
  { value: 'Sulafat', description: 'Warm and friendly' },
  { value: 'Achird', description: 'Warm and friendly' },
  { value: 'Umbriel', description: 'Casual and relaxed' },
  { value: 'Callirhoe', description: 'Casual and relaxed' },
  { value: 'Fenrir', description: 'Excitable' },
  { value: 'Leda', description: 'Youthful' },
  { value: 'Lysithea', description: 'Gentle' },
  { value: 'Aoede', description: 'Musical' },
  { value: 'Sinope', description: 'Mysterious' },
  { value: 'Thebe', description: 'Confident' },
  { value: 'Carpo', description: 'Playful' },
  { value: 'Himalia', description: 'Sophisticated' },
];

export const ttsFlow = ai.defineFlow(
  {
    name: 'tts',
    inputSchema: TTSInputSchema,
    outputSchema: TTSOutputSchema,
  },
  async (input: TTSInput): Promise<TTSOutput> => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    logger.info('Starting TTS generation', {
      prompt: input.prompt.substring(0, 100) + (input.prompt.length > 100 ? '...' : ''),
      voice: input.voice,
      userId: input.userId,
      channelId: input.channelId,
      wordCount: wordCount(input.prompt),
    });

    try {
      // Initialize Google GenAI client (direct API, not Genkit)
      const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });
      const response = await genaiClient.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: input.prompt }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: input.voice,
              },
            },
          },
        },
      });
      
      if (!response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
        throw new Error('No audio data received from TTS service');
      }

      // Extract audio data from response
      const audioData = response.candidates[0].content.parts[0].inlineData.data;
      
      // Convert base64 PCM audio to buffer
      const pcmBuffer = Buffer.from(audioData, 'base64');

      // Convert PCM to WAV format (Gemini TTS returns raw PCM data)
      // Using typical TTS audio specs: 24kHz sample rate, mono, 16-bit
      let audioBuffer: Buffer;
      try {
        audioBuffer = convertPCMToWAV(pcmBuffer, 24000, 1, 16);
      } catch (conversionError) {
        logger.error('TTS PCM conversion failed', { error: conversionError });
        throw new Error(`Failed to convert TTS audio format: ${conversionError}`);
      }

      // Validate the converted WAV audio buffer
      const validation = validateAudioBuffer(audioBuffer);
      if (!validation.valid) {
        logger.error('TTS validation failed', { 
          error: validation.error,
          pcmSize: pcmBuffer.length,
          wavSize: audioBuffer.length 
        });
        throw new Error('Invalid audio data received from TTS model');
      }

      // Calculate duration and generate waveform using audioUtils
      const duration = calculateWAVDuration(audioBuffer);
      const waveform = generateSimpleWaveform(audioBuffer, 256);

      const processingTime = Date.now() - startTime;

      logger.info('TTS generation completed', {
        voice: input.voice,
        duration: duration.toFixed(2),
        audioSize: audioBuffer.length,
        processingTime,
        userId: input.userId,
        channelId: input.channelId,
      });

      return {
        audioBuffer,
        duration,
        waveform,
        timestamp,
        model: 'gemini-2.5-flash-preview-tts',
        metadata: {
          userId: input.userId,
          channelId: input.channelId,
          flowType: 'textToSpeech',
          prompt: input.prompt.substring(0, 100), // Store truncated prompt for logging
          voice: input.voice,
          wordCount: wordCount(input.prompt),
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('TTS generation failed', {
        error: error instanceof Error ? error.message : String(error),
        voice: input.voice,
        processingTime,
        userId: input.userId,
        channelId: input.channelId,
      });

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('SAFETY')) {
          throw new Error('Content violates safety policies. Please try a different prompt.');
        }
        if (error.message.includes('DEADLINE_EXCEEDED')) {
          throw new Error('TTS generation timed out. Please try again with a shorter prompt.');
        }
        if (error.message.includes('QUOTA_EXCEEDED') || error.message.includes('RESOURCE_EXHAUSTED')) {
          throw new Error('TTS service quota exceeded. Please try again later.');
        }
        if (error.message.includes('INVALID_ARGUMENT')) {
          throw new Error('Invalid voice selection or prompt. Please check your input.');
        }
      }

      throw new Error(`TTS generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);