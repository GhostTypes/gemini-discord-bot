/**
 * @fileoverview Classic Tic-Tac-Toe game with intelligent AI opponent.
 * 
 * Implements a fully-featured Tic-Tac-Toe game with AI opponent powered by
 * Google's AI models. Features configurable difficulty levels and rich Discord
 * integration with interactive buttons and embedded game boards. Key features:
 * - AI opponent with three difficulty levels (EASY, MEDIUM, HARD)
 * - Interactive Discord embeds with clickable button grid
 * - Random player/AI symbol assignment for variety
 * - Win condition detection with diagonal, row, and column checks
 * - Move validation and game state management
 * - Real-time board updates and game status display
 * 
 * Game Mechanics:
 * - 3x3 grid with X and O symbols
 * - Player vs AI with configurable AI difficulty
 * - Turn-based gameplay with immediate AI responses
 * - Win detection for rows, columns, and diagonals
 * - Draw detection when board is full with no winner
 * 
 * Discord Integration:
 * - Rich embed displays with game board visualization
 * - Interactive button grid for move selection
 * - Real-time game state updates and move feedback
 * - Game result announcements with winner identification
 */

import { BaseGame } from '../common/BaseGame.js';
import { GameState, GameAction, GameActionResult, GameConfig, GameEffect } from '../common/types.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ticTacToeAiFlow } from '../../flows/ticTacToeAiFlow.js';
import { DiscordReply } from '../../types/discord.js';

interface TicTacToeState extends GameState {
  board: Array<Array<'X' | 'O' | null>>;
  currentPlayer: 'X' | 'O';
  gamePhase: 'PLAYING' | 'GAME_OVER';
  winner: 'X' | 'O' | 'DRAW' | null;
  playerSymbol: 'X' | 'O';
  aiSymbol: 'X' | 'O';
  moveCount: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  lastMove: { row: number; col: number; player: 'X' | 'O' } | null;
  messageId?: string;
}

export class TicTacToeGame extends BaseGame {
  config: GameConfig = {
    name: 'tictactoe',
    displayName: 'Tic Tac Toe',
    description: 'Play Tic Tac Toe against an AI opponent!',
    minPlayers: 1,
    maxPlayers: 1,
    timeoutMinutes: 10,
  };

  startGame(options: { hostId: string; channelId: string; difficulty?: string }): GameActionResult {
    const playerSymbol = Math.random() < 0.5 ? 'X' : 'O';
    const aiSymbol = playerSymbol === 'X' ? 'O' : 'X';

    const newState: TicTacToeState = {
      gameType: 'tictactoe',
      isActive: true,
      participants: [options.hostId],
      createdAt: new Date(),
      board: [
        [null, null, null],
        [null, null, null],
        [null, null, null]
      ],
      currentPlayer: 'X',
      gamePhase: 'PLAYING',
      winner: null,
      playerSymbol,
      aiSymbol,
      moveCount: 0,
      difficulty: (options.difficulty as 'EASY' | 'MEDIUM' | 'HARD') || 'MEDIUM',
      lastMove: null,
    };

    const effects: GameEffect[] = [];

    if (aiSymbol === 'X') {
      effects.push({
        type: 'SCHEDULE_AI_MOVE',
        delay: 1000,
      });
    }

    return {
      newState,
      success: true,
      effects,
    };
  }

  processAction(currentState: GameState, action: GameAction): GameActionResult {
    const state = currentState as TicTacToeState;

    if (!this.validateAction(currentState, action)) {
      return {
        newState: currentState,
        success: false,
        effects: [],
        message: 'Invalid action',
      };
    }

    switch (action.type) {
      case 'SUBMIT':
        return this.handlePlayerMove(state, action);
      
      case 'QUIT':
        return this.handleQuit(state);
      
      default:
        if (action.type === 'DIFFICULTY' && action.payload?.difficulty) {
          return this.handleDifficultyChange(state, action.payload.difficulty);
        }
        
        return {
          newState: currentState,
          success: false,
          effects: [],
          message: 'Unknown action type',
        };
    }
  }

