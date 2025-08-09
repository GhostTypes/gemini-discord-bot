/**
 * @fileoverview AI-powered TicTacToe opponent with configurable difficulty levels.
 * 
 * Provides intelligent TicTacToe gameplay through AI decision-making with
 * multiple difficulty settings. Key capabilities include:
 * - Strategic move calculation based on board state analysis
 * - Configurable difficulty levels (EASY, MEDIUM, HARD) with distinct strategies
 * - Structured game state validation using Zod schemas
 * - Move reasoning and explanation for educational purposes
 * - Integration with TicTacToe game logic and Discord interactions
 * 
 * The AI analyzes the current board state, considers player patterns, and
 * makes strategic moves appropriate to the selected difficulty level,
 * providing an engaging opponent for single-player TicTacToe games.
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';

export const TicTacToeAiInputSchema = z.object({
  board: z.array(z.array(z.union([z.literal('X'), z.literal('O'), z.null()]))),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  aiSymbol: z.union([z.literal('X'), z.literal('O')]),
  playerSymbol: z.union([z.literal('X'), z.literal('O')]),
  moveCount: z.number(),
});

export const TicTacToeAiOutputSchema = z.object({
  row: z.number().min(0).max(2),
  col: z.number().min(0).max(2),
  reasoning: z.string().optional(),
});

export type TicTacToeAiInput = z.infer<typeof TicTacToeAiInputSchema>;
export type TicTacToeAiOutput = z.infer<typeof TicTacToeAiOutputSchema>;

export async function ticTacToeAiFlow(input: TicTacToeAiInput): Promise<TicTacToeAiOutput> {
  const boardDisplay = input.board
    .map((row, rowIndex) =>
      row
        .map((cell, colIndex) => {
          const position = rowIndex * 3 + colIndex + 1;
          return cell || position.toString();
        })
        .join(' | ')
    )
    .join('\n---------\n');

  const emptyPositions = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (input.board[row][col] === null) {
        emptyPositions.push({ row, col, position: row * 3 + col + 1 });
      }
    }
  }

  const difficultyInstructions = {
    EASY: 'Play casually with some randomness. Make occasional suboptimal moves. About 30% chance of making the best move.',
    MEDIUM: 'Play reasonably well. Always block immediate wins and take immediate wins when available, but sometimes make suboptimal strategic moves.',
    HARD: 'Play optimally using perfect strategy. Always make the mathematically best move available.'
  };

  const prompt = `You are playing Tic Tac Toe as ${input.aiSymbol} against a human player who is ${input.playerSymbol}.

Current board state:
${boardDisplay}

Available positions: ${emptyPositions.map(p => `${p.position} (row ${p.row}, col ${p.col})`).join(', ')}

Difficulty level: ${input.difficulty}
Strategy: ${difficultyInstructions[input.difficulty]}

Move count: ${input.moveCount}

IMPORTANT: You must choose from one of the available positions listed above. Return the row and col coordinates (0-2) for your move.

${input.difficulty === 'HARD' ? `
Strategic priority (for HARD difficulty):
1. Win immediately if possible
2. Block opponent's winning move
3. Take center (position 5) if available
4. Take corners if available
5. Take edges as last resort
` : ''}

${input.difficulty === 'EASY' ? `
For EASY difficulty: Consider making a random move or an obviously suboptimal move about 70% of the time.
` : ''}

Respond with your move choice and optionally explain your reasoning.`;

  const result = await ai.generate({
    prompt,
    output: {
      schema: TicTacToeAiOutputSchema,
      format: 'json',
    },
  });

  const aiMove = result.output;

  if (!aiMove) {
    throw new Error('AI failed to generate a valid move');
  }

  if (aiMove.row < 0 || aiMove.row > 2 || aiMove.col < 0 || aiMove.col > 2) {
    throw new Error(`Invalid AI move coordinates: row ${aiMove.row}, col ${aiMove.col}`);
  }

  if (input.board[aiMove.row][aiMove.col] !== null) {
    throw new Error(`AI attempted to play on occupied position: row ${aiMove.row}, col ${aiMove.col}`);
  }

  return aiMove;
}