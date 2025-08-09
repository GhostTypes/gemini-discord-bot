/**
 * @fileoverview Database-backed channel whitelist service for Discord bot access control.
 * 
 * This service manages two separate whitelists:
 * - BOT: Controls whether the bot can function at all in a channel (respond to mentions, commands, etc.)
 * - AUTONOMOUS: Controls whether the bot can send autonomous responses without being mentioned
 * 
 * Features:
 * - Database-backed storage using Prisma
 * - Separate control for bot functionality vs autonomous responses
 * - Per-guild whitelist management
 * - Comprehensive logging and error handling
 * - Thread-safe operations
 */

import { prisma } from '../persistence/client.js';
import { logger } from '../utils/logger.js';

export enum WhitelistType {
  BOT = 'BOT',
  AUTONOMOUS = 'AUTONOMOUS'
}

interface WhitelistStats {
  totalChannels: number;
  botWhitelisted: number;
  autonomousWhitelisted: number;
  lastModified: string | null;
}

export class WhitelistService {
  private static instance: WhitelistService;

  private constructor() {}

  public static getInstance(): WhitelistService {
    if (!WhitelistService.instance) {
      WhitelistService.instance = new WhitelistService();
    }
    return WhitelistService.instance;
  }

  /**
   * Check if a channel is whitelisted for a specific type
   */
  public async isChannelWhitelisted(channelId: string, type: WhitelistType): Promise<boolean> {
    try {
      const entry = await prisma.channelWhitelist.findUnique({
        where: {
          channelId_whitelistType: {
            channelId,
            whitelistType: type
          }
        }
      });

      return entry?.isEnabled ?? false;
    } catch (error) {
      logger.error('Error checking channel whitelist status:', {
        error,
        channelId,
        type
      });
      return false;
    }
  }

  /**
   * Add a channel to a specific whitelist type
   */
  public async addChannel(
    channelId: string, 
    guildId: string, 
    type: WhitelistType, 
    addedBy: string
  ): Promise<boolean> {
    try {
      const result = await prisma.channelWhitelist.upsert({
        where: {
          channelId_whitelistType: {
            channelId,
            whitelistType: type
          }
        },
        update: {
          isEnabled: true,
          addedBy,
          updatedAt: new Date()
        },
        create: {
          channelId,
          guildId,
          whitelistType: type,
          isEnabled: true,
          addedBy
        }
      });

      logger.info('Channel added to whitelist:', {
        channelId,
        guildId,
        type,
        addedBy,
        id: result.id
      });

      return true;
    } catch (error) {
      logger.error('Error adding channel to whitelist:', {
        error,
        channelId,
        guildId,
        type,
        addedBy
      });
      return false;
    }
  }

  /**
   * Remove a channel from a specific whitelist type
   */
  public async removeChannel(channelId: string, type: WhitelistType): Promise<boolean> {
    try {
      const result = await prisma.channelWhitelist.updateMany({
        where: {
          channelId,
          whitelistType: type
        },
        data: {
          isEnabled: false,
          updatedAt: new Date()
        }
      });

      const wasRemoved = result.count > 0;

      if (wasRemoved) {
        logger.info('Channel removed from whitelist:', {
          channelId,
          type
        });
      } else {
        logger.debug('Channel not found in whitelist:', {
          channelId,
          type
        });
      }

      return wasRemoved;
    } catch (error) {
      logger.error('Error removing channel from whitelist:', {
        error,
        channelId,
        type
      });
      return false;
    }
  }

  /**
   * Get all whitelisted channels for a specific type
   */
  public async getWhitelistedChannels(type: WhitelistType, guildId?: string): Promise<string[]> {
    try {
      const where: any = {
        whitelistType: type,
        isEnabled: true
      };

      if (guildId) {
        where.guildId = guildId;
      }

      const entries = await prisma.channelWhitelist.findMany({
        where,
        select: {
          channelId: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return entries.map(entry => entry.channelId);
    } catch (error) {
      logger.error('Error getting whitelisted channels:', {
        error,
        type,
        guildId
      });
      return [];
    }
  }

  /**
   * Get channel whitelist status for both types
   */
  public async getChannelStatus(channelId: string): Promise<{
    bot: boolean;
    autonomous: boolean;
  }> {
    try {
      const [botStatus, autonomousStatus] = await Promise.all([
        this.isChannelWhitelisted(channelId, WhitelistType.BOT),
        this.isChannelWhitelisted(channelId, WhitelistType.AUTONOMOUS)
      ]);

      return {
        bot: botStatus,
        autonomous: autonomousStatus
      };
    } catch (error) {
      logger.error('Error getting channel status:', {
        error,
        channelId
      });
      return {
        bot: false,
        autonomous: false
      };
    }
  }

  /**
   * Get whitelist statistics
   */
  public async getStats(guildId?: string): Promise<WhitelistStats> {
    try {
      const where: any = {
        isEnabled: true
      };

      if (guildId) {
        where.guildId = guildId;
      }

      const [totalChannels, botChannels, autonomousChannels, lastEntry]: [number, number, number, { updatedAt: Date } | null] = await Promise.all([
        prisma.channelWhitelist.count({ where }),
        prisma.channelWhitelist.count({ 
          where: { ...where, whitelistType: WhitelistType.BOT } 
        }),
        prisma.channelWhitelist.count({ 
          where: { ...where, whitelistType: WhitelistType.AUTONOMOUS } 
        }),
        prisma.channelWhitelist.findFirst({
          where,
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true }
        })
      ]);

      return {
        totalChannels,
        botWhitelisted: botChannels,
        autonomousWhitelisted: autonomousChannels,
        lastModified: lastEntry?.updatedAt.toISOString() ?? null
      };
    } catch (error) {
      logger.error('Error getting whitelist stats:', {
        error,
        guildId
      });
      return {
        totalChannels: 0,
        botWhitelisted: 0,
        autonomousWhitelisted: 0,
        lastModified: null
      };
    }
  }

  /**
   * Clear all whitelist entries for a specific type
   */
  public async clearWhitelist(type: WhitelistType, guildId?: string): Promise<number> {
    try {
      const where: any = {
        whitelistType: type
      };

      if (guildId) {
        where.guildId = guildId;
      }

      const result = await prisma.channelWhitelist.updateMany({
        where,
        data: {
          isEnabled: false,
          updatedAt: new Date()
        }
      });

      logger.info('Whitelist cleared:', {
        type,
        guildId,
        clearedCount: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('Error clearing whitelist:', {
        error,
        type,
        guildId
      });
      return 0;
    }
  }

  /**
   * Migrate existing JSON whitelist data to database (one-time operation)
   */
  public async migrateFromJson(jsonChannels: string[], defaultGuildId: string, addedBy: string): Promise<void> {
    try {
      logger.info('Starting migration from JSON whitelist:', {
        channelCount: jsonChannels.length,
        defaultGuildId
      });

      for (const channelId of jsonChannels) {
        // Add to both BOT and AUTONOMOUS whitelists for backwards compatibility
        await this.addChannel(channelId, defaultGuildId, WhitelistType.BOT, addedBy);
        await this.addChannel(channelId, defaultGuildId, WhitelistType.AUTONOMOUS, addedBy);
      }

      logger.info('Migration completed successfully:', {
        migratedChannels: jsonChannels.length
      });
    } catch (error) {
      logger.error('Error during migration:', {
        error,
        channelCount: jsonChannels.length
      });
      throw error;
    }
  }
}