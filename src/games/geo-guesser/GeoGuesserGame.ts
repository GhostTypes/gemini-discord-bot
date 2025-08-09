/**
 * @fileoverview GeoGuesser game implementation with AI-powered location guessing.
 * 
 * Implements a comprehensive geographical guessing game with intelligent AI validation
 * and rich Discord integration. Features multiple difficulty levels, scoring systems,
 * hint mechanisms, and comprehensive location databases. Key features:
 * - AI-powered guess validation with partial credit scoring
 * - Multiple difficulty levels with location filtering
 * - Interactive Discord embeds with location images
 * - Hint system with point penalties
 * - Multi-round gameplay with cumulative scoring
 * - Comprehensive error handling and fallback systems
 * 
 * Game Mechanics:
 * - Random location selection based on difficulty
 * - Time limits per round with countdown display
 * - Hint system: country hints, region hints, climate hints
 * - Scoring based on accuracy, speed, and hint usage
 * - Multi-round progression with increasing difficulty
 * 
 * Discord Integration:
 * - Rich embed displays with location images
 * - Interactive button grid for game actions
 * - Real-time score updates and round progression
 * - Comprehensive result displays with maps and statistics
 */

import { BaseGame } from '../common/BaseGame.js';
import { DiscordReply } from '../../types/discord.js';
import { GameState, GameAction, GameActionResult, GameConfig } from '../common/types.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { LocationAPIService, LocationData } from './services/LocationAPIService.js';
import { geoGuesserValidationFlow } from './flows/geoGuesserValidationFlow.js';
import { createLocationImageAttachment } from './utils/imageUtils.js';
import { logger } from '../../utils/logger.js';

interface GeoGuesserState extends GameState {
  gamePhase: 'LOADING' | 'GUESSING' | 'REVEALING' | 'ROUND_END' | 'GAME_OVER';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  round: number;
  maxRounds: number;
  score: number;
  totalPossibleScore: number;

  currentLocation: LocationData | null;
  roundStartTime: Date | null;
  timeLimit: number;
  timeRemaining: number;

  guessHistory: Array<{
    round: number;
    guess: string;
    correct: boolean;
    accuracy: number;
    points: number;
    timeSpent: number;
    distance?: number;
    matchType: string;
    reasoning?: string;
  }>;

  currentGuess: {
    text: string;
    submittedAt?: Date;
    reasoning?: string;
  } | null;

  hints: {
    used: number;
    available: number;
    hintsRevealed: string[];
    hintPenalty: number;
  };

  settings: {
    showCountryHints: boolean;
    allowMultipleGuesses: boolean;
    strictMatching: boolean;
    showImages: boolean;
  };

  lastApiCall: Date | null;
  apiFailures: number;
  isLoadingLocation: boolean;
}

export class GeoGuesserGame extends BaseGame {
  private locationService: LocationAPIService;

  config: GameConfig = {
    name: 'geoguesser',
    displayName: 'GeoGuesser',
    description: 'Guess the location from images and clues! Test your geographical knowledge.',
    minPlayers: 1,
    maxPlayers: 1,
    timeoutMinutes: 15,
  };

  constructor() {
    super();
    this.locationService = new LocationAPIService();
  }

