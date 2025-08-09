/**
 * @fileoverview Discord-specific type definitions for bot message rendering and interaction handling.
 * 
 * This module defines the core types used throughout the bot for managing Discord message
 * interactions, including render strategies for different message update scenarios and
 * the unified reply interface that supports embeds, components, and file attachments.
 */

import { APIEmbed, AttachmentPayload, ActionRowBuilder, ButtonBuilder, AttachmentBuilder } from 'discord.js';

export type RenderStrategy = 
  | 'reply'          // Create new message (message.reply())
  | 'edit'           // Edit existing message
  | 'delete-create'  // Delete and recreate (for attachment changes)
  | 'send';          // Send to channel (message.channel.send())

export interface DiscordReply {
  content?: string;
  embeds?: APIEmbed[];
  components?: ActionRowBuilder<ButtonBuilder>[];
  files?: (AttachmentPayload | AttachmentBuilder)[];
  strategy: RenderStrategy;
  ephemeral?: boolean;
}