  private handlePlayerMove(state: TicTacToeState, action: GameAction): GameActionResult {
    const { row, col } = action.payload;
    
    const newBoard = state.board.map(r => [...r]);
    newBoard[row][col] = state.playerSymbol;
    
    const newState: TicTacToeState = {
      ...state,
      board: newBoard,
      moveCount: state.moveCount + 1,
      lastMove: { row, col, player: state.playerSymbol },
      currentPlayer: state.aiSymbol,
    };

    const endResult = this.checkEndConditions(newState);
    if (endResult.shouldEnd) {
      return this.handleGameEnd(newState, endResult);
    }

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'SCHEDULE_AI_MOVE',
          delay: 2000,
        }
      ],
    };
  }

  private handleDifficultyChange(state: TicTacToeState, difficulty: 'EASY' | 'MEDIUM' | 'HARD'): GameActionResult {
    if (state.moveCount > 0) {
      return {
        newState: state,
        success: false,
        effects: [],
        message: 'Cannot change difficulty after the game has started',
      };
    }

    const newState: TicTacToeState = {
      ...state,
      difficulty,
    };

    return {
      newState,
      success: true,
      effects: [],
    };
  }

  private handleQuit(state: TicTacToeState): GameActionResult {
    const newState: TicTacToeState = {
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

  private handleGameEnd(state: TicTacToeState, endResult: { shouldEnd: boolean; winnerId?: string; reason?: string }): GameActionResult {
    const newState: TicTacToeState = {
      ...state,
      gamePhase: 'GAME_OVER',
      isActive: false,
      winner: this.checkWinCondition(state.board),
    };

    const winMessage = this.getWinMessage(newState);

    return {
      newState,
      success: true,
      effects: [
        {
          type: 'END_GAME',
          ...(endResult.winnerId && { winnerId: endResult.winnerId }),
          reason: winMessage,
        }
      ],
    };
  }

  async handleAiMove(state: TicTacToeState): Promise<GameActionResult> {
    try {
      console.log('TicTacToe: Starting AI move generation...');
      const aiMove = await this.generateAiMove(state);
      console.log('TicTacToe: AI chose position:', aiMove);
      
      const newBoard = state.board.map(r => [...r]);
      newBoard[aiMove.row][aiMove.col] = state.aiSymbol;
      
      const newState: TicTacToeState = {
        ...state,
        board: newBoard,
        moveCount: state.moveCount + 1,
        lastMove: { row: aiMove.row, col: aiMove.col, player: state.aiSymbol },
        currentPlayer: state.playerSymbol,
      };

      const endResult = this.checkEndConditions(newState);
      if (endResult.shouldEnd) {
        return this.handleGameEnd(newState, endResult);
      }

      return {
        newState,
        success: true,
        effects: [],
      };
    } catch (error) {
      const fallbackMove = this.getRandomMove(state);
      if (!fallbackMove) {
        return this.handleGameEnd(state, { shouldEnd: true, reason: 'AI error - no valid moves' });
      }

      const newBoard = state.board.map(r => [...r]);
      newBoard[fallbackMove.row][fallbackMove.col] = state.aiSymbol;
      
      const newState: TicTacToeState = {
        ...state,
        board: newBoard,
        moveCount: state.moveCount + 1,
        lastMove: { row: fallbackMove.row, col: fallbackMove.col, player: state.aiSymbol },
        currentPlayer: state.playerSymbol,
      };

      return {
        newState,
        success: true,
        effects: [],
      };
    }
  }

  private async generateAiMove(state: TicTacToeState): Promise<{ row: number; col: number }> {
    try {
      // Use AI flow for move generation
      const aiMove = await ticTacToeAiFlow({
        board: state.board,
        difficulty: state.difficulty,
        aiSymbol: state.aiSymbol,
        playerSymbol: state.playerSymbol,
        moveCount: state.moveCount,
      });
      
      return { row: aiMove.row, col: aiMove.col };
    } catch (error) {
      console.error('AI flow failed, falling back to local algorithm:', error);
      
      // Fallback to local algorithms if AI flow fails
      switch (state.difficulty) {
        case 'EASY':
          return this.getEasyMove(state);
        case 'MEDIUM':
          return this.getMediumMove(state);
        case 'HARD':
          return this.getHardMove(state);
        default:
          return this.getRandomMove(state) || { row: 0, col: 0 };
      }
    }
  }

  private getEasyMove(state: TicTacToeState): { row: number; col: number } {
    if (Math.random() < 0.3) {
      const goodMove = this.getOptimalMove(state);
      if (goodMove) {return goodMove;}
    }
    return this.getRandomMove(state) || { row: 0, col: 0 };
  }

  private getMediumMove(state: TicTacToeState): { row: number; col: number } {
    const winMove = this.findWinningMove(state, state.aiSymbol);
    if (winMove) {return winMove;}

    const blockMove = this.findWinningMove(state, state.playerSymbol);
    if (blockMove) {return blockMove;}

    if (Math.random() < 0.7) {
      const goodMove = this.getOptimalMove(state);
      if (goodMove) {return goodMove;}
    }

    return this.getRandomMove(state) || { row: 0, col: 0 };
  }

  private getHardMove(state: TicTacToeState): { row: number; col: number } {
    return this.getOptimalMove(state) || this.getRandomMove(state) || { row: 0, col: 0 };
  }

  private findWinningMove(state: TicTacToeState, symbol: 'X' | 'O'): { row: number; col: number } | null {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (state.board[row][col] === null) {
          const testBoard = state.board.map(r => [...r]);
          testBoard[row][col] = symbol;
          if (this.checkWinCondition(testBoard) === symbol) {
            return { row, col };
          }
        }
      }
    }
    return null;
  }

  private getOptimalMove(state: TicTacToeState): { row: number; col: number } | null {
    let bestScore = -Infinity;
    let bestMove: { row: number; col: number } | null = null;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (state.board[row][col] === null) {
          const testBoard = state.board.map(r => [...r]);
          testBoard[row][col] = state.aiSymbol;
          const score = this.minimax(testBoard, 0, false, state.aiSymbol, state.playerSymbol);
          if (score > bestScore) {
            bestScore = score;
            bestMove = { row, col };
          }
        }
      }
    }

    return bestMove;
  }

  private minimax(
    board: Array<Array<'X' | 'O' | null>>,
    depth: number,
    isMaximizing: boolean,
    aiSymbol: 'X' | 'O',
    playerSymbol: 'X' | 'O'
  ): number {
    const winner = this.checkWinCondition(board);
    
    if (winner === aiSymbol) {return 10 - depth;}
    if (winner === playerSymbol) {return depth - 10;}
    if (winner === 'DRAW') {return 0;}

    if (isMaximizing) {
      let maxScore = -Infinity;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (board[row][col] === null) {
            board[row][col] = aiSymbol;
            const score = this.minimax(board, depth + 1, false, aiSymbol, playerSymbol);
            board[row][col] = null;
            maxScore = Math.max(score, maxScore);
          }
        }
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (board[row][col] === null) {
            board[row][col] = playerSymbol;
            const score = this.minimax(board, depth + 1, true, aiSymbol, playerSymbol);
            board[row][col] = null;
            minScore = Math.min(score, minScore);
          }
        }
      }
      return minScore;
    }
  }

  private getRandomMove(state: TicTacToeState): { row: number; col: number } | null {
    const emptyCells: { row: number; col: number }[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (state.board[row][col] === null) {
          emptyCells.push({ row, col });
        }
      }
    }
    
    if (emptyCells.length === 0) {return null;}
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }

  validateAction(currentState: GameState, action: GameAction): boolean {
    const state = currentState as TicTacToeState;
    
    if (!state.isActive || state.gamePhase === 'GAME_OVER') {
      return false;
    }
    
    if (!state.participants.includes(action.userId)) {
      return false;
    }
    
    switch (action.type) {
      case 'SUBMIT': {
        if (!action.payload || typeof action.payload.row !== 'number' || typeof action.payload.col !== 'number') {
          return false;
        }
        const { row, col } = action.payload;
        return (
          row >= 0 && row < 3 && 
          col >= 0 && col < 3 && 
          state.board[row][col] === null &&
          state.currentPlayer === state.playerSymbol
        );
      }
      
      case 'QUIT':
        return true;
        
      default:
        if (action.type === 'DIFFICULTY' && action.payload?.difficulty) {
          return ['EASY', 'MEDIUM', 'HARD'].includes(action.payload.difficulty) && state.moveCount === 0;
        }
        return false;
    }
  }

  checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string } {
    const state = currentState as TicTacToeState;
    const winner = this.checkWinCondition(state.board);
    
    if (winner === state.playerSymbol) {
      return {
        shouldEnd: true,
        winnerId: state.participants[0],
        reason: 'Player wins!',
      };
    }
    
    if (winner === state.aiSymbol) {
      return {
        shouldEnd: true,
        reason: 'AI wins!',
      };
    }
    
    if (winner === 'DRAW') {
      return {
        shouldEnd: true,
        reason: "It's a draw!",
      };
    }
    
    return { shouldEnd: false };
  }

  private checkWinCondition(board: Array<Array<'X' | 'O' | null>>): 'X' | 'O' | 'DRAW' | null {
    for (let row = 0; row < 3; row++) {
      if (board[row][0] && 
          board[row][0] === board[row][1] && 
          board[row][1] === board[row][2]) {
        return board[row][0];
      }
    }

    for (let col = 0; col < 3; col++) {
      if (board[0][col] && 
          board[0][col] === board[1][col] && 
          board[1][col] === board[2][col]) {
        return board[0][col];
      }
    }

    if (board[0][0] && 
        board[0][0] === board[1][1] && 
        board[1][1] === board[2][2]) {
      return board[0][0];
    }

    if (board[0][2] && 
        board[0][2] === board[1][1] && 
        board[1][1] === board[2][0]) {
      return board[0][2];
    }

    const isFull = board.every(row => row.every(cell => cell !== null));
    if (isFull) {
      return 'DRAW';
    }

    return null;
  }

  private getWinMessage(state: TicTacToeState): string {
    if (state.winner === state.playerSymbol) {
      return `🎉 You won! Great job!`;
    } else if (state.winner === state.aiSymbol) {
      return `🤖 AI wins! Better luck next time!`;
    } else if (state.winner === 'DRAW') {
      return `🤝 It's a draw! Well played!`;
    }
    return 'Game ended';
  }

  getDisplayState(currentState: GameState): string {
    const state = currentState as TicTacToeState;
    
    // For simple text display (like in status command)
    let textDisplay = `🎮 **Tic Tac Toe**\n\n`;
    textDisplay += `You: **${state.playerSymbol}** | AI: **${state.aiSymbol}**\n`;
    textDisplay += `Difficulty: ${state.difficulty}\n`;
    textDisplay += `Moves: ${state.moveCount}/9\n\n`;
    
    // Add board representation
    for (let row = 0; row < 3; row++) {
      let rowStr = '';
      for (let col = 0; col < 3; col++) {
        const cell = state.board[row][col];
        rowStr += cell || (row * 3 + col + 1).toString();
        if (col < 2) {rowStr += ' | ';}
      }
      textDisplay += rowStr + '\n';
      if (row < 2) {textDisplay += '--|---|--\n';}
    }
    
    textDisplay += '\n';
    if (state.gamePhase === 'GAME_OVER') {
      textDisplay += this.getWinMessage(state);
    } else {
      textDisplay += state.currentPlayer === state.playerSymbol 
        ? 'Your turn! 🎯' 
        : 'AI thinking... 🤖';
    }
    
    return textDisplay;
  }

  getEmbedDisplay(currentState: GameState): { embeds: any[], components: any[] } {
    const state = currentState as TicTacToeState;
    
    const embed = new EmbedBuilder()
      .setTitle('🎮 Tic Tac Toe')
      .setDescription(`You are **${state.playerSymbol}**, AI is **${state.aiSymbol}**`)
      .setColor(0x00AE86)
      .addFields(
        {
          name: 'Current Turn',
          value: state.gamePhase === 'GAME_OVER' 
            ? this.getWinMessage(state)
            : state.currentPlayer === state.playerSymbol 
              ? 'Your turn! 🎯' 
              : 'AI thinking... 🤖',
          inline: true
        },
        {
          name: 'Difficulty',
          value: state.difficulty,
          inline: true
        },
        {
          name: 'Moves',
          value: `${state.moveCount}/9`,
          inline: true
        }
      );

    if (state.lastMove) {
      embed.addFields({
        name: 'Last Move',
        value: `${state.lastMove.player} played position ${state.lastMove.row * 3 + state.lastMove.col + 1}`,
        inline: false
      });
    }

    embed.setFooter({ text: state.gamePhase === 'PLAYING' ? 'Click a button to make your move!' : 'Game Over' });

    const components = this.buildComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components.map(row => row.toJSON())
    };
  }

  private buildComponents(state: TicTacToeState): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    
    for (let row = 0; row < 3; row++) {
      const actionRow = new ActionRowBuilder<ButtonBuilder>();
      for (let col = 0; col < 3; col++) {
        const position = row * 3 + col + 1;
        const cellValue = state.board[row][col];
        
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ttt_${row}_${col}`)
            .setLabel(cellValue || position.toString())
            .setStyle(this.getButtonStyle(cellValue))
            .setDisabled(
              cellValue !== null || 
              state.currentPlayer !== state.playerSymbol ||
              state.gamePhase === 'GAME_OVER'
            )
        );
      }
      rows.push(actionRow);
    }

    const controlRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('ttt_difficulty')
          .setLabel(`Difficulty: ${state.difficulty}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.moveCount > 0 || state.gamePhase === 'GAME_OVER'),
        new ButtonBuilder()
          .setCustomId('ttt_quit')
          .setLabel('Quit Game')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(state.gamePhase === 'GAME_OVER')
      );

    rows.push(controlRow);
    return rows;
  }

  private getButtonStyle(cellValue: 'X' | 'O' | null): ButtonStyle {
    if (cellValue === 'X') {return ButtonStyle.Primary;}
    if (cellValue === 'O') {return ButtonStyle.Danger;}
    return ButtonStyle.Secondary;
  }

  getAvailableActions(currentState: GameState): string[] {
    const state = currentState as TicTacToeState;
    
    if (!state.isActive || state.gamePhase === 'GAME_OVER') {
      return [];
    }

    const actions = ['QUIT'];
    
    if (state.moveCount === 0) {
      actions.push('DIFFICULTY');
    }
    
    if (state.currentPlayer === state.playerSymbol) {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (state.board[row][col] === null) {
            actions.push(`SUBMIT:${row},${col}`);
          }
        }
      }
    }
    
    return actions;
  }

  render(currentState: GameState): DiscordReply {
    const state = currentState as TicTacToeState;
    
    const embed = new EmbedBuilder()
      .setTitle('🎮 Tic Tac Toe')
      .setDescription(`You are **${state.playerSymbol}**, AI is **${state.aiSymbol}**`)
      .setColor(0x00AE86)
      .addFields(
        {
          name: 'Current Turn',
          value: state.gamePhase === 'GAME_OVER' 
            ? this.getWinMessage(state)
            : state.currentPlayer === state.playerSymbol 
              ? 'Your turn! 🎯' 
              : 'AI thinking... 🤖',
          inline: true
        },
        {
          name: 'Difficulty',
          value: state.difficulty,
          inline: true
        },
        {
          name: 'Moves',
          value: `${state.moveCount}/9`,
          inline: true
        }
      );

    if (state.lastMove) {
      embed.addFields({
        name: 'Last Move',
        value: `${state.lastMove.player} played position ${state.lastMove.row * 3 + state.lastMove.col + 1}`,
        inline: false
      });
    }

    embed.setFooter({ text: state.gamePhase === 'PLAYING' ? 'Click a button to make your move!' : 'Game Over' });

    const components = this.buildComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }
}