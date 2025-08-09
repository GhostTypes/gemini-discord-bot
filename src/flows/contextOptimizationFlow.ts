/**
 * @fileoverview Context optimization flow for intelligent conversation history filtering.
 * 
 * Provides AI-powered conversation context optimization to improve response quality
 * while reducing token usage. Key capabilities include:
 * - Semantic relevance scoring for message history using AI embeddings
 * - Intelligent message filtering based on relevance to current query
 * - Token usage optimization with configurable context window limits
 * - Structured input/output validation with comprehensive metadata
 * - Integration with RelevanceScorer service for advanced semantic analysis
 * 
 * The flow analyzes conversation history to identify the most relevant messages
 * for the current query, enabling more focused and efficient AI responses while
 * maintaining conversational context. Supports configurable optimization parameters
 * and provides detailed metrics for token savings and relevance scoring.
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { RelevanceScorer, type OptimizedContext } from '../services/RelevanceScorer.js';
import { botConfig } from '../config/environment.js';
import { logger } from '../utils/logger.js';

const MessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(), // Always expect ISO string from parsing
  author: z.object({
    id: z.string(),
    username: z.string(),
    bot: z.boolean().optional(),
  }).optional(),
  replyToMessageId: z.string().nullable().optional(),
  reactions: z.record(z.any()).optional(),
});

const ContextOptimizerInputSchema = z.object({
  query: z.string(),
  history: z.array(MessageSchema),
  maxContextMessages: z.number().default(botConfig.rag.maxContextMessages),
});

const ContextOptimizerOutputSchema = z.object({
  optimizedContext: z.array(MessageSchema),
  relevanceScores: z.array(z.number()),
  tokenSavings: z.number(),
  originalTokens: z.number(),
  optimizedTokens: z.number(),
  metadata: z.object({
    optimizationApplied: z.boolean(),
    fallbackReason: z.string().optional(),
  }),
});

export const contextOptimizerTool = ai.defineTool(
  {
    name: 'contextOptimizer',
    description: 'Selects the most relevant messages from conversation history to answer a user query using RAG-like optimization.',
    inputSchema: ContextOptimizerInputSchema,
    outputSchema: ContextOptimizerOutputSchema,
  },
  async ({ query, history, maxContextMessages }: z.infer<typeof ContextOptimizerInputSchema>) => {
    try {
      if (!botConfig.rag.enabled) {
        logger.debug('RAG optimization disabled, returning full history');
        return {
          optimizedContext: history,
          relevanceScores: history.map(() => 1.0),
          tokenSavings: 0,
          originalTokens: 0,
          optimizedTokens: 0,
          metadata: {
            optimizationApplied: false,
            fallbackReason: 'RAG disabled in configuration',
          },
        };
      }

      if (history.length <= maxContextMessages) {
        logger.debug('History already within context limit, no optimization needed');
        return {
          optimizedContext: history,
          relevanceScores: history.map(() => 1.0),
          tokenSavings: 0,
          originalTokens: 0,
          optimizedTokens: 0,
          metadata: {
            optimizationApplied: false,
            fallbackReason: 'History within context limit',
          },
        };
      }

      logger.info('Applying RAG optimization', {
        originalMessages: history.length,
        maxContextMessages,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      });

      const relevanceScorer = new RelevanceScorer();
      const optimizedResult: OptimizedContext = await relevanceScorer.optimizeContext(
        query,
        history,
        maxContextMessages
      );

      logger.info('RAG optimization completed', {
        originalMessages: history.length,
        optimizedMessages: optimizedResult.messages.length,
        tokenSavings: Math.round(optimizedResult.tokenSavings),
        originalTokens: optimizedResult.originalTokens,
        optimizedTokens: optimizedResult.optimizedTokens,
      });

      return {
        optimizedContext: optimizedResult.messages,
        relevanceScores: optimizedResult.relevanceScores,
        tokenSavings: optimizedResult.tokenSavings,
        originalTokens: optimizedResult.originalTokens,
        optimizedTokens: optimizedResult.optimizedTokens,
        metadata: {
          optimizationApplied: true,
        },
      };
    } catch (error) {
      logger.error('Context optimization failed, falling back to recent messages', error);
      
      // Emergency fallback: use most recent messages
      const fallbackMessages = history.slice(-maxContextMessages);
      
      return {
        optimizedContext: fallbackMessages,
        relevanceScores: fallbackMessages.map(() => 0.5),
        tokenSavings: 0,
        originalTokens: 0,
        optimizedTokens: 0,
        metadata: {
          optimizationApplied: false,
          fallbackReason: `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      };
    }
  }
);

export type ContextOptimizerInput = z.infer<typeof ContextOptimizerInputSchema>;
export type ContextOptimizerOutput = z.infer<typeof ContextOptimizerOutputSchema>;