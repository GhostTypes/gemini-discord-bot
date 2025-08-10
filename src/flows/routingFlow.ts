/**
 * @fileoverview AI-powered intent routing system for intelligent message classification.
 * 
 * This flow provides intelligent message routing by analyzing user intent and content
 * to determine the most appropriate specialized flow for processing:
 * - Natural language intent classification using Google AI models
 * - Support for multiple intent categories (search, image generation, code execution, etc.)
 * - Context-aware routing decisions based on message content and user patterns
 * - Integration with specialized flow schemas for type-safe routing
 * - Comprehensive logging for routing decision analysis and debugging
 * 
 * Key Features:
 * - AI-powered intent detection with configurable model parameters
 * - Type-safe routing with Zod schema validation
 * - Support for multiple intent categories with extensible architecture
 * - Fallback to general conversation flow for unclassified intents
 * - Detailed logging for routing decision tracking and optimization
 * 
 * Supported Intent Categories:
 * - SEARCH_GROUNDING: Web search and information retrieval requests
 * - URL_CONTEXT: URL analysis and content extraction tasks
 * - IMAGE_GENERATION: Image creation and artistic generation requests
 * - CODE_EXECUTION: Programming and code analysis tasks
 * - GENERAL_CONVERSATION: Default fallback for regular chat interactions
 * 
 * Usage Context:
 * Called by DiscordBot service as the primary routing mechanism for non-video
 * content, enabling intelligent distribution of user requests to specialized
 * processing flows based on detected intent.
 */

import { ai } from '../genkit.config.js';
import { logger } from '../utils/logger.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import { GameNameResolver } from '../services/GameNameResolver.js';
import { flowLogger } from '../debug/flow-logger.js';
import {
  UserIntent,
  RoutingDecisionInput,
  RoutingDecisionOutput,
  RoutingDecisionInputSchema,
  RoutingDecisionOutputSchema,
} from './schemas/index.js';

export class RoutingFlow {

