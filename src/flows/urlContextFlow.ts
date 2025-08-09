/**
 * @fileoverview URL analysis and context extraction flow for web content processing.
 * 
 * Provides intelligent analysis of web URLs mentioned in user messages with
 * content extraction and context-aware responses. Key capabilities include:
 * - URL validation and accessibility verification
 * - Web content extraction and summarization
 * - Integration with GenerativeService for enhanced content analysis
 * - Streaming responses with proper citation formatting
 * - Structured input/output validation with comprehensive metadata
 * 
 * The flow processes user messages containing URLs, extracts and analyzes
 * the web content, and provides intelligent responses based on both the
 * user's query and the extracted content. Supports multiple URLs per request
 * and handles various web content types.
 */

import { ai } from '../genkit.config.js';
import { 
  UrlContextInputSchema, 
  UrlContextOutputSchema,
  type UrlContextInput,
  type UrlContextOutput 
} from './schemas/webContext.js';
import { generativeService } from '../services/GenerativeService.js';
import { logger } from '../utils/logger.js';
import { botConfig } from '../config/environment.js';

/**
 * URL Context Flow - Analyzes specific URLs provided by users
 */
export const urlContextFlow = ai.defineFlow(
  {
    name: 'urlContextFlow',
    inputSchema: UrlContextInputSchema,
    outputSchema: UrlContextOutputSchema,
  },
  async (input: UrlContextInput): Promise<UrlContextOutput> => {
    const { message, urls, userId } = input;

    logger.info('URL CONTEXT: Processing URL analysis request', { 
      userId, 
      urlCount: urls.length,
      messageLength: message.length 
    });

    try {
      const urlList = urls.map((url, index) => `${index + 1}. ${url}`).join('\n');
      const prompt = `You are a helpful Discord bot assistant that analyzes web content from provided URLs.

User message: ${message}

URLs to analyze:
${urlList}

Please analyze the content from these URLs and provide a comprehensive response to the user's message. Be thorough, accurate, and helpful in your analysis.

IMPORTANT: Do not include or repeat the URLs in your response as this causes unwanted embeds in Discord. Just provide the analysis directly.`;

      const result = await generativeService.generateUrlContext(prompt);
      const responseText = result.text ?? '';

      logger.info('URL CONTEXT: Response generated', { 
        userId, 
        responseLength: responseText.length,
        processedUrlCount: urls.length 
      });

      return {
        response: responseText,
        processedUrls: urls,
      };

    } catch (error) {
      logger.error('URL CONTEXT: Error processing request', { userId, urls, error });
      
      return {
        response: 'I apologize, but I encountered an error while analyzing the provided URLs. Please check that the URLs are accessible and try again.',
        processedUrls: [],
      };
    }
  }
);

/**
 * Streaming version of URL context analysis
 */
export async function streamUrlContext(
  input: UrlContextInput,
  onChunk: (chunk: string) => Promise<void>
): Promise<{ responseText: string; processedUrls: string[] }> {
  const { message, urls, userId } = input;

  logger.info('URL CONTEXT STREAM: Processing URL analysis request', { 
    userId, 
    urlCount: urls.length,
    messageLength: message.length 
  });

  try {
    const urlList = urls.map((url, index) => `${index + 1}. ${url}`).join('\n');
    const prompt = `You are a helpful Discord bot assistant that analyzes web content from provided URLs.

User message: ${message}

URLs to analyze:
${urlList}

Please analyze the content from these URLs and provide a comprehensive response to the user's message. Be thorough, accurate, and helpful in your analysis.

IMPORTANT: Do not include or repeat the URLs in your response as this causes unwanted embeds in Discord. Just provide the analysis directly.`;

    const result = await generativeService.generateUrlContextStream(prompt);

    let fullResponseText = '';
    let chunkCount = 0;

    // Stream the response text (result is the async generator)
    for await (const chunk of result) {
      const chunkAny = chunk as any;
      
      // Filter out thinking chunks, only process final response text
      if (chunk.text && !chunkAny.thoughts) {
        const text = chunk.text;
        chunkCount++;
        fullResponseText += text;
        
        logger.debug(`URL CONTEXT STREAM: Processing chunk ${chunkCount}, length: ${text.length}`);
        await onChunk(text);
      } else if (chunkAny.thoughts) {
        logger.debug(`URL CONTEXT STREAM: Processing thinking chunk (${chunkAny.thoughts.length} chars) - not streaming to user`);
      }
    }

    // Log thinking usage if enabled
    if (botConfig.thinking.enabled) {
      logger.info(`URL CONTEXT STREAM: Completed with thinking enabled (budget: ${botConfig.thinking.budget === -1 ? 'dynamic' : botConfig.thinking.budget})`);
    }

    logger.info('URL CONTEXT STREAM: Stream completed', { 
      userId, 
      responseChunks: chunkCount,
      finalResponseLength: fullResponseText.length,
      processedUrlCount: urls.length 
    });

    return {
      responseText: fullResponseText || 'Sorry, I couldn\'t analyze the provided URLs.',
      processedUrls: urls,
    };

  } catch (error) {
    logger.error('URL CONTEXT STREAM: Error processing request', { userId, urls, error });
    
    const errorMessage = 'I apologize, but I encountered an error while analyzing the provided URLs. Please check that the URLs are accessible and try again.';
    await onChunk(errorMessage);
    
    return {
      responseText: errorMessage,
      processedUrls: [],
    };
  }
}

/**
 * Helper function to validate and clean URLs
 */
export function validateUrls(urls: string[]): string[] {
  const validUrls: string[] = [];
  const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

  for (const url of urls) {
    const cleanUrl = url.trim();
    if (urlPattern.test(cleanUrl)) {
      validUrls.push(cleanUrl);
    } else {
      logger.warn('URL CONTEXT: Invalid URL detected', { url: cleanUrl });
    }
  }

  return validUrls;
}

/**
 * Helper function to determine if URLs are suitable for context analysis
 */
export function isUrlContextAppropriate(urls: string[]): boolean {
  // Filter out known media URLs that should be handled by other flows
  const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.pdf'];
  const youtubePattern = /(?:youtube\.com\/watch|youtu\.be\/)/i;

  for (const url of urls) {
    const lowerUrl = url.toLowerCase();
    
    // Check if it's a YouTube URL (should go to video flow)
    if (youtubePattern.test(lowerUrl)) {
      return false;
    }
    
    // Check if it's a direct media file (should go to appropriate media flow)
    if (mediaExtensions.some(ext => lowerUrl.includes(ext))) {
      return false;
    }
  }

  return true;
}