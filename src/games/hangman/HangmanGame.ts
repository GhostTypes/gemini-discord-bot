/**
 * @fileoverview Hangman game implementation with AI-powered word generation.
 * 
 * Features a complete Hangman game with visual hangman progression, hint system,
 * and intelligent AI word generation. Supports multiple categories and difficulty
 * levels with rich Discord integration including embeds and interactive buttons.
 * 
 * Game Mechanics:
 * - AI-generated words with fallback word lists
 * - Visual hangman progression (0-6 stages)
 * - Letter guessing with duplicate detection
 * - Progressive hint system (2-3 hints per game)
 * - Category and difficulty selection
 * - Win/loss condition detection
 * 
 * Discord Integration:
 * - Rich embed displays with hangman visualization
 * - Text input for letter guessing
 * - Interactive buttons for hints and game controls
 * - Real-time game state updates
 */

import { BaseGame } from '../common/BaseGame.js';
import { GameState, GameAction, GameActionResult, GameConfig } from '../common/types.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { FALLBACK_WORDS } from './flows/hangmanWordFlow.js';

interface HangmanState extends GameState {
  // Core game data
  word: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  
  // Player progress - using arrays for better serialization
  guessedLetters: string[];
  correctLetters: string[];
  incorrectLetters: string[];
  
  // Game state
  gamePhase: 'PLAYING' | 'GAME_OVER';
  remainingGuesses: number;
  maxGuesses: number;
  winner: 'PLAYER' | 'AI' | null;
  
  // UI state
  displayWord: string;
  hangmanStage: number;
  
  // Hint system
  hintsUsed: number;
  maxHints: number;
  currentHint: string | null;
  availableHints: string[];
  
  // Metadata
  startTime: Date;
  wordLength: number;
  completedLetterCount: number;
  totalUniqueLetters: number;
}

const HANGMAN_STAGES = [
  // Stage 0 - Empty gallows
  `   -----
   |   |
   |    
   |    
   |    
   |    
-------`,
  
  // Stage 1 - Head
  `   -----
   |   |
   |   O
   |    
   |    
   |    
-------`,
  
  // Stage 2 - Body  
  `   -----
   |   |
   |   O
   |   |
   |    
   |    
-------`,
  
  // Stage 3 - Left arm
  `   -----
   |   |
   |   O
   |  /|
   |    
   |    
-------`,
  
  // Stage 4 - Right arm
  `   -----
   |   |
   |   O
   |  /|\\
   |    
   |    
-------`,
  
  // Stage 5 - Left leg
  `   -----
   |   |
   |   O
   |  /|\\
   |  / 
   |    
-------`,
  
  // Stage 6 - Right leg (Game Over)
  `   -----
   |   |
   |   O
   |  /|\\
   |  / \\
   |    
-------`
];

export class HangmanGame extends BaseGame {
  config: GameConfig = {
    name: 'hangman',
    displayName: 'Hangman',
    description: 'Guess the word letter by letter before the hangman is completed!',
    minPlayers: 1,
    maxPlayers: 1,
    timeoutMinutes: 15,
  };

  startGame(options: { 
    hostId: string; 
    channelId: string; 
    difficulty?: string;
    category?: string;
  }): GameActionResult {
    const difficulty = (options.difficulty as 'EASY' | 'MEDIUM' | 'HARD') || 'MEDIUM';
    const category = (options.category as 'ANIMALS' | 'MOVIES' | 'COUNTRIES' | 'FOOD' | 'SPORTS' | 'TECHNOLOGY' | 'RANDOM') || 'RANDOM';

    // Use fallback word to start immediately
    const categoryWords = FALLBACK_WORDS.MEDIUM?.[category] || FALLBACK_WORDS.EASY.RANDOM;
    const fallbackWordData = categoryWords[Math.floor(Math.random() * categoryWords.length)];
    
    const word = fallbackWordData.word;
    const uniqueLetters = new Set(word.split(''));
    
    const newState: HangmanState = {
      gameType: 'hangman',
      isActive: true,
      participants: [options.hostId],
      createdAt: new Date(),
      
      // Core game data
      word: word,
      category: category,
      difficulty: difficulty,
      
      // Player progress
      guessedLetters: [],
      correctLetters: [],
      incorrectLetters: [],
      
      // Game state
      gamePhase: 'PLAYING',
      remainingGuesses: 6,
      maxGuesses: 6,
      winner: null,
      
      // UI state
      displayWord: this.generateDisplayWord(word, []),
      hangmanStage: 0,
      
      // Hint system
      hintsUsed: 0,
      maxHints: 3,
      currentHint: null,
      availableHints: [fallbackWordData.hint, ...fallbackWordData.alternativeHints],
      
      // Metadata
      startTime: new Date(),
      wordLength: word.length,
      completedLetterCount: 0,
      totalUniqueLetters: uniqueLetters.size,
    };

    return {
      newState,
      success: true,
      effects: [],
    };
  }

