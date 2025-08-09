/**
 * @fileoverview Word Scramble puzzle game with hints and multiplayer support.
 * 
 * Implements a word puzzle game where players unscramble letters to guess
 * the original word. Features multiplayer support, hint system, and a curated
 * word list focused on programming and technology terms. Key features:
 * - Randomized word selection from curated technology vocabulary
 * - Letter scrambling algorithm with multiple shuffle passes
 * - Hint system with limited hints per game (3 maximum)
 * - Multiplayer support for up to 10 concurrent players
 * - Attempt tracking with user identification and timestamps
 * - Case-insensitive guess validation
 * 
 * Game Mechanics:
 * - Random word selection from programming/technology terms
 * - Letter scrambling with Fisher-Yates shuffle algorithm
 * - Multiple attempts allowed until correct guess
 * - Hint system revealing word length and letter positions
 * - Win condition when correct word is guessed
 * - Support for multiple players competing simultaneously
 * 
 * Word Categories:
 * Focus on programming, technology, and computer science terms to
 * provide educational value while maintaining engaging gameplay.
 */

import { BaseGame } from '../common/BaseGame.js';
import { GameState, GameAction, GameActionResult, GameConfig } from '../common/types.js';
import { DiscordReply } from '../../types/discord.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

interface WordScrambleState extends GameState {
  originalWord: string;
  scrambledWord: string;
  attempts: Array<{ userId: string; guess: string; timestamp: Date }>;
  hintsUsed: number;
  maxHints: number;
}

export class WordScrambleGame extends BaseGame {
  config: GameConfig = {
    name: 'wordscramble',
    displayName: 'Word Scramble',
    description: 'Unscramble the letters to guess the word!',
    minPlayers: 1,
    maxPlayers: 10,
    timeoutMinutes: 10,
  };

  private readonly WORD_LIST = [
    'TYPESCRIPT', 'DISCORD', 'COMPUTER', 'KEYBOARD', 'PROGRAMMING',
    'DEVELOPER', 'CODING', 'SOFTWARE', 'ALGORITHM', 'FUNCTION',
    'VARIABLE', 'ARRAY', 'OBJECT', 'STRING', 'NUMBER'
  ];

