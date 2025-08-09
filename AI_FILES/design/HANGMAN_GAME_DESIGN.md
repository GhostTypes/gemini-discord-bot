# Comprehensive Hangman Game Technical Specification

Based on the existing TicTacToe implementation and game architecture, here's a complete technical specification for implementing a Hangman game that seamlessly integrates with your Discord bot system.

## 1. Game State Interface

```typescript
interface HangmanState extends GameState {
  // Core game data
  word: string;                    // The secret word to guess
  category: string;                // Word category (animals, movies, etc.)
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  
  // Player progress
  guessedLetters: Set<string>;     // All letters guessed so far
  correctLetters: Set<string>;     // Letters that are in the word
  incorrectLetters: Set<string>;   // Letters that are not in the word
  
  // Game state
  gamePhase: 'PLAYING' | 'GAME_OVER';
  remainingGuesses: number;        // Lives left (typically 6)
  maxGuesses: number;              // Total allowed wrong guesses (6)
  winner: 'PLAYER' | 'AI' | null; // Player wins by guessing, AI wins by hangman completion
  
  // UI state
  displayWord: string;             // Word with blanks: "_ _ _ L E"
  hangmanStage: number;            // 0-6 for drawing progression
  
  // Optional features
  hintsUsed: number;               // Track hint usage
  maxHints: number;                // Allowed hints per game (2-3)
  currentHint: string | null;      // Current hint text
  
  // Metadata
  startTime: Date;
  wordLength: number;
  completedLetterCount: number;    // How many unique letters have been found
  totalUniqueLetters: number;      // Total unique letters in the word
}
```

## 2. Action System Design

**Add to `types.ts` GameAction type union:**
```typescript
export type HangmanActionType = 
  | 'GUESS_LETTER'     // Primary action - guess a letter
  | 'HINT'             // Request a hint
  | 'NEW_GAME'         // Start a new game after completion
  | 'CATEGORY'         // Change category (only before first guess)
  | 'DIFFICULTY';      // Change difficulty (only before first guess)

// Update GameAction type to include HangmanActionType
export interface GameAction {
  userId: string;
  type: 'SUBMIT' | 'JOIN' | 'LEAVE' | 'HINT' | 'QUIT' | 'DIFFICULTY' | AIUprisingActionType | HangmanActionType;
  payload?: any;
  timestamp: Date;
}
```

**Action Payload Interfaces:**
```typescript
interface GuessLetterPayload {
  letter: string;      // Single letter A-Z
}

interface DifficultyPayload {
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

interface CategoryPayload {
  category: string;    // Selected category
}
```

## 3. AI Word Generation Flow

**File: `src/games/hangman/flows/hangmanWordFlow.ts`**
```typescript
import { ai } from '../../../genkit.config.js';
import { z } from 'zod';

const WordGenerationInputSchema = z.object({
  category: z.enum(['ANIMALS', 'MOVIES', 'COUNTRIES', 'FOOD', 'SPORTS', 'TECHNOLOGY', 'RANDOM']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  previousWords: z.array(z.string()).optional(),
});

const WordGenerationOutputSchema = z.object({
  word: z.string().min(3).max(15),
  category: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  hint: z.string(),
  alternativeHints: z.array(z.string()).min(1).max(3),
});

export async function hangmanWordFlow(input: z.infer<typeof WordGenerationInputSchema>): Promise<z.infer<typeof WordGenerationOutputSchema>> {
  const difficultySpecs = {
    EASY: '3-6 letters, common everyday words',
    MEDIUM: '5-9 letters, moderate vocabulary level',
    HARD: '7-15 letters, challenging vocabulary, proper nouns allowed'
  };

  const categoryPrompts = {
    ANIMALS: 'animals, creatures, wildlife, pets, insects, birds, marine life',
    MOVIES: 'movie titles, film names, cinema classics, popular films',
    COUNTRIES: 'countries, nations, territories, places around the world',
    FOOD: 'food items, dishes, ingredients, cuisine, beverages',
    SPORTS: 'sports, games, athletic activities, equipment, terms',
    TECHNOLOGY: 'technology, computers, gadgets, software, digital terms',
    RANDOM: 'any appropriate word from various categories'
  };

  const prompt = `Generate a word for a Hangman game with these requirements:

