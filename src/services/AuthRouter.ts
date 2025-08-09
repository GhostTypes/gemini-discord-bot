/**
 * @fileoverview Natural language authentication router for Discord bot access control.
 * 
 * Provides natural language interface for all authentication and authorization
 * operations, enabling users to manage operators and whitelists through conversational
 * commands rather than slash commands. Key features:
 * - Natural language parsing for auth commands and user mentions
 * - Complete feature parity with slash command system
 * - Intelligent entity extraction for users, channels, and auth operations
 * - Comprehensive authorization checks using OperatorService
 * - User-friendly error messages and response formatting
 * 
 * Supported Natural Language Patterns:
 * - Operator Management: "add @user as operator", "remove @user from operators"
 * - Operator Information: "list operators", "who are the operators", "what's my access"
 * - Whitelist Management: "whitelist this channel", "disable bot here"
 * - Whitelist Information: "check whitelist status", "is this channel whitelisted"
 * 
 * Integration Pattern:
 * Follows the same architecture as GameHandler, providing specialized routing
 * for authentication-related intents detected by the AI routing system.
 */

import { Message } from 'discord.js';
import { OperatorService } from './OperatorService.js';
import { WhitelistService, WhitelistType } from './WhitelistService.js';
import { logger } from '../utils/logger.js';
import { AuthFlowOutput } from '../flows/authFlow.js';

interface AuthAction {
  type: 'ADD_OPERATOR' | 'REMOVE_OPERATOR' | 'LIST_OPERATORS' | 'AUTH_STATUS' | 
        'WHITELIST_ADD' | 'WHITELIST_REMOVE' | 'WHITELIST_STATUS' | 'WHITELIST_LIST';
  targetUserId?: string;
  whitelistType?: WhitelistType;
  payload?: any;
}

export class AuthRouter {
  private operatorService: OperatorService;
  private whitelistService: WhitelistService;

  constructor() {
    this.operatorService = OperatorService.getInstance();
    this.whitelistService = WhitelistService.getInstance();
  }

  /**
   * Parse natural language auth command and extract entities
   */
  private parseAuthCommand(message: string, discordMessage: Message): AuthAction | null {
    const cleanMessage = message.toLowerCase().trim();
    
    // Extract user mentions from the Discord message
    const mentionedUsers = Array.from(discordMessage.mentions.users.keys());
    const targetUserId = mentionedUsers.length > 0 ? mentionedUsers[0] : undefined;

    // Operator management patterns
    if ((cleanMessage.includes('add') || cleanMessage.includes('make')) && 
        (cleanMessage.includes('operator') || cleanMessage.includes('admin')) &&
        targetUserId) {
      return { type: 'ADD_OPERATOR', targetUserId };
    }

    if ((cleanMessage.includes('remove') || cleanMessage.includes('revoke') || cleanMessage.includes('delete')) && 
        (cleanMessage.includes('operator') || cleanMessage.includes('admin')) &&
        targetUserId) {
      return { type: 'REMOVE_OPERATOR', targetUserId };
    }

    // Operator information patterns
    if ((cleanMessage.includes('list') || cleanMessage.includes('show') || cleanMessage.includes('who')) &&
        (cleanMessage.includes('operator') || cleanMessage.includes('admin'))) {
      return { type: 'LIST_OPERATORS' };
    }

    if ((cleanMessage.includes('my') && (cleanMessage.includes('access') || cleanMessage.includes('permissions') || cleanMessage.includes('level'))) ||
        (cleanMessage.includes('am i') && cleanMessage.includes('operator'))) {
      return { type: 'AUTH_STATUS' };
    }

    // Whitelist information patterns - CHECK THESE FIRST to prevent conflicts
    if ((cleanMessage.includes('check') || cleanMessage.includes('status') || cleanMessage.includes('what') || cleanMessage.includes('is')) &&
        (cleanMessage.includes('whitelist') || cleanMessage.includes('enabled') || cleanMessage.includes('allowed'))) {
      return { type: 'WHITELIST_STATUS' };
    }

    // Whitelist management patterns - ADD operations
    if ((cleanMessage.includes('whitelist') || cleanMessage.includes('enable') || cleanMessage.includes('allow')) &&
        (cleanMessage.includes('channel') || cleanMessage.includes('this') || cleanMessage.includes('here')) &&
        !(cleanMessage.includes('status') || cleanMessage.includes('check') || cleanMessage.includes('what') || cleanMessage.includes('is'))) {
      
      // Determine whitelist type
      let whitelistType: WhitelistType = WhitelistType.BOT; // Default to bot
      
      if (cleanMessage.includes('autonomous') || cleanMessage.includes('auto')) {
        whitelistType = WhitelistType.AUTONOMOUS;
      } else if (cleanMessage.includes('bot') && cleanMessage.includes('function')) {
        whitelistType = WhitelistType.BOT;
      }
      
      return { type: 'WHITELIST_ADD', whitelistType };
    }

    // Whitelist management patterns - REMOVE operations  
    if ((cleanMessage.includes('unwhitelist') || cleanMessage.includes('remove') || cleanMessage.includes('disable') || cleanMessage.includes('deny')) &&
        (cleanMessage.includes('channel') || cleanMessage.includes('this') || cleanMessage.includes('here') || cleanMessage.includes('bot'))) {
      
      // Determine whitelist type
      let whitelistType: WhitelistType = WhitelistType.BOT; // Default to bot
      
      if (cleanMessage.includes('autonomous') || cleanMessage.includes('auto')) {
        whitelistType = WhitelistType.AUTONOMOUS;
      }
      
      return { type: 'WHITELIST_REMOVE', whitelistType };
    }

    if ((cleanMessage.includes('list') || cleanMessage.includes('show')) &&
        (cleanMessage.includes('whitelist') || cleanMessage.includes('channel'))) {
      return { type: 'WHITELIST_LIST' };
    }

    return null;
  }

