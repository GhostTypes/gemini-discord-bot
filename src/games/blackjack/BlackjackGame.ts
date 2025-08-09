/**
 * @fileoverview Main Blackjack game implementation extending BaseGame for Discord bot integration.
 * 
 * This file contains the complete Blackjack game logic including betting phases, card dealing,
 * player actions (hit, stand, double down), dealer automation, and win/loss calculations.
 * Integrates with Discord.js for rich embed rendering and button interactions, providing
 * a full casino-style blackjack experience with chip management and visual card displays.
 * 
 * Key features:
 * - Complete betting system with chip management
 * - Standard blackjack rules (dealer hits soft 17, 3:2 blackjack payout)
 * - Rich Discord embed UI with interactive buttons
 * - Game state persistence through the base game system
 * - Proper card shuffling and dealing mechanics
 * 
 * The game follows a phase-based state machine: BETTING -> DEALING -> PLAYER_TURN -> DEALER_TURN -> GAME_OVER
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { BaseGame } from '../common/BaseGame.js';
import { GameState, GameAction, GameActionResult, GameConfig } from '../common/types.js';
import { DiscordReply } from '../../types/discord.js';
import { BlackjackState, BlackjackActionType } from './types.js';
import { createShuffledDeck, dealCard, getHandDisplay } from './utils/cardUtils.js';
import { calculateHandValue, isBlackjack, isBust, shouldDealerHit, canDoubleDown } from './utils/handUtils.js';

export class BlackjackGame extends BaseGame {
  config: GameConfig = {
    name: 'blackjack',
    displayName: 'Blackjack',
    description: 'Classic casino blackjack - beat the dealer to 21!',
    minPlayers: 1,
    maxPlayers: 1,
    timeoutMinutes: 10,
  };

  startGame(options: { hostId: string; channelId: string }): GameActionResult {
    const initialState: BlackjackState = {
      gameId: `blackjack_${Date.now()}`,
      gameType: 'blackjack',
      hostId: options.hostId,
      channelId: options.channelId,
      players: [options.hostId],
      participants: [options.hostId], // Required by GameState
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
      
      // Game phase management
      gamePhase: 'BETTING',
      
      // Card data
      deck: createShuffledDeck(),
      playerHand: [],
      dealerHand: [],
      
      // Betting system
      playerChips: 1000,
      currentBet: 0,
      pendingBet: 0,
      
      // Game calculations
      playerHandValue: 0,
      dealerHandValue: 0,
      playerSoftAce: false,
      dealerSoftAce: false,
      
      // Game result
      gameResult: null,
      winAmount: 0,
      
      // Game settings
      minBet: 10,
      maxBet: 500,
      startingChips: 1000,
      
      // UI state
      dealerCardHidden: false,
      canDoubleDown: false,
    };

    return {
      newState: initialState,
      effects: [], // No SEND_MESSAGE effects from startGame
      success: true,
    };
  }

  processAction(currentState: GameState, action: GameAction): GameActionResult {
    const state = currentState as BlackjackState;

    if (!this.validateAction(state, action)) {
      return {
        newState: state,
        effects: [],
        success: false,
        message: 'Invalid action for current game state'
      };
    }

    switch (state.gamePhase) {
      case 'BETTING':
        return this.handleBetting(state, action);
      case 'PLAYER_TURN':
        return this.handlePlayerTurn(state, action);
      case 'GAME_OVER':
        return this.handleGameOver(state, action);
      default:
        return {
          newState: state,
          effects: [],
          success: false,
          message: 'Invalid game phase'
        };
    }
  }

  private handleBetting(state: BlackjackState, action: GameAction): GameActionResult {
    const newState = { ...state };
    const actionType = action.type as BlackjackActionType;

    switch (actionType) {
      case 'BET': {
        const betAmount = action.payload?.amount || 10;
        const newPendingBet = newState.pendingBet + betAmount;
        if (newPendingBet >= newState.minBet && newPendingBet <= Math.min(newState.maxBet, newState.playerChips)) {
          newState.pendingBet = newPendingBet;
        }
        break;
      }

      case 'MAX_BET':
        newState.pendingBet = Math.min(newState.maxBet, newState.playerChips);
        break;

      case 'PLACE_BET':
        if (newState.pendingBet >= newState.minBet && newState.pendingBet <= newState.playerChips) {
          newState.currentBet = newState.pendingBet;
          newState.playerChips -= newState.currentBet;
          newState.gamePhase = 'DEALING';
          
          // Deal initial cards
          const dealResult = this.dealInitialCards(newState);
          Object.assign(newState, dealResult);
          
          // Check for blackjack
          if (isBlackjack(newState.playerHand)) {
            return this.handleBlackjack(newState);
          }
          
          newState.gamePhase = 'PLAYER_TURN';
          newState.canDoubleDown = canDoubleDown(newState.playerHand);
        }
        break;

      case 'QUIT':
        return {
          newState: state,
          effects: [{ type: 'END_GAME', reason: 'Player quit the game' }],
          success: true,
        };
    }

    return {
      newState,
      effects: [],
      success: true,
    };
  }

  private handlePlayerTurn(state: BlackjackState, action: GameAction): GameActionResult {
    const newState = { ...state };
    const actionType = action.type as BlackjackActionType;

    switch (actionType) {
      case 'HIT': {
        const card = dealCard(newState.deck);
        if (card) {
          newState.playerHand.push(card);
          const { value, softAce } = calculateHandValue(newState.playerHand);
          newState.playerHandValue = value;
          newState.playerSoftAce = softAce;
          newState.canDoubleDown = false; // Can't double after hitting
          
          if (isBust(newState.playerHand)) {
            newState.gamePhase = 'GAME_OVER';
            newState.gameResult = 'LOSS';
            newState.winAmount = 0;
          }
        }
        break;
      }

      case 'STAND':
        newState.gamePhase = 'DEALER_TURN';
        return this.handleDealerTurn(newState);

      case 'DOUBLE_DOWN': {
        if (newState.canDoubleDown && newState.playerChips >= newState.currentBet) {
          newState.playerChips -= newState.currentBet;
          newState.currentBet *= 2;
          
          // Deal exactly one more card
          const card = dealCard(newState.deck);
          if (card) {
            newState.playerHand.push(card);
            const { value, softAce } = calculateHandValue(newState.playerHand);
            newState.playerHandValue = value;
            newState.playerSoftAce = softAce;
          }
          
          if (isBust(newState.playerHand)) {
            newState.gamePhase = 'GAME_OVER';
            newState.gameResult = 'LOSS';
            newState.winAmount = 0;
          } else {
            newState.gamePhase = 'DEALER_TURN';
            return this.handleDealerTurn(newState);
          }
        }
        break;
      }

      case 'QUIT':
        return {
          newState: state,
          effects: [{ type: 'END_GAME', reason: 'Player quit the game' }],
          success: true,
        };
    }

    return {
      newState,
      effects: [],
      success: true,
    };
  }

  private handleDealerTurn(state: BlackjackState): GameActionResult {
    const newState = { ...state };
    newState.gamePhase = 'DEALER_TURN';
    newState.dealerCardHidden = false;

    // Calculate dealer's initial hand value
    let { value: dealerValue, softAce: dealerSoftAce } = calculateHandValue(newState.dealerHand);
    newState.dealerHandValue = dealerValue;
    newState.dealerSoftAce = dealerSoftAce;

    // Dealer hits according to rules
    while (shouldDealerHit(dealerValue, dealerSoftAce)) {
      const card = dealCard(newState.deck);
      if (card) {
        newState.dealerHand.push(card);
        const result = calculateHandValue(newState.dealerHand);
        dealerValue = result.value;
        dealerSoftAce = result.softAce;
        newState.dealerHandValue = dealerValue;
        newState.dealerSoftAce = dealerSoftAce;
      } else {
        break; // No more cards in deck
      }
    }

    // Determine game result
    newState.gamePhase = 'GAME_OVER';
    
    if (isBust(newState.dealerHand)) {
      newState.gameResult = 'WIN';
      newState.winAmount = newState.currentBet * 2;
    } else if (newState.playerHandValue > dealerValue) {
      newState.gameResult = 'WIN';
      newState.winAmount = newState.currentBet * 2;
    } else if (newState.playerHandValue < dealerValue) {
      newState.gameResult = 'LOSS';
      newState.winAmount = 0;
    } else {
      newState.gameResult = 'PUSH';
      newState.winAmount = newState.currentBet; // Return bet
    }

    // Add winnings to chips
    newState.playerChips += newState.winAmount;

    return {
      newState,
      effects: [],
      success: true,
    };
  }

  private handleGameOver(state: BlackjackState, action: GameAction): GameActionResult {
    const actionType = action.type as BlackjackActionType;

    switch (actionType) {
      case 'NEW_GAME':
        if (state.playerChips >= state.minBet) {
          const newState = { ...state };
          newState.gamePhase = 'BETTING';
          newState.deck = createShuffledDeck();
          newState.playerHand = [];
          newState.dealerHand = [];
          newState.currentBet = 0;
          newState.pendingBet = 0;
          newState.playerHandValue = 0;
          newState.dealerHandValue = 0;
          newState.playerSoftAce = false;
          newState.dealerSoftAce = false;
          newState.gameResult = null;
          newState.winAmount = 0;
          newState.dealerCardHidden = false;
          newState.canDoubleDown = false;
          
          return {
            newState,
            effects: [],
            success: true,
          };
        }
        break;

      case 'QUIT':
        return {
          newState: state,
          effects: [{ type: 'END_GAME', reason: 'Player ended the game' }],
          success: true,
        };
    }

    return {
      newState: state,
      effects: [],
      success: false,
    };
  }

  private dealInitialCards(state: BlackjackState): Partial<BlackjackState> {
    const updates: Partial<BlackjackState> = {};
    
    // Deal 2 cards to player
    const playerCard1 = dealCard(state.deck);
    const playerCard2 = dealCard(state.deck);
    if (playerCard1 && playerCard2) {
      updates.playerHand = [playerCard1, playerCard2];
      const { value, softAce } = calculateHandValue(updates.playerHand);
      updates.playerHandValue = value;
      updates.playerSoftAce = softAce;
    }

    // Deal 2 cards to dealer
    const dealerCard1 = dealCard(state.deck);
    const dealerCard2 = dealCard(state.deck);
    if (dealerCard1 && dealerCard2) {
      updates.dealerHand = [dealerCard1, dealerCard2];
      // Only calculate visible card value initially
      updates.dealerCardHidden = true;
      const { value } = calculateHandValue([dealerCard1]);
      updates.dealerHandValue = value;
    }

    return updates;
  }

  private handleBlackjack(state: BlackjackState): GameActionResult {
    const newState = { ...state };
    newState.gamePhase = 'GAME_OVER';
    
    // Check if dealer also has blackjack
    if (isBlackjack(newState.dealerHand)) {
      newState.gameResult = 'PUSH';
      newState.winAmount = newState.currentBet; // Return bet
    } else {
      newState.gameResult = 'BLACKJACK';
      newState.winAmount = Math.floor(newState.currentBet * 2.5); // 3:2 payout
    }
    
    newState.playerChips += newState.winAmount;
    newState.dealerCardHidden = false;
    
    return {
      newState,
      effects: [],
      success: true,
    };
  }

  validateAction(currentState: GameState, action: GameAction): boolean {
    const state = currentState as BlackjackState;
    const actionType = action.type as BlackjackActionType;

    if (action.userId !== state.hostId) {return false;}

    switch (state.gamePhase) {
      case 'BETTING':
        return ['BET', 'MAX_BET', 'PLACE_BET', 'QUIT'].includes(actionType);
      case 'PLAYER_TURN':
        return ['HIT', 'STAND', 'DOUBLE_DOWN', 'QUIT'].includes(actionType);
      case 'GAME_OVER':
        return ['NEW_GAME', 'QUIT'].includes(actionType);
      default:
        return false;
    }
  }

  checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string } {
    const state = currentState as BlackjackState;
    
    if (state.playerChips < state.minBet && state.gamePhase === 'GAME_OVER') {
      return {
        shouldEnd: true,
        reason: 'Player ran out of chips'
      };
    }

    return { shouldEnd: false };
  }

  getDisplayState(currentState: GameState): string {
    const state = currentState as BlackjackState;
    
    switch (state.gamePhase) {
      case 'BETTING':
        return `Betting Phase - Chips: ${state.playerChips}, Pending Bet: ${state.pendingBet}`;
      case 'PLAYER_TURN':
        return `Player Turn - Hand: ${getHandDisplay(state.playerHand)} (${state.playerHandValue})`;
      case 'DEALER_TURN':
        return `Dealer Turn - Dealer: ${getHandDisplay(state.dealerHand)} (${state.dealerHandValue})`;
      case 'GAME_OVER':
        return `Game Over - Result: ${state.gameResult}, Chips: ${state.playerChips}`;
      default:
        return 'Unknown phase';
    }
  }

  getAvailableActions(currentState: GameState): string[] {
    const state = currentState as BlackjackState;

    switch (state.gamePhase) {
      case 'BETTING':
        return ['BET', 'MAX_BET', 'PLACE_BET', 'QUIT'];
      case 'PLAYER_TURN': {
        const actions = ['HIT', 'STAND', 'QUIT'];
        if (state.canDoubleDown && state.playerChips >= state.currentBet) {
          actions.push('DOUBLE_DOWN');
        }
        return actions;
      }
      case 'GAME_OVER': {
        const gameOverActions = ['QUIT'];
        if (state.playerChips >= state.minBet) {
          gameOverActions.unshift('NEW_GAME');
        }
        return gameOverActions;
      }
      default:
        return [];
    }
  }

  render(currentState: GameState): DiscordReply {
    const state = currentState as BlackjackState;

    const embed = new EmbedBuilder()
      .setTitle('🃏 Blackjack')
      .setColor(0x0099FF);

    let description = '';
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    switch (state.gamePhase) {
      case 'BETTING': {
        description = `💰 Chips: ${state.playerChips} | Current Bet: ${state.pendingBet}\n\n`;
        description += `🎯 Place your bet to start playing!\n`;
        description += `Minimum bet: ${state.minBet} | Maximum bet: ${Math.min(state.maxBet, state.playerChips)}`;

        const bettingRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('blackjack_bet_10')
              .setLabel('+10')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('blackjack_bet_25')
              .setLabel('+25')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('blackjack_bet_50')
              .setLabel('+50')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('blackjack_bet_100')
              .setLabel('+100')
              .setStyle(ButtonStyle.Primary),
          );

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('blackjack_max_bet')
              .setLabel('Max Bet')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('blackjack_place_bet')
              .setLabel('Place Bet')
              .setStyle(ButtonStyle.Success)
              .setDisabled(state.pendingBet < state.minBet),
            new ButtonBuilder()
              .setCustomId('blackjack_quit')
              .setLabel('❌ Quit')
              .setStyle(ButtonStyle.Danger),
          );

        components.push(bettingRow, actionRow);
        break;
      }

      case 'PLAYER_TURN': {
        description = `💰 Chips: ${state.playerChips} | Bet: ${state.currentBet}\n\n`;
        description += `🎲 Dealer: ${getHandDisplay(state.dealerHand, state.dealerCardHidden)} (${state.dealerCardHidden ? state.dealerHandValue + '+?' : state.dealerHandValue})\n`;
        description += `👤 Player: ${getHandDisplay(state.playerHand)} (${state.playerHandValue})\n\n`;
        description += `Your turn! Choose your action:`;

        const playerRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('blackjack_hit')
              .setLabel('🃏 Hit')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('blackjack_stand')
              .setLabel('✋ Stand')
              .setStyle(ButtonStyle.Secondary),
          );

        if (state.canDoubleDown && state.playerChips >= state.currentBet) {
          playerRow.addComponents(
            new ButtonBuilder()
              .setCustomId('blackjack_double')
              .setLabel('⚡ Double')
              .setStyle(ButtonStyle.Success)
          );
        }

        playerRow.addComponents(
          new ButtonBuilder()
            .setCustomId('blackjack_quit')
            .setLabel('❌ Quit')
            .setStyle(ButtonStyle.Danger)
        );

        components.push(playerRow);
        break;
      }

      case 'GAME_OVER': {
        const resultEmojis = {
          'WIN': '🎉',
          'LOSS': '💸',
          'PUSH': '🤝',
          'BLACKJACK': '🎊'
        };

        const resultMessages = {
          'WIN': 'You win!',
          'LOSS': 'You lose!',
          'PUSH': 'Push (tie)!',
          'BLACKJACK': 'BLACKJACK!'
        };

        const winLoss = state.winAmount - state.currentBet;
        description = `💰 Chips: ${state.playerChips} | Result: ${state.gameResult} (${winLoss >= 0 ? '+' : ''}${winLoss})\n\n`;
        description += `🎲 Dealer: ${getHandDisplay(state.dealerHand)} (${state.dealerHandValue})\n`;
        description += `👤 Player: ${getHandDisplay(state.playerHand)} (${state.playerHandValue})\n\n`;
        description += `${resultEmojis[state.gameResult!]} ${resultMessages[state.gameResult!]}`;

        if (isBust(state.dealerHand)) {
          description += ` Dealer busts!`;
        } else if (isBust(state.playerHand)) {
          description += ` Player busts!`;
        }

        const gameOverRow = new ActionRowBuilder<ButtonBuilder>();
        
        if (state.playerChips >= state.minBet) {
          gameOverRow.addComponents(
            new ButtonBuilder()
              .setCustomId('blackjack_new_game')
              .setLabel('🎮 New Game')
              .setStyle(ButtonStyle.Success)
          );
        }

        gameOverRow.addComponents(
          new ButtonBuilder()
            .setCustomId('blackjack_quit')
            .setLabel('❌ Quit Game')
            .setStyle(ButtonStyle.Danger)
        );

        components.push(gameOverRow);
        break;
      }
    }

    embed.setDescription(description);

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: 'edit',
    };
  }
}