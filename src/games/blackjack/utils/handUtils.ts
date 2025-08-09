/**
 * @fileoverview Hand calculation and game rule utility functions for Blackjack.
 * 
 * This module contains the core Blackjack game logic for hand evaluation, rule enforcement,
 * and game state calculations. Implements standard casino Blackjack rules including
 * proper Ace handling (soft/hard values), bust detection, blackjack identification,
 * and dealer behavior automation.
 * 
 * Key functions:
 * - calculateHandValue(): Smart Ace handling for optimal hand values
 * - isBlackjack(): Detects natural blackjack (21 with exactly 2 cards)
 * - isBust(): Determines if a hand exceeds 21
 * - shouldDealerHit(): Implements dealer rules (hits soft 17, stands hard 17+)
 * - canDoubleDown(): Validates double down eligibility (first 2 cards only)
 * 
 * All calculations follow standard casino rules with soft Ace logic that automatically
 * converts Aces from 11 to 1 when needed to avoid busting.
 */
import { Card } from '../types.js';

export function calculateHandValue(hand: Card[]): { value: number; softAce: boolean } {
  let value = 0;
  let aces = 0;
  
  // First, add up all non-ace cards and count aces
  for (const card of hand) {
    if (card.rank === 'A') {
      aces++;
    } else {
      value += card.value;
    }
  }
  
  // Now handle aces - start with all high (11)
  let acesAsEleven = aces;
  value += acesAsEleven * 11;
  
  // Convert aces to low (1) if we're over 21
  while (value > 21 && acesAsEleven > 0) {
    value -= 10; // Convert an ace from 11 to 1
    acesAsEleven--;
  }
  
  // We have a soft ace if at least one ace is counting as 11
  const softAce = acesAsEleven > 0;
  
  return { value, softAce };
}

export function isBlackjack(hand: Card[]): boolean {
  if (hand.length !== 2) {return false;}
  
  const { value } = calculateHandValue(hand);
  return value === 21;
}

export function isBust(hand: Card[]): boolean {
  const { value } = calculateHandValue(hand);
  return value > 21;
}

export function shouldDealerHit(dealerValue: number, softAce: boolean): boolean {
  if (dealerValue < 17) {return true;}
  if (dealerValue > 17) {return false;}
  
  // Dealer hits on soft 17 (17 with ace counting as 11)
  return softAce;
}

export function canDoubleDown(hand: Card[]): boolean {
  // Can only double down on first two cards
  return hand.length === 2;
}