  /**
   * Handle authentication request with AI-determined action and entities
   */
  async handleAuthAction(message: Message, authResult: AuthFlowOutput): Promise<void> {
    const userId = message.author.id;
    const channelId = message.channelId;

    try {
      logger.info('Processing AI-determined auth action', {
        userId,
        channelId,
        action: authResult.authAction,
        targetUserId: authResult.targetUserId,
        whitelistType: authResult.whitelistType
      });

      // Handle the specific auth action based on AI determination
      switch (authResult.authAction) {
        case 'ADD_OPERATOR':
          if (!authResult.targetUserId) {
            await message.reply('❌ **Missing Target User**\n\nTo add an operator, you need to mention a user (e.g., "add @user as operator").');
            return;
          }
          await this.handleAddOperator(message, authResult.targetUserId);
          break;
          
        case 'REMOVE_OPERATOR':
          if (!authResult.targetUserId) {
            await message.reply('❌ **Missing Target User**\n\nTo remove an operator, you need to mention a user (e.g., "remove @user from operators").');
            return;
          }
          await this.handleRemoveOperator(message, authResult.targetUserId);
          break;
          
        case 'LIST_OPERATORS':
          await this.handleListOperators(message);
          break;
          
        case 'AUTH_STATUS':
          await this.handleAuthStatus(message);
          break;
          
        case 'WHITELIST_ADD': {
          const addType = authResult.whitelistType === 'AUTONOMOUS' ? WhitelistType.AUTONOMOUS : WhitelistType.BOT;
          await this.handleWhitelistAdd(message, addType);
          break;
        }
          
        case 'WHITELIST_REMOVE': {
          const removeType = authResult.whitelistType === 'AUTONOMOUS' ? WhitelistType.AUTONOMOUS : WhitelistType.BOT;
          await this.handleWhitelistRemove(message, removeType);
          break;
        }
          
        case 'WHITELIST_STATUS':
          await this.handleWhitelistStatus(message);
          break;
          
        case 'WHITELIST_LIST':
          await this.handleWhitelistList(message);
          break;
          
        default:
          await message.reply('Sorry, I couldn\'t process that auth command.');
      }

    } catch (error) {
      logger.error('Error handling AI-determined auth action:', {
        error,
        userId,
        channelId,
        action: authResult.authAction
      });
      
      await message.reply('An error occurred while processing your auth request. Please try again.');
    }
  }