  processAction(currentState: GameState, action: GameAction): GameActionResult {
    const state = this.ensureArrays(currentState as HangmanState);

    if (!this.validateAction(currentState, action)) {
      return {
        newState: currentState,
        success: false,
        effects: [],
        message: 'Invalid action',
      };
    }

    switch (action.type) {
      case 'GUESS_LETTER':
        return this.handleGuessLetter(state, action);
      
      case 'HINT':
        return this.handleHint(state);
      
      case 'NEW_GAME':
        return this.handleNewGame(state, action);
      
      case 'CATEGORY':
        return this.handleCategoryChange(state, action);
      
      case 'DIFFICULTY':
        return this.handleDifficultyChange(state, action);
      
      case 'QUIT':
        return this.handleQuit(state);
      
      default:
        return {
          newState: currentState,
          success: false,
          effects: [],
          message: 'Unknown action type',
        };
    }
  }

  private handleGuessLetter(state: HangmanState, action: GameAction): GameActionResult {
    const letter = action.payload?.letter?.toUpperCase();
    
    if (!letter || letter.length !== 1 || !/^[A-Z]$/.test(letter)) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Please provide a valid letter (A-Z)',
      };
    }

    if (state.guessedLetters.includes(letter)) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: `You already guessed "${letter}". Try a different letter!`,
      };
    }

    const newGuessedLetters = [...state.guessedLetters, letter];
    const isCorrect = state.word.includes(letter);
    
    const newCorrectLetters = isCorrect ? 
      [...state.correctLetters, letter] : 
      state.correctLetters;
    const newIncorrectLetters = isCorrect ? 
      state.incorrectLetters :
      [...state.incorrectLetters, letter];
    const newRemainingGuesses = isCorrect ? state.remainingGuesses : state.remainingGuesses - 1;
    const newHangmanStage = isCorrect ? state.hangmanStage : state.hangmanStage + 1;

    const newDisplayWord = this.generateDisplayWord(state.word, newCorrectLetters);
    const completedLetterCount = newCorrectLetters.length;

    

    const newState: HangmanState = {
      ...state,
      guessedLetters: newGuessedLetters,
      correctLetters: newCorrectLetters,
      incorrectLetters: newIncorrectLetters,
      remainingGuesses: newRemainingGuesses,
      hangmanStage: newHangmanStage,
      displayWord: newDisplayWord,
      completedLetterCount,
    };

    // Check for game end conditions
    const endResult = this.checkEndConditions(newState);
    if (endResult.shouldEnd) {
      return this.handleGameEnd(newState, endResult);
    }

    const embedContent = JSON.stringify(this.getEmbedDisplay(newState));

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'SEND_MESSAGE',
          content: `__HANGMAN_EMBED__${embedContent}`,
          isEmbed: true,
        }
      ],
    };
  }

  private handleHint(state: HangmanState): GameActionResult {
    if (state.hintsUsed >= state.maxHints) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'No more hints available!',
      };
    }

    const newState: HangmanState = {
      ...state,
      hintsUsed: state.hintsUsed + 1,
      currentHint: state.availableHints[state.hintsUsed] || 'No more specific hints available.',
    };

    const embedContent = JSON.stringify(this.getEmbedDisplay(newState));

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'SEND_MESSAGE',
          content: `__HANGMAN_EMBED__${embedContent}`,
          isEmbed: true,
        }
      ],
    };
  }

  private handleNewGame(state: HangmanState, action: GameAction): GameActionResult {
    // Start a new game with the same settings
    return this.startGame({
      hostId: action.userId,
      channelId: '', // This will be provided by the caller
      difficulty: state.difficulty,
      category: state.category,
    }) as GameActionResult;
  }

  private handleCategoryChange(state: HangmanState, action: GameAction): GameActionResult {
    if (state.guessedLetters.length > 0) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Cannot change category after making guesses',
      };
    }

    // This would require restarting the game with new category
    return this.startGame({
      hostId: state.participants[0],
      channelId: '',
      difficulty: state.difficulty,
      category: action.payload?.category || state.category,
    }) as GameActionResult;
  }

  private handleDifficultyChange(state: HangmanState, action: GameAction): GameActionResult {
    if (state.guessedLetters.length > 0) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Cannot change difficulty after making guesses',
      };
    }

    // This would require restarting the game with new difficulty
    return this.startGame({
      hostId: state.participants[0],
      channelId: '',
      difficulty: action.payload?.difficulty || state.difficulty,
      category: state.category,
    }) as GameActionResult;
  }

  private handleQuit(state: HangmanState): GameActionResult {
    const newState: HangmanState = {
      ...state,
      gamePhase: 'GAME_OVER',
      isActive: false,
    };

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'END_GAME',
          reason: `Player quit. The word was "${state.word}"`,
        }
      ],
    };
  }

  private handleGameEnd(state: HangmanState, endResult: { shouldEnd: boolean; winnerId?: string; reason?: string }): GameActionResult {
    const isWin = state.displayWord.replace(/\s/g, '') === state.word;
    
    const newState: HangmanState = {
      ...state,
      gamePhase: 'GAME_OVER',
      isActive: false,
      winner: isWin ? 'PLAYER' : 'AI',
    };

    const embedContent = JSON.stringify(this.getEmbedDisplay(newState));

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'SEND_MESSAGE',
          content: `__HANGMAN_EMBED__${embedContent}`,
          isEmbed: true,
        },
        {
          type: 'END_GAME',
          ...(endResult.winnerId && { winnerId: endResult.winnerId }),
          reason: endResult.reason || 'Game ended',
        }
      ],
    };
  }

  validateAction(currentState: GameState, action: GameAction): boolean {
    const state = this.ensureArrays(currentState as HangmanState);
    
    if (!state.isActive || state.gamePhase === 'GAME_OVER') {
      return action.type === 'NEW_GAME' || action.type === 'QUIT';
    }
    
    switch (action.type) {
      case 'GUESS_LETTER': {
        const letter = action.payload?.letter?.toUpperCase();
        return (
          letter &&
          letter.length === 1 &&
          /^[A-Z]$/.test(letter) &&
          !state.guessedLetters.includes(letter)
        );
      }
        
      case 'HINT':
        return state.hintsUsed < state.maxHints;
        
      case 'DIFFICULTY':
      case 'CATEGORY':
        return state.guessedLetters.length === 0;
        
      case 'QUIT':
      case 'NEW_GAME':
        return true;
        
      default:
        return false;
    }
  }

  checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string } {
    const state = this.ensureArrays(currentState as HangmanState);
    
    // Player wins by guessing all letters
    if (state.displayWord.replace(/\s/g, '') === state.word) {
      return {
        shouldEnd: true,
        winnerId: state.participants[0],
        reason: 'Word completely guessed!',
      };
    }
    
    // AI wins by completing hangman (no guesses left)
    if (state.remainingGuesses <= 0) {
      return {
        shouldEnd: true,
        reason: 'Hangman completed - no guesses remaining!',
      };
    }
    
    return { shouldEnd: false };
  }

  private generateDisplayWord(word: string, correctLetters: string[]): string {
    return word
      .split('')
      .map(letter => correctLetters.includes(letter) ? letter : '_')
      .join(' ');
  }

  getEmbedDisplay(currentState: GameState): { embeds: any[], components: any[] } {
    const state = this.ensureArrays(currentState as HangmanState);
    
    const embed = new EmbedBuilder()
      .setTitle('🎪 Hangman')
      .setDescription(`**Category:** ${state.category}\n**Difficulty:** ${state.difficulty}`)
      .setColor(state.gamePhase === 'GAME_OVER' 
        ? (state.winner === 'PLAYER' ? 0x00FF00 : 0xFF0000)
        : 0x00AE86)
      .addFields(
        {
          name: '🎯 Word',
          value: `\`\`\`${state.displayWord}\`\`\``,
          inline: false
        },
        {
          name: '🎨 Hangman',
          value: `\`\`\`${HANGMAN_STAGES[state.hangmanStage]}\`\`\``,
          inline: false
        },
        {
          name: '✅ Correct Letters',
          value: state.correctLetters.length > 0 
            ? state.correctLetters.sort().join(', ')
            : 'None yet',
          inline: true
        },
        {
          name: '❌ Wrong Letters', 
          value: state.incorrectLetters.length > 0
            ? state.incorrectLetters.sort().join(', ')
            : 'None yet',
          inline: true
        },
        {
          name: '💔 Lives Left',
          value: `${state.remainingGuesses}/${state.maxGuesses}`,
          inline: true
        }
      );

    if (state.currentHint) {
      embed.addFields({
        name: '💡 Hint',
        value: state.currentHint,
        inline: false
      });
    }

    if (state.gamePhase === 'GAME_OVER') {
      const message = state.winner === 'PLAYER' 
        ? `🎉 Congratulations! You guessed "${state.word}"!`
        : `💀 Game Over! The word was "${state.word}"`;
      embed.addFields({
        name: 'Result',
        value: message,
        inline: false
      });
    } else {
      embed.setFooter({ 
        text: 'Type a letter to guess, or use the buttons below!' 
      });
    }

    const components = this.buildComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components.map(row => row.toJSON())
    };
  }

  private buildComponents(state: HangmanState): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const fixedState = this.ensureArrays(state);
    
    // Row 1: Game control buttons
    const controlRow = new ActionRowBuilder<ButtonBuilder>();
    
    controlRow.addComponents(
      new ButtonBuilder()
        .setCustomId('hangman_hint')
        .setLabel(`💡 Hint (${fixedState.hintsUsed}/${fixedState.maxHints})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(
          fixedState.hintsUsed >= fixedState.maxHints || 
          fixedState.gamePhase === 'GAME_OVER'
        )
    );
    
    // Only show difficulty/category buttons if no letters have been guessed
    if (fixedState.guessedLetters.length === 0) {
      controlRow.addComponents(
        new ButtonBuilder()
          .setCustomId('hangman_difficulty')
          .setLabel(`Difficulty: ${fixedState.difficulty}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId('hangman_category')
          .setLabel(`Category: ${fixedState.category}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false)
      );
    }
    
    rows.push(controlRow);
    
    // Row 2: Action buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    
    if (fixedState.gamePhase === 'GAME_OVER') {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('hangman_new_game')
          .setLabel('🎮 New Game')
          .setStyle(ButtonStyle.Success)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId('hangman_quit')
          .setLabel('❌ Quit')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false)
      );
    } else {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('hangman_quit')
          .setLabel('❌ Quit Game')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false)
      );
    }
    
    rows.push(actionRow);
    return rows;
  }

  getDisplayState(currentState: GameState): string {
    const state = this.ensureArrays(currentState as HangmanState);
    
    let display = `🎪 **Hangman**\n\n`;
    display += `**Category:** ${state.category}\n`;
    display += `**Difficulty:** ${state.difficulty}\n`;
    display += `**Word:** ${state.displayWord}\n`;
    display += `**Lives:** ${state.remainingGuesses}/${state.maxGuesses}\n\n`;
    
    display += `**Hangman:**\n\`\`\`\n${HANGMAN_STAGES[state.hangmanStage]}\n\`\`\`\n`;
    
    if (state.correctLetters.length > 0) {
      display += `**Correct:** ${state.correctLetters.sort().join(', ')}\n`;
    }
    
    if (state.incorrectLetters.length > 0) {
      display += `**Wrong:** ${state.incorrectLetters.sort().join(', ')}\n`;
    }
    
    if (state.currentHint) {
      display += `**Hint:** ${state.currentHint}\n`;
    }
    
    if (state.gamePhase === 'GAME_OVER') {
      display += state.winner === 'PLAYER' 
        ? `\n🎉 **You won!** The word was "${state.word}"`
        : `\n💀 **Game Over!** The word was "${state.word}"`;
    }
    
    return display;
  }

  getAvailableActions(currentState: GameState): string[] {
    const state = this.ensureArrays(currentState as HangmanState);
    
    if (!state.isActive || state.gamePhase === 'GAME_OVER') {
      return ['NEW_GAME', 'QUIT'];
    }

    const actions = ['QUIT'];
    
    if (state.hintsUsed < state.maxHints) {
      actions.push('HINT');
    }
    
    if (state.guessedLetters.length === 0) {
      actions.push('DIFFICULTY', 'CATEGORY');
    }
    
    // Add letter guessing actions
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      if (!state.guessedLetters.includes(letter)) {
        actions.push(`GUESS_LETTER:${letter}`);
      }
    }
    
    return actions;
  }

  render(currentState: GameState): any {
    const embedDisplay = this.getEmbedDisplay(currentState);
    
    return {
      embeds: embedDisplay.embeds,
      components: embedDisplay.components,
      strategy: 'edit' as const,
    };
  }

  // Helper method to ensure arrays are properly handled after serialization/deserialization
  private ensureArrays(state: HangmanState): HangmanState {
    return {
      ...state,
      guessedLetters: Array.isArray(state.guessedLetters) ? state.guessedLetters : [],
      correctLetters: Array.isArray(state.correctLetters) ? state.correctLetters : [],
      incorrectLetters: Array.isArray(state.incorrectLetters) ? state.incorrectLetters : [],
    };
  }
}