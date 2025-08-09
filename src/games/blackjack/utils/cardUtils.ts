/**
 * @fileoverview Card-related utility functions for Blackjack game mechanics.
 * 
 * This module provides essential card manipulation functions including deck creation,
 * shuffling, dealing, and display formatting. Handles the core card game infrastructure
 * that supports the Blackjack game logic with proper randomization and visual presentation
 * for Discord integration.
 * 
 * Key functions:
 * - createShuffledDeck(): Generates a full 52-card deck with proper values
 * - shuffleDeck(): Fisher-Yates shuffle algorithm for randomization
 * - getCardDisplay(): Formats cards for Discord display with emoji suits
 * - getHandDisplay(): Renders complete hands with optional card hiding
 * - dealCard(): Safe card dealing with null handling for empty decks
 * 
 * All card values follow standard Blackjack rules with Aces starting at 11,
 * face cards worth 10, and proper suit emoji representation for Discord.
 */
import { Card } from '../types.js';

export function createShuffledDeck(): Card[] {
  const suits: Array<'♠️' | '♥️' | '♦️' | '♣️'> = ['♠️', '♥️', '♦️', '♣️'];
  const ranks: Array<'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'> = 
    ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  const deck: Card[] = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      let value: number;
      if (rank === 'A') {
        value = 11; // Start with high value, will be adjusted in hand calculations
      } else if (rank === 'J' || rank === 'Q' || rank === 'K') {
        value = 10;
      } else {
        value = parseInt(rank);
      }
      
      deck.push({ suit, rank, value });
    }
  }
  
  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getCardDisplay(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function getHandDisplay(hand: Card[], hideFirst?: boolean): string {
  if (hand.length === 0) {return '';}
  
  const displays = hand.map((card, index) => {
    if (hideFirst && index === 0) {
      return '🂠'; // Hidden card back
    }
    return getCardDisplay(card);
  });
  
  return displays.join(' ');
}

export function dealCard(deck: Card[]): Card | null {
  return deck.pop() || null;
}