  /**
   * Legacy method - Handle natural language authentication request with string parsing
   * @deprecated Use handleAuthAction() with AI flow instead
   */
  async handleAuthRequest(message: Message, cleanMessage: string): Promise<void> {
    const userId = message.author.id;
    const channelId = message.channelId;

    try {
      // Parse the command
      const authAction = this.parseAuthCommand(cleanMessage, message);
      
      if (!authAction) {
        await message.reply('I didn\'t understand that auth command. Try something like:\n' +
          '• "add @user as operator"\n' +
          '• "list operators"\n' +
          '• "whitelist this channel"\n' +
          '• "check whitelist status"');
        return;
      }

      logger.info('Processing natural language auth command', {
        userId,
        channelId,
        action: authAction.type,
        targetUserId: authAction.targetUserId,
        whitelistType: authAction.whitelistType
      });

      // Handle the specific auth action
      switch (authAction.type) {
        case 'ADD_OPERATOR':
          await this.handleAddOperator(message, authAction.targetUserId!);
          break;
          
        case 'REMOVE_OPERATOR':
          await this.handleRemoveOperator(message, authAction.targetUserId!);
          break;
          
        case 'LIST_OPERATORS':
          await this.handleListOperators(message);
          break;
          
        case 'AUTH_STATUS':
          await this.handleAuthStatus(message);
          break;
          
        case 'WHITELIST_ADD':
          await this.handleWhitelistAdd(message, authAction.whitelistType!);
          break;
          
        case 'WHITELIST_REMOVE':
          await this.handleWhitelistRemove(message, authAction.whitelistType!);
          break;
          
        case 'WHITELIST_STATUS':
          await this.handleWhitelistStatus(message);
          break;
          
        case 'WHITELIST_LIST':
          await this.handleWhitelistList(message);
          break;
          
        default:
          await message.reply('Sorry, I couldn\'t process that auth command.');
      }

    } catch (error) {
      logger.error('Error handling auth request:', {
        error,
        userId,
        channelId,
        message: cleanMessage.substring(0, 100)
      });
      
      await message.reply('An error occurred while processing your auth request. Please try again.');
    }
  }

  private async handleAddOperator(message: Message, targetUserId: string): Promise<void> {
    // Check authorization
    const isAuthorized = await this.operatorService.isAuthorized(message.author.id);
    if (!isAuthorized) {
      await message.reply('❌ **Access Denied**\n\nYou are not authorized to manage operators. Only operators can add other operators.');
      return;
    }

    const result = await this.operatorService.addOperator(targetUserId, message.author.id);
    
    if (result.success) {
      const operators = await this.operatorService.getAllOperators();
      await message.reply(`✅ **Sub-operator Added**\n\n${result.message}\n\n**Current Sub-operators:** ${operators.subOperators.length}\n**Total Operators:** ${operators.subOperators.length + 1} (including primary)`);
      
      logger.info('AUTH_ROUTER: Sub-operator added via natural language', {
        targetUserId,
        addedBy: message.author.id,
        addedByUsername: message.author.username
      });
    } else {
      await message.reply(`❌ **Failed to Add Sub-operator**\n\n${result.message}`);
    }
  }

  private async handleRemoveOperator(message: Message, targetUserId: string): Promise<void> {
    // Check authorization
    const isAuthorized = await this.operatorService.isAuthorized(message.author.id);
    if (!isAuthorized) {
      await message.reply('❌ **Access Denied**\n\nYou are not authorized to manage operators. Only operators can remove other operators.');
      return;
    }

    const result = await this.operatorService.removeOperator(targetUserId, message.author.id);
    
    if (result.success) {
      const operators = await this.operatorService.getAllOperators();
      await message.reply(`✅ **Sub-operator Removed**\n\n${result.message}\n\n**Current Sub-operators:** ${operators.subOperators.length}\n**Total Operators:** ${operators.subOperators.length + 1} (including primary)`);
      
      logger.info('AUTH_ROUTER: Sub-operator removed via natural language', {
        targetUserId,
        removedBy: message.author.id,
        removedByUsername: message.author.username
      });
    } else {
      await message.reply(`❌ **Failed to Remove Sub-operator**\n\n${result.message}`);
    }
  }

