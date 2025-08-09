/**
 * @fileoverview Discord message event handler for AI chat and game interactions.
 * 
 * Handles all Discord message creation events, serving as the primary entry point
 * for AI chat interactions, game messages, and autonomous responses. This handler
 * delegates to MessageHandler which coordinates:
 * - Message validation and response strategy determination
 * - AI chat flow routing based on content analysis
 * - Game message processing when channels are in game mode
 * - Autonomous response opportunities and content analysis
 * - Message caching for conversation context management
 * 
 * The handler ensures all Discord messages are properly processed through the
 * bot's comprehensive message processing pipeline with appropriate routing.
 */

import { Message } from 'discord.js';
import { MessageHandler } from '../services/MessageHandler.js';

export async function handleMessageCreate(message: Message, messageHandler: MessageHandler): Promise<void> {
  await messageHandler.handleMessage(message);
}