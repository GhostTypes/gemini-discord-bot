/**
 * @fileoverview Operator management slash commands for Discord bot authorization.
 * 
 * This command allows the primary operator to manage sub-operators who can
 * use protected bot commands. Provides subcommands to:
 * - Add users as sub-operators (primary operator only)
 * - Remove users from sub-operators (primary operator only)
 * - List all operators (primary + sub-operators)
 * - Show operator statistics and permissions
 * 
 * Security Features:
 * - Only primary operator can manage sub-operators
 * - Primary operator cannot be removed or demoted
 * - Comprehensive validation and error handling
 * - Detailed logging for security auditing
 * 
 * Required Permissions:
 * - Primary operator: Can use all subcommands
 * - Sub-operators: Can only view operator status (list/status)
 * - Regular users: No access to any operator commands
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { OperatorService } from '../services/OperatorService.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('operators')
  .setDescription('Manage bot operators and authorization')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a user as sub-operator (primary operator only)')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to add as sub-operator')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a user from sub-operators (primary operator only)')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to remove from sub-operators')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all operators (primary + sub-operators)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Show operator system status and statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear')
      .setDescription('Remove all sub-operators (primary operator only)')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const operatorService = OperatorService.getInstance();

  // Check if user is authorized to use operator commands
  const isAuthorized = await operatorService.isAuthorized(userId);
  if (!isAuthorized) {
    await interaction.reply({
      content: '❌ **Access Denied**\n\nYou are not authorized to use operator commands. Only operators can access this system.',
      ephemeral: true
    });
    return;
  }

  try {
    switch (subcommand) {
      case 'add': {
        const targetUser = interaction.options.getUser('user', true);
        const targetUserId = targetUser.id;
        
        const result = await operatorService.addOperator(targetUserId, userId);
        
        if (result.success) {
          const operators = await operatorService.getAllOperators();
          await interaction.reply({
            content: `✅ **Sub-operator Added**\n\n${result.message}\n\n**Current Sub-operators:** ${operators.subOperators.length}\n**Total Operators:** ${operators.subOperators.length + 1} (including primary)`,
            ephemeral: true
          });
          
          logger.info('OPERATORS: Sub-operator added via slash command', {
            targetUserId,
            targetUsername: targetUser.username,
            addedBy: userId,
            addedByUsername: interaction.user.username
          });
        } else {
          await interaction.reply({
            content: `❌ **Failed to Add Sub-operator**\n\n${result.message}`,
            ephemeral: true
          });
        }
        break;
      }

      case 'remove': {
        const targetUser = interaction.options.getUser('user', true);
        const targetUserId = targetUser.id;
        
        const result = await operatorService.removeOperator(targetUserId, userId);
        
        if (result.success) {
          const operators = await operatorService.getAllOperators();
          await interaction.reply({
            content: `✅ **Sub-operator Removed**\n\n${result.message}\n\n**Current Sub-operators:** ${operators.subOperators.length}\n**Total Operators:** ${operators.subOperators.length + 1} (including primary)`,
            ephemeral: true
          });
          
          logger.info('OPERATORS: Sub-operator removed via slash command', {
            targetUserId,
            targetUsername: targetUser.username,
            removedBy: userId,
            removedByUsername: interaction.user.username
          });
        } else {
          await interaction.reply({
            content: `❌ **Failed to Remove Sub-operator**\n\n${result.message}`,
            ephemeral: true
          });
        }
        break;
      }

      case 'list': {
        const operators = await operatorService.getAllOperators();
        
        if (operators.subOperators.length === 0) {
          await interaction.reply({
            content: `👑 **Operator List**\n\n**Primary Operator:** <@${operators.primary}>\n**Sub-operators:** None\n\n**Total Operators:** 1`,
            ephemeral: true
          });
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
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
        }
        break;
      }

      case 'status': {
        const stats = await operatorService.getStats();
        const isPrimary = operatorService.isPrimaryOperator(userId);
        const userRole = isPrimary ? 'Primary Operator' : 'Sub-Operator';
        
        const embed = {
          title: '📊 Operator System Status',
          fields: [
            {
              name: '👤 Your Status',
              value: `**Role:** ${userRole}\n**User ID:** \`${userId}\``,
              inline: false
            },
            {
              name: '🔧 System Information',
              value: `**Primary Operator:** <@${stats.primaryOperatorId}>\n**Total Sub-operators:** ${stats.totalSubOperators}\n**Last Modified:** ${stats.lastModified ? new Date(stats.lastModified).toLocaleString() : 'Never'}`,
              inline: false
            },
            {
              name: '🔐 Permissions',
              value: isPrimary 
                ? '✅ Can manage sub-operators\n✅ Can use all bot functions\n✅ Cannot be removed'
                : '❌ Cannot manage operators\n✅ Can use bot functions\n⚠️ Can be removed by primary operator',
              inline: false
            }
          ],
          color: isPrimary ? 0xffd700 : 0x00ff00
        };
        
        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
        break;
      }

      case 'clear': {
        const result = await operatorService.clearOperators(userId);
        
        if (result.success) {
          await interaction.reply({
            content: `✅ **Sub-operators Cleared**\n\n${result.message}\n\nOnly the primary operator remains.`,
            ephemeral: true
          });
          
          logger.info('OPERATORS: All sub-operators cleared via slash command', {
            clearedBy: userId,
            clearedByUsername: interaction.user.username
          });
        } else {
          await interaction.reply({
            content: `❌ **Failed to Clear Sub-operators**\n\n${result.message}`,
            ephemeral: true
          });
        }
        break;
      }

      default:
        await interaction.reply({
          content: '❌ Unknown subcommand. Please check the available options.',
          ephemeral: true
        });
    }

  } catch (error) {
    logger.error('OPERATORS: Error executing operator command:', {
      error,
      subcommand,
      userId,
      username: interaction.user.username
    });

    const errorMessage = interaction.replied || interaction.deferred
      ? 'An error occurred while managing operators.'
      : '❌ **Error**\n\nAn error occurred while managing the operator system. Please try again.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}