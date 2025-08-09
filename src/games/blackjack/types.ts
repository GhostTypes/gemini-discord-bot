/**
 * @fileoverview TypeScript type definitions for Blackjack game data structures.
 * 
 * This file defines all TypeScript interfaces and types used throughout the Blackjack
 * game implementation, providing type safety and clear contracts for game state,
 * card representations, and action types. Extends the common game types while adding
 * Blackjack-specific properties for betting, hand management, and game phases.
 * 
 * Key type definitions:
 * - Card: Playing card representation with suit, rank, and value
 * - BlackjackState: Complete game state extending base GameState
 * - BlackjackActionType: Union type for all possible player actions
 * 
 * The BlackjackState interface includes comprehensive game data including betting system,
 * card hands, game phases, win/loss tracking, and UI state management for Discord rendering.
 */
export interface Card {
  suit: '♠️' | '♥️' | '♦️' | '♣️';
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
  value: number; // Base value for calculations
}

import { GameState } from '../common/types.js';

export interface BlackjackState extends GameState {
  gameId: string;
  hostId: string;
  channelId: string;
  gameType: 'blackjack';
  players: string[];
  participants: string[]; // Required by GameState
  
  // Game phase management
  gamePhase: 'BETTING' | 'DEALING' | 'PLAYER_TURN' | 'DEALER_TURN' | 'GAME_OVER';
  
  // Card data (using arrays for serialization safety)
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  
  // Betting system
  playerChips: number;
  currentBet: number;
  pendingBet: number; // For setting bet amount
  
  // Game calculations
  playerHandValue: number;
  dealerHandValue: number;
  playerSoftAce: boolean;
  dealerSoftAce: boolean;
  
  // Game result
  gameResult: 'WIN' | 'LOSS' | 'PUSH' | 'BLACKJACK' | null;
  winAmount: number;
  
  // Game settings
  minBet: number;
  maxBet: number;
  startingChips: number;
  
  // UI state
  dealerCardHidden: boolean;
  canDoubleDown: boolean;
}

export type BlackjackActionType = 
  | 'BET'
  | 'INCREASE_BET' 
  | 'DECREASE_BET'
  | 'MAX_BET'
  | 'PLACE_BET'
  | 'HIT'
  | 'STAND' 
  | 'DOUBLE_DOWN'
  | 'NEW_GAME'
  | 'QUIT';