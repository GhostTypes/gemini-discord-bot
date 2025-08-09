/**
 * @fileoverview Main export module for the Tic-tac-toe game system.
 * 
 * This module provides the classic Tic-tac-toe game implementation for the Discord bot,
 * offering players a familiar and accessible multiplayer experience. The game serves as
 * a foundational example of the bot's game system architecture, demonstrating clean
 * implementation of turn-based mechanics and player interaction patterns.
 * 
 * Game Features:
 * - Traditional 3x3 grid Tic-tac-toe gameplay
 * - Two-player competitive matches with X and O markers
 * - Interactive Discord integration with emoji-based game board display
 * - Real-time turn management and win condition detection
 * - Automatic game state validation and error handling
 * - Clean game ending with winner announcement or draw detection
 * 
 * The TicTacToeGame class implements the GameInterface, ensuring consistent integration
 * with the bot's centralized game management system. It provides an excellent reference
 * implementation for other simple turn-based games, showcasing best practices for
 * game state management, player validation, and Discord message formatting.
 * 
 * This game serves as both an entertaining user feature and a development template
 * for implementing additional classic games within the bot's modular game framework.
 */

export { TicTacToeGame } from './TicTacToeGame.js';