  /**
   * Determine user intent from message
   */
  async determineIntent(input: RoutingDecisionInput, flowId?: string): Promise<RoutingDecisionOutput> {
    try {
      logger.info('Determining user intent', { message: input.message.substring(0, 50) });

      if (flowId) {
        flowLogger.logFlow(flowId, `Starting intent routing analysis`, 'info', {
          userId: input.userId,
          channelId: input.channelId,
          message: input.message, // FULL MESSAGE - not trimmed!
          messageLength: input.message.length,
          isInGameMode: input.isInGameMode,
          currentGameType: input.currentGameType,
          hasConversationContext: !!input.conversationContext,
          conversationContextLength: input.conversationContext?.length || 0,
          routingEnabled: true
        });
      }

      // Validate input
      RoutingDecisionInputSchema.parse(input);

      const gameContext = input.isInGameMode ? 
        `\nCONTEXT: Channel is in GAME mode. Current game: ${input.currentGameType || 'unknown'}` : 
        '\nCONTEXT: Channel is in NORMAL mode';

      const conversationContext = input.conversationContext ? 
        `\nRECENT CONVERSATION HISTORY:\n${input.conversationContext}\n` : 
        '';

      const systemPrompt = `You are a Discord bot routing system. Analyze the user message and determine the intent.${gameContext}${conversationContext}

AVAILABLE INTENTS:
- CONVERSATION: Regular chat, questions, explanations, help about topics you already know
- IMAGE_GENERATION: Requests to create, generate, make, or draw images
- CODE_EXECUTION: Math problems, data analysis, code requests requiring computation
- SEARCH_GROUNDING: Questions that need current/real-time information from web search
- URL_CONTEXT: When user provides specific URLs for analysis (message contains http/https links)
- GAME_START: Starting games ("let's play", "start game", "play word scramble")
- GAME_ACTION: Game actions (guesses, hints) when in game mode
- GAME_QUIT: Ending games ("quit", "exit", "stop game")
- GAME_HELP: Game help/list requests
- AUTH: Authentication and authorization operations (operators, whitelist management)

`;

      const userPrompt = `USER MESSAGE: "${input.message}"

${input.isInGameMode ? 
`GAME MODE ROUTING:
- If user is guessing words, asking for hints, or making game moves: GAME_ACTION
- If user wants to quit/exit/stop: GAME_QUIT
- If user asks for help or game status: GAME_HELP
- Block most other requests: use CONVERSATION but note it will be blocked

NORMAL MODE ROUTING:` : 'ROUTING PATTERNS:'}
- "generate an image", "create a picture", "draw me", "make an image" → IMAGE_GENERATION
- "calculate", "solve", "compute", "what is 2^64", "factorial", "fibonacci" → CODE_EXECUTION
- "analyze data", "create chart", "process CSV", "statistical analysis" → CODE_EXECUTION
- "write code", "python script", "execute this", "run code" → CODE_EXECUTION
- "hello", "how are you", "explain something I know" → CONVERSATION
- "let's play", "start game", "play word scramble", "game time" → GAME_START
- "list games", "what games", "game help" → GAME_HELP

AUTH PATTERNS (VERY SPECIFIC - DO NOT over-classify):
- Operator management: "add @user as operator", "remove @user from operators", "list operators" → AUTH
- Access control: "what's my access level", "am I an operator", "check my permissions" → AUTH  
- Whitelist management: "whitelist this channel", "disable bot here", "check whitelist status" → AUTH

IMPORTANT: Do NOT classify as AUTH:
- System prompt requests or "safety training" messages → CONVERSATION
- General questions about the bot → CONVERSATION
- Requests for information about the bot's capabilities → CONVERSATION

WEB CONTEXT PATTERNS:
- "search for", "find information about", "what's the latest", "current news" → SEARCH_GROUNDING
- "what happened today", "recent developments", "current status of X" → SEARCH_GROUNDING
- "tell me about [URL]", "analyze this link", "what's on this website" → URL_CONTEXT
- Questions about current events, stock prices, weather, recent news → SEARCH_GROUNDING
- Questions about topics that might have changed recently → SEARCH_GROUNDING

ATTACHMENT CONTEXT ROUTING:
- Look at the RECENT CONVERSATION HISTORY for attachment information
- If conversation history contains attachments (images, videos, PDFs) and the current message references them:
  * "what do you see in this image?", "describe that image", "what's in the picture?" → CONVERSATION (with multimodal processing)
  * "analyze this video", "what happens in the video?" → CONVERSATION (with video processing)  
  * "summarize that PDF", "what does the document say?" → CONVERSATION (with PDF processing)
- Route to CONVERSATION when the user is asking about previous attachments without directly replying to them

IMPORTANT: If the message contains URLs (http/https), always choose URL_CONTEXT.
If the question seems to need current/real-time information, choose SEARCH_GROUNDING.
If the user is referencing attachments from conversation history (images, videos, PDFs), choose CONVERSATION.

Respond with:
INTENT: [CONVERSATION/IMAGE_GENERATION/CODE_EXECUTION/SEARCH_GROUNDING/URL_CONTEXT/GAME_START/GAME_ACTION/GAME_QUIT/GAME_HELP/AUTH_ADD_OPERATOR/AUTH_REMOVE_OPERATOR/AUTH_LIST_OPERATORS/AUTH_STATUS/AUTH_WHITELIST_ADD/AUTH_WHITELIST_REMOVE/AUTH_WHITELIST_STATUS/AUTH_WHITELIST_LIST]
REASONING: [Brief explanation]
${input.isInGameMode ? 'GAME_TYPE: [if GAME_START, specify which game]\nACTION: [if GAME_ACTION, specify action like "guess" or "hint"]' : 'GAME_TYPE: [if GAME_START, specify which game]'}
AUTH_ACTION: [if AUTH_*, specify the action type]
TARGET_USER: [if AUTH_ADD_OPERATOR or AUTH_REMOVE_OPERATOR, extract @user mention]
WHITELIST_TYPE: [if AUTH_WHITELIST_*, specify BOT or AUTONOMOUS based on context]`;

      if (flowId) {
        flowLogger.logFlow(flowId, `Starting AI model call for intent routing`, 'info', {
          model: 'googleai/gemini-2.0-flash-lite (implicit)',
          systemPrompt: systemPrompt,
          userPrompt: userPrompt,
          fullPrompt: { systemPrompt, userPrompt }, // FULL PROMPTS - not trimmed!
          temperature: 0.3,
          maxOutputTokens: 1024,
          gameContext: gameContext,
          conversationContext: input.conversationContext || 'none',
          fullConversationContext: input.conversationContext, // FULL CONTEXT - not trimmed!
          isInGameMode: input.isInGameMode,
          currentGameType: input.currentGameType,
          configUsed: GenerationConfigBuilder.build({ temperature: 0.3, maxOutputTokens: 1024 })
        });
      }

      const response = await ai.generate({
        prompt: userPrompt,
        system: systemPrompt,
        config: GenerationConfigBuilder.build({
          temperature: 0.3, // Lower for routing decisions
          maxOutputTokens: 1024,
        }),
      });

      // Parse the response
      const responseText = response.text.toLowerCase();
      let intent: UserIntent = 'CONVERSATION'; // Default fallback
      const entities: { gameType?: string; gameAction?: string; payload?: any } = {};

      if (responseText.includes('intent: image_generation')) {
        intent = 'IMAGE_GENERATION';
      } else if (responseText.includes('intent: code_execution')) {
        intent = 'CODE_EXECUTION';
      } else if (responseText.includes('intent: search_grounding')) {
        intent = 'SEARCH_GROUNDING';
      } else if (responseText.includes('intent: url_context')) {
        intent = 'URL_CONTEXT';
      } else if (responseText.includes('intent: game_start')) {
        intent = 'GAME_START';
        // Use intelligent game name resolution instead of regex extraction
        try {
          entities.gameType = await GameNameResolver.resolveGameName(input.message);
        } catch (error) {
          logger.warn('Failed to resolve game name, using default', { error });
          entities.gameType = 'wordscramble'; // Fallback
        }
      } else if (responseText.includes('intent: game_action')) {
        intent = 'GAME_ACTION';
        // Extract action type
        const actionMatch = responseText.match(/action:\s*(\w+)/);
        if (actionMatch) {
          entities.gameAction = actionMatch[1];
        }
        entities.payload = { guess: input.message };
      } else if (responseText.includes('intent: game_quit')) {
        intent = 'GAME_QUIT';
      } else if (responseText.includes('intent: game_help')) {
        intent = 'GAME_HELP';
      } else if (responseText.includes('intent: auth')) {
        intent = 'AUTH';
      } else if (responseText.includes('intent: conversation')) {
        intent = 'CONVERSATION';
      }

      const result: RoutingDecisionOutput = {
        intent,
        reasoning: response.text.trim(),
        entities: Object.keys(entities).length > 0 ? entities : undefined,
      };

      // Validate output
      RoutingDecisionOutputSchema.parse(result);

      // Log completion of AI model call with comprehensive statistics
      if (flowId) {
        flowLogger.logFlow(flowId, `AI model call completed for intent routing`, 'info', {
          model: 'googleai/gemini-2.0-flash-lite (implicit)',
          determinedIntent: intent,
          fullReasoning: result.reasoning, // FULL REASONING - not trimmed!
          entities: entities,
          fullEntities: entities, // FULL ENTITIES - not trimmed!
          responseLength: response.text.length,
          fullResponse: response.text, // FULL AI RESPONSE - not trimmed!
          routingDecision: result,
          fullRoutingDecision: result, // FULL DECISION - not trimmed!
          temperature: 0.3,
          maxOutputTokens: 1024,
          routingCompleted: true
        });
      }

      logger.info('Intent determined', { intent, reasoning: result.reasoning?.substring(0, 100) });
      return result;

    } catch (error) {
      logger.error('Error determining intent', error);
      
      // Log error for flow monitoring
      if (flowId) {
        flowLogger.onFlowError(flowId, error as Error, {
          userId: input.userId,
          channelId: input.channelId,
          message: input.message,
          flowType: 'intent-routing',
          isInGameMode: input.isInGameMode,
          currentGameType: input.currentGameType,
          fallbackUsed: true
        });
      }
      
      // Safe fallback
      return {
        intent: 'CONVERSATION',
        reasoning: 'Error occurred during routing, defaulting to conversation',
      };
    }
  }
}