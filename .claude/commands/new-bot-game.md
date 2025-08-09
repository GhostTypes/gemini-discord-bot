Design a new bot game

You need design and implement the game described by the user: #$ARGUMENTS into the codebase (TypeScript LLM powered discord bot)

## Game System Architecture

The game system is located at src\games:
- **BaseGame.ts** - Abstract base class with required methods
- **GameRegistry.ts** - Game registration and discovery system
- **types.ts** - Core interfaces (GameState, GameAction, GameEffect, GameConfig)
- Individual game implementation files (e.g., TicTacToeGame.ts)

## Critical Implementation Knowledge (Learned from TicTacToe)

### 1. Embed Display System
**CRITICAL**: Use the `__TICTACTOE_EMBED__` pattern for complex games with embeds:
- Return `__GAMENAME_EMBED__${JSON.stringify(embedData)}` in SEND_MESSAGE effects
- This ensures proper embed rendering across ALL start methods (slash commands AND natural language)
- Both CommandService and GameHandler must parse this format

### 2. Message ID Management for AI Moves
**ESSENTIAL for AI opponents**:
- Add `lastMessageId` to GameSession database schema
- Store message ID when first sending game board
- Use stored ID to edit the SAME message for AI moves (not create new ones)
- GameManager needs Discord client access for message editing

### 3. Button Interaction Handling
**For interactive games**:
- Use custom button IDs like `game_row_col` (e.g., `ttt_0_1`)
- CommandService must handle button interactions in `handleButtonInteraction()`
- Use `interaction.deferUpdate()` then `interaction.editReply()` for seamless updates
- Only allow game starter to interact (check `participants` array)

### 4. AI Move Architecture
**For AI-powered games**:
- Create Genkit flow in `src/flows/gameNameAiFlow.ts`
- Use `SCHEDULE_AI_MOVE` effect with delay
- GameManager processes this effect with `setTimeout()`
- AI moves must edit stored message ID, not create new messages

### 5. Dual Start Methods Support
**Games must work from**:
- Slash commands (`/game start gamename`)
- Natural language ("Let's play gamename!")
- Both paths must handle embed parsing identically

### 6. Database Schema Requirements
Add to GameSession model:
```prisma
lastMessageId String? // For message editing during AI moves
```

### 7. Required Game Components

#### BaseGame Implementation:
- `startGame()` - Accept options parameter for game settings
- `processAction()` - Handle all user interactions  
- `validateAction()` - Ensure valid moves/participants
- `checkEndConditions()` - Win/loss/draw detection
- `getDisplayState()` - Text representation for status
- `getEmbedDisplay()` - Rich embed with components (if applicable)

#### GameEffect Types:
- `SEND_MESSAGE` - Display updates (use embed format for complex games)
- `SCHEDULE_AI_MOVE` - Trigger AI processing after delay
- `END_GAME` - Complete game with reason
- `SCHEDULE_TIMEOUT` - Auto-end after inactivity

### 8. Implementation Checklist

**BEFORE starting implementation**:
1. Design complete game state interface
2. Plan all possible user actions and validations  
3. Design embed layout and button interactions
4. Plan AI integration (if applicable)
5. Consider error handling and edge cases

**DURING implementation**:
1. Extend BaseGame with all required methods
2. Create Genkit AI flow (if needed)
3. Add game to GameRegistry
4. Update database schema (if needed)  
5. Test both start methods (slash + natural language)
6. Verify AI moves edit same message

**AFTER implementation**:
1. `npm run type-check` - Ensure compilation
2. `npm run lint` - Code quality  
3. `npm run linecount` - Monitor size
4. Test complete game flow including AI moves

## Design Process

You MUST use the `discord-game-designer` sub-agent for the design phase. The sub-agent will provide comprehensive technical specifications.

Give the sub-agent:
- Detailed game requirements from user
- Any special considerations (multiplayer, AI, complexity)
- Performance or UX constraints
- Integration requirements

Once you have the complete design, present it to the user and await approval before any code changes.

You are expected to be 100% ready to implement flawlessly after design approval.