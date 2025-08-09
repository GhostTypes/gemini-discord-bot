/**
 * @fileoverview Google Search grounding flow for real-time information retrieval.
 * 
 * Provides current, accurate information by leveraging Google Search grounding
 * capabilities within the AI model. Key features include:
 * - Real-time web search integration through Google's grounding service
 * - Streaming responses with citation support for source attribution
 * - Structured input/output validation with comprehensive metadata
 * - Integration with GenerativeService for enhanced search processing
 * - Automatic citation formatting and source verification
 * 
 * The flow processes search queries through Google's grounding service to provide
 * up-to-date information with proper source citations, enabling the bot to answer
 * questions about current events, recent developments, and factual information
 * that may not be in the base model's training data.
 */

import { ai } from '../genkit.config.js';
import { 
  SearchGroundingInputSchema, 
  SearchGroundingOutputSchema,
  type SearchGroundingInput,
  type SearchGroundingOutput,
  Citation 
} from './schemas/webContext.js';
import { generativeService } from '../services/GenerativeService.js';
import { logger } from '../utils/logger.js';
import { botConfig } from '../config/environment.js';

/**
 * Search Grounding Flow - Uses Google Search to provide current information
 */
export const searchGroundingFlow = ai.defineFlow(
  {
    name: 'searchGroundingFlow',
    inputSchema: SearchGroundingInputSchema,
    outputSchema: SearchGroundingOutputSchema,
  },
  async (input: SearchGroundingInput): Promise<SearchGroundingOutput> => {
    const { message, userId } = input;

    logger.info('SEARCH GROUNDING: Processing search request', { userId, queryLength: message.length });

    try {
      const systemPrompt = `You are a helpful Discord bot assistant that provides accurate, up-to-date information using web search.

Please provide a comprehensive answer using current information from web search. Be factual, cite your sources, and provide helpful context.`;
      
      const userQuery = `User query: ${message}`;

      const result = await generativeService.generateSearchGrounded(userQuery, systemPrompt);
      const responseText = result.text ?? '';

      // Extract citations from grounding metadata
      const citations = extractCitationsFromResponse(result);
      const searchQueries = extractSearchQueriesFromResponse(result);

      logger.info('SEARCH GROUNDING: Response generated', { 
        userId, 
        responseLength: responseText.length,
        citationCount: citations.length,
        queryCount: searchQueries.length 
      });

      return {
        response: responseText,
        citations,
        searchQueries,
      };

    } catch (error) {
      logger.error('SEARCH GROUNDING: Error processing request', { userId, error });
      
      return {
        response: 'I apologize, but I encountered an error while searching for information. Please try again or rephrase your question.',
        citations: [],
        searchQueries: [],
      };
    }
  }
);

/**
 * Streaming version of search grounding with citation enhancement
 */
export async function streamSearchGrounding(
  input: SearchGroundingInput,
  onChunk: (chunk: string) => Promise<void>
): Promise<{ responseText: string; citations: Citation[]; searchQueries: string[] }> {
  const { message, userId } = input;

  logger.info('SEARCH GROUNDING STREAM: Processing search request', { userId, queryLength: message.length });

  try {
    const systemPrompt = `You are a helpful Discord bot assistant that provides accurate, up-to-date information using web search.

Please provide a comprehensive answer using current information from web search. Be factual, cite your sources, and provide helpful context.`;
    
    const userQuery = `User query: ${message}`;

    const result = await generativeService.generateSearchGroundedStream(userQuery, systemPrompt);

    let fullResponseText = '';
    let chunkCount = 0;

    let finalResponse: any = null;
    
    // Stream the response text (result is the async generator)
    for await (const chunk of result) {
      const chunkAny = chunk as any;
      
      // Filter out thinking chunks, only process final response text
      if (chunk.text && !chunkAny.thoughts) {
        const text = chunk.text;
        chunkCount++;
        fullResponseText += text;
        
        logger.debug(`SEARCH GROUNDING STREAM: Processing chunk ${chunkCount}, length: ${text.length}`);
        await onChunk(text);
      } else if (chunkAny.thoughts) {
        logger.debug(`SEARCH GROUNDING STREAM: Processing thinking chunk (${chunkAny.thoughts.length} chars) - not streaming to user`);
      }
      
      // Keep the last chunk for metadata extraction
      finalResponse = chunk;
    }
    const citations = extractCitationsFromResponse(finalResponse);
    const searchQueries = extractSearchQueriesFromResponse(finalResponse);

    // Log thinking usage if enabled
    if (botConfig.thinking.enabled) {
      logger.info(`SEARCH GROUNDING STREAM: Completed with thinking enabled (budget: ${botConfig.thinking.budget === -1 ? 'dynamic' : botConfig.thinking.budget})`);
    }

    logger.info('SEARCH GROUNDING STREAM: Stream completed', { 
      userId, 
      responseChunks: chunkCount,
      finalResponseLength: fullResponseText.length,
      citationCount: citations.length,
      queryCount: searchQueries.length 
    });

    return {
      responseText: fullResponseText || 'Sorry, I couldn\'t generate a response.',
      citations,
      searchQueries,
    };

  } catch (error) {
    logger.error('SEARCH GROUNDING STREAM: Error processing request', { userId, error });
    
    const errorMessage = 'I apologize, but I encountered an error while searching for information. Please try again or rephrase your question.';
    await onChunk(errorMessage);
    
    return {
      responseText: errorMessage,
      citations: [],
      searchQueries: [],
    };
  }
}

/**
 * Extract citations from Gemini's grounding response
 */
function extractCitationsFromResponse(response: any): Citation[] {
  try {
    const groundingMetadata = response.groundingAttributions || response.groundingSupport?.groundingChunks;
    
    if (!groundingMetadata || !Array.isArray(groundingMetadata)) {
      return [];
    }

    return groundingMetadata
      .map((chunk: any, index: number) => {
        if (chunk.web?.uri && chunk.web?.title) {
          return {
            uri: chunk.web.uri,
            title: chunk.web.title,
            index: index + 1,
          };
        }
        return null;
      })
      .filter((citation): citation is Citation => citation !== null);

  } catch (error) {
    logger.warn('SEARCH GROUNDING: Failed to extract citations', { error });
    return [];
  }
}

/**
 * Extract search queries from Gemini's response metadata
 */
function extractSearchQueriesFromResponse(response: any): string[] {
  try {
    const searchQueries = response.groundingSupport?.webSearchQueries || 
                         response.searchQueries ||
                         [];
    
    return Array.isArray(searchQueries) ? searchQueries : [];

  } catch (error) {
    logger.warn('SEARCH GROUNDING: Failed to extract search queries', { error });
    return [];
  }
}