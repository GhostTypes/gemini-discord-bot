/**
 * @fileoverview Whitelist slash command for managing bot and autonomous response channels.
 * 
 * This command allows server administrators to manage two separate whitelists:
 * - Bot whitelist: Controls whether the bot can function at all in a channel
 * - Autonomous whitelist: Controls whether the bot can send autonomous responses
 * 
 * Provides subcommands to:
 * - Add current channel to a specific whitelist type
 * - Remove current channel from a specific whitelist type
 * - List all whitelisted channels for a specific type
 * - Check status of current channel for both types
 * - Clear all channels from a specific whitelist type
 * 
 * Required Permissions:
 * - User must be an authorized operator (primary operator or sub-operator)
 * - Bot must have necessary permissions to send messages in the channel
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { WhitelistService, WhitelistType } from '../services/WhitelistService.js';
import { OperatorService } from '../services/OperatorService.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Manage bot and autonomous response channel whitelists')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add current channel to a whitelist')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Whitelist type to add channel to')
          .setRequired(true)
          .addChoices(
            { name: 'Bot (allows all bot functions)', value: 'bot' },
            { name: 'Autonomous (allows autonomous responses)', value: 'autonomous' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove current channel from a whitelist')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Whitelist type to remove channel from')
          .setRequired(true)
          .addChoices(
            { name: 'Bot (removes all bot functions)', value: 'bot' },
            { name: 'Autonomous (removes autonomous responses)', value: 'autonomous' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all whitelisted channels for a specific type')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Whitelist type to list')
          .setRequired(true)
          .addChoices(
            { name: 'Bot whitelist', value: 'bot' },
            { name: 'Autonomous whitelist', value: 'autonomous' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check current channel whitelist status for both types')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear')
      .setDescription('Clear all channels from a specific whitelist type')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Whitelist type to clear')
          .setRequired(true)
          .addChoices(
            { name: 'Bot whitelist', value: 'bot' },
            { name: 'Autonomous whitelist', value: 'autonomous' }
          )
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const whitelistService = WhitelistService.getInstance();
  const operatorService = OperatorService.getInstance();

  // Check if user is authorized to use whitelist commands
  const isAuthorized = await operatorService.isAuthorized(userId);
  if (!isAuthorized) {
    await interaction.reply({
      content: '❌ **Access Denied**\n\nYou are not authorized to use whitelist commands. Only operators can manage channel whitelists.',
      ephemeral: true
    });
    return;
  }

  if (!guildId) {
    await interaction.reply({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  // Helper function to convert string choice to enum
  const getWhitelistType = (typeString: string): WhitelistType => {
    return typeString === 'bot' ? WhitelistType.BOT : WhitelistType.AUTONOMOUS;
  };

  try {
    switch (subcommand) {
      case 'add': {
        const typeString = interaction.options.getString('type', true);
        const type = getWhitelistType(typeString);
        
        const wasAdded = await whitelistService.addChannel(channelId, guildId, type, userId);
        
        if (wasAdded) {
          const typeDisplay = type === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
          await interaction.reply({
            content: `✅ **Channel whitelisted for ${typeDisplay}!**\n\n${
              type === WhitelistType.BOT 
                ? 'The bot can now function in this channel (respond to mentions, use commands, etc.).'
                : 'The bot can now send autonomous responses in this channel without being mentioned.'
            }`,
            ephemeral: true
          });
          
          logger.info('WHITELIST: Channel added via slash command', {
            channelId,
            userId,
            guildId,
            type: typeString
          });
        } else {
          const typeDisplay = type === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
          await interaction.reply({
            content: `⚠️ **Already whitelisted**\n\nThis channel is already enabled for ${typeDisplay}.`,
            ephemeral: true
          });
        }
        break;
      }

      case 'remove': {
        const typeString = interaction.options.getString('type', true);
        const type = getWhitelistType(typeString);
        
        const wasRemoved = await whitelistService.removeChannel(channelId, type);
        
        if (wasRemoved) {
          const typeDisplay = type === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
          await interaction.reply({
            content: `❌ **Channel removed from ${typeDisplay} whitelist**\n\n${
              type === WhitelistType.BOT
                ? 'The bot will no longer function in this channel.'
                : 'Autonomous responses are now disabled. The bot will still respond to mentions if bot functionality is whitelisted.'
            }`,
            ephemeral: true
          });
          
          logger.info('WHITELIST: Channel removed via slash command', {
            channelId,
            userId,
            guildId,
            type: typeString
          });
        } else {
          const typeDisplay = type === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
          await interaction.reply({
            content: `⚠️ **Not whitelisted**\n\nThis channel was not in the ${typeDisplay} whitelist.`,
            ephemeral: true
          });
        }
        break;
      }

      case 'list': {
        const typeString = interaction.options.getString('type', true);
        const type = getWhitelistType(typeString);
        
        const channels = await whitelistService.getWhitelistedChannels(type, guildId);
        const stats = await whitelistService.getStats(guildId);
        
        if (channels.length === 0) {
          const typeDisplay = type === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
          await interaction.reply({
            content: `📋 **${typeDisplay} whitelist is empty**\n\nNo channels are currently whitelisted for ${typeDisplay}.`,
            ephemeral: true
          });
        } else {
          const channelList = channels
            .map(id => `• <#${id}> (\`${id}\`)`)
            .join('\n');
          
          const typeDisplay = type === WhitelistType.BOT ? 'Bot Functionality' : 'Autonomous Responses';
          const embed = {
            title: `📋 ${typeDisplay} Whitelist`,
            description: `**${channels.length} channel${channels.length === 1 ? '' : 's'} whitelisted:**\n\n${channelList}`,
            color: 0x00ff00,
            footer: {
              text: `Last modified: ${stats.lastModified ? new Date(stats.lastModified).toLocaleString() : 'Never'}`
            }
          };
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
        }
        break;
      }

      case 'status': {
        const status = await whitelistService.getChannelStatus(channelId);
        const stats = await whitelistService.getStats(guildId);
        
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
        
        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
        break;
      }

      case 'clear': {
        const typeString = interaction.options.getString('type', true);
        const type = getWhitelistType(typeString);
        
        const channels = await whitelistService.getWhitelistedChannels(type, guildId);
        
        if (channels.length === 0) {
          const typeDisplay = type === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
          await interaction.reply({
            content: `⚠️ **${typeDisplay} whitelist already empty**\n\nThere are no channels to clear.`,
            ephemeral: true
          });
          return;
        }

        const clearedCount = await whitelistService.clearWhitelist(type, guildId);
        const typeDisplay = type === WhitelistType.BOT ? 'bot functionality' : 'autonomous responses';
        
        await interaction.reply({
          content: `✅ **${typeDisplay} whitelist cleared**\n\nRemoved **${clearedCount} channel${clearedCount === 1 ? '' : 's'}** from the ${typeDisplay} whitelist.`,
          ephemeral: true
        });
        
        logger.info('WHITELIST: Whitelist cleared via slash command', {
          type: typeString,
          clearedCount,
          userId,
          guildId
        });
        break;
      }

      default:
        await interaction.reply({
          content: '❌ Unknown subcommand. Please check the available options.',
          ephemeral: true
        });
    }

  } catch (error) {
    logger.error('WHITELIST: Error executing whitelist command:', {
      error,
      subcommand,
      channelId,
      userId,
      guildId
    });

    const errorMessage = interaction.replied || interaction.deferred
      ? 'An error occurred while managing the whitelist.'
      : '❌ **Error**\n\nAn error occurred while managing the channel whitelist. Please try again.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}