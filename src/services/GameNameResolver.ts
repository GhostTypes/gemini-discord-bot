/**
 * @fileoverview Intelligent game name resolution service for fuzzy matching user input to registered games.
 * 
 * This service uses AI to intelligently match user input like "world scrambler", "word puzzle", 
 * "scramble game" to the actual registered game names like "wordscramble". This provides a more
 * natural user experience where users don't need to memorize exact game names.
 * 
 * Features:
 * - AI-powered fuzzy matching for game names
 * - Support for synonyms and alternative game descriptions
 * - Fallback to default game if no clear match is found
 * - Integration with GameRegistry for available games
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { GameRegistry } from '../games/common/GameRegistry.js';
import { logger } from '../utils/logger.js';

export class GameNameResolver {
  
  /**
   * Resolve a user's game request to an actual registered game name
   */
  static async resolveGameName(userInput: string): Promise<string> {
    try {
      // Get available games from registry
      const availableGames = GameRegistry.list();
      
      if (availableGames.length === 0) {
        logger.warn('No games registered in GameRegistry');
        return 'wordscramble'; // Fallback
      }

      // If there's only one game, return it
      if (availableGames.length === 1) {
        return availableGames[0].name;
      }

      logger.debug('Resolving game name from user input', {
        userInput,
        availableGames: availableGames.map(g => g.name)
      });

      const gameList = availableGames
        .map(game => `- ${game.name}: ${game.displayName} - ${game.description}`)
        .join('\n');

      const prompt = `You are a game name resolver. Match the user's request to the most appropriate game from the available games.

AVAILABLE GAMES:
${gameList}

USER REQUEST: "${userInput}"

MATCHING RULES:
- Look for keywords that match game names or descriptions
- Consider synonyms and variations (e.g., "word puzzle" = "wordscramble", "scrambler" = "wordscramble")
- Be flexible with spelling mistakes and variations
- If multiple games could match, choose the most likely one
- If no clear match, choose the first/default game

Return the exact game name (the key before the colon) that best matches the user's request.`;

      const result = await ai.generate({
        prompt,
        config: {
          temperature: 0.2, // Low temperature for consistent matching
          maxOutputTokens: 100,
        },
        output: {
          format: 'json',
          schema: z.object({
            gameName: z.string().describe('The exact game name key that matches the user request'),
            confidence: z.number().min(0).max(1).describe('Confidence in the match (0-1)'),
            reasoning: z.string().describe('Brief explanation of why this game was chosen')
          })
        }
      });

      const resolution = result.output;
      if (!resolution) {
        throw new Error('No output from game name resolution');
      }

      // Validate that the resolved game name actually exists
      const resolvedGameName = resolution.gameName.toLowerCase();
      const gameExists = GameRegistry.exists(resolvedGameName);

      if (!gameExists) {
        logger.warn('AI resolved to non-existent game, using fallback', {
          userInput,
          resolvedName: resolvedGameName,
          availableGames: availableGames.map(g => g.name)
        });
        return availableGames[0].name; // Fallback to first available game
      }

      logger.info('Game name resolved successfully', {
        userInput,
        resolvedName: resolvedGameName,
        confidence: resolution.confidence,
        reasoning: resolution.reasoning
      });

      return resolvedGameName;

    } catch (error) {
      logger.error('Error resolving game name, using fallback', {
        error,
        userInput
      });
      
      // Fallback to first available game or wordscramble
      const availableGames = GameRegistry.list();
      return availableGames.length > 0 ? availableGames[0].name : 'wordscramble';
    }
  }

  /**
   * Check if a user input contains game-related keywords
   */
  static containsGameKeywords(input: string): boolean {
    const gameKeywords = [
      'play', 'game', 'start', 'begin',
      'scramble', 'word', 'puzzle', 'challenge'
    ];
    
    const lowercaseInput = input.toLowerCase();
    return gameKeywords.some(keyword => lowercaseInput.includes(keyword));
  }
}