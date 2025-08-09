/**
 * @fileoverview Main export module for the Word Scramble game system.
 * 
 * This module provides an engaging word puzzle game implementation for the Discord bot,
 * challenging players to unscramble letters and form valid words within a time limit.
 * The game combines educational value with entertainment, offering vocabulary building
 * and pattern recognition challenges suitable for players of all ages.
 * 
 * Game Features:
 * - Dynamic word scrambling with varying difficulty levels
 * - Time-based gameplay with configurable round duration
 * - Hint system to assist players when stuck
 * - Score tracking and performance feedback
 * - Multiple difficulty settings affecting word complexity and time limits
 * - Support for both single-player and competitive multiplayer modes
 * - Extensive word database with category-based selection
 * 
 * The WordScrambleGame class implements the GameInterface, ensuring seamless integration
 * with the bot's game management infrastructure. It demonstrates effective use of
 * AI-powered word selection and scrambling algorithms, providing a balanced challenge
 * that adapts to player skill levels and preferences.
 * 
 * This game showcases the bot's capability to provide educational content through
 * interactive gameplay, making learning vocabulary and word patterns an enjoyable
 * social experience within Discord communities.
 */

export { WordScrambleGame } from './WordScrambleGame.js';