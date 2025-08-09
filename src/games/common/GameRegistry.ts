/**
 * @fileoverview Centralized game registration and discovery system for Discord bot games.
 * 
 * Provides a registry pattern for managing all available games in the bot,
 * enabling dynamic game discovery, instantiation, and management. Key features:
 * - Automatic game registration during module initialization
 * - Dynamic game instantiation by name with error handling
 * - Game discovery and listing for Discord slash command choices
 * - Type-safe game creation with BaseGame interface enforcement
 * 
 * Registered Games:
 * - wordscramble: Word puzzle game with scrambled word challenges
 * - tictactoe: Classic tic-tac-toe with AI opponent
 * - aiuprising: Complex RPG with AI-generated content and storylines
 * - geoguesser: Geographic guessing game with AI-powered location validation
 * - hangman: Word guessing game with visual hangman progression
 * 
 * The registry automatically registers games on module load and provides
 * the foundation for the /game slash command's game type choices and
 * GameManager's dynamic game instantiation system.
 */

import { BaseGame } from './BaseGame.js';
import { WordScrambleGame } from '../word-scramble/WordScrambleGame.js';
import { TicTacToeGame } from '../tic-tac-toe/TicTacToeGame.js';
import { AIUprisingGame } from '../ai-uprising/AIUprisingGame.js';
import { GeoGuesserGame } from '../geo-guesser/GeoGuesserGame.js';
import { HangmanGame } from '../hangman/HangmanGame.js';
import { BlackjackGame } from '../blackjack/BlackjackGame.js';
import { logger } from '../../utils/logger.js';

export class GameRegistry {
  private static games = new Map<string, new () => BaseGame>();

  static {
    this.register('wordscramble', WordScrambleGame);
    this.register('tictactoe', TicTacToeGame);
    this.register('aiuprising', AIUprisingGame);
    this.register('geoguesser', GeoGuesserGame);
    this.register('hangman', HangmanGame);
    this.register('blackjack', BlackjackGame);
  }

  static register(name: string, gameClass: new () => BaseGame): void {
    this.games.set(name.toLowerCase(), gameClass);
    logger.info(`Registered game: ${name}`);
  }

  static create(name: string): BaseGame | null {
    const GameClass = this.games.get(name.toLowerCase());
    if (!GameClass) {
      logger.warn(`Unknown game type: ${name}`);
      return null;
    }
    
    return new GameClass();
  }

  static list(): Array<{ name: string; displayName: string; description: string }> {
    const games: Array<{ name: string; displayName: string; description: string }> = [];
    
    for (const [, GameClass] of this.games) {
      const instance = new GameClass();
      games.push({
        name: instance.config.name,
        displayName: instance.config.displayName,
        description: instance.config.description,
      });
    }
    
    return games;
  }

  static exists(name: string): boolean {
    return this.games.has(name.toLowerCase());
  }

  static getGameInstance(name: string): BaseGame | null {
    return this.create(name);
  }
}