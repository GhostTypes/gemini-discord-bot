/**
 * @fileoverview Channel whitelist management utility for autonomous responses.
 * 
 * This utility manages a JSON-based whitelist of Discord channels where the bot
 * is allowed to send autonomous responses. Provides functionality to:
 * - Load and save whitelist from/to JSON file
 * - Check if a channel is whitelisted for autonomous responses
 * - Add/remove channels from the whitelist
 * - Thread-safe file operations with error handling
 * 
 * The whitelist helps prevent spam and allows server administrators to control
 * where the bot can respond autonomously, separate from mention/reply responses.
 * 
 * File Format:
 * {
 *   "channels": ["channel_id_1", "channel_id_2"],
 *   "lastModified": "2024-01-01T00:00:00.000Z"
 * }
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

interface WhitelistData {
  channels: string[];
  lastModified: string | null;
}

export class ChannelWhitelist {
  private static readonly WHITELIST_FILE = path.join(process.cwd(), 'whitelisted_channels.json');
  private static instance: ChannelWhitelist;
  private whitelistData: WhitelistData = { channels: [], lastModified: null };
  private isLoaded = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ChannelWhitelist {
    if (!ChannelWhitelist.instance) {
      ChannelWhitelist.instance = new ChannelWhitelist();
    }
    return ChannelWhitelist.instance;
  }

  /**
   * Load whitelist from JSON file
   */
  private async loadWhitelist(): Promise<void> {
    try {
      const data = await fs.readFile(ChannelWhitelist.WHITELIST_FILE, 'utf-8');
      this.whitelistData = JSON.parse(data);
      this.isLoaded = true;
      
      logger.info('Channel whitelist loaded', {
        channelCount: this.whitelistData.channels.length,
        lastModified: this.whitelistData.lastModified
      });
    } catch (error) {
      if ((error as any)?.code === 'ENOENT') {
        // File doesn't exist, create it with empty data
        await this.saveWhitelist();
        logger.info('Created new channel whitelist file');
      } else {
        logger.error('Error loading channel whitelist:', error);
        // Use empty whitelist as fallback
        this.whitelistData = { channels: [], lastModified: null };
      }
      this.isLoaded = true;
    }
  }

  /**
   * Save current whitelist to JSON file
   */
  private async saveWhitelist(): Promise<void> {
    try {
      this.whitelistData.lastModified = new Date().toISOString();
      const data = JSON.stringify(this.whitelistData, null, 2);
      await fs.writeFile(ChannelWhitelist.WHITELIST_FILE, data, 'utf-8');
      
      logger.debug('Channel whitelist saved', {
        channelCount: this.whitelistData.channels.length
      });
    } catch (error) {
      logger.error('Error saving channel whitelist:', error);
      throw error;
    }
  }

  /**
   * Ensure whitelist is loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadWhitelist();
    }
  }

  /**
   * Check if a channel is whitelisted for autonomous responses
   */
  public async isChannelWhitelisted(channelId: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.whitelistData.channels.includes(channelId);
  }

  /**
   * Add a channel to the whitelist
   */
  public async addChannel(channelId: string): Promise<boolean> {
    await this.ensureLoaded();
    
    if (this.whitelistData.channels.includes(channelId)) {
      logger.debug('Channel already whitelisted', { channelId });
      return false; // Already exists
    }
    
    this.whitelistData.channels.push(channelId);
    await this.saveWhitelist();
    
    logger.info('Channel added to whitelist', { 
      channelId,
      totalChannels: this.whitelistData.channels.length 
    });
    
    return true; // Successfully added
  }

  /**
   * Remove a channel from the whitelist
   */
  public async removeChannel(channelId: string): Promise<boolean> {
    await this.ensureLoaded();
    
    const index = this.whitelistData.channels.indexOf(channelId);
    if (index === -1) {
      logger.debug('Channel not in whitelist', { channelId });
      return false; // Doesn't exist
    }
    
    this.whitelistData.channels.splice(index, 1);
    await this.saveWhitelist();
    
    logger.info('Channel removed from whitelist', { 
      channelId,
      totalChannels: this.whitelistData.channels.length 
    });
    
    return true; // Successfully removed
  }

  /**
   * Get all whitelisted channels
   */
  public async getWhitelistedChannels(): Promise<string[]> {
    await this.ensureLoaded();
    return [...this.whitelistData.channels]; // Return copy
  }

  /**
   * Get whitelist statistics
   */
  public async getStats(): Promise<{
    totalChannels: number;
    lastModified: string | null;
  }> {
    await this.ensureLoaded();
    return {
      totalChannels: this.whitelistData.channels.length,
      lastModified: this.whitelistData.lastModified,
    };
  }

  /**
   * Clear all whitelisted channels
   */
  public async clearWhitelist(): Promise<void> {
    await this.ensureLoaded();
    this.whitelistData.channels = [];
    await this.saveWhitelist();
    
    logger.info('Channel whitelist cleared');
  }
}