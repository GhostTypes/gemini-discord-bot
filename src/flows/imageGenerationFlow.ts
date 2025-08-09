/**
 * @fileoverview AI-powered image generation flow with Google Imagen integration.
 * 
 * This flow handles image generation requests through a two-phase process:
 * 1. Request parsing to extract prompts and style preferences from natural language
 * 2. Image generation using Google's Imagen model with optimized parameters
 * 
 * Key Features:
 * - Natural language prompt parsing and enhancement
 * - Style detection and application (photorealistic, artistic, cartoon, etc.)
 * - Google Imagen model integration with base64 data URL output
 * - Comprehensive error handling and validation
 * - Type-safe interfaces with Zod schema validation
 * 
 * Image Generation Pipeline:
 * 1. Parse user request to extract core prompt and style preferences
 * 2. Enhance prompt with style-specific guidance and quality modifiers
 * 3. Generate image using Google Imagen with optimized parameters
 * 4. Return base64-encoded data URL for Discord attachment
 * 5. Handle errors gracefully with user-friendly messaging
 * 
 * Supported Features:
 * - Multiple artistic styles (photorealistic, digital art, cartoon, etc.)
 * - Prompt enhancement and optimization for better results
 * - Quality and safety filters through Google's built-in moderation
 * - Configurable generation parameters (creativity, style influence)
 * 
 * Usage Context:
 * Called by DiscordBot service when routing flow determines IMAGE_GENERATION
 * intent, processing user requests for visual content creation.
 */

import { ai } from '../genkit.config.js';
import { googleAI } from '@genkit-ai/googleai';
import { logger } from '../utils/logger.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import {
  ImageGenerationInput,
  ImageGenerationOutput,
  ImageRequestParsingInput,
  ImageRequestParsingOutput,
  ImageGenerationInputSchema,
  ImageRequestParsingInputSchema,
} from './schemas/index.js';

export class ImageGenerationFlow {

  /**
   * Parse natural language image request into structured prompt and style
   */
  async parseImageRequest(input: ImageRequestParsingInput): Promise<ImageRequestParsingOutput> {
    try {
      logger.info('Parsing image request', { message: input.message.substring(0, 50) });

      // Validate input
      ImageRequestParsingInputSchema.parse(input);

      const prompt = `Parse this image generation request and extract the main prompt and style.

USER REQUEST: "${input.message}"

Extract:
1. MAIN PROMPT - what should be in the image (remove command words like "generate", "create", "make")
2. STYLE - art style if mentioned (photorealistic, cartoon, anime, painting, etc.)

Examples:
- "generate an image of a sunset" → prompt: "sunset", style: none
- "create a cartoon image of a cat" → prompt: "cat", style: "cartoon"
- "draw me a photorealistic portrait" → prompt: "portrait", style: "photorealistic"

Respond with:
PROMPT: [cleaned description]
STYLE: [style or NONE]
SUCCESS: [TRUE/FALSE]`;

      const response = await ai.generate({
        prompt,
        config: GenerationConfigBuilder.build({
          temperature: 0.2,
          maxOutputTokens: 150,
        }),
      });

      // Parse the response
      const lines = response.text.split('\n');
      let extractedPrompt = input.message; // Fallback
      let style: string | undefined;
      let success = false;

      // Extract prompt
      const promptLine = lines.find(line => line.toLowerCase().startsWith('prompt:'));
      if (promptLine) {
        const parsed = promptLine.substring(promptLine.indexOf(':') + 1).trim();
        if (parsed && parsed.length > 0) {
          extractedPrompt = parsed;
          success = true;
        }
      }

      // Extract style
      const styleLine = lines.find(line => line.toLowerCase().startsWith('style:'));
      if (styleLine) {
        const parsed = styleLine.substring(styleLine.indexOf(':') + 1).trim();
        if (parsed && parsed.toLowerCase() !== 'none') {
          style = parsed;
        }
      }

      const result: ImageRequestParsingOutput = {
        prompt: extractedPrompt,
        style,
        success,
        reasoning: response.text.trim(),
      };

      logger.info('Image request parsed', { prompt: result.prompt, style: result.style, success });
      return result;

    } catch (error) {
      logger.error('Error parsing image request', error);
      
      return {
        prompt: input.message,
        style: undefined,
        success: false,
        reasoning: 'Failed to parse request, using original message',
      };
    }
  }

  /**
   * Generate image from prompt and style
   */
  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    try {
      logger.info('Generating image', { prompt: input.prompt.substring(0, 50), style: input.style });

      // Validate input
      ImageGenerationInputSchema.parse(input);

      // Build enhanced prompt with proper style handling
      let enhancedPrompt: string;
      if (input.style && input.style.trim() !== '') {
        enhancedPrompt = `Create a high-quality ${input.style} image: ${input.prompt}`;
      } else {
        enhancedPrompt = `Create a high-quality image: ${input.prompt}`;
      }

      logger.debug('Image generation prompt', { enhancedPrompt });

      // Generate image using Gemini 2.0 Flash image generation model
      const response = await ai.generate({
        model: googleAI.model('gemini-2.0-flash-preview-image-generation'),
        prompt: enhancedPrompt,
        config: {
          temperature: 0.7, // Some creativity for image generation
          responseModalities: ['TEXT', 'IMAGE'], // Required for image generation model
        },
      });

      // Extract image data URL from response
      let imageDataUrl: string | null = null;

      // Check message.content array for media
      if (response.message?.content && Array.isArray(response.message.content)) {
        const mediaPart = response.message.content.find((part: any) => part.media?.url);
        if (mediaPart?.media?.url) {
          imageDataUrl = mediaPart.media.url;
        }
      }

      // Validate image data
      if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
        throw new Error('No valid image data received from AI model');
      }

      const result: ImageGenerationOutput = {
        dataUrl: imageDataUrl,
        timestamp: new Date().toISOString(),
        model: 'gemini-2.0-flash-preview-image-generation',
        metadata: {
          userId: input.userId,
          channelId: input.channelId,
          prompt: input.prompt,
          style: input.style,
        },
      };

      logger.info('Image generated successfully');
      return result;

    } catch (error) {
      logger.error('Error generating image', error);
      throw new Error(`Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}