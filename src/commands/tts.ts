/**
 * @fileoverview Discord slash command for text-to-speech audio generation.
 * 
 * Provides text-to-speech functionality through Discord slash commands using Google's
 * AI-powered TTS service. Features include:
 * - Multiple voice options with descriptive names and characteristics
 * - Input validation with character limits (max 1000 characters)
 * - Real-time audio generation with progress feedback through deferred replies
 * - Audio file attachment delivery with metadata (duration, size, voice used)
 * - Comprehensive error handling with user-friendly error messages
 * - Safety policy enforcement and content filtering
 * - Logging for usage tracking and debugging
 * 
 * Integrates with the ttsFlow for AI-powered speech synthesis and supports
 * various voice personalities and speaking styles.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { ttsFlow, TTS_VOICES } from '../flows/ttsFlow.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('tts')
  .setDescription('Generate text-to-speech audio')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('The text to convert to speech')
      .setRequired(true)
      .setMaxLength(1000)
  )
  .addStringOption(option => {
    const voiceOption = option
      .setName('voice')
      .setDescription('Voice to use for text-to-speech')
      .setRequired(true);
    
    // Add all voice choices
    TTS_VOICES.forEach(voice => {
      voiceOption.addChoices({ name: `${voice.value} (${voice.description})`, value: voice.value });
    });
    
    return voiceOption;
  });

export async function execute(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString('prompt', true);
  const voice = interaction.options.getString('voice', true);
  
  if (!prompt || !voice) {
    await interaction.reply({
      content: 'Missing required parameters.',
      ephemeral: true,
    });
    return;
  }

  // Validate voice selection
  const validVoices = TTS_VOICES.map(v => v.value);
  if (!validVoices.includes(voice)) {
    await interaction.reply({
      content: 'Invalid voice selection.',
      ephemeral: true,
    });
    return;
  }

  // Defer reply as TTS generation may take time
  await interaction.deferReply();

  try {
    logger.info('TTS command initiated', {
      userId: interaction.user.id,
      username: interaction.user.username,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      voice,
    });

    // Generate TTS audio
    const result = await ttsFlow({
      prompt,
      voice,
      userId: interaction.user.id,
      channelId: interaction.channelId || undefined,
    });

    // Create audio attachment
    const attachment = new AttachmentBuilder(result.audioBuffer, {
      name: `tts_${voice}_${Date.now()}.wav`,
      description: `TTS audio generated with ${voice} voice`,
    });

    // Reply with the audio file
    await interaction.editReply({
      content: `🎵 **Text-to-Speech Generated**\n` +
               `**Voice:** ${voice}\n` +
               `**Duration:** ${result.duration.toFixed(1)}s\n` +
               `**Size:** ${(result.audioBuffer.length / 1024).toFixed(1)} KB`,
      files: [attachment],
    });

    logger.info('TTS command completed successfully', {
      userId: interaction.user.id,
      channelId: interaction.channelId,
      voice,
      duration: result.duration,
      audioSize: result.audioBuffer.length,
    });
  } catch (error) {
    logger.error('TTS command failed', {
      userId: interaction.user.id,
      channelId: interaction.channelId,
      voice,
      error: error instanceof Error ? error.message : String(error),
    });

    // Handle different error types with user-friendly messages
    let errorMessage = 'An error occurred while generating the audio.';
    
    if (error instanceof Error) {
      if (error.message.includes('safety policies')) {
        errorMessage = '❌ Your text violates content policies. Please try a different prompt.';
      } else if (error.message.includes('timed out')) {
        errorMessage = '⏱️ Audio generation timed out. Please try a shorter text.';
      } else if (error.message.includes('quota exceeded')) {
        errorMessage = '🚫 Service temporarily unavailable. Please try again later.';
      } else if (error.message.includes('too large')) {
        errorMessage = '📁 Generated audio file is too large for Discord.';
      } else if (error.message.includes('Invalid')) {
        errorMessage = '❌ Invalid input. Please check your text and voice selection.';
      }
    }

    await interaction.editReply({
      content: errorMessage,
    });
  }
}