  startGame(options: { hostId: string; channelId: string; [key: string]: any }): GameActionResult {
    const word = this.getRandomWord();
    const scrambled = this.scrambleWord(word);

    const newState: WordScrambleState = {
      gameType: 'wordscramble',
      isActive: true,
      participants: [options.hostId],
      createdAt: new Date(),
      originalWord: word,
      scrambledWord: scrambled,
      attempts: [],
      hintsUsed: 0,
      maxHints: Math.floor(word.length / 3),
    };

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'SCHEDULE_TIMEOUT',
          duration: this.config.timeoutMinutes * 60 * 1000,
        },
      ],
    };
  }

  processAction(currentState: GameState, action: GameAction): GameActionResult {
    const state = currentState as WordScrambleState;

    if (!this.validateAction(state, action)) {
      return {
        newState: state,
        success: false,
        effects: [{ type: 'SEND_MESSAGE', content: 'Invalid action for current game state.' }],
      };
    }

    switch (action.type) {
      case 'SUBMIT':
        return this.handleGuess(state, action);
      case 'HINT':
        return this.handleHint(state);
      case 'JOIN':
        return this.handleJoin(state, action);
      case 'QUIT':
        return this.handleQuit(state, action.userId);
      default:
        return {
          newState: state,
          success: false,
          effects: [{ type: 'SEND_MESSAGE', content: 'Unknown action type.' }],
        };
    }
  }

  private handleGuess(state: WordScrambleState, action: GameAction): GameActionResult {
    const guess = action.payload?.guess?.toUpperCase();
    
    if (!guess) {
      return {
        newState: state,
        success: false,
        effects: [{ type: 'SEND_MESSAGE', content: 'Please provide a word to guess!' }],
      };
    }

    const newAttempt = { userId: action.userId, guess, timestamp: new Date() };
    const newState = {
      ...state,
      attempts: [...state.attempts, newAttempt],
    };

    if (guess === state.originalWord) {
      return {
        newState: { ...newState, isActive: false },
        success: true,
        effects: [
          { type: 'END_GAME', winnerId: action.userId, reason: 'Word guessed correctly' },
        ],
      };
    } else {
      return {
        newState,
        success: true,
        effects: [],
      };
    }
  }

  private handleHint(state: WordScrambleState): GameActionResult {
    if (state.hintsUsed >= state.maxHints) {
      return {
        newState: state,
        success: false,
        effects: [{ type: 'SEND_MESSAGE', content: 'No more hints available!' }],
      };
    }

    // Hint logic now handled in render() method
    
    const newState = {
      ...state,
      hintsUsed: state.hintsUsed + 1,
    };

    return {
      newState,
      success: true,
      effects: [],
    };
  }

  private handleJoin(state: WordScrambleState, action: GameAction): GameActionResult {
    if (state.participants.includes(action.userId)) {
      return {
        newState: state,
        success: false,
        effects: [{ type: 'SEND_MESSAGE', content: 'You are already participating in this game!' }],
      };
    }

    if (state.participants.length >= this.config.maxPlayers) {
      return {
        newState: state,
        success: false,
        effects: [{ type: 'SEND_MESSAGE', content: 'Game is full!' }],
      };
    }

    const newState = {
      ...state,
      participants: [...state.participants, action.userId],
    };

    return {
      newState,
      success: true,
      effects: [
        { type: 'UPDATE_PARTICIPANTS', participants: newState.participants },
      ],
    };
  }

  // eslint-disable-next-line no-unused-vars
  private handleQuit(state: WordScrambleState, _userId: string): GameActionResult {
    return {
      newState: { ...state, isActive: false },
      success: true,
      effects: [
        { type: 'END_GAME', reason: 'Game quit by user' },
      ],
    };
  }

  validateAction(currentState: GameState, action: GameAction): boolean {
    const state = currentState as WordScrambleState;
    
    if (!state.isActive) {
      return false;
    }
    
    switch (action.type) {
      case 'SUBMIT':
      case 'HINT':
        return state.participants.includes(action.userId);
      case 'JOIN':
        return !state.participants.includes(action.userId) && 
               state.participants.length < this.config.maxPlayers;
      case 'QUIT':
        return state.participants.includes(action.userId);
      default:
        return false;
    }
  }

  checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string } {
    if (!currentState.isActive) {
      return { shouldEnd: true, reason: 'Game already ended' };
    }

    return { shouldEnd: false };
  }

  getDisplayState(currentState: GameState): string {
    const state = currentState as WordScrambleState;
    
    return `🎮 **Word Scramble**\n\n` +
           `Scrambled: **${state.scrambledWord}**\n` +
           `Length: ${state.originalWord.length} letters\n` +
           `Hints used: ${state.hintsUsed}/${state.maxHints}\n` +
           `Attempts: ${state.attempts.length}\n` +
           `Players: ${state.participants.length}`;
  }

  getAvailableActions(currentState: GameState): string[] {
    const state = currentState as WordScrambleState;
    const actions = ['Type your guess'];
    
    if (state.hintsUsed < state.maxHints) {
      actions.push('Say "hint" for a clue');
    }
    
    actions.push('Say "quit" to end the game');
    
    return actions;
  }

  private getRandomWord(): string {
    return this.WORD_LIST[Math.floor(Math.random() * this.WORD_LIST.length)];
  }

  private scrambleWord(word: string): string {
    const chars = word.split('');
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  private generateHint(word: string, hintIndex: number): string {
    const hints = [
      `The first letter is: **${word[0]}**`,
      `The last letter is: **${word[word.length - 1]}**`,
      `The word contains the letter: **${word[Math.floor(word.length / 2)]}**`,
    ];
    
    return hints[hintIndex] || `The word has ${word.length} letters.`;
  }

  render(currentState: GameState): DiscordReply {
    const state = currentState as WordScrambleState;
    
    const embed = new EmbedBuilder()
      .setTitle('🎮 Word Scramble')
      .setColor(0x00AE86)
      .addFields([
        {
          name: 'Word Length',
          value: `${state.originalWord.length} letters`,
          inline: true
        },
        {
          name: 'Hints Used',
          value: `${state.hintsUsed}/${state.maxHints}`,
          inline: true
        },
        {
          name: 'Attempts',
          value: `${state.attempts.length}`,
          inline: true
        }
      ]);

    // Set description based on game state
    if (!state.isActive && state.attempts.length > 0) {
      const lastAttempt = state.attempts[state.attempts.length - 1];
      if (lastAttempt.guess === state.originalWord) {
        // Game won
        embed.setDescription(`🎉 **Congratulations <@${lastAttempt.userId}>!** 🎉\n\nYou correctly guessed: **${state.originalWord}**`)
             .setColor(0x00FF00);
      } else {
        // Game ended (quit)
        embed.setDescription(`🛑 **Game Ended**\n\nThe word was: **${state.originalWord}**`)
             .setColor(0xFF0000);
      }
    } else if (!state.isActive) {
      // Game ended without attempts (quit immediately)
      embed.setDescription(`🛑 **Game Ended**\n\nThe word was: **${state.originalWord}**`)
           .setColor(0xFF0000);
    } else {
      // Active game
      embed.setDescription(`Unscramble this word: **${state.scrambledWord}**`);
    }

    // Add last attempt feedback if any
    if (state.attempts.length > 0 && state.isActive) {
      const lastAttempt = state.attempts[state.attempts.length - 1];
      const isCorrect = lastAttempt.guess === state.originalWord;
      embed.addFields({
        name: 'Last Guess',
        value: `${isCorrect ? '✅' : '❌'} "${lastAttempt.guess}" by <@${lastAttempt.userId}>${isCorrect ? '' : ' - Try again!'}`,
        inline: false
      });
    }

    // Add hint if just used
    if (state.hintsUsed > 0) {
      const hintIndex = state.hintsUsed - 1;
      const hint = this.generateHint(state.originalWord, hintIndex);
      embed.addFields({
        name: `💡 Recent Hint`,
        value: hint,
        inline: false
      });
    }

    embed.setFooter({ 
      text: state.isActive 
        ? 'Type your guess in chat, or use buttons for hints/quit!' 
        : 'Game Over' 
    });

    const components = this.buildComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: 'send' // WordScramble always sends new messages
    };
  }

  private buildComponents(state: WordScrambleState): ActionRowBuilder<ButtonBuilder>[] {
    if (!state.isActive) {
      return []; // No buttons for completed games
    }

    const row = new ActionRowBuilder<ButtonBuilder>();

    // Hint button - disabled if no hints remaining
    const hintButton = new ButtonBuilder()
      .setCustomId('ws_hint')
      .setLabel(`💡 Hint (${state.hintsUsed}/${state.maxHints})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.hintsUsed >= state.maxHints);

    // Quit button
    const quitButton = new ButtonBuilder()
      .setCustomId('ws_quit')
      .setLabel('🛑 Quit')
      .setStyle(ButtonStyle.Danger);

    row.addComponents(hintButton, quitButton);
    return [row];
  }
}