  private async handleListOperators(message: Message): Promise<void> {
    // Check authorization
    const isAuthorized = await this.operatorService.isAuthorized(message.author.id);
    if (!isAuthorized) {
      await message.reply('❌ **Access Denied**\n\nYou are not authorized to view operator lists. Only operators can view this information.');
      return;
    }

    const operators = await this.operatorService.getAllOperators();
    
    if (operators.subOperators.length === 0) {
      await message.reply(`👑 **Operator List**\n\n**Primary Operator:** <@${operators.primary}>\n**Sub-operators:** None\n\n**Total Operators:** 1`);
    } else {
      const subOperatorList = operators.subOperators
        .map((id, index) => `${index + 1}. <@${id}> (\`${id}\`)`)
        .join('\n');
      
      const embed = {
        title: '👑 Bot Operators',
        fields: [
          {
            name: '🔹 Primary Operator',
            value: `<@${operators.primary}> (\`${operators.primary}\`)\n*Can manage sub-operators and all bot functions*`,
            inline: false
          },
          {
            name: '🔸 Sub-Operators',
            value: `${subOperatorList}\n*Can use bot functions but cannot manage operators*`,
            inline: false
          },
          {
            name: '📊 Summary',
            value: `**Total Operators:** ${operators.subOperators.length + 1}\n**Sub-operators:** ${operators.subOperators.length}`,
            inline: false
          }
        ],
        color: 0x00ff00
      };
      
      await message.reply({ embeds: [embed] });
    }
  }

  private async handleAuthStatus(message: Message): Promise<void> {
    const userId = message.author.id;
    const stats = await this.operatorService.getStats();
    const isPrimary = this.operatorService.isPrimaryOperator(userId);
    const isOperator = await this.operatorService.isOperator(userId);
    
    if (!isOperator) {
      await message.reply('🔒 **Your Auth Status**\n\n**Role:** Regular User\n**Permissions:** Can use public bot features\n\n*You are not an operator. Contact an operator to request elevated access.*');
      return;
    }
    
    const userRole = isPrimary ? 'Primary Operator' : 'Sub-Operator';
    
    const embed = {
      title: '📊 Your Operator Status',
      fields: [
        {
          name: '👤 Your Information',
          value: `**Role:** ${userRole}\n**User ID:** \`${userId}\``,
          inline: false
        },
        {
          name: '🔧 System Information',
          value: `**Primary Operator:** <@${stats.primaryOperatorId}>\n**Total Sub-operators:** ${stats.totalSubOperators}\n**Last Modified:** ${stats.lastModified ? new Date(stats.lastModified).toLocaleString() : 'Never'}`,
          inline: false
        },
        {
          name: '🔐 Your Permissions',
          value: isPrimary 
            ? '✅ Can manage sub-operators\n✅ Can use all bot functions\n✅ Cannot be removed'
            : '❌ Cannot manage operators\n✅ Can use bot functions\n⚠️ Can be removed by primary operator',
          inline: false
        }
      ],
      color: isPrimary ? 0xffd700 : 0x00ff00
    };
    
    await message.reply({ embeds: [embed] });
  }

  private async handleWhitelistAdd(message: Message, whitelistType: WhitelistType): Promise<void> {
    const userId = message.author.id;
    const channelId = message.channelId;
    const guildId = message.guildId;

    // Check authorization
    const isAuthorized = await this.operatorService.isAuthorized(userId);
    if (!isAuthorized) {
      await message.reply('❌ **Access Denied**\n\nYou are not authorized to manage channel whitelists. Only operators can modify whitelist settings.');
      return;
    }

    if (!guildId) {
      await message.reply('❌ This command can only be used in a server.');
      return;
    }

    const wasAdded = await this.whitelistService.addChannel(channelId, guildId, whitelistType, userId);
    
    if (wasAdded) {
      const typeDisplay = whitelistType === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
      await message.reply(`✅ **Channel whitelisted for ${typeDisplay}!**\n\n${
        whitelistType === WhitelistType.BOT 
          ? 'The bot can now function in this channel (respond to mentions, use commands, etc.).'
          : 'The bot can now send autonomous responses in this channel without being mentioned.'
      }`);
      
      logger.info('AUTH_ROUTER: Channel whitelisted via natural language', {
        channelId,
        userId,
        guildId,
        type: whitelistType
      });
    } else {
      const typeDisplay = whitelistType === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
      await message.reply(`⚠️ **Already whitelisted**\n\nThis channel is already enabled for ${typeDisplay}.`);
    }
  }