Category: ${input.category} (${categoryPrompts[input.category]})
Difficulty: ${input.difficulty} (${difficultySpecs[input.difficulty]})
${input.previousWords?.length ? `Avoid these recently used words: ${input.previousWords.join(', ')}` : ''}

Requirements:
- Word must be appropriate for all audiences
- No abbreviations, contractions, or hyphenated words
- For EASY: use common words everyone knows
- For MEDIUM: use moderately challenging words
- For HARD: use advanced vocabulary, proper nouns acceptable
- Provide one main hint and 2-3 alternative hints for progressive difficulty

Return a suitable word with helpful hints that give clues without being too obvious.`;

  const result = await ai.generate({
    prompt,
    output: {
      schema: WordGenerationOutputSchema,
      format: 'json',
    },
  });

  const wordData = result.output;
  if (!wordData) {
    throw new Error('AI failed to generate word data');
  }

  // Validation and fallback
  const word = wordData.word.toUpperCase().trim();
  if (!/^[A-Z]+$/.test(word)) {
    throw new Error('Generated word contains invalid characters');
  }

  return {
    ...wordData,
    word: word,
  };
}

// Fallback word lists for when AI fails
export const FALLBACK_WORDS = {
  EASY: {
    ANIMALS: ['CAT', 'DOG', 'BIRD', 'FISH', 'BEAR'],
    MOVIES: ['JAWS', 'CARS', 'UP', 'WALL-E'],
    COUNTRIES: ['USA', 'ITALY', 'JAPAN'],
    // ... more categories
  },
  // ... more difficulties
};
```

## 4. Visual Hangman Display System

```typescript
const HANGMAN_STAGES = [
  // Stage 0 - Empty gallows
  `   -----
   |   |
   |    
   |    
   |    
   |    
-------`,
  
  // Stage 1 - Head
  `   -----
   |   |
   |   O
   |    
   |    
   |    
-------`,
  
  // Stage 2 - Body  
  `   -----
   |   |
   |   O
   |   |
   |    
   |    
-------`,
  
  // Stage 3 - Left arm
  `   -----
   |   |
   |   O
   |  /|
   |    
   |    
-------`,
  
  // Stage 4 - Right arm
  `   -----
   |   |
   |   O
   |  /|\\
   |    
   |    
-------`,
  
  // Stage 5 - Left leg
  `   -----
   |   |
   |   O
   |  /|\\
   |  / 
   |    
-------`,
  
  // Stage 6 - Right leg (Game Over)
  `   -----
   |   |
   |   O
   |  /|\\
   |  / \\
   |    
-------`
];
```

## 5. Discord Embed Layout Design

```typescript
getEmbedDisplay(currentState: GameState): { embeds: any[], components: any[] } {
  const state = currentState as HangmanState;
  
  const embed = new EmbedBuilder()
    .setTitle('🎪 Hangman')
    .setDescription(`**Category:** ${state.category}\n**Difficulty:** ${state.difficulty}`)
    .setColor(state.gamePhase === 'GAME_OVER' 
      ? (state.winner === 'PLAYER' ? 0x00FF00 : 0xFF0000)
      : 0x00AE86)
    .addFields(
      {
        name: '🎯 Word',
        value: `\`\`\`${state.displayWord}\`\`\``,
        inline: false
      },
      {
        name: '🎨 Hangman',
        value: `\`\`\`${HANGMAN_STAGES[state.hangmanStage]}\`\`\``,
        inline: false
      },
      {
        name: '✅ Correct Letters',
        value: state.correctLetters.size > 0 
          ? Array.from(state.correctLetters).sort().join(', ')
          : 'None yet',
        inline: true
      },
      {
        name: '❌ Wrong Letters', 
        value: state.incorrectLetters.size > 0
          ? Array.from(state.incorrectLetters).sort().join(', ')
          : 'None yet',
        inline: true
      },
      {
        name: '💔 Lives Left',
        value: `${state.remainingGuesses}/${state.maxGuesses}`,
        inline: true
      }
    );

  if (state.currentHint) {
    embed.addFields({
      name: '💡 Hint',
      value: state.currentHint,
      inline: false
    });
  }

  if (state.gamePhase === 'GAME_OVER') {
    const message = state.winner === 'PLAYER' 
      ? `🎉 Congratulations! You guessed "${state.word}"!`
      : `💀 Game Over! The word was "${state.word}"`;
    embed.addFields({
      name: 'Result',
      value: message,
      inline: false
    });
  } else {
    embed.setFooter({ 
      text: 'Type a letter to guess, or use the buttons below!' 
    });
  }

  const components = this.buildComponents(state);
  
  return {
    embeds: [embed.toJSON()],
    components: components.map(row => row.toJSON())
  };
}
```

## 6. Button Component System

```typescript
private buildComponents(state: HangmanState): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  // Row 1: Game control buttons
  const controlRow = new ActionRowBuilder<ButtonBuilder>();
  
  controlRow.addComponents(
    new ButtonBuilder()
      .setCustomId('hangman_hint')
      .setLabel(`💡 Hint (${state.hintsUsed}/${state.maxHints})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(
        state.hintsUsed >= state.maxHints || 
        state.gamePhase === 'GAME_OVER'
      )
  );
  
  if (state.guessedLetters.size === 0) {
    controlRow.addComponents(
      new ButtonBuilder()
        .setCustomId('hangman_difficulty')
        .setLabel(`Difficulty: ${state.difficulty}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false),
      new ButtonBuilder()
        .setCustomId('hangman_category')
        .setLabel(`Category: ${state.category}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
    );
  }
  
  rows.push(controlRow);
  
  // Row 2: Action buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (state.gamePhase === 'GAME_OVER') {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('hangman_new_game')
        .setLabel('🎮 New Game')
        .setStyle(ButtonStyle.Success)
        .setDisabled(false),
      new ButtonBuilder()
        .setCustomId('hangman_quit')
        .setLabel('❌ Quit')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false)
    );
  } else {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('hangman_quit')
        .setLabel('❌ Quit Game')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false)
    );
  }
  
  rows.push(actionRow);
  return rows;
}
```

## 7. Core Game Logic Methods

```typescript
// Action validation
validateAction(currentState: GameState, action: GameAction): boolean {
  const state = currentState as HangmanState;
  
  if (!state.isActive || state.gamePhase === 'GAME_OVER') {
    return action.type === 'NEW_GAME' || action.type === 'QUIT';
  }
  
  switch (action.type) {
    case 'GUESS_LETTER':
      const letter = action.payload?.letter?.toUpperCase();
      return (
        letter &&
        letter.length === 1 &&
        /^[A-Z]$/.test(letter) &&
        !state.guessedLetters.has(letter)
      );
      
    case 'HINT':
      return state.hintsUsed < state.maxHints;
      
    case 'DIFFICULTY':
    case 'CATEGORY':
      return state.guessedLetters.size === 0;
      
    case 'QUIT':
    case 'NEW_GAME':
      return true;
      
    default:
      return false;
  }
}

// Word display generation
private generateDisplayWord(word: string, guessedLetters: Set<string>): string {
  return word
    .split('')
    .map(letter => guessedLetters.has(letter) ? letter : '_')
    .join(' ');
}

// Win condition checking  
checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string } {
  const state = currentState as HangmanState;
  
  // Player wins by guessing all letters
  if (state.displayWord.replace(/\s/g, '') === state.word.replace(/\s/g, '')) {
    return {
      shouldEnd: true,
      winnerId: state.participants[0],
      reason: 'Word completely guessed!'
    };
  }
  
  // AI wins by completing hangman (no guesses left)
  if (state.remainingGuesses <= 0) {
    return {
      shouldEnd: true,
      reason: 'Hangman completed - no guesses remaining!'
    };
  }
  
  return { shouldEnd: false };
}
```

## 8. Message Input Integration Strategy

**Key Challenge**: Hangman requires text input for letter guessing, not just button interactions.

**Solution**: Enhance CommandService to detect active Hangman games and route text messages:

```typescript
// In CommandService.handleMessage()
async handleMessage(message: Message): Promise<void> {
  // Check if user has active Hangman game
  const activeGame = await this.gameManager.getActiveGame(message.author.id, message.channel.id);
  
  if (activeGame?.gameType === 'hangman') {
    // Parse single letter from message content
    const content = message.content.trim().toUpperCase();
    if (/^[A-Z]$/.test(content)) {
      // Route as GUESS_LETTER action
      const action: GameAction = {
        userId: message.author.id,
        type: 'GUESS_LETTER',
        payload: { letter: content },
        timestamp: new Date()
      };
      
      await this.gameManager.processAction(activeGame.id, action);
      return;
    }
  }
  
  // Continue with normal message processing...
}
```

## 9. File Structure & Integration Points

**New Files Required:**
```
src/games/hangman/
├── HangmanGame.ts                 // Main game class
├── interactions/
│   └── HangmanInteractionHandler.ts // Button handling
├── flows/
│   └── hangmanWordFlow.ts         // AI word generation
└── index.ts                       // Exports
```

**Files to Modify:**
- `src/games/common/types.ts` - Add HangmanActionType
- `src/games/common/GameRegistry.ts` - Register HangmanGame
- `src/services/CommandService.ts` - Add text input routing

## 10. Configuration & Game Setup

```typescript
export class HangmanGame extends BaseGame {
  config: GameConfig = {
    name: 'hangman',
    displayName: 'Hangman',
    description: 'Guess the word letter by letter before the hangman is completed!',
    minPlayers: 1,
    maxPlayers: 1,
    timeoutMinutes: 15,
  };

  startGame(options: { 
    hostId: string; 
    channelId: string; 
    difficulty?: string;
    category?: string;
  }): GameActionResult {
    // Generate word using AI flow
    // Initialize game state
    // Return with SEND_MESSAGE effect using __HANGMAN_EMBED__ encoding
  }
}
```

## 11. Testing Checklist

**Core Functionality:**
- [ ] Slash command start: `/game start hangman`
- [ ] Natural language start: "@bot let's play hangman"
- [ ] Text input letter guessing works correctly
- [ ] Button interactions (hint, difficulty, category, new game, quit)
- [ ] AI word generation with different categories/difficulties
- [ ] Visual hangman progression displays correctly
- [ ] Win/loss conditions trigger properly
- [ ] Message editing pattern (not new messages)

**Edge Cases:**
- [ ] Duplicate letter handling (friendly reminder)
- [ ] Invalid character input validation
- [ ] AI word generation failure (fallback to word lists)
- [ ] Hint system exhaustion
- [ ] Game timeout handling
- [ ] Multiple concurrent games per user

**Integration:**
- [ ] Proper embed encoding with `__HANGMAN_EMBED__` pattern
- [ ] Message ID storage for editing
- [ ] GameRegistry registration
- [ ] InteractionHandler routing

## 12. Implementation Notes

### Critical Implementation Knowledge (From TicTacToe)

1. **Embed Display System**: Use the `__HANGMAN_EMBED__` pattern for complex games with embeds
2. **Message ID Management**: Add `lastMessageId` to GameSession database schema
3. **Button Interaction Handling**: Use custom button IDs like `hangman_hint`
4. **Dual Start Methods Support**: Games must work from slash commands AND natural language
5. **Text Input Detection**: Enhance CommandService to route single letters to active games

### Quality Assurance
After implementation, ALWAYS run:
1. `npm run type-check` - Ensure TypeScript compilation passes
2. `npm run lint` - Check for code quality issues  
3. `npm run linecount` - Monitor codebase size

This specification provides a complete, production-ready design that follows all existing architectural patterns while implementing the unique mechanics required for Hangman gameplay. The system integrates seamlessly with your current Discord bot infrastructure and maintains consistency with the proven TicTacToe implementation patterns.