/**
 * @fileoverview Type definitions for the Discord bot game system.
 * 
 * Defines all core types and interfaces used throughout the game system,
 * providing type safety and consistency across all game implementations.
 * Includes comprehensive type definitions for:
 * - Game actions and their payloads for different game types
 * - Game state management with extensible state properties
 * - Game effects for Discord integration (messages, embeds, timeouts)
 * - Game configuration metadata for registration and display
 * - AI Uprising specific action types and state structures
 * 
 * Type Categories:
 * - GameAction: Player actions with userId, type, and payload
 * - GameActionResult: Processing results with state updates and effects
 * - GameEffect: Discord integration effects (messages, game ending, AI moves)
 * - GameState: Base game state with extensible properties
 * - GameConfig: Game metadata for registration and discovery
 * - AI Uprising Types: Complex RPG-specific state and action definitions
 * 
 * These types ensure type safety across the entire game system and provide
 * clear contracts for game implementations and the GameManager.
 */

export interface GameAction {
  userId: string;
  type: 'SUBMIT' | 'JOIN' | 'LEAVE' | 'HINT' | 'QUIT' | 'DIFFICULTY' | AIUprisingActionType | GeoGuesserActionType | HangmanActionType | BlackjackActionType;
  payload?: any;
  timestamp: Date;
}

export type AIUprisingActionType = 
  | 'MOVE' 
  | 'SEARCH' 
  | 'ATTACK' 
  | 'DEFEND' 
  | 'USE_ITEM' 
  | 'EQUIP' 
  | 'UNEQUIP'
  | 'STORY_CHOICE' 
  | 'VIEW_INVENTORY' 
  | 'VIEW_EQUIPMENT' 
  | 'VIEW_QUESTS'
  | 'REST'
  | 'SAVE_GAME'
  | 'SETTINGS';

export type GeoGuesserActionType =
  | 'GUESS'
  | 'NEXT_ROUND'
  | 'SKIP';

export type HangmanActionType = 
  | 'GUESS_LETTER'
  | 'NEW_GAME'
  | 'CATEGORY';

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

export interface GameActionResult {
  newState: GameState;
  effects: GameEffect[];
  success: boolean;
  message?: string;
}

export type GameEffect =
  | { type: 'SEND_MESSAGE'; content: string; isEmbed?: boolean }
  | { type: 'END_GAME'; winnerId?: string; reason: string }
  | { type: 'SCHEDULE_TIMEOUT'; duration: number }
  | { type: 'UPDATE_PARTICIPANTS'; participants: string[] }
  | { type: 'SCHEDULE_AI_MOVE'; delay?: number };

export interface GameState {
  gameType: string;
  isActive: boolean;
  participants: string[];
  createdAt: Date;
  [key: string]: any;
}

export interface GameConfig {
  name: string;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  timeoutMinutes: number;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'WEAPON' | 'ARMOR' | 'ACCESSORY';
  stats: {
    attack?: number;
    defense?: number;
    health?: number;
    energy?: number;
  };
  description: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

// Import the new comprehensive Item type from AI Uprising flows
import type { Item } from '../ai-uprising/flows/aiUprisingFlows.js';

export type InventoryItem = Item;

export interface Area {
  id: string;
  name: string;
  description: string;
  type: 'SAFE' | 'DANGEROUS' | 'BOSS' | 'SPECIAL';
  exits: Exit[];
  encounters: EncounterChance[];
  discovered: boolean;
}

export interface Exit {
  direction: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'UP' | 'DOWN';
  targetAreaId: string;
  name: string;
  locked: boolean;
  requiredItem?: string;
}

export interface WorldMap {
  currentAreaId: string;
  areas: Record<string, Area>;
}

export interface Enemy {
  id: string;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  abilities: EnemyAbility[];
  description: string;
  aiPersonality: string;
  rewards: {
    experience: number;
    credits: number;
    items: InventoryItem[];
  };
}

export interface EnemyAbility {
  id: string;
  name: string;
  description: string;
  energyCost: number;
  cooldown: number;
  currentCooldown: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  duration: number;
  effect: {
    type: 'DAMAGE' | 'HEAL' | 'BUFF' | 'DEBUFF';
    value: number;
    stat?: 'health' | 'attack' | 'defense' | 'energy';
  };
}

export interface StoryEvent {
  id: string;
  title: string;
  description: string;
  choices: EventChoice[];
  context: string;
}

export interface EventChoice {
  id: string;
  text: string;
  requirements?: {
    level?: number;
    item?: string;
    credits?: number;
  };
  outcome: {
    type: 'STORY' | 'COMBAT' | 'REWARD' | 'TRAVEL';
    data: any;
  };
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  objectives: QuestObjective[];
  rewards: {
    experience: number;
    credits: number;
    items: InventoryItem[];
  };
}

export interface QuestObjective {
  id: string;
  description: string;
  completed: boolean;
  type: 'KILL' | 'COLLECT' | 'EXPLORE' | 'INTERACT';
  target: string;
  current: number;
  required: number;
}

export interface EncounterChance {
  type: 'ENEMY' | 'TREASURE' | 'EVENT';
  chance: number;
  data: any;
}

export interface AIUprisingState extends GameState {
  gamePhase: 'INTRO' | 'EXPLORING' | 'COMBAT' | 'INVENTORY' | 'STORY_EVENT' | 'GAME_OVER';
  storyProgress: number;
  currentArea: string;
  
  player: {
    name: string;
    level: number;
    experience: number;
    experienceToNext: number;
    health: number;
    maxHealth: number;
    energy: number;
    maxEnergy: number;
    credits: number;
  };
  
  equipment: {
    weapon: Equipment | null;
    armor: Equipment | null;
    accessory: Equipment | null;
  };
  
  inventory: {
    items: InventoryItem[];
    maxSlots: number;
  };
  
  world: {
    currentMap: WorldMap;
    exploredAreas: string[];
    availableExits: Exit[];
  };
  
  combat: {
    enemy: Enemy | null;
    playerTurn: boolean;
    combatRound: number;
    playerActions: number;
    statusEffects: StatusEffect[];
  } | null;
  
  story: {
    currentEvent: StoryEvent | null;
    completedEvents: string[];
    activeQuests: Quest[];
    completedQuests: string[];
  };
  
  settings: {
    difficulty: 'EASY' | 'NORMAL' | 'HARD';
    autoSave: boolean;
  };
  
  lastAIContext: {
    seed: string;
    worldState: any;
    lastActionResult?: string;
    currentAction?: string;
  };
}