  private async handleWhitelistRemove(message: Message, whitelistType: WhitelistType): Promise<void> {
    const userId = message.author.id;
    const channelId = message.channelId;

    // Check authorization
    const isAuthorized = await this.operatorService.isAuthorized(userId);
    if (!isAuthorized) {
      await message.reply('❌ **Access Denied**\n\nYou are not authorized to manage channel whitelists. Only operators can modify whitelist settings.');
      return;
    }

    const wasRemoved = await this.whitelistService.removeChannel(channelId, whitelistType);
    
    if (wasRemoved) {
      const typeDisplay = whitelistType === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
      await message.reply(`❌ **Channel removed from ${typeDisplay} whitelist**\n\n${
        whitelistType === WhitelistType.BOT
          ? 'The bot will no longer function in this channel.'
          : 'Autonomous responses are now disabled. The bot will still respond to mentions if bot functionality is whitelisted.'
      }`);
      
      logger.info('AUTH_ROUTER: Channel removed from whitelist via natural language', {
        channelId,
        userId,
        type: whitelistType
      });
    } else {
      const typeDisplay = whitelistType === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
      await message.reply(`⚠️ **Not whitelisted**\n\nThis channel was not in the ${typeDisplay} whitelist.`);
    }
  }

  private async handleWhitelistStatus(message: Message): Promise<void> {
    const userId = message.author.id;
    const channelId = message.channelId;
    const guildId = message.guildId;

    // Check authorization
    const isAuthorized = await this.operatorService.isAuthorized(userId);
    if (!isAuthorized) {
      await message.reply('❌ **Access Denied**\n\nYou are not authorized to view whitelist status. Only operators can access this information.');
      return;
    }

    if (!guildId) {
      await message.reply('❌ This command can only be used in a server.');
      return;
    }

    const status = await this.whitelistService.getChannelStatus(channelId);
    const stats = await this.whitelistService.getStats(guildId);
    
    const botEmoji = status.bot ? '✅' : '❌';
    const autonomousEmoji = status.autonomous ? '✅' : '❌';
    
    const embed = {
      title: '📊 Channel Whitelist Status',
      fields: [
        {
          name: `${botEmoji} Bot Functionality`,
          value: status.bot 
            ? 'ENABLED - Bot can respond to mentions, use commands, etc.'
            : 'DISABLED - Bot cannot function in this channel',
          inline: false
        },
        {
          name: `${autonomousEmoji} Autonomous Responses`,
          value: status.autonomous
            ? 'ENABLED - Bot can send responses without being mentioned'
            : 'DISABLED - Bot only responds when mentioned',
          inline: false
        },
        {
          name: '📈 Server Statistics',
          value: `**Bot channels:** ${stats.botWhitelisted}\n**Autonomous channels:** ${stats.autonomousWhitelisted}\n**Last modified:** ${stats.lastModified ? new Date(stats.lastModified).toLocaleString() : 'Never'}`,
          inline: false
        }
      ],
      color: (status.bot || status.autonomous) ? 0x00ff00 : 0xff0000
    };
    
    await message.reply({ embeds: [embed] });
  }

  private async handleWhitelistList(message: Message): Promise<void> {
    const userId = message.author.id;
    const guildId = message.guildId;

    // Check authorization
    const isAuthorized = await this.operatorService.isAuthorized(userId);
    if (!isAuthorized) {
      await message.reply('❌ **Access Denied**\n\nYou are not authorized to view whitelist information. Only operators can access this information.');
      return;
    }

    if (!guildId) {
      await message.reply('❌ This command can only be used in a server.');
      return;
    }

    const [botChannels, autonomousChannels, stats] = await Promise.all([
      this.whitelistService.getWhitelistedChannels(WhitelistType.BOT, guildId),
      this.whitelistService.getWhitelistedChannels(WhitelistType.AUTONOMOUS, guildId),
      this.whitelistService.getStats(guildId)
    ]);

    if (botChannels.length === 0 && autonomousChannels.length === 0) {
      await message.reply('📋 **No Whitelisted Channels**\n\nNo channels are currently whitelisted for any functionality.');
      return;
    }

    const fields = [];

    if (botChannels.length > 0) {
      const botChannelList = botChannels
        .map(id => `• <#${id}> (\`${id}\`)`)
        .join('\n');
      fields.push({
        name: '🤖 Bot Functionality Channels',
        value: botChannelList,
        inline: false
      });
    }

    if (autonomousChannels.length > 0) {
      const autonomousChannelList = autonomousChannels
        .map(id => `• <#${id}> (\`${id}\`)`)
        .join('\n');
      fields.push({
        name: '🔄 Autonomous Response Channels',
        value: autonomousChannelList,
        inline: false
      });
    }

    const embed = {
      title: '📋 Server Whitelist Overview',
      fields: fields,
      footer: {
        text: `Last modified: ${stats.lastModified ? new Date(stats.lastModified).toLocaleString() : 'Never'}`
      },
      color: 0x00ff00
    };

    await message.reply({ embeds: [embed] });
  }
}