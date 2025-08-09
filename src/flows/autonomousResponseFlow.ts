/**
 * @fileoverview Autonomous Response Flow - AI-powered proactive bot responses
 * 
 * This flow enables the bot to proactively respond to messages without being explicitly
 * mentioned or replied to. It uses a two-step process:
 * 1. Analyze if the message warrants an autonomous response
 * 2. Generate an appropriate response if warranted
 * 
 * Use cases:
 * - Answering questions that the bot can help with
 * - Providing helpful context or corrections
 * - Responding to specific keywords or patterns
 * - Educational or informational responses
 * 
 * The system is designed to be conservative to avoid spam and only respond when
 * it can provide genuine value to the conversation.
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';


// Input schema for the analysis flow
const AnalysisInputSchema = z.object({
  message: z.string().describe('The message content to analyze'),
  channelId: z.string().describe('Discord channel ID'),
  userId: z.string().describe('User ID who sent the message'),
  username: z.string().describe('Username of the sender'),
  recentMessages: z.array(z.object({
    content: z.string(),
    author: z.string(),
    timestamp: z.string(),
  })).optional().describe('Recent channel messages for context'),
});


/**
 * Analyzes whether a message warrants an autonomous response from the bot
 * Returns only the decision - actual response generation happens through routing
 */
export async function processAutonomousResponse(
  input: z.infer<typeof AnalysisInputSchema>
): Promise<{
  shouldRespond: boolean;
  confidence: number;
  responseType: string;
  reason: string;
}> {
  try {
    logger.debug('AUTONOMOUS: Analyzing message for autonomous response', {
      userId: input.userId,
      messageLength: input.message.length,
    });

    // Only analyze - don't generate response (that happens through routing)
    const systemPrompt = `You are an AI assistant that decides whether a Discord bot should respond autonomously to messages.

IMPORTANT GUIDELINES:
- Only respond when you can provide GENUINE VALUE
- Be CONSERVATIVE - avoid responding to casual conversations
- Focus on helpful, educational, or corrective responses
- DO NOT respond to simple greetings, casual chat, or personal conversations
- DO respond to:
  * Direct questions that you can answer helpfully
  * Technical questions or problems
  * Requests for information or explanations
  * Clear misconceptions that need correction
  * Requests for help or assistance
  * Game initiation requests ("let's play", "start game", "play word scramble")
  * Game-related help requests

RESPONSE TYPES:
- answer: Direct answer to a question
- help: Offering assistance or guidance
- correction: Correcting misinformation or mistakes
- context: Providing helpful context or additional information
- game: Game initiation or game-related requests
- none: No response needed

Consider the channel context and recent messages if provided.

Return ONLY your analysis in JSON format - do not generate the actual response.`;

    const userPrompt = `Analyze this message and decide if an autonomous response is warranted:
Message: "${input.message}"
Username: ${input.username}
${input.recentMessages ? `Recent context: ${input.recentMessages.map((m: any) => `${m.author}: ${m.content}`).join('\n')}` : ''}`;

    const result = await ai.generate({
      prompt: userPrompt,
      system: systemPrompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 500,
      },
      output: {
        format: 'json',
        schema: z.object({
          shouldRespond: z.boolean().describe('Whether the bot should respond to this message'),
          confidence: z.number().min(0).max(1).describe('Confidence level (0-1) in the response decision'),
          reason: z.string().describe('Brief explanation for the decision'),
          responseType: z.enum(['answer', 'help', 'correction', 'context', 'game', 'none']).describe('Type of response to provide'),
        }),
      },
    });

    const analysis = result.output;
    if (!analysis) {
      throw new Error('No output from analysis');
    }

    logger.info('AUTONOMOUS: Analysis completed', {
      userId: input.userId,
      shouldRespond: analysis.shouldRespond,
      confidence: analysis.confidence,
      responseType: analysis.responseType,
      reason: analysis.reason,
    });

    return {
      shouldRespond: analysis.shouldRespond && analysis.confidence >= 0.7,
      confidence: analysis.confidence,
      responseType: analysis.responseType,
      reason: analysis.reason,
    };

  } catch (error) {
    logger.error('AUTONOMOUS: Error in autonomous response analysis:', error);
    return {
      shouldRespond: false,
      confidence: 0,
      responseType: 'none',
      reason: 'Analysis error occurred',
    };
  }
}