  startGame(options: { hostId: string; channelId: string; difficulty?: string; rounds?: number }): GameActionResult {
    const difficulty = (options.difficulty as 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT') || 'MEDIUM';
    const maxRounds = options.rounds || 5;

    const newState: GeoGuesserState = {
      gameType: 'geoguesser',
      isActive: true,
      participants: [options.hostId],
      createdAt: new Date(),
      gamePhase: 'LOADING',
      difficulty,
      round: 1,
      maxRounds,
      score: 0,
      totalPossibleScore: 0,
      currentLocation: null,
      roundStartTime: null,
      timeLimit: this.getTimeLimitForDifficulty(difficulty),
      timeRemaining: 0,
      guessHistory: [],
      currentGuess: null,
      hints: {
        used: 0,
        available: this.getHintsForDifficulty(difficulty),
        hintsRevealed: [],
        hintPenalty: 10
      },
      settings: {
        showCountryHints: true,
        allowMultipleGuesses: false,
        strictMatching: false,
        showImages: true
      },
      lastApiCall: null,
      apiFailures: 0,
      isLoadingLocation: true
    };

    return {
      newState,
      success: true,
      effects: [], // Don't schedule location loading yet - wait for difficulty selection
    };
  }

  processAction(currentState: GameState, action: GameAction): GameActionResult | Promise<GameActionResult> {
    const state = currentState as GeoGuesserState;

    if (!this.validateAction(currentState, action)) {
      return {
        newState: currentState,
        success: false,
        effects: [],
        message: 'Invalid action',
      };
    }

    switch (action.type) {
      case 'GUESS':
        return this.handleGuess(state, action);
      
      case 'HINT':
        return this.handleHint(state, action);
      
      case 'NEXT_ROUND':
        return this.handleNextRound(state);
      
      case 'SKIP':
        return this.handleSkip(state);
      
      case 'QUIT':
        return this.handleQuit(state);
      
      case 'DIFFICULTY':
        return this.handleDifficultyChange(state, action);
      
      default:
        return {
          newState: currentState,
          success: false,
          effects: [],
          message: 'Unknown action type',
        };
    }
  }

  private async handleGuess(state: GeoGuesserState, action: GameAction): Promise<GameActionResult> {
    if (!state.currentLocation || state.gamePhase !== 'GUESSING') {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'No active round to guess on',
      };
    }

    // Check guess limit (3 guesses per round)
    const currentRoundGuesses = state.guessHistory.filter(g => g.round === state.round);
    if (currentRoundGuesses.length >= 3) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'You have already used all 3 guesses for this round!',
      };
    }

    const guess = action.payload?.guess;
    if (!guess || typeof guess !== 'string') {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Invalid guess format',
      };
    }

    const timeSpent = state.roundStartTime 
      ? Math.round((Date.now() - new Date(state.roundStartTime).getTime()) / 1000)
      : 0;

    try {
      // Use AI to validate the guess
      const validation = await geoGuesserValidationFlow({
        userGuess: guess,
        correctLocation: {
          city: state.currentLocation!.city,
          state: state.currentLocation!.state,
          country: state.currentLocation!.country,
          countryCode: state.currentLocation!.countryCode,
          latitude: state.currentLocation!.latitude,
          longitude: state.currentLocation!.longitude,
        },
        difficulty: state.difficulty,
        allowPartialCredit: true,
      });

      // Calculate final points with time and hint bonuses/penalties
      let finalPoints = validation.partialCreditPoints;
      
      // Only add bonuses/penalties if the guess earned some points
      if (finalPoints > 0) {
        // Time bonus (faster = more points)
        const timeBonus = Math.max(0, state.timeLimit - timeSpent) * 2;
        finalPoints += timeBonus;
        
        // Hint penalty
        const hintPenalty = state.hints.used * state.hints.hintPenalty;
        finalPoints = Math.max(0, finalPoints - hintPenalty);
      }

      // Update guess history
      const guessResult = {
        round: state.round,
        guess,
        correct: validation.isCorrect,
        accuracy: validation.accuracy,
        points: Math.round(finalPoints),
        timeSpent,
        ...(validation.distance !== undefined && { distance: validation.distance }),
        matchType: validation.matchType,
        reasoning: validation.reasoning,
      };

      // Check if this round should end
      const updatedRoundGuesses = [...state.guessHistory, guessResult].filter(g => g.round === state.round);
      const isRoundComplete = validation.isCorrect || updatedRoundGuesses.length >= 3;
      
      const newState: GeoGuesserState = {
        ...state,
        gamePhase: isRoundComplete ? 'REVEALING' : 'GUESSING', // Use REVEALING phase for correct results
        score: state.score + Math.round(finalPoints),
        guessHistory: [...state.guessHistory, guessResult],
        currentGuess: {
          text: guess,
          submittedAt: new Date(),
          reasoning: validation.reasoning,
        },
      };
      
      // No effects for incomplete rounds or revealing phase - let user see results
      return {
        newState,
        success: true,
        effects: [],
      };

    } catch (error) {
      logger.error('GeoGuesser: Error validating guess:', error);
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Failed to validate guess. Please try again.',
      };
    }
  }

  private handleHint(state: GeoGuesserState, action: GameAction): GameActionResult {
    if (state.hints.used >= state.hints.available) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'No hints remaining!',
      };
    }

    if (!state.currentLocation) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'No active location for hints',
      };
    }

    const hintType = action.payload?.hintType || 'COUNTRY';
    const newHint = this.generateHint(state.currentLocation, hintType, state.hints.used);

    const newState: GeoGuesserState = {
      ...state,
      hints: {
        ...state.hints,
        used: state.hints.used + 1,
        hintsRevealed: [...state.hints.hintsRevealed, newHint],
      },
    };

    return {
      newState,
      success: true,
      effects: [],
    };
  }

  private handleNextRound(state: GeoGuesserState): GameActionResult {
    if (state.round >= state.maxRounds) {
      return this.handleGameEnd(state);
    }

    const newState: GeoGuesserState = {
      ...state,
      gamePhase: 'LOADING',
      round: state.round + 1,
      currentLocation: null,
      roundStartTime: null,
      timeRemaining: 0,
      currentGuess: null,
      hints: {
        used: 0,
        available: this.getHintsForDifficulty(state.difficulty),
        hintsRevealed: [],
        hintPenalty: 10
      },
      isLoadingLocation: true,
    };

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'SCHEDULE_AI_MOVE',
          delay: 1000,
        }
      ],
    };
  }


  private handleSkip(state: GeoGuesserState): GameActionResult {
    if (!state.currentLocation) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'No active round to skip',
      };
    }

    const skippedResult = {
      round: state.round,
      guess: '(skipped)',
      correct: false,
      accuracy: 0,
      points: 0,
      timeSpent: 0,
      matchType: 'NONE',
    };

    const newState: GeoGuesserState = {
      ...state,
      gamePhase: 'REVEALING',
      guessHistory: [...state.guessHistory, skippedResult],
    };

    return {
      newState,
      success: true,
      effects: [],
    };
  }

  private handleDifficultyChange(state: GeoGuesserState, action: GameAction): GameActionResult {
    if (state.round > 1) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Cannot change difficulty after starting the game',
      };
    }

    const difficulty = action.payload?.difficulty;
    if (!['EASY', 'MEDIUM', 'HARD', 'EXPERT'].includes(difficulty)) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Invalid difficulty level',
      };
    }

    const newState: GeoGuesserState = {
      ...state,
      difficulty,
      timeLimit: this.getTimeLimitForDifficulty(difficulty),
      hints: {
        ...state.hints,
        available: this.getHintsForDifficulty(difficulty),
      },
    };

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'SCHEDULE_AI_MOVE', // Now trigger location loading after difficulty selection
          delay: 1000,
        }
      ],
    };
  }

  private handleQuit(state: GeoGuesserState): GameActionResult {
    const newState: GeoGuesserState = {
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
          reason: 'Player quit the game',
        }
      ],
    };
  }

  private handleGameEnd(state: GeoGuesserState): GameActionResult {
    const newState: GeoGuesserState = {
      ...state,
      gamePhase: 'GAME_OVER',
      isActive: false,
    };

    const totalPossiblePoints = state.maxRounds * 100;
    const scorePercentage = Math.round((state.score / totalPossiblePoints) * 100);

    let rank = 'Novice Explorer';
    if (scorePercentage >= 90) {rank = 'Master Geographer';}
    else if (scorePercentage >= 75) {rank = 'Expert Navigator';}
    else if (scorePercentage >= 60) {rank = 'Skilled Traveler';}
    else if (scorePercentage >= 40) {rank = 'Curious Wanderer';}

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'END_GAME',
          reason: `Game completed! Final score: ${state.score}/${totalPossiblePoints} (${scorePercentage}%) - ${rank}`,
        }
      ],
    };
  }

  async handleLocationLoading(state: GeoGuesserState): Promise<GameActionResult> {
    try {
      logger.info(`GeoGuesser: Loading location for round ${state.round}`);
      
      const location = await this.locationService.getRandomLocation(state.difficulty);
      
      const newState: GeoGuesserState = {
        ...state,
        gamePhase: 'GUESSING',
        currentLocation: location,
        roundStartTime: new Date(),
        timeRemaining: state.timeLimit,
        isLoadingLocation: false,
        apiFailures: 0,
      };

      logger.info(`GeoGuesser: Loaded location: ${location.city}, ${location.country}`);

      return {
        newState,
        success: true,
        effects: [],
      };

    } catch (error) {
      logger.error('GeoGuesser: Failed to load location:', error);
      
      const newState: GeoGuesserState = {
        ...state,
        apiFailures: state.apiFailures + 1,
        isLoadingLocation: false,
      };

      if (newState.apiFailures >= 3) {
        return this.handleGameEnd(newState);
      }

      return {
        newState,
        success: false,
        effects: [
          {
            type: 'SCHEDULE_AI_MOVE',
            delay: 2000,
          }
        ],
      };
    }
  }

  validateAction(currentState: GameState, action: GameAction): boolean {
    const state = currentState as GeoGuesserState;
    
    if (!state.isActive || state.gamePhase === 'GAME_OVER') {
      return false;
    }
    
    if (!state.participants.includes(action.userId)) {
      return false;
    }
    
    switch (action.type) {
      case 'GUESS':
        return state.gamePhase === 'GUESSING' && state.currentLocation !== null;
      
      case 'HINT':
        return state.gamePhase === 'GUESSING' && state.hints.used < state.hints.available;
      
      case 'NEXT_ROUND':
        return state.gamePhase === 'REVEALING';
      
      case 'SKIP':
        return state.gamePhase === 'GUESSING' && state.currentLocation !== null;
      
      case 'QUIT':
        return true;
        
      case 'DIFFICULTY':
        return state.round === 1 && state.gamePhase === 'LOADING';
      
      default:
        return false;
    }
  }

  checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string } {
    const state = currentState as GeoGuesserState;
    
    if (state.gamePhase === 'GAME_OVER') {
      return {
        shouldEnd: true,
        winnerId: state.participants[0],
        reason: 'Game completed',
      };
    }
    
    return { shouldEnd: false };
  }

  getDisplayState(currentState: GameState): string {
    const state = currentState as GeoGuesserState;
    
    let display = `🌍 **GeoGuesser** - Round ${state.round}/${state.maxRounds}\n\n`;
    display += `**Score:** ${state.score} points\n`;
    display += `**Difficulty:** ${state.difficulty}\n`;
    display += `**Hints Used:** ${state.hints.used}/${state.hints.available}\n\n`;
    
    if (state.gamePhase === 'LOADING') {
      display += '🔄 Loading location...';
    } else if (state.gamePhase === 'GUESSING') {
      display += '📸 Location loaded! Where do you think this is?';
    } else if (state.gamePhase === 'REVEALING') {
      display += '✅ Round complete! Ready for next round?';
    } else if (state.gamePhase === 'GAME_OVER') {
      display += '🎉 Game finished!';
    }
    
    return display;
  }

  getEmbedDisplay(currentState: GameState): { embeds: any[], components: any[], imageData?: { base64: string, filename: string } } {
    const state = currentState as GeoGuesserState;
    
    if (state.gamePhase === 'LOADING') {
      return this.getLoadingEmbedDisplay(state);
    } else {
      return this.getGameEmbedDisplay(state);
    }
  }

  private getLoadingEmbedDisplay(state: GeoGuesserState): { embeds: any[], components: any[] } {
    const embed = new EmbedBuilder()
      .setTitle('🌍 GeoGuesser - Loading...')
      .setDescription('🔄 Searching for an interesting location...')
      .setColor(0x3498DB)
      .addFields(
        {
          name: 'Round',
          value: `${state.round}/${state.maxRounds}`,
          inline: true
        },
        {
          name: 'Difficulty',
          value: state.difficulty,
          inline: true
        },
        {
          name: 'Score',
          value: `${state.score} points`,
          inline: true
        }
      )
      .setFooter({ text: 'Please wait while we find a location for you to guess!' });

    return {
      embeds: [embed.toJSON()],
      components: []
    };
  }

  private getGameEmbedDisplay(state: GeoGuesserState): { embeds: any[], components: any[], imageData?: { base64: string, filename: string } } {
    const embed = new EmbedBuilder()
      .setTitle(`🌍 GeoGuesser - Round ${state.round}/${state.maxRounds}`)
      .setColor(0x27AE60)
      .addFields(
        {
          name: '🎯 Score',
          value: `${state.score} points`,
          inline: true
        },
        {
          name: '⚡ Difficulty',
          value: state.difficulty,
          inline: true
        },
        {
          name: '💡 Hints',
          value: `${state.hints.used}/${state.hints.available} used`,
          inline: true
        }
      );

    let imageData: { base64: string, filename: string } | undefined;
    
    if (state.currentLocation && state.settings.showImages && state.currentLocation.imageData) {
      try {
        const filename = `geoguesser-round-${state.round}.jpeg`;
        embed.setImage(`attachment://${filename}`);
        embed.setDescription('📸 **Where in the world is this?** Type your guess or use the buttons below!');
        imageData = {
          base64: state.currentLocation.imageData,
          filename: filename
        };
      } catch (error) {
        logger.error('GeoGuesser: Failed to prepare image data:', error);
        embed.setDescription('🗺️ **Mystery Location Loaded!** Unfortunately, there was an issue loading the image for this location. Use the hints to help you guess!');
      }
    } else {
      embed.setDescription('🗺️ **Mystery Location Loaded!** Unfortunately, no image is available for this location. Use the hints to help you guess!');
    }

    if (state.hints.hintsRevealed.length > 0) {
      embed.addFields({
        name: '💡 Hints Revealed',
        value: state.hints.hintsRevealed.join('\n'),
        inline: false
      });
    }

    embed.setFooter({ 
      text: state.gamePhase === 'GUESSING' 
        ? 'Type your guess in chat or use the buttons!' 
        : 'Use the buttons to continue'
    });

    const components = this.buildGameComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components.map(row => row.toJSON()),
      ...(imageData && { imageData })
    };
  }




  private buildGameComponents(state: GeoGuesserState): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    
    // Main action row
    const mainRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('geoguesser_hint')
          .setLabel(`💡 Hint (${state.hints.available - state.hints.used} left)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.hints.used >= state.hints.available || state.gamePhase !== 'GUESSING'),
        new ButtonBuilder()
          .setCustomId('geoguesser_skip')
          .setLabel('⏭️ Skip Round')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.gamePhase !== 'GUESSING'),
        new ButtonBuilder()
          .setCustomId('geoguesser_quit')
          .setLabel('❌ Quit Game')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(state.gamePhase === 'GAME_OVER')
      );

    rows.push(mainRow);

    // Difficulty row (only show in loading phase of first round)
    if (state.round === 1 && state.gamePhase === 'LOADING') {
      const difficultyRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('geoguesser_difficulty_easy')
            .setLabel('🟢 Easy')
            .setStyle(state.difficulty === 'EASY' ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('geoguesser_difficulty_medium')
            .setLabel('🟡 Medium')
            .setStyle(state.difficulty === 'MEDIUM' ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('geoguesser_difficulty_hard')
            .setLabel('🔴 Hard')
            .setStyle(state.difficulty === 'HARD' ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('geoguesser_difficulty_expert')
            .setLabel('⚫ Expert')
            .setStyle(state.difficulty === 'EXPERT' ? ButtonStyle.Success : ButtonStyle.Secondary)
        );

      rows.push(difficultyRow);
    }

    return rows;
  }

  private buildRevealingComponents(state: GeoGuesserState): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    
    // Main action row with Next Round and Quit buttons
    const mainRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('geoguesser_next_round')
          .setLabel(state.round < state.maxRounds ? '➡️ Continue to Next Round' : '🏆 View Final Results')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('geoguesser_quit')
          .setLabel('❌ Quit Game')
          .setStyle(ButtonStyle.Danger)
      );

    rows.push(mainRow);
    return rows;
  }

  private getTimeLimitForDifficulty(difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'): number {
    const timeLimits = {
      EASY: 120,    // 2 minutes
      MEDIUM: 90,   // 1.5 minutes
      HARD: 60,     // 1 minute
      EXPERT: 45    // 45 seconds
    };
    return timeLimits[difficulty];
  }

  private getHintsForDifficulty(difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'): number {
    const hintCounts = {
      EASY: 3,
      MEDIUM: 2,
      HARD: 1,
      EXPERT: 1
    };
    return hintCounts[difficulty];
  }

  private generateHint(location: LocationData, hintType: string, hintNumber: number): string {
    // Generate different types of hints based on hintType
    const countryHints = [
      `🌍 This location is in ${location.country}`,
      `🗺️ This place is located ${location.latitude >= 0 ? 'north' : 'south'} of the equator`,
    ];

    const cityHints = [
      `🏙️ The nearest major city is ${location.city}`,
    ];

    const regionHints = [
      ...(location.state ? [`🗺️ This location is in the state/province of ${location.state}`] : []),
    ];

    const climateHints = [
      ...(Math.abs(location.latitude) > 60 ? [`❄️ This location is in a polar region (very high latitude)`] : []),
      ...(Math.abs(location.latitude) < 23.5 ? [`🌴 This location is in the tropical zone (near the equator)`] : []),
    ];

    let hints: string[] = [];
    
    // Select hints based on hintType
    switch (hintType.toUpperCase()) {
      case 'COUNTRY':
        hints = [...countryHints, ...regionHints];
        break;
      case 'CITY':
        hints = [...cityHints, ...countryHints];
        break;
      case 'REGION':
        hints = [...regionHints, ...countryHints];
        break;
      case 'CLIMATE':
        hints = [...climateHints, ...countryHints];
        break;
      default:
        // Default mix of all hint types
        hints = [...countryHints, ...cityHints, ...regionHints, ...climateHints];
    }

    // Filter out empty hints and return appropriate hint
    const validHints = hints.filter(hint => hint.length > 0);
    return validHints[Math.min(hintNumber, validHints.length - 1)] || countryHints[0];
  }

  getAvailableActions(currentState: GameState): string[] {
    const state = currentState as GeoGuesserState;
    
    if (!state.isActive || state.gamePhase === 'GAME_OVER') {
      return [];
    }

    const actions = ['QUIT'];
    
    if (state.gamePhase === 'GUESSING') {
      actions.push('GUESS', 'SKIP');
      if (state.hints.used < state.hints.available) {
        actions.push('HINT');
      }
    }
    
    if (state.gamePhase === 'REVEALING') {
      if (state.round < state.maxRounds) {
        actions.push('NEXT_ROUND');
      }
    }
    
    if (state.round === 1 && state.gamePhase === 'LOADING') {
      actions.push('DIFFICULTY');
    }
    
    return actions;
  }

  render(currentState: GameState): DiscordReply {
    const state = currentState as GeoGuesserState;
    
    // Handle different game phases
    if (state.gamePhase === 'LOADING') {
      return this.renderLoadingState(state);
    } else if (state.gamePhase === 'GUESSING') {
      return this.renderGuessingState(state);
    } else if (state.gamePhase === 'REVEALING') {
      return this.renderRevealingState(state);
    } else if (state.gamePhase === 'GAME_OVER') {
      return this.renderGameOverState(state);
    }
    
    // Default fallback
    return this.renderLoadingState(state);
  }

  private renderLoadingState(state: GeoGuesserState): DiscordReply {
    const embed = new EmbedBuilder()
      .setTitle('🌍 GeoGuesser - Loading...')
      .setDescription('🔄 Searching for an interesting location...')
      .setColor(0x3498DB)
      .addFields(
        {
          name: 'Round',
          value: `${state.round}/${state.maxRounds}`,
          inline: true
        },
        {
          name: 'Difficulty',
          value: state.difficulty,
          inline: true
        },
        {
          name: 'Score',
          value: `${state.score} points`,
          inline: true
        }
      )
      .setFooter({ text: 'Please wait while we find a location for you to guess!' });

    const components = this.buildGameComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private renderGuessingState(state: GeoGuesserState): DiscordReply {
    const embed = new EmbedBuilder()
      .setTitle(`🌍 GeoGuesser - Round ${state.round}/${state.maxRounds}`)
      .setColor(0x27AE60)
      .addFields(
        {
          name: '🎯 Score',
          value: `${state.score} points`,
          inline: true
        },
        {
          name: '⚡ Difficulty',
          value: state.difficulty,
          inline: true
        },
        {
          name: '💡 Hints',
          value: `${state.hints.used}/${state.hints.available} used`,
          inline: true
        }
      );

    // Add guesses remaining
    const currentRoundGuesses = state.guessHistory.filter(g => g.round === state.round);
    const guessesRemaining = 3 - currentRoundGuesses.length;
    embed.addFields({
      name: '🎯 Guesses',
      value: `${guessesRemaining}/3 remaining`,
      inline: true
    });

    // Show previous guess result if exists
    if (state.currentGuess?.reasoning) {
      const lastGuess = currentRoundGuesses[currentRoundGuesses.length - 1];
      const isCorrect = lastGuess?.correct || false;
      
      embed.addFields(
        {
          name: '📝 Your Last Guess',
          value: state.currentGuess.text,
          inline: true
        },
        {
          name: 'Points Earned',
          value: `${lastGuess?.points || 0}`,
          inline: true
        },
        {
          name: '\u200B', // Empty field for spacing
          value: '\u200B',
          inline: true
        },
        {
          name: '🤖 AI Analysis',
          value: state.currentGuess.reasoning,
          inline: false
        }
      );
      
      // Change color based on correctness
      embed.setColor(isCorrect ? 0x27AE60 : 0xE74C3C);
    }

    let files: AttachmentBuilder[] = [];
    
    // Handle image attachment
    if (state.currentLocation && state.settings.showImages && state.currentLocation.imageData) {
      try {
        const attachment = createLocationImageAttachment(state.currentLocation.imageData, state.round);
        if (attachment.name) {
          files = [attachment];
          embed.setImage(`attachment://${attachment.name}`);
          embed.setDescription('📸 **Where in the world is this?** Type your guess or use the buttons below!');
        } else {
          embed.setDescription('🗺️ **Mystery Location Loaded!** Unfortunately, there was an issue with the image name for this location. Use the hints to help you guess!');
        }
      } catch (error) {
        logger.error('GeoGuesser: Failed to prepare image attachment:', error);
        embed.setDescription('🗺️ **Mystery Location Loaded!** Unfortunately, there was an issue loading the image for this location. Use the hints to help you guess!');
      }
    } else {
      embed.setDescription('🗺️ **Mystery Location Loaded!** Unfortunately, no image is available for this location. Use the hints to help you guess!');
    }

    if (state.hints.hintsRevealed.length > 0) {
      embed.addFields({
        name: '💡 Hints Revealed',
        value: state.hints.hintsRevealed.join('\n'),
        inline: false
      });
    }

    embed.setFooter({ 
      text: 'Type your guess in chat or use the buttons!' 
    });

    const components = this.buildGameComponents(state);
    
    const reply: DiscordReply = {
      embeds: [embed.toJSON()],
      components: components,
      strategy: 'send' // Always send new message for guess updates to avoid image flicker
    };
    
    // Include files for new messages
    if (files.length > 0) {
      reply.files = files;
    }
    
    return reply;
  }

  private renderRevealingState(state: GeoGuesserState): DiscordReply {
    const embed = new EmbedBuilder()
      .setTitle(`🌍 GeoGuesser - Round ${state.round}/${state.maxRounds}`)
      .setColor(0x27AE60)
      .addFields(
        {
          name: '🎯 Score',
          value: `${state.score} points`,
          inline: true
        },
        {
          name: '⚡ Difficulty',
          value: state.difficulty,
          inline: true
        },
        {
          name: '💡 Hints',
          value: `${state.hints.used}/${state.hints.available} used`,
          inline: true
        }
      );

    // Show the correct location
    if (state.currentLocation) {
      const location = state.currentLocation;
      embed.addFields(
        {
          name: '📍 Correct Location',
          value: location.state 
            ? `${location.city}, ${location.state}, ${location.country}`
            : `${location.city}, ${location.country}`,
          inline: false
        }
      );
    }

    // Show the last guess result with AI reasoning
    if (state.currentGuess?.reasoning) {
      const lastGuess = state.guessHistory.filter(g => g.round === state.round).pop();
      const isCorrect = lastGuess?.correct || false;
      
      embed.addFields(
        {
          name: '📝 Your Guess',
          value: state.currentGuess.text,
          inline: true
        },
        {
          name: 'Points Earned',
          value: `${lastGuess?.points || 0}`,
          inline: true
        },
        {
          name: '\u200B', // Empty field for spacing
          value: '\u200B',
          inline: true
        },
        {
          name: '🤖 AI Analysis',
          value: state.currentGuess.reasoning,
          inline: false
        }
      );
      
      // Change color based on correctness
      embed.setColor(isCorrect ? 0x00FF00 : 0xE74C3C);
      
      // Set description based on result
      if (isCorrect) {
        embed.setDescription('🎉 **Excellent!** You got it right!');
      } else {
        embed.setDescription('💔 **Close, but not quite!** Here\'s the correct answer:');
      }
    }

    embed.setFooter({ 
      text: state.round < state.maxRounds 
        ? 'Click Continue to proceed to the next round!' 
        : 'Click Continue to see your final results!'
    });

    const components = this.buildRevealingComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: 'reply' // Reply to show results clearly
    };
  }

  private renderGameOverState(state: GeoGuesserState): DiscordReply {
    const averageAccuracy = state.guessHistory.length > 0
      ? state.guessHistory.reduce((sum, guess) => sum + guess.accuracy, 0) / state.guessHistory.length
      : 0;

    const totalPossiblePoints = state.maxRounds * 100;
    const scorePercentage = Math.round((state.score / totalPossiblePoints) * 100);

    let rank = 'Novice Explorer';
    if (scorePercentage >= 90) {rank = 'Master Geographer';}
    else if (scorePercentage >= 75) {rank = 'Expert Navigator';}
    else if (scorePercentage >= 60) {rank = 'Skilled Traveler';}
    else if (scorePercentage >= 40) {rank = 'Curious Wanderer';}

    const embed = new EmbedBuilder()
      .setTitle('🏆 GeoGuesser - Game Complete!')
      .setDescription(`**Congratulations!** You've earned the rank of **${rank}**`)
      .setColor(0xF1C40F)
      .addFields(
        {
          name: '🎯 Final Score',
          value: `${state.score} points`,
          inline: true
        },
        {
          name: '📊 Average Accuracy',
          value: `${Math.round(averageAccuracy * 100)}%`,
          inline: true
        },
        {
          name: '🌍 Rounds Completed',
          value: `${state.guessHistory.length}/${state.maxRounds}`,
          inline: true
        }
      );

    // Add performance breakdown
    const correctGuesses = state.guessHistory.filter(g => g.correct).length;

    embed.addFields(
      {
        name: '✅ Correct Guesses',
        value: `${correctGuesses}/${state.guessHistory.length}`,
        inline: true
      },
      {
        name: '💡 Total Hints Used',
        value: `${state.guessHistory.length * state.hints.used}`, // This is approximate
        inline: true
      },
      {
        name: '⚡ Difficulty',
        value: state.difficulty,
        inline: true
      }
    );

    embed.setFooter({ text: 'Thanks for playing GeoGuesser! Want to try again with a different difficulty?' });

    return {
      embeds: [embed.toJSON()],
      components: [], // No components for game over
      strategy: 'edit' // Edit to show final results
    };
  }
}