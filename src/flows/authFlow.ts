/**
 * @fileoverview Authentication and authorization flow for Discord bot access control.
 * 
 * Provides AI-powered natural language processing for authentication operations.
 * Extracts specific auth actions, target users, and whitelist types from user messages.
 * 
 * Supported Operations:
 * - Operator Management: Add/remove operators, list operators, check auth status
 * - Whitelist Management: Add/remove channels, check status, list channels
 * - Entity Extraction: User mentions, whitelist types, target channels
 * 
 * Architecture:
 * This flow is called by the main routing system when auth-related intents are detected.
 * It provides specialized processing for auth commands using AI understanding rather
 * than primitive string matching, maintaining consistency with the overall flow-based
 * architecture.
 */

import { z } from 'zod';
import { ai } from '../genkit.config.js';
import { logger } from '../utils/logger.js';

// Auth action types that map to AuthRouter methods
const AuthActionSchema = z.enum([
  'ADD_OPERATOR',
  'REMOVE_OPERATOR', 
  'LIST_OPERATORS',
  'AUTH_STATUS',
  'WHITELIST_ADD',
  'WHITELIST_REMOVE',
  'WHITELIST_STATUS',
  'WHITELIST_LIST'
]);

// Input schema for auth flow
const AuthFlowInputSchema = z.object({
  message: z.string().describe('User message requesting auth operation'),
  userId: z.string().describe('Discord user ID of the requester'),
  channelId: z.string().describe('Discord channel ID where request was made'),
  mentionedUserIds: z.array(z.string()).optional().describe('Array of mentioned user IDs'),
});

// Output schema for auth flow
const AuthFlowOutputSchema = z.object({
  authAction: AuthActionSchema.describe('Specific authentication action to perform'),
  targetUserId: z.string().optional().describe('Target user ID for operator operations'),
  whitelistType: z.enum(['BOT', 'AUTONOMOUS']).optional().describe('Type of whitelist operation'),
  reasoning: z.string().describe('Explanation of why this action was chosen'),
});

export type AuthFlowInput = z.infer<typeof AuthFlowInputSchema>;
export type AuthFlowOutput = z.infer<typeof AuthFlowOutputSchema>;

export class AuthFlow {
  /**
   * Determines specific authentication action and extracts relevant entities
   * from natural language auth requests using AI understanding.
   */
  async determineAuthAction(input: AuthFlowInput): Promise<AuthFlowOutput> {
    try {
      logger.info('AUTH_FLOW: Processing auth request', {
        userId: input.userId,
        channelId: input.channelId,
        message: input.message.substring(0, 100),
        mentionedUsers: input.mentionedUserIds?.length || 0
      });

      const response = await ai.generate({
        system: `You are an authentication command parser for a Discord bot. Analyze the user message and determine the specific auth action they want to perform.

SUPPORTED AUTH ACTIONS:
- ADD_OPERATOR: Adding users as operators ("add @user as operator", "make @user admin", "promote @user")
- REMOVE_OPERATOR: Removing operators ("remove @user from operators", "revoke @user access", "demote @user")  
- LIST_OPERATORS: Listing operators ("list operators", "who are the operators", "show admins")
- AUTH_STATUS: Checking auth status ("what's my access level", "am I an operator", "check my permissions")
- WHITELIST_ADD: Adding channels to whitelist ("whitelist this channel", "enable bot here", "allow bot functionality")
- WHITELIST_REMOVE: Removing from whitelist ("disable bot here", "unwhitelist channel", "remove from whitelist")
- WHITELIST_LIST: Listing whitelist status ("list whitelist", "show whitelisted channels", "whitelist status")  
- WHITELIST_STATUS: Checking current channel status ("is this channel whitelisted", "check whitelist status here")

ENTITY EXTRACTION RULES:
1. For operator operations: Extract target user ID from MENTIONED_USERS if present
2. For whitelist operations: Determine type based on keywords:
   - "autonomous", "auto" → AUTONOMOUS
   - "bot functionality", "bot", or no specific type → BOT
3. For status/list operations: No additional entities needed

OUTPUT FORMAT:
Respond with the auth action, extracted entities, and reasoning.

ACTION: [AUTH_ACTION]
TARGET_USER: [user_id or NONE]
WHITELIST_TYPE: [BOT/AUTONOMOUS or NONE]
REASONING: [Brief explanation of decision]`,
        prompt: `USER MESSAGE: "${input.message}"
MENTIONED_USERS: ${input.mentionedUserIds?.join(', ') || 'None'}
REQUESTER_ID: ${input.userId}
CHANNEL_ID: ${input.channelId}`,
        config: {
          temperature: 0.1, // Low temperature for consistent parsing
          maxOutputTokens: 300,
        }
      });

      // Parse the AI response
      const responseText = response.text;
      logger.info('AUTH_FLOW: AI response', { response: responseText.substring(0, 200) });

      // Extract action
      const actionMatch = responseText.match(/ACTION:\s*([^\n]+)/);
      const authAction = actionMatch?.[1]?.trim() as z.infer<typeof AuthActionSchema>;

      if (!authAction || !AuthActionSchema.safeParse(authAction).success) {
        throw new Error(`Invalid auth action extracted: ${authAction}`);
      }

      // Extract target user ID
      const targetMatch = responseText.match(/TARGET_USER:\s*([^\n]+)/);
      const targetUserId = targetMatch?.[1]?.trim();
      const finalTargetUserId = (targetUserId && targetUserId !== 'NONE') ? targetUserId : undefined;

      // Extract whitelist type
      const whitelistMatch = responseText.match(/WHITELIST_TYPE:\s*([^\n]+)/);
      const whitelistType = whitelistMatch?.[1]?.trim();
      const finalWhitelistType = (whitelistType && whitelistType !== 'NONE') ? 
        whitelistType as 'BOT' | 'AUTONOMOUS' : undefined;

      // Extract reasoning
      const reasoningMatch = responseText.match(/REASONING:\s*([^\n]+.*)/s);
      const reasoning = reasoningMatch?.[1]?.trim() || 'Auth action determined by AI processing';

      const result: AuthFlowOutput = {
        authAction,
        targetUserId: finalTargetUserId,
        whitelistType: finalWhitelistType,
        reasoning: reasoning.substring(0, 200) // Limit reasoning length
      };

      // Validate the complete output
      AuthFlowOutputSchema.parse(result);

      logger.info('AUTH_FLOW: Auth action determined', {
        authAction: result.authAction,
        targetUserId: result.targetUserId,
        whitelistType: result.whitelistType,
        reasoning: result.reasoning.substring(0, 100)
      });

      return result;

    } catch (error) {
      logger.error('AUTH_FLOW: Error processing auth request', {
        error,
        userId: input.userId,
        message: input.message.substring(0, 100)
      });

      // Fallback to safe default
      return {
        authAction: 'AUTH_STATUS' as const,
        reasoning: 'Error occurred during auth processing, defaulting to status check'
      };
    }
  }
}