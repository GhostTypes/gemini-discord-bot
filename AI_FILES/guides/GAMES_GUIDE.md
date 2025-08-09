# Discord Bot Game Development Guide

**The Complete Reference for Implementing Games in the Discord Bot System**

This guide provides comprehensive patterns, architectures, and implementation details based on all existing games in the system. Follow these patterns to implement new games correctly on the first try.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Game Implementation Patterns](#game-implementation-patterns)
4. [Discord Integration](#discord-integration)
5. [AI Integration](#ai-integration)
6. [Database & State Management](#database--state-management)
7. [Critical Implementation Rules](#critical-implementation-rules)
8. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
9. [Testing & Quality Assurance](#testing--quality-assurance)
10. [Game Examples Analysis](#game-examples-analysis)

## Architecture Overview

### System Components
```
GameRegistry ← Register all games
    ↓
BaseGame ← All games inherit from this
    ↓
GameManager ← Manages lifecycle, state, effects
    ↓
GameHandler ← Handles text input, renders responses
    ↓
InteractionHandlers ← Handle button clicks
    ↓
Discord Integration ← Embeds, components, messages
```

### Game Lifecycle
1. **Registration**: Game class registered in GameRegistry
2. **Instantiation**: GameManager creates instance when requested
3. **Startup**: `startGame()` called with options
4. **State Persistence**: Game state saved to database via Prisma
5. **Action Processing**: `processAction()` handles player inputs
6. **State Updates**: Database updated with new state
7. **Discord Updates**: Render system updates Discord messages
8. **Game End**: `checkEndConditions()` triggers cleanup

## Core Components

### 1. BaseGame Abstract Class

**Location**: `src/games/common/BaseGame.ts`

**Required Methods**:
```typescript
abstract startGame(options: { hostId: string; channelId: string; [key: string]: any }): GameActionResult;
abstract processAction(currentState: GameState, action: GameAction): GameActionResult | Promise<GameActionResult>;
abstract getDisplayState(currentState: GameState): string;
abstract validateAction(currentState: GameState, action: GameAction): boolean;
abstract checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string };
abstract getAvailableActions(currentState: GameState): string[];
abstract render(currentState: GameState): DiscordReply;
```

### 2. Game Configuration
```typescript
config: GameConfig = {
  name: 'mygame',                    // Lowercase, used for registration
  displayName: 'My Game',            // Human readable
  description: 'Description here',   // For help commands
  minPlayers: 1,                     // Minimum players
  maxPlayers: 1,                     // Maximum players  
  timeoutMinutes: 15,               // Auto-timeout duration
};
```

### 3. Game State Interface
```typescript
interface MyGameState extends GameState {
  gameType: string;      // REQUIRED: Game type identifier
  isActive: boolean;     // REQUIRED: Game activity status
  participants: string[]; // REQUIRED: Player IDs
  createdAt: Date;       // REQUIRED: Creation timestamp
  
  // Game-specific properties
  currentPlayer: string;
  gamePhase: 'PLAYING' | 'GAME_OVER';
  winner: string | null;
  // ... other game data
}
```

## Game Implementation Patterns

### Pattern 1: Simple Single-Player Games (Hangman, WordScramble)

**Characteristics**:
- One player vs AI/system
- Turn-based or continuous input
- Rich embed displays
- Button interactions

**Key Implementation**:
```typescript
startGame(options: { hostId: string; channelId: string }): GameActionResult {
  const newState: MyGameState = {
    gameType: 'mygame',
    isActive: true,
    participants: [options.hostId],
    createdAt: new Date(),
    // Game-specific initialization
  };

  return {
    newState,
    success: true,
    effects: [], // NO SEND_MESSAGE effects - let render system handle
  };
}
```

### Pattern 2: AI Opponent Games (TicTacToe)

**Characteristics**:
- Player vs intelligent AI
- Scheduled AI moves via effects
- Complex AI decision making
- Fallback algorithms for AI failures

**Key Implementation**:
```typescript
// In player move processing
return {
  newState,
  success: true,
  effects: [
    {
      type: 'SCHEDULE_AI_MOVE',
      delay: 2000, // 2-second delay for AI move
    }
  ],
};

// Separate AI move handler
async handleAiMove(state: MyGameState): Promise<GameActionResult> {
  try {
    const aiMove = await this.generateAiMove(state);
    // Process AI move
    return { newState, success: true, effects: [] };
  } catch (error) {
    // ALWAYS have fallback logic
    const fallbackMove = this.getRandomMove(state);
    // Process fallback move
  }
}
```

### Pattern 3: Complex RPG Games (AI Uprising)

**Characteristics**:
- Multiple game phases and states
- Rich inventory/equipment systems
- AI-generated content and storylines
- Complex state management

**Key Implementation**:
```typescript
// Use extensive state interfaces
interface ComplexGameState extends GameState {
  gamePhase: 'SETUP' | 'EXPLORATION' | 'COMBAT' | 'STORY' | 'GAME_OVER';
  player: PlayerStats;
  inventory: Item[];
  equipment: Equipment;
  currentLocation: Location;
  activeQuests: Quest[];
  storyContext: StoryState;
}

// Break down complex actions into smaller handlers
processAction(currentState: GameState, action: GameAction): GameActionResult {
  switch (action.type) {
    case 'MOVE': return this.handleMove(state, action);
    case 'ATTACK': return this.handleAttack(state, action);
    case 'USE_ITEM': return this.handleItemUse(state, action);
    // ... more handlers
  }
}
```

### Pattern 4: Location-Based Games (GeoGuesser)

**Characteristics**:
- External data integration (maps, locations)
- Image/media processing
- Scoring and validation systems
- Fallback data sources

**Key Implementation**:
```typescript
// Always have local fallback data
const FALLBACK_LOCATIONS = [
  { name: "Paris", country: "France", difficulty: "EASY" },
  // ... more locations
];

// Robust data fetching with fallbacks
async generateLocation(difficulty: string) {
  try {
    // Try external API first
    const location = await externalAPI.getLocation(difficulty);
    return location;
  } catch (error) {
    // Fall back to local data
    const locations = FALLBACK_LOCATIONS.filter(l => l.difficulty === difficulty);
    return locations[Math.floor(Math.random() * locations.length)];
  }
}
```

## Discord Integration

### 1. Render System - CRITICAL PATTERNS

**Rule**: NEVER return `SEND_MESSAGE` effects from `startGame()`. Always use the render system.

```typescript
// ❌ WRONG - Will cause duplicate embeds
startGame(): GameActionResult {
  return {
    newState,
    success: true,
    effects: [
      { type: 'SEND_MESSAGE', content: 'embed data' } // DON'T DO THIS
    ]
  };
}

// ✅ CORRECT - Let render system handle display
startGame(): GameActionResult {
  return {
    newState,
    success: true,
    effects: [] // Empty effects for game start
  };
}
```

**Render Method Implementation**:
```typescript
render(currentState: GameState): DiscordReply {
  const state = currentState as MyGameState;
  
  const embed = new EmbedBuilder()
    .setTitle('🎮 My Game')
    .setDescription('Game description')
    .setColor(0x00AE86)
    .addFields(
      { name: 'Status', value: 'Current status', inline: true }
    );

  const components = this.buildComponents(state);
  
  return {
    embeds: [embed.toJSON()],
    components: components,
    strategy: 'edit' as const // Use 'edit' for updates, 'send' for new messages
  };
}
```

### 2. Button Interaction Handlers

**Location**: `src/games/{game}/interactions/{Game}InteractionHandler.ts`

**Pattern**:
```typescript
export class MyGameInteractionHandler implements BaseInteractionHandler {
  canHandle(customId: string): boolean {
    return customId.startsWith('mygame_');
  }

  async handleButtonInteraction(interaction: any): Promise<void> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      // Process the action
      const result = await gameManager().handleAction(interaction.channelId, {
        userId: interaction.user.id,
        type: 'ACTION_TYPE',
        payload: { /* action data */ },
        timestamp: new Date(),
      });

      if (!result.success) {
        await interaction.reply({
          content: result.message || 'Action failed',
          ephemeral: true,
        });
        return;
      }

      // Defer the update first
      await interaction.deferUpdate();

      try {
        // Get updated game state and render
        const gameState = await gameManager().getChannelGameState(interaction.channelId);
        
        if (gameState.gameState && gameState.gameType === 'mygame') {
          const { GameRegistry } = await import('../../../games/common/GameRegistry.js');
          const game = GameRegistry.getGameInstance('mygame');
          
          if (game) {
            const reply = game.render(gameState.gameState);
            
            const payload: any = {};
            if (reply.embeds) payload.embeds = reply.embeds;
            if (reply.components) payload.components = reply.components;
            if (reply.files) payload.files = reply.files;
            
            await interaction.editReply(payload);
            await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
          }
        }
      } catch (error) {
        logger.error('Error rendering game update:', error);
        await interaction.followUp({
          content: 'Error updating game display.',
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('Error handling interaction:', error);
      // Proper error handling for different interaction states
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Error occurred', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Error occurred', ephemeral: true });
      }
    }
  }
}
```

### 3. Component Building

```typescript
private buildComponents(state: MyGameState): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  // Main action buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (state.gamePhase === 'PLAYING') {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('mygame_action')
        .setLabel('Take Action')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
    );
  }

  // Control buttons
  const controlRow = new ActionRowBuilder<ButtonBuilder>();
  controlRow.addComponents(
    new ButtonBuilder()
      .setCustomId('mygame_quit')
      .setLabel('❌ Quit Game')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(state.gamePhase === 'GAME_OVER')
  );

  rows.push(actionRow, controlRow);
  return rows;
}
```

## AI Integration

### 1. Structured Input/Output with Zod

**CRITICAL**: Always use structured Zod schemas for AI interactions.

```typescript
import { z } from 'zod';

// Define input schema
const AIInputSchema = z.object({
  gameState: z.string().describe("Current game state"),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  playerAction: z.string().optional(),
});

// Define output schema - AVOID PROBLEMATIC ZOD FEATURES
const AIOutputSchema = z.object({
  action: z.string().min(1),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1),
  // Use min/max instead of positive()
  // Use enum() instead of literal()
  // Use explicit object properties instead of record()
});

// In your AI flow
export const myGameAIFlow = defineFlow(
  {
    name: 'my-game-ai-flow',
    inputSchema: AIInputSchema,
    outputSchema: AIOutputSchema,
  },
  async (input) => {
    const result = await generate({
      model: gemini20FlashLite,
      prompt: `Analyze this game state: ${input.gameState}`,
      output: { schema: AIOutputSchema },
      config: { temperature: 0.7 },
    });
    
    return result.output;
  }
);
```

### 2. Zod Schema Compatibility Rules

**AVOID these Zod features (cause Gemini API errors)**:
```typescript
// ❌ BROKEN with Gemini API
z.number().positive()           // Use z.number().min(1)
z.literal("value")             // Use z.enum(["value"])
z.record(z.string(), z.number()) // Use explicit object properties
z.discriminatedUnion()         // Use single flexible schema
z.union([...])                 // Simplify to single schema

// ✅ SAFE with Gemini API
z.number().min(1).max(100)
z.enum(["EASY", "MEDIUM", "HARD"])
z.object({
  prop1: z.string().optional(),
  prop2: z.number().optional(),
})
z.string().describe("Clear description for AI")
```

### 3. Fallback Systems

**ALWAYS implement fallback systems for AI failures**:
```typescript
async generateAIResponse(input: any) {
  try {
    // Try AI generation first
    const aiResult = await myGameAIFlow(input);
    return aiResult;
  } catch (error) {
    logger.error('AI flow failed, using fallback:', error);
    
    // Implement deterministic fallback
    return this.getFallbackResponse(input);
  }
}

private getFallbackResponse(input: any) {
  // Always have a working fallback that doesn't depend on external services
  const fallbackActions = ['action1', 'action2', 'action3'];
  return fallbackActions[Math.floor(Math.random() * fallbackActions.length)];
}
```

## Database & State Management

### 1. State Serialization Issues

**CRITICAL**: JavaScript Sets and Maps don't serialize properly to JSON/database.

```typescript
// ❌ PROBLEMATIC - Sets serialize incorrectly
interface BadGameState extends GameState {
  playerCards: Set<string>;     // Becomes {"0": "card1", "1": "card2"}
  scores: Map<string, number>;  // Serialization issues
}

// ✅ CORRECT - Use Arrays and Objects
interface GoodGameState extends GameState {
  playerCards: string[];        // Serializes as ["card1", "card2"]
  scores: Record<string, number>; // Serializes as {"player1": 100}
}

// If you need to work with Sets, convert during operations
private ensureArrays(state: MyGameState): MyGameState {
  return {
    ...state,
    playerCards: Array.isArray(state.playerCards) ? state.playerCards : [],
  };
}
```

### 2. State Persistence Patterns

**GameManager handles all database operations automatically**:
- Game state stored in `gameData` field as JSON
- State retrieved and passed to game methods
- No direct database access needed in game classes

## Critical Implementation Rules

### 1. Game Registration

**MANDATORY**: Register game in GameRegistry static initializer:

```typescript
// In GameRegistry.ts
static {
  this.register('wordscramble', WordScrambleGame);
  this.register('tictactoe', TicTacToeGame);
  this.register('mygame', MyGameGame);  // ADD YOUR GAME HERE
}
```

### 2. Render System Integration

**MANDATORY**: Add game to both render lists:

```typescript
// In GameHandler.ts - for natural language starts
if (gameType === 'tictactoe' || gameType === 'wordscramble' || /* ... */ || gameType === 'mygame') {

// In game.ts - for slash command starts  
if (result.success && (gameType === 'tictactoe' || /* ... */ || gameType === 'mygame')) {

// In GameHandler.ts - for action responses
if (gameType === 'tictactoe' || gameType === 'wordscramble' || /* ... */ || gameType === 'mygame') {
```

### 3. Action Type Registration

**MANDATORY**: Add action types to union in types.ts:

```typescript
export type MyGameActionType = 
  | 'MY_ACTION1'
  | 'MY_ACTION2';

export interface GameAction {
  type: 'SUBMIT' | 'JOIN' | /* ... */ | MyGameActionType;
  // ...
}
```

### 4. Interaction Handler Registration

**MANDATORY**: Register interaction handler in interactionCreateListener.ts:

```typescript
import { MyGameInteractionHandler } from '../games/mygame/interactions/MyGameInteractionHandler.js';

const handlers = [
  // ... other handlers
  new MyGameInteractionHandler(),
];
```

### 5. Text Input Handling (Optional)

**If your game accepts text input**, add to GameHandler.ts:

```typescript
// In handleGameMessage method
if (gameState.gameType === 'mygame') {
  // Handle text input for your game
  const result = await gameManager().handleAction(channelId, {
    userId,
    type: 'TEXT_INPUT',
    payload: { text: message.content },
    timestamp: new Date(),
  });
  
  await this.renderGameResponse(message, result);
  return;
}
```

## Common Pitfalls & Solutions

### 1. Duplicate Embed Syndrome

**Problem**: Game displays multiple identical embeds
**Cause**: Returning `SEND_MESSAGE` effects from `startGame()`
**Solution**: Remove `SEND_MESSAGE` effects, use render system

### 2. Button Interactions Not Working

**Problem**: Clicking buttons does nothing
**Cause**: Not using render system in interaction handlers
**Solution**: Follow the interaction handler pattern exactly

### 3. State Not Persisting

**Problem**: Game state resets between actions
**Cause**: Not returning updated state in `GameActionResult`
**Solution**: Always return complete updated state

### 4. AI Generation Failures

**Problem**: AI flows throwing schema validation errors
**Cause**: Using incompatible Zod features
**Solution**: Follow Zod compatibility rules

### 5. Games Not Starting

**Problem**: Game doesn't appear in `/game start` list
**Cause**: Not registered in GameRegistry or render lists
**Solution**: Follow registration rules

## Testing & Quality Assurance

### 1. Required QA Commands

**ALWAYS run these after implementation**:
```bash
npm run type-check  # TypeScript compilation
npm run lint       # Code quality  
npm run linecount  # Monitor codebase size
```

### 2. Testing Checklist

- [ ] Game starts via natural language
- [ ] Game starts via `/game start` command
- [ ] All button interactions work
- [ ] Text input works (if applicable)  
- [ ] AI moves work (if applicable)
- [ ] Game ends properly
- [ ] Quit button works
- [ ] State persists between actions
- [ ] Error handling works
- [ ] Fallback systems work

### 3. Common Test Scenarios

1. **Happy Path**: Normal gameplay from start to finish
2. **Error Handling**: Invalid inputs, AI failures, network issues
3. **Edge Cases**: Empty states, boundary conditions, timeout scenarios
4. **Concurrency**: Multiple games in different channels
5. **Recovery**: Bot restart during active games

## Game Examples Analysis

### Example 1: Hangman (Simple, Rich UI)

**Strengths**:
- Clear state management with arrays (not Sets)
- Rich ASCII art display
- Progressive hint system
- Smart fallback word lists
- Proper button interaction handling

**Key Patterns**:
```typescript
// Visual hangman stages as constants
const HANGMAN_STAGES = [/* ASCII art arrays */];

// Array-based state for serialization
interface HangmanState extends GameState {
  guessedLetters: string[];    // Not Set<string>
  correctLetters: string[];    // Not Set<string>
  incorrectLetters: string[];  // Not Set<string>
}

// Rich embed with multiple fields
.addFields(
  { name: '🎯 Word', value: '```' + displayWord + '```' },
  { name: '🎨 Hangman', value: '```' + hangmanArt + '```' },
  { name: '✅ Correct', value: correctLetters.join(', ') }
)
```

### Example 2: TicTacToe (AI Opponent)

**Strengths**:
- Clean AI move scheduling
- Minimax algorithm with fallbacks
- Smart button grid generation
- Proper difficulty levels

**Key Patterns**:
```typescript
// AI move scheduling
effects: [{
  type: 'SCHEDULE_AI_MOVE',
  delay: 2000
}]

// Fallback for AI failures
try {
  const aiMove = await ticTacToeAiFlow(input);
  return aiMove;
} catch (error) {
  return this.getLocalAlgorithmMove(state);
}

// Dynamic button grid
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    button.setCustomId(`ttt_${row}_${col}`);
  }
}
```

### Example 3: AI Uprising (Complex RPG)

**Strengths**:
- Complex state management
- Multiple game phases
- Rich inventory/equipment systems
- Extensive AI integration

**Key Patterns**:
```typescript
// Complex state breakdown
interface AIUprisingState extends GameState {
  gamePhase: 'SETUP' | 'EXPLORATION' | 'COMBAT' | 'STORY' | 'GAME_OVER';
  player: {
    stats: PlayerStats;
    inventory: Item[];
    equipment: EquippedItems;
    quests: Quest[];
  };
  world: {
    currentLocation: Location;
    visitedLocations: string[];
    storyProgress: StoryState;
  };
}

// Action type breakdown
switch (action.type) {
  case 'MOVE': return this.handleMovement(state, action);
  case 'ATTACK': return this.handleCombat(state, action); 
  case 'USE_ITEM': return this.handleItemUsage(state, action);
  case 'STORY_CHOICE': return this.handleStoryProgression(state, action);
}
```

### Example 4: GeoGuesser (External Data)

**Strengths**:
- Local data fallbacks
- Image processing integration
- Scoring and validation systems
- Clean location management

**Key Patterns**:
```typescript
// Robust data fetching
async getLocation(difficulty: string) {
  try {
    // Try external source first
    return await this.fetchExternalLocation(difficulty);
  } catch (error) {
    // Fall back to curated local database
    return this.getLocalLocation(difficulty);
  }
}

// Pre-verified data
const LOCATIONS = [
  {
    name: "Paris, France",
    imageUrl: "verified-image-url",
    difficulty: "EASY",
    hints: ["European capital", "Eiffel Tower"]
  }
];
```

## Final Implementation Checklist

When implementing a new game, follow this checklist:

### Phase 1: Planning
- [ ] Define game concept and mechanics
- [ ] Design state interface extending GameState
- [ ] Plan action types and UI interactions
- [ ] Design Discord embed layout
- [ ] Plan AI integration (if needed)

### Phase 2: Core Implementation
- [ ] Create game class extending BaseGame
- [ ] Implement all required abstract methods
- [ ] Create game state interface with arrays (not Sets/Maps)
- [ ] Add action types to types.ts
- [ ] Test core game logic

### Phase 3: Discord Integration
- [ ] Implement render() method with embeds/components
- [ ] Create interaction handler class
- [ ] Register interaction handler
- [ ] Add to GameRegistry static initializer
- [ ] Add to all render lists in GameHandler.ts and game.ts

### Phase 4: AI Integration (if applicable)
- [ ] Create Zod schemas using compatible features only
- [ ] Implement AI flows with structured input/output
- [ ] Add comprehensive fallback systems
- [ ] Test AI failure scenarios

### Phase 5: Testing & Polish
- [ ] Run type-check, lint, linecount
- [ ] Test all interaction patterns
- [ ] Test game start via both methods
- [ ] Test error handling and edge cases
- [ ] Verify state persistence
- [ ] Test concurrent games

### Phase 6: Documentation
- [ ] Add comprehensive file header documentation
- [ ] Document complex game logic
- [ ] Update this guide with new patterns (if any)

---

## Conclusion

This guide captures all the patterns, pitfalls, and solutions learned from implementing the existing game system. Following these patterns will ensure new games integrate seamlessly with the bot's architecture and provide a consistent, high-quality user experience.

**Remember**: The goal is to implement games correctly on the first try by following proven patterns, not to reinvent or "improve" the working system architecture.

---

**Last Updated**: Based on Hangman, TicTacToe, AI Uprising, GeoGuesser, and WordScramble implementations  
**Total Lines**: 500+ comprehensive reference guide