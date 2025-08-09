/**
 * @fileoverview AI Uprising - Immersive text-based RPG game with AI-powered narrative.
 * 
 * A comprehensive role-playing game where players fight against AI robot overlords
 * in a post-apocalyptic setting. Features dynamic storytelling, combat systems,
 * and progressive character development. Key game systems include:
 * - Dynamic world generation with procedural story events
 * - Turn-based combat with strategic decision-making
 * - Character progression with stats, levels, and equipment
 * - AI-generated loot system with varied items and rarities
 * - Rich Discord embed presentations with interactive buttons
 * - Persistent game state management across sessions
 * 
 * Game Mechanics:
 * - Player stats: Health, Energy, Hacking, Stealth, Charisma
 * - Combat system with strategic choices and consequences
 * - Equipment system with weapons, armor, and consumables
 * - Experience and leveling progression
 * - Story events with meaningful player choices
 * - Dynamic difficulty scaling based on player level
 * 
 * Integration Features:
 * - Discord button interactions for player choices
 * - Rich embed displays with game state visualization
 * - AI-powered content generation for stories, enemies, and loot
 * - Integration with aiUprisingFlows for advanced game logic
 */

import { BaseGame } from '../common/BaseGame.js';
import { DiscordReply } from '../../types/discord.js';
import { 
  GameState, 
  GameAction, 
  GameActionResult, 
  GameConfig, 
  GameEffect,
  AIUprisingState,
  AIUprisingActionType,
  EventChoice,
  StoryEvent,
  Equipment
} from '../common/types.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { worldGenerationFlow, enemyGenerationFlow, combatAIFlow, lootGenerationFlow, storyEventFlow } from './flows/aiUprisingFlows.js';
import { logger } from '../../utils/logger.js';

export class AIUprisingGame extends BaseGame {
  config: GameConfig = {
    name: 'aiuprising',
    displayName: 'AI Uprising',
    description: 'Fight against AI robot overlords in this text-based RPG adventure!',
    minPlayers: 1,
    maxPlayers: 1,
    timeoutMinutes: 30,
  };

  startGame(options: { hostId: string; channelId: string; difficulty?: 'EASY' | 'NORMAL' | 'HARD' }): GameActionResult {
    const difficulty = options.difficulty || 'NORMAL';
    const seed = Math.random().toString(36).substring(2, 15);
    
    const initialState: AIUprisingState = {
      gameType: 'aiuprising',
      isActive: true,
      participants: [options.hostId],
      createdAt: new Date(),
      gamePhase: 'INTRO',
      storyProgress: 0,
      currentArea: 'resistance_base',
      
      player: {
        name: 'Resistance Fighter',
        level: 1,
        experience: 0,
        experienceToNext: 100,
        health: 100,
        maxHealth: 100,
        energy: 50,
        maxEnergy: 50,
        credits: 100,
      },
      
      equipment: {
        weapon: {
          id: 'starter_pistol',
          name: 'Makeshift Pistol',
          type: 'WEAPON',
          stats: { attack: 5 },
          description: 'A crude but effective weapon cobbled together from scrap.',
          rarity: 'COMMON'
        },
        armor: {
          id: 'starter_vest',
          name: 'Scrap Vest',
          type: 'ARMOR',
          stats: { defense: 3 },
          description: 'Basic protection made from salvaged materials.',
          rarity: 'COMMON'
        },
        accessory: null,
      },
      
      inventory: {
        items: [
          {
            id: 'health_stim',
            name: 'Health Stimpack',
            type: 'CONSUMABLE',
            quantity: 3,
            description: 'Restores 25 health points.',
            rarity: 'COMMON',
            usable: true,
            effect: {
              type: 'HEAL_HP',
              value: 25
            }
          },
          {
            id: 'energy_cell',
            name: 'Energy Cell',
            type: 'CONSUMABLE',
            quantity: 2,
            description: 'Restores 20 energy points.',
            rarity: 'COMMON',
            usable: true,
            effect: {
              type: 'RESTORE_ENERGY',
              value: 20
            }
          }
        ],
        maxSlots: 20,
      },
      
      world: {
        currentMap: {
          currentAreaId: 'resistance_base',
          areas: {
            resistance_base: {
              id: 'resistance_base',
              name: 'Resistance Base',
              description: 'The last safe haven for humanity. Flickering screens show surveillance feeds of the outside world.',
              type: 'SAFE',
              exits: [
                {
                  direction: 'NORTH',
                  targetAreaId: 'city_outskirts',
                  name: 'City Outskirts',
                  locked: false
                }
              ],
              encounters: [],
              discovered: true
            }
          }
        },
        exploredAreas: ['resistance_base'],
        availableExits: [
          {
            direction: 'NORTH',
            targetAreaId: 'city_outskirts',
            name: 'City Outskirts',
            locked: false
          }
        ],
      },
      
      combat: null,
      
      story: {
        currentEvent: null,
        completedEvents: [],
        activeQuests: [
          {
            id: 'first_mission',
            title: 'First Strike',
            description: 'Venture into the city outskirts and gather intelligence on AI patrol patterns.',
            objectives: [
              {
                id: 'explore_outskirts',
                description: 'Reach the City Outskirts',
                completed: false,
                type: 'EXPLORE',
                target: 'city_outskirts',
                current: 0,
                required: 1
              }
            ],
            rewards: {
              experience: 50,
              credits: 100,
              items: []
            }
          }
        ],
        completedQuests: [],
      },
      
      settings: {
        difficulty,
        autoSave: true,
      },
      
      lastAIContext: {
        seed,
        worldState: {},
      },
    };

    // const introMessage = this.generateIntroMessage(initialState);
    
    return {
      newState: initialState,
      effects: [],
      success: true,
      message: 'AI Uprising RPG started! The resistance needs you!'
    };
  }

  async processAction(currentState: GameState, action: GameAction): Promise<GameActionResult> {
    const state = currentState as AIUprisingState;
    const actionType = action.type as AIUprisingActionType | 'QUIT';
    
    logger.info('Processing AI Uprising action', { 
      actionType, 
      userId: action.userId, 
      gamePhase: state.gamePhase 
    });

    // Set current action from payload, move previous action to last
    const newState = { 
      ...state,
      lastAIContext: {
        ...state.lastAIContext,
        ...(state.lastAIContext?.currentAction && { lastActionResult: state.lastAIContext.currentAction }),
        ...(action.payload?.currentAction && { currentAction: action.payload.currentAction })
      }
    };

    if (actionType === 'QUIT') {
      return {
        newState: { ...newState, isActive: false },
        effects: [{ type: 'END_GAME', reason: 'Player quit the game' }],
        success: true,
        message: 'Game ended by player'
      };
    }

    switch (newState.gamePhase) {
      case 'INTRO':
        return this.processIntroAction(newState, action);
      case 'EXPLORING':
        return await this.processExplorationAction(newState, action);
      case 'COMBAT':
        return await this.processCombatAction(newState, action);
      case 'INVENTORY':
        return this.processInventoryAction(newState, action);
      case 'STORY_EVENT':
        return this.processStoryEventAction(newState, action);
      case 'GAME_OVER':
        return this.processGameOverAction(newState, action);
      default:
        return {
          newState: newState,
          effects: [],
          success: false
        };
    }
  }

  validateAction(currentState: GameState, action: GameAction): boolean {
    const state = currentState as AIUprisingState;
    
    if (!state.participants.includes(action.userId)) {
      return false;
    }

    if (!state.isActive) {
      return false;
    }

    return true;
  }

  checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string } {
    const state = currentState as AIUprisingState;
    
    if (state.gamePhase === 'GAME_OVER') {
      return { shouldEnd: true, winnerId: state.participants[0], reason: 'Game completed' };
    }
    
    if (state.player.health <= 0) {
      return { shouldEnd: true, reason: 'Player defeated' };
    }
    
    if (state.storyProgress >= 100) {
      return { shouldEnd: true, winnerId: state.participants[0], reason: 'Victory! AI uprising defeated!' };
    }
    
    return { shouldEnd: false };
  }

  getDisplayState(currentState: GameState): string {
    const state = currentState as AIUprisingState;
    return `AI Uprising - ${state.gamePhase} - ${state.currentArea} - Level ${state.player.level}`;
  }

  getAvailableActions(currentState: GameState): string[] {
    const state = currentState as AIUprisingState;
    
    switch (state.gamePhase) {
      case 'INTRO':
        return ['Start Adventure'];
      case 'EXPLORING':
        return ['Move', 'Search', 'Inventory', 'Rest', 'Quests'];
      case 'COMBAT':
        return ['Attack', 'Defend', 'Use Item', 'Flee'];
      case 'INVENTORY':
        return ['Use Item', 'Equip', 'Back'];
      case 'STORY_EVENT':
        return ['Make Choice'];
      default:
        return [];
    }
  }

  private processIntroAction(state: AIUprisingState, action: GameAction): GameActionResult {
    if (action.type === 'SUBMIT' && action.payload?.customId === 'aiuprising_start_adventure') {
      const newState = { 
        ...state, 
        gamePhase: 'EXPLORING' as const 
      };
      
      return {
        newState,
        effects: [],
        success: true,
        message: 'Adventure begins!'
      };
    }
    
    return {
      newState: state,
      effects: [],
      success: false
    };
  }

  private async processExplorationAction(state: AIUprisingState, action: GameAction): Promise<GameActionResult> {
    if (action.type !== 'SUBMIT' || !action.payload?.customId) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    const customId = action.payload.customId as string;
    
    if (customId.startsWith('aiuprising_move_')) {
      const direction = customId.replace('aiuprising_move_', '').toUpperCase();
      return await this.processMovement(state, { ...action, payload: { direction } });
    }
    
    switch (customId) {
      case 'aiuprising_search':
        return await this.processSearch(state, action);
      case 'aiuprising_inventory':
        return this.showInventory(state);
      case 'aiuprising_rest':
        return this.processRest(state);
      default:
        return {
          newState: state,
          effects: [],
          success: false
        };
    }
  }

  private async processCombatAction(state: AIUprisingState, action: GameAction): Promise<GameActionResult> {
    if (!state.combat || !state.combat.enemy) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    if (action.type !== 'SUBMIT' || !action.payload?.customId) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    const customId = action.payload.customId as string;
    let newState = { ...state };
    const effects: GameEffect[] = [];
    let message = '';

    // Process player action
    switch (customId) {
      case 'aiuprising_attack': {
        const result = await this.processPlayerAttack(newState);
        newState = result.newState;
        message = result.message;
        break;
      }
        
      case 'aiuprising_defend':
        newState = this.processPlayerDefend(newState);
        message = 'You raise your guard, reducing incoming damage.';
        break;
        
      case 'aiuprising_use_item':
        // For now, show inventory in combat
        newState.gamePhase = 'INVENTORY';
        return {
          newState,
          effects: [],
          success: true,
          message: 'Choose an item to use'
        };
        
      case 'aiuprising_flee': {
        const fleeResult = this.processPlayerFlee(newState);
        if (fleeResult.success) {
          return fleeResult;
        }
        newState = fleeResult.newState as AIUprisingState;
        message = fleeResult.message || 'Failed to flee!';
        break;
      }
        
      default:
        return {
          newState: state,
          effects: [],
          success: false
        };
    }

    // Check if enemy is defeated
    if (newState.combat && newState.combat.enemy && newState.combat.enemy.health <= 0) {
      return await this.handleCombatVictory(newState);
    }

    // Check if player is defeated
    if (newState.player.health <= 0) {
      return this.handleCombatDefeat(newState);
    }

    // Process AI turn if combat continues
    if (newState.combat && newState.combat.enemy) {
      const aiResult = await this.processEnemyTurn(newState);
      newState = aiResult.newState;
      message += aiResult.message ? ` ${aiResult.message}` : '';
    }

    // Check again if player is defeated after AI turn
    if (newState.player.health <= 0) {
      return this.handleCombatDefeat(newState);
    }

    // Presentation is now handled by render system

    return {
      newState,
      effects,
      success: true,
      message
    };
  }

  private processInventoryAction(state: AIUprisingState, action: GameAction): GameActionResult {
    if (action.type !== 'SUBMIT' || !action.payload?.customId) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    const customId = action.payload.customId as string;
    
    if (customId === 'aiuprising_back_to_exploring') {
      // Determine which phase to return to (could be combat or exploring)
      const previousPhase = state.combat ? 'COMBAT' : 'EXPLORING';
      const backState = { ...state, gamePhase: previousPhase as 'COMBAT' | 'EXPLORING' };
      return {
        newState: backState,
        effects: [],
        success: true
      };
    }
    
    if (customId.startsWith('aiuprising_use_')) {
      const itemId = customId.replace('aiuprising_use_', '');
      return this.useItem(state, itemId);
    }
    
    return {
      newState: state,
      effects: [],
      success: false
    };
  }

  private processStoryEventAction(state: AIUprisingState, action: GameAction): GameActionResult {
    if (!state.story.currentEvent) {
      return {
        newState: { ...state, gamePhase: 'EXPLORING' },
        effects: [],
        success: true
      };
    }

    const choiceId = action.payload?.customId?.replace('aiuprising_story_choice_', '');
    const selectedChoice = state.story.currentEvent.choices.find(choice => choice.id === choiceId);
    
    if (!selectedChoice) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    // Check if player meets choice requirements
    if (!this.meetsChoiceRequirements(state, selectedChoice)) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    const newState: AIUprisingState = {
      ...state,
      gamePhase: 'EXPLORING',
      story: {
        ...state.story,
        currentEvent: null,
        completedEvents: [...state.story.completedEvents, state.story.currentEvent.id]
      }
    };

    // Deduct requirements costs
    if (selectedChoice.requirements) {
      if (selectedChoice.requirements.credits) {
        newState.player.credits -= selectedChoice.requirements.credits;
      }
      if (selectedChoice.requirements.item) {
        // Remove the required item from inventory
        const itemIndex = newState.inventory.items.findIndex(item => item.id === selectedChoice.requirements!.item);
        if (itemIndex !== -1) {
          newState.inventory.items[itemIndex].quantity -= 1;
          if (newState.inventory.items[itemIndex].quantity <= 0) {
            newState.inventory.items.splice(itemIndex, 1);
          }
        }
      }
    }

    // Apply choice consequences
    const outcome = selectedChoice.outcome;
    let resultMessage = `You chose: ${selectedChoice.text}`;

    switch (outcome.type) {
      case 'STORY':
        if (outcome.data.gameOver) {
          newState.gamePhase = 'GAME_OVER';
          resultMessage += ` Thank you for playing AI Uprising! Your heroic journey has come to an end.`;
        }
        if (outcome.data.storyProgress) {
          newState.storyProgress = Math.min(100, newState.storyProgress + outcome.data.storyProgress);
          resultMessage += ` Story progress increased!`;
        }
        if (outcome.data.credits) {
          newState.player.credits += outcome.data.credits;
          resultMessage += ` Gained ${outcome.data.credits} credits!`;
        }
        if (outcome.data.experience) {
          newState.player.experience += outcome.data.experience;
          resultMessage += ` Gained ${outcome.data.experience} XP!`;
        }
        break;
        
      case 'REWARD':
        if (outcome.data.experience) {
          newState.player.experience += outcome.data.experience;
          resultMessage += ` Gained ${outcome.data.experience} XP!`;
        }
        if (outcome.data.credits) {
          newState.player.credits += outcome.data.credits;
          resultMessage += ` Gained ${outcome.data.credits} credits!`;
        }
        break;
        
      case 'COMBAT':
        // Could trigger specific combat encounter
        resultMessage += ` A battle begins!`;
        break;
        
      case 'TRAVEL':
        // Could move to specific area
        resultMessage += ` You are transported to a new location!`;
        break;
    }

    newState.lastAIContext = {
      ...newState.lastAIContext,
      lastActionResult: `📖 ${resultMessage}`
    };

    return {
      newState,
      effects: [],
      success: true,
      message: resultMessage
    };
  }

  private processGameOverAction(state: AIUprisingState, action: GameAction): GameActionResult {
    // Handle any final game over actions like restart/new game
    console.log('Game over action received:', action.type, action.payload);
    return {
      newState: state,
      effects: [{ type: 'END_GAME', reason: 'Game over' }],
      success: true
    };
  }

  private async processMovement(state: AIUprisingState, action: GameAction): Promise<GameActionResult> {
    const direction = action.payload?.direction;
    const availableExit = state.world.availableExits.find(exit => exit.direction === direction);
    
    if (!availableExit) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }
    
    if (availableExit.locked && availableExit.requiredItem) {
      const hasKey = state.inventory.items.some(item => item.id === availableExit.requiredItem);
      if (!hasKey) {
        return {
          newState: state,
          effects: [],
          success: false
        };
      }
    }

    // Check if we need to generate a new area
    const targetAreaId = availableExit.targetAreaId;
    const newState = { ...state };
    
    if (!newState.world.currentMap.areas[targetAreaId]) {
      // Generate new area using AI
      try {
        const generationResult = await worldGenerationFlow({
          currentArea: state.currentArea,
          playerLevel: state.player.level,
          storyProgress: state.storyProgress,
          exploredAreas: state.world.exploredAreas,
          direction,
          seed: state.lastAIContext.seed
        });

        // Add the new area to the world
        const generatedArea = generationResult.newArea;
        const newArea = {
          id: targetAreaId,
          name: generatedArea.name,
          description: generatedArea.description,
          type: generatedArea.type,
          exits: generatedArea.exits.map(exit => ({
            direction: exit.direction,
            targetAreaId: exit.targetAreaId,
            name: exit.name,
            locked: exit.locked,
            ...(exit.requiredItem && { requiredItem: exit.requiredItem })
          })),
          encounters: generatedArea.encounters.map(encounter => ({
            type: encounter.type,
            chance: encounter.chance,
            data: encounter.data || {}
          })),
          discovered: true
        };
        
        newState.world.currentMap.areas[targetAreaId] = newArea;
        newState.world.exploredAreas.push(targetAreaId);
        
      } catch (error) {
        logger.error('Failed to generate new area', error);
        // Fallback to a simple area
        newState.world.currentMap.areas[targetAreaId] = {
          id: targetAreaId,
          name: `Unknown Sector`,
          description: 'A mysterious area shrouded in darkness.',
          type: 'DANGEROUS',
          exits: [
            {
              direction: this.getOppositeDirection(direction),
              targetAreaId: state.currentArea,
              name: 'Back',
              locked: false
            }
          ],
          encounters: [{ type: 'ENEMY', chance: 50, data: {} }],
          discovered: true
        };
      }
    }

    // Move to the new area
    newState.currentArea = targetAreaId;
    newState.world.currentMap.currentAreaId = targetAreaId;
    
    // Update available exits
    const currentArea = newState.world.currentMap.areas[targetAreaId];
    newState.world.availableExits = currentArea.exits;
    
    // Set movement result message and move current action to last
    newState.lastAIContext = {
      ...newState.lastAIContext,
      ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
      currentAction: `🚶 You move ${direction.toLowerCase()} to ${currentArea.name}.`
    };
    
    // Increase story progress slightly
    newState.storyProgress = Math.min(100, newState.storyProgress + 2);

    // Check for story milestones before encounters
    const storyCheckedState = await this.checkStoryMilestones(newState);
    if (storyCheckedState.gamePhase === 'STORY_EVENT') {
      return {
        newState: storyCheckedState,
        effects: [],
        success: true,
        message: `You move ${direction} to ${currentArea.name}`
      };
    }

    // Update newState to story-checked version
    Object.assign(newState, storyCheckedState);

    // Check for encounters when entering the area
    const encounterRoll = Math.random() * 100;
    
    // Enemy encounters (higher chance in dangerous areas)
    const enemyEncounter = currentArea.encounters.find(enc => enc.type === 'ENEMY');
    if (enemyEncounter) {
      let encounterChance = enemyEncounter.chance;
      
      // Increase encounter chance based on area type
      if (currentArea.type === 'DANGEROUS') {encounterChance += 15;}
      if (currentArea.type === 'BOSS') {encounterChance += 25;}
      if (currentArea.type === 'SPECIAL') {encounterChance += 10;}
      
      if (encounterRoll < encounterChance) {
        // Trigger combat encounter immediately
        newState.lastAIContext.lastActionResult += ` A hostile presence emerges!`;
        return await this.initiateCombat(newState);
      }
    }
    
    // Treasure encounters (lower chance, but automatic)
    const treasureEncounter = currentArea.encounters.find(enc => enc.type === 'TREASURE');
    if (treasureEncounter && encounterRoll < (enemyEncounter?.chance || 0) + treasureEncounter.chance) {
      // Generate treasure loot
      try {
        const treasureLoot = await lootGenerationFlow({
          playerLevel: newState.player.level,
          areaType: currentArea.type,
          lootType: 'TREASURE_CHEST',
          difficulty: newState.settings.difficulty,
          seed: newState.lastAIContext.seed
        });
        
        // Process loot with auto-equip
        const lootResult = this.processLootWithAutoEquip(
          newState, 
          treasureLoot.items || [], 
          treasureLoot.credits, 
          treasureLoot.experience, 
          treasureLoot.description
        );
        Object.assign(newState, lootResult.newState);
        
        // Check for level up
        if (newState.player.experience >= newState.player.experienceToNext) {
          const levelsGained = Math.floor(newState.player.experience / newState.player.experienceToNext);
          newState.player.level += levelsGained;
          newState.player.experience = newState.player.experience % newState.player.experienceToNext;
          newState.player.experienceToNext = newState.player.level * 100;
          
          // Increase stats on level up
          newState.player.maxHealth += levelsGained * 10;
          newState.player.health = newState.player.maxHealth; // Full heal on level up
          newState.player.maxEnergy += levelsGained * 5;
          newState.player.energy = newState.player.maxEnergy;
        }
        
        const levelUpMessage = newState.player.level > state.player.level ? ` LEVEL UP to ${newState.player.level}!` : '';
        newState.lastAIContext.lastActionResult += ` ${lootResult.lootMessage}${levelUpMessage}`;
        
      } catch (error) {
        logger.warn('Failed to generate treasure loot, using basic rewards', { error });
        // Fallback to basic rewards
        const creditsFound = Math.floor(Math.random() * 25) + 15;
        const xpGained = Math.floor(Math.random() * 8) + 3;
        
        newState.player.credits += creditsFound;
        newState.player.experience += xpGained;
        newState.lastAIContext.lastActionResult += ` 💰 You found ${creditsFound} credits and ${xpGained} XP while exploring!`;
      }
    }

    return {
      newState,
      effects: [],
      success: true,
      message: `You move ${direction} to ${currentArea.name}`
    };
  }

  private getOppositeDirection(direction: string): 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'UP' | 'DOWN' {
    const opposites: Record<string, 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'UP' | 'DOWN'> = {
      'NORTH': 'SOUTH',
      'SOUTH': 'NORTH', 
      'EAST': 'WEST',
      'WEST': 'EAST',
      'UP': 'DOWN',
      'DOWN': 'UP'
    };
    return opposites[direction] || 'SOUTH';
  }

  private async checkStoryMilestones(state: AIUprisingState): Promise<AIUprisingState> {
    const currentProgress = state.storyProgress;
    const completedEvents = state.story.completedEvents;
    
    // Define story milestones
    const milestones = [
      { threshold: 25, eventId: 'infiltration_complete', phase: 'Infiltration Phase Complete' },
      { threshold: 50, eventId: 'sabotage_opportunity', phase: 'Sabotage Mission Available' },
      { threshold: 75, eventId: 'final_assault_prep', phase: 'Final Assault Preparation' },
      { threshold: 90, eventId: 'ai_overlord_confrontation', phase: 'AI Overlord Confrontation' },
      { threshold: 100, eventId: 'final_victory', phase: 'Final Victory' }
    ];
    
    // Check for triggered milestones
    for (const milestone of milestones) {
      if (currentProgress >= milestone.threshold && !completedEvents.includes(milestone.eventId)) {
        // Special handling for final victory
        if (milestone.eventId === 'final_victory') {
          return await this.triggerVictorySequence(state);
        }
        
        try {
          const storyEvent = await storyEventFlow({
            currentArea: state.currentArea,
            playerLevel: state.player.level,
            storyProgress: currentProgress,
            completedEvents: completedEvents,
            recentActions: [], // Could track recent player actions
            seed: state.lastAIContext.seed
          });
          
          // Create new state with story event
          const newState: AIUprisingState = {
            ...state,
            story: {
              ...state.story,
              currentEvent: storyEvent.event as StoryEvent,
              completedEvents: [...completedEvents, milestone.eventId]
            },
            gamePhase: 'STORY_EVENT' as const,
            lastAIContext: {
              ...state.lastAIContext,
              lastActionResult: `📖 ${milestone.phase}: ${storyEvent.event.title}`
            }
          };
          
          return newState;
          
        } catch (error) {
          logger.warn(`Failed to generate story event for milestone ${milestone.eventId}`, { error });
          // Continue without story event
        }
      }
    }
    
    return state;
  }

  private async processSearch(state: AIUprisingState, action: GameAction): Promise<GameActionResult> {
    console.log('Search action received:', action.type, action.payload);
    const currentArea = state.world.currentMap.areas[state.currentArea];
    const newState = { ...state };
    
    if (currentArea.type === 'SAFE') {
      // Safe areas have good reward chances when searched
      if (Math.random() < 0.6) {
        const creditsFound = Math.floor(Math.random() * 30) + 10;
        const xpGained = Math.floor(Math.random() * 12) + 5;
        
        newState.player.credits += creditsFound;
        newState.player.experience += xpGained;
        
        // Check for level up
        if (newState.player.experience >= newState.player.experienceToNext) {
          const levelsGained = Math.floor(newState.player.experience / newState.player.experienceToNext);
          newState.player.level += levelsGained;
          newState.player.experience = newState.player.experience % newState.player.experienceToNext;
          newState.player.experienceToNext = newState.player.level * 100;
          
          // Increase stats on level up
          newState.player.maxHealth += levelsGained * 10;
          newState.player.health = newState.player.maxHealth;
          newState.player.maxEnergy += levelsGained * 5;
          newState.player.energy = newState.player.maxEnergy;
          
          newState.lastAIContext = {
            ...newState.lastAIContext,
            ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
            currentAction: `🔍 JACKPOT! You found ${creditsFound} credits and ${xpGained} XP in the safe area! LEVEL UP! Now level ${newState.player.level}!`
          };
        } else {
          newState.lastAIContext = {
            ...newState.lastAIContext,
            ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
            currentAction: `🔍 You found ${creditsFound} credits and ${xpGained} XP hidden in the safe area!`
          };
        }
        
        return {
          newState,
          effects: [],
          success: true
        };
      }
      newState.lastAIContext = {
        ...newState.lastAIContext,
        ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
        currentAction: `🔍 You search the safe area thoroughly but find nothing this time.`
      };
      return {
        newState,
        effects: [],
        success: true
      };
    }
    
    // Generate random search outcome
    const searchRoll = Math.random() * 100;
    
    // Check for combat encounters first (highest priority)
    const combatEncounter = currentArea.encounters.find(enc => enc.type === 'ENEMY');
    if (combatEncounter && searchRoll < combatEncounter.chance) {
      // Trigger combat encounter
      return await this.initiateCombat(state);
    }
    
    // Check for treasure encounters (increase chance by 20% when actively searching)
    const treasureEncounter = currentArea.encounters.find(enc => enc.type === 'TREASURE');
    const bonusTreasureChance = 20; // Active searching bonus
    if (treasureEncounter && searchRoll < (combatEncounter?.chance || 0) + treasureEncounter.chance + bonusTreasureChance) {
      // Generate enhanced search treasure loot
      try {
        const searchLoot = await lootGenerationFlow({
          playerLevel: newState.player.level,
          areaType: currentArea.type,
          lootType: 'SEARCH_RESULT',
          difficulty: newState.settings.difficulty,
          seed: newState.lastAIContext.seed
        });
        
        // Process loot with auto-equip
        const lootResult = this.processLootWithAutoEquip(
          newState, 
          searchLoot.items || [], 
          searchLoot.credits, 
          searchLoot.experience, 
          searchLoot.description
        );
        Object.assign(newState, lootResult.newState);
        
        // Check for level up
        if (newState.player.experience >= newState.player.experienceToNext) {
          const levelsGained = Math.floor(newState.player.experience / newState.player.experienceToNext);
          newState.player.level += levelsGained;
          newState.player.experience = newState.player.experience % newState.player.experienceToNext;
          newState.player.experienceToNext = newState.player.level * 100;
          
          // Increase stats on level up
          newState.player.maxHealth += levelsGained * 10;
          newState.player.health = newState.player.maxHealth; // Full heal on level up
          newState.player.maxEnergy += levelsGained * 5;
          newState.player.energy = newState.player.maxEnergy;
        }
        
        const levelUpMessage = newState.player.level > state.player.level ? ` LEVEL UP to ${newState.player.level}!` : '';
        
        newState.lastAIContext = {
          ...newState.lastAIContext,
          ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
          currentAction: `🔍 ${lootResult.lootMessage}${levelUpMessage}`
        };
        
      } catch (error) {
        logger.warn('Failed to generate search loot, using basic rewards', { error });
        // Fallback to basic rewards
        const creditsFound = Math.floor(Math.random() * 40) + 20;
        const xpGained = Math.floor(Math.random() * 15) + 8;
        
        newState.player.credits += creditsFound;
        newState.player.experience += xpGained;
        
        newState.lastAIContext = {
          ...newState.lastAIContext,
          ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
          currentAction: `💰 TREASURE FOUND! You gained ${creditsFound} credits and ${xpGained} XP!`
        };
      }
      
      return {
        newState,
        effects: [],
        success: true
      };
    }
    
    // No major encounter - but still chance for small rewards
    if (Math.random() < 0.4) {
      // Small consolation reward
      const creditsFound = Math.floor(Math.random() * 15) + 5;
      const xpGained = Math.floor(Math.random() * 5) + 2;
      
      newState.player.credits += creditsFound;
      newState.player.experience += xpGained;
      
      newState.lastAIContext = {
        ...newState.lastAIContext,
        ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
        currentAction: `🔍 You search thoroughly and find some scattered supplies: +${creditsFound} credits, +${xpGained} XP.`
      };
    } else {
      newState.lastAIContext = {
        ...newState.lastAIContext,
        ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
        currentAction: `🔍 You search the area carefully but find nothing of value this time.`
      };
    }
    
    return {
      newState,
      effects: [],
      success: true
    };
  }

  private showInventory(state: AIUprisingState): GameActionResult {
    const inventoryPhase = { ...state, gamePhase: 'INVENTORY' as const };
    
    return {
      newState: inventoryPhase,
      effects: [],
      success: true
    };
  }


  private processRest(state: AIUprisingState): GameActionResult {
    const currentArea = state.world.currentMap.areas[state.currentArea];
    
    if (currentArea.type !== 'SAFE') {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }
    
    const healAmount = Math.floor(state.player.maxHealth * 0.5);
    const energyAmount = Math.floor(state.player.maxEnergy * 0.8);
    
    const newState = {
      ...state,
      player: {
        ...state.player,
        health: Math.min(state.player.maxHealth, state.player.health + healAmount),
        energy: Math.min(state.player.maxEnergy, state.player.energy + energyAmount)
      }
    };
    
    return {
      newState,
      effects: [],
      success: true,
      message: `You rest and recover. Health +${healAmount}, Energy +${energyAmount}`
    };
  }

  private useItem(state: AIUprisingState, itemId: string): GameActionResult {
    const item = state.inventory.items.find(i => i.id === itemId);
    
    if (!item || item.quantity <= 0) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    const newState = { ...state };
    let message = '';

    // Apply item effects
    switch (itemId) {
      case 'health_stim': {
        const healthGain = 25;
        newState.player = {
          ...newState.player,
          health: Math.min(newState.player.maxHealth, newState.player.health + healthGain)
        };
        message = `Used ${item.name}. Health +${healthGain}`;
        break;
      }
      
      case 'energy_cell': {
        const energyGain = 20;
        newState.player = {
          ...newState.player,
          energy: Math.min(newState.player.maxEnergy, newState.player.energy + energyGain)
        };
        message = `Used ${item.name}. Energy +${energyGain}`;
        break;
      }
      
      default:
        return {
          newState: state,
          effects: [],
          success: false
        };
    }

    // Reduce item quantity
    newState.inventory.items = newState.inventory.items.map(i => 
      i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
    );

    // Go back to previous phase after using item
    newState.gamePhase = newState.combat ? 'COMBAT' : 'EXPLORING';

    return {
      newState,
      effects: [],
      success: true,
      message
    };
  }




  private createHealthBar(current: number, max: number): string {
    const percentage = current / max;
    const filledBars = Math.floor(percentage * 10);
    const emptyBars = 10 - filledBars;
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  private createXPBar(current: number, needed: number): string {
    const percentage = current / needed;
    const filledBars = Math.floor(percentage * 8);
    const emptyBars = 8 - filledBars;
    return `(${current}/${needed}) ` + '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  private getAreaColor(areaType: string): number {
    switch (areaType) {
      case 'SAFE': return 0x2ecc71;
      case 'DANGEROUS': return 0xe74c3c;
      case 'BOSS': return 0x8e44ad;
      case 'SPECIAL': return 0xf39c12;
      default: return 0x95a5a6;
    }
  }


  getEmbedDisplay(currentState: GameState): { embeds: any[], components: any[] } {
    const state = currentState as AIUprisingState;
    
    const embed = this.createGameEmbedBuilder(state);
    const components = this.buildGameComponents(state);
    
    return {
      embeds: [embed.toJSON()],
      components: components.map(row => row.toJSON())
    };
  }

  private createGameEmbedBuilder(state: AIUprisingState): EmbedBuilder {
    const currentArea = state.world.currentMap.areas[state.currentArea];
    const healthBar = this.createHealthBar(state.player.health, state.player.maxHealth);
    const energyBar = this.createHealthBar(state.player.energy, state.player.maxEnergy);
    const xpBar = this.createXPBar(state.player.experience, state.player.experienceToNext);
    
    const embed = new EmbedBuilder()
      .setTitle(`🤖 AI Uprising - ${currentArea.name}`)
      .setColor(this.getAreaColor(currentArea.type))
      .setDescription(currentArea.description)
      .addFields(
        {
          name: '❤️ Health',
          value: `${state.player.health}/${state.player.maxHealth} ${healthBar}`,
          inline: true
        },
        {
          name: '⚡ Energy',
          value: `${state.player.energy}/${state.player.maxEnergy} ${energyBar}`,
          inline: true
        },
        {
          name: '💰 Credits',
          value: state.player.credits.toLocaleString(),
          inline: true
        },
        {
          name: '🎯 Level',
          value: `${state.player.level} ${xpBar}`,
          inline: true
        },
        {
          name: '⚔️ Weapon',
          value: state.equipment.weapon ? `${state.equipment.weapon.name} +${state.equipment.weapon.stats.attack || 0}` : 'None',
          inline: true
        },
        {
          name: '🛡️ Armor',
          value: state.equipment.armor ? `${state.equipment.armor.name} +${state.equipment.armor.stats.defense || 0}` : 'None',
          inline: true
        }
      );

    // Add current action if available
    if (state.lastAIContext?.currentAction) {
      embed.addFields({
        name: '🎮 Current Action',
        value: state.lastAIContext.currentAction,
        inline: false
      });
    }

    // Add last action result if available
    if (state.lastAIContext?.lastActionResult && state.lastAIContext.lastActionResult !== state.lastAIContext?.currentAction) {
      embed.addFields({
        name: '📝 Last Action',
        value: state.lastAIContext.lastActionResult,
        inline: false
      });
    }

    if (state.combat && state.combat.enemy) {
      const enemy = state.combat.enemy;
      const enemyHealthBar = this.createHealthBar(enemy.health, enemy.maxHealth);
      
      // Build detailed enemy info
      let enemyInfo = `**${enemy.name}** (Level ${enemy.level})\n`;
      enemyInfo += `Health: ${enemy.health}/${enemy.maxHealth} ${enemyHealthBar}\n`;
      enemyInfo += `Attack: ${enemy.attack} | Defense: ${enemy.defense}\n`;
      
      // Show description if available
      if (enemy.description) {
        enemyInfo += `*${enemy.description}*\n`;
      }
      
      // Show abilities if available
      if (enemy.abilities && enemy.abilities.length > 0) {
        const readyAbilities = enemy.abilities.filter(a => a.currentCooldown === 0);
        const coolingAbilities = enemy.abilities.filter(a => a.currentCooldown > 0);
        
        if (readyAbilities.length > 0) {
          enemyInfo += `Ready: ${readyAbilities.map(a => a.name).join(', ')}\n`;
        }
        if (coolingAbilities.length > 0) {
          enemyInfo += `Cooldown: ${coolingAbilities.map(a => `${a.name} (${a.currentCooldown})`).join(', ')}\n`;
        }
      }
      
      embed.addFields({
        name: '⚔️ Combat',
        value: enemyInfo,
        inline: false
      });
    } else if (state.gamePhase === 'STORY_EVENT' && state.story.currentEvent) {
      embed.setTitle(`📖 ${state.story.currentEvent.title}`)
        .setDescription(state.story.currentEvent.description)
        .addFields({
          name: '🎭 Choose Your Action',
          value: state.story.currentEvent.choices.map((choice, index) => {
            const requirements = choice.requirements ? 
              `\n*(Requires: ${choice.requirements.level ? `Level ${choice.requirements.level}` : ''}${choice.requirements.credits ? ` ${choice.requirements.credits} credits` : ''}${choice.requirements.item ? ` ${choice.requirements.item}` : ''})*` : '';
            return `**${index + 1}.** ${choice.text}${requirements}`;
          }).join('\n\n'),
          inline: false
        });
    } else {
      embed.addFields({
        name: '🧭 Available Exits',
        value: state.world.availableExits.length > 0 
          ? state.world.availableExits.map(exit => `${exit.direction}: ${exit.name}${exit.locked ? ' 🔒' : ''}`).join('\n')
          : 'No exits available',
        inline: false
      });
    }

    embed.setFooter({ 
      text: `Story Progress: ${state.storyProgress}% | Use buttons to take action` 
    });

    return embed;
  }

  private buildGameComponents(state: AIUprisingState): ActionRowBuilder<ButtonBuilder>[] {
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    switch (state.gamePhase) {
      case 'INTRO':
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('aiuprising_start_adventure')
              .setLabel('🚀 Start Adventure')
              .setStyle(ButtonStyle.Primary)
          )
        );
        break;

      case 'EXPLORING': {
        // Movement buttons (first row)
        const movementRow = new ActionRowBuilder<ButtonBuilder>();
        state.world.availableExits.forEach(exit => {
          movementRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`aiuprising_move_${exit.direction.toLowerCase()}`)
              .setLabel(`🧭 ${exit.direction}`)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(exit.locked && !this.hasRequiredItem(state, exit.requiredItem))
          );
        });
        components.push(movementRow);

        // Action buttons (second row)
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('aiuprising_search')
              .setLabel('🔍 Search Area')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('aiuprising_inventory')
              .setLabel('📦 Inventory')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('aiuprising_rest')
              .setLabel('😴 Rest')
              .setStyle(ButtonStyle.Success)
              .setDisabled(state.world.currentMap.areas[state.currentArea].type !== 'SAFE')
          )
        );
        break;
      }

      case 'COMBAT':
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('aiuprising_attack')
              .setLabel('⚔️ Attack')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('aiuprising_defend')
              .setLabel('🛡️ Defend')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('aiuprising_use_item')
              .setLabel('💊 Use Item')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('aiuprising_flee')
              .setLabel('🏃 Flee')
              .setStyle(ButtonStyle.Secondary)
          )
        );
        break;

      case 'INVENTORY': {
        const healthItems = state.inventory.items.filter(item => item.type === 'CONSUMABLE' && item.quantity > 0);
        const inventoryRow = new ActionRowBuilder<ButtonBuilder>();
        
        healthItems.slice(0, 4).forEach(item => {
          inventoryRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`aiuprising_use_${item.id}`)
              .setLabel(`${item.name} (${item.quantity})`)
              .setStyle(ButtonStyle.Success)
          );
        });
        
        inventoryRow.addComponents(
          new ButtonBuilder()
            .setCustomId('aiuprising_back_to_exploring')
            .setLabel('↩️ Back')
            .setStyle(ButtonStyle.Secondary)
        );
        
        components.push(inventoryRow);
        break;
      }

      case 'STORY_EVENT': {
        if (state.story.currentEvent) {
          const choiceRow = new ActionRowBuilder<ButtonBuilder>();
          
          // Add up to 4 choices per row (Discord's limit)
          state.story.currentEvent.choices.slice(0, 4).forEach(choice => {
            // Check if player meets requirements
            const meetsRequirements = this.meetsChoiceRequirements(state, choice);
            
            choiceRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`aiuprising_story_choice_${choice.id}`)
                .setLabel(choice.text)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!meetsRequirements)
            );
          });
          
          components.push(choiceRow);
          
          // If there are more than 4 choices, add a second row
          if (state.story.currentEvent.choices.length > 4) {
            const secondRow = new ActionRowBuilder<ButtonBuilder>();
            state.story.currentEvent.choices.slice(4, 8).forEach(choice => {
              const meetsRequirements = this.meetsChoiceRequirements(state, choice);
              
              secondRow.addComponents(
                new ButtonBuilder()
                  .setCustomId(`aiuprising_story_choice_${choice.id}`)
                  .setLabel(choice.text)
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(!meetsRequirements)
              );
            });
            components.push(secondRow);
          }
        }
        break;
      }

      case 'GAME_OVER':
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('aiuprising_quit')
              .setLabel('👋 End Game')
              .setStyle(ButtonStyle.Secondary)
          )
        );
        break;
    }

    return components;
  }

  private hasRequiredItem(state: AIUprisingState, requiredItem?: string): boolean {
    if (!requiredItem) {return true;}
    return state.inventory.items.some(item => item.id === requiredItem);
  }

  private meetsChoiceRequirements(state: AIUprisingState, choice: EventChoice): boolean {
    if (!choice.requirements) {
      return true;
    }

    const req = choice.requirements;

    // Check level requirement
    if (req.level && state.player.level < req.level) {
      return false;
    }

    // Check credits requirement
    if (req.credits && state.player.credits < req.credits) {
      return false;
    }

    // Check item requirement
    if (req.item && !this.hasRequiredItem(state, req.item)) {
      return false;
    }

    return true;
  }

  private calculateEquipmentPower(equipment: Equipment): number {
    const stats = equipment.stats;
    return (stats.attack || 0) + (stats.defense || 0) + (stats.health || 0) + (stats.energy || 0);
  }

  private isEquipmentUpgrade(newEquipment: Equipment, currentEquipment: Equipment | null): boolean {
    if (!currentEquipment) {return true;}
    
    const newPower = this.calculateEquipmentPower(newEquipment);
    const currentPower = this.calculateEquipmentPower(currentEquipment);
    
    return newPower > currentPower;
  }

  private autoEquipItem(state: AIUprisingState, equipment: Equipment): { newState: AIUprisingState; wasUpgrade: boolean; replacedItem?: Equipment | null } {
    const equipSlot = equipment.type === 'WEAPON' ? 'weapon' : 
                     equipment.type === 'ARMOR' ? 'armor' : 'accessory';
    
    const currentEquipment = state.equipment[equipSlot];
    const isUpgrade = this.isEquipmentUpgrade(equipment, currentEquipment);
    
    if (isUpgrade) {
      const newState: AIUprisingState = {
        ...state,
        equipment: {
          ...state.equipment,
          [equipSlot]: equipment
        }
      };
      
      // Add replaced item back to inventory if there was one
      if (currentEquipment) {
        const replacedAsInventoryItem = {
          id: currentEquipment.id,
          name: currentEquipment.name,
          type: 'MATERIAL' as const,
          quantity: 1,
          description: currentEquipment.description,
          rarity: currentEquipment.rarity,
          usable: false as const,
          category: 'TECH' as const
        };
        
        newState.inventory.items.push(replacedAsInventoryItem);
      }
      
      return { newState, wasUpgrade: true, replacedItem: currentEquipment };
    }
    
    // Not an upgrade, add to inventory  
    const inventoryItem = {
      id: equipment.id,
      name: equipment.name,
      type: 'MATERIAL' as const,
      quantity: 1,
      description: equipment.description,
      rarity: equipment.rarity,
      usable: false as const,
      category: 'TECH' as const
    };
    
    const newState: AIUprisingState = {
      ...state,
      inventory: {
        ...state.inventory,
        items: [...state.inventory.items, inventoryItem]
      }
    };
    
    return { newState, wasUpgrade: false };
  }

  private processLootWithAutoEquip(state: AIUprisingState, lootItems: any[], credits: number, experience: number, lootDescription: string): { 
    newState: AIUprisingState; 
    equipmentUpgrades: string[];
    lootMessage: string;
  } {
    let currentState = { ...state };
    const equipmentUpgrades: string[] = [];
    
    // Apply credits and experience
    currentState.player.credits += credits;
    currentState.player.experience += experience;
    
    // Process each loot item
    for (const item of lootItems) {
      logger.info('Processing loot item', { 
        itemId: item.id, 
        itemName: item.name, 
        itemType: item.type,
        hasStats: !!item.stats,
        hasEffect: !!item.effect
      });
      
      // Check if item is equipment (has type WEAPON, ARMOR, or ACCESSORY and stats property)
      if (item.stats && (item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY')) {
        // This is equipment, try to auto-equip
        // Convert loot stats format to equipment stats format
        const equipmentStats: any = { ...item.stats };
        
        // Map weapon stats: damage -> attack, defenseRating -> defense
        if (item.type === 'WEAPON' && item.stats.damage) {
          equipmentStats.attack = item.stats.damage;
        }
        if (item.type === 'ARMOR' && item.stats.defenseRating) {
          equipmentStats.defense = item.stats.defenseRating;
        }
        
        const equipment: Equipment = {
          id: item.id,
          name: item.name,
          type: item.type,
          stats: equipmentStats,
          description: item.description,
          rarity: item.rarity || 'COMMON'
        };
        
        const equipResult = this.autoEquipItem(currentState, equipment);
        currentState = equipResult.newState;
        
        if (equipResult.wasUpgrade) {
          const powerIncrease = this.calculateEquipmentPower(equipment) - (equipResult.replacedItem ? this.calculateEquipmentPower(equipResult.replacedItem) : 0);
          equipmentUpgrades.push(`🔧 Auto-equipped ${equipment.name} (+${powerIncrease} power)${equipResult.replacedItem ? ` (replaced ${equipResult.replacedItem.name})` : ''}`);
        } else {
          equipmentUpgrades.push(`📦 Added ${equipment.name} to inventory (not an upgrade)`);
        }
      } else {
        // Regular inventory item - handle stacking for consumables
        const existingItem = currentState.inventory.items.find(invItem => invItem.id === item.id);
        if (existingItem && item.type === 'CONSUMABLE' && existingItem.type === 'CONSUMABLE') {
          // Stack consumables with same ID
          existingItem.quantity += item.quantity || 1;
          equipmentUpgrades.push(`📦 Added ${item.name} x${item.quantity || 1} (stacked)`);
        } else {
          // Add new item to inventory if there's space
          if (currentState.inventory.items.length < currentState.inventory.maxSlots) {
            currentState.inventory.items.push(item);
            equipmentUpgrades.push(`📦 Added ${item.name} x${item.quantity || 1} to inventory`);
          } else {
            equipmentUpgrades.push(`❌ Inventory full! Couldn't add ${item.name}`);
          }
        }
      }
    }
    
    // Create comprehensive loot message
    let lootMessage = lootDescription;
    if (credits > 0) {lootMessage += ` +${credits} credits!`;}
    if (experience > 0) {lootMessage += ` +${experience} XP!`;}
    if (equipmentUpgrades.length > 0) {
      lootMessage += `\n${equipmentUpgrades.join('\n')}`;
    }
    
    return { newState: currentState, equipmentUpgrades, lootMessage };
  }

  private async triggerVictorySequence(state: AIUprisingState): Promise<AIUprisingState> {
    // Create final victory story event
    try {
      const victoryEvent = await storyEventFlow({
        currentArea: state.currentArea,
        playerLevel: state.player.level,
        storyProgress: 100,
        completedEvents: state.story.completedEvents,
        recentActions: ['FINAL_VICTORY'],
        seed: state.lastAIContext.seed
      });

      return {
        ...state,
        gamePhase: 'STORY_EVENT' as const,
        story: {
          ...state.story,
          currentEvent: {
            ...victoryEvent.event,
            title: "🏆 Victory: AI Uprising Defeated!",
            description: "After your long struggle, the AI overlords have finally been defeated! The resistance has triumphed, and humanity is free once more. You stand as a hero of the revolution.",
            choices: [
              {
                id: 'celebrate_victory',
                text: '🎉 Celebrate with the resistance',
                outcome: { type: 'STORY', data: { credits: 1000 } }
              },
              {
                id: 'reflect_journey',
                text: '🤔 Reflect on your journey',
                outcome: { type: 'STORY', data: { experience: 500 } }
              },
              {
                id: 'end_game',
                text: '👋 End your adventure',
                outcome: { type: 'STORY', data: { gameOver: true } }
              }
            ]
          } as StoryEvent
        },
        lastAIContext: {
          ...state.lastAIContext,
          lastActionResult: "🏆 VICTORY ACHIEVED! The AI uprising has been defeated!"
        }
      };
    } catch (error) {
      logger.warn('Failed to generate victory event, using fallback', { error });
      
      // Fallback victory event
      return {
        ...state,
        gamePhase: 'STORY_EVENT' as const,
        story: {
          ...state.story,
          currentEvent: {
            id: 'final_victory',
            title: "🏆 Victory: AI Uprising Defeated!",
            description: "After your heroic efforts, the AI overlords have been defeated! The resistance celebrates as humanity reclaims its freedom. You have become a legend among the survivors.",
            choices: [
              {
                id: 'celebrate_victory',
                text: '🎉 Celebrate with the resistance',
                outcome: { type: 'STORY', data: { credits: 1000 } }
              },
              {
                id: 'end_game',
                text: '👋 End your adventure',
                outcome: { type: 'STORY', data: { gameOver: true } }
              }
            ],
            context: 'final_victory'
          } as StoryEvent
        },
        lastAIContext: {
          ...state.lastAIContext,
          lastActionResult: "🏆 VICTORY ACHIEVED! The AI uprising has been defeated!"
        }
      };
    }
  }

  private async initiateCombat(state: AIUprisingState): Promise<GameActionResult> {
    try {
      const currentArea = state.world.currentMap.areas[state.currentArea];
      
      // Generate enemy using AI flow
      const enemyResult = await enemyGenerationFlow({
        playerLevel: state.player.level,
        areaType: currentArea.type,
        storyProgress: state.storyProgress,
        difficulty: state.settings.difficulty,
        areaName: currentArea.name,
        seed: state.lastAIContext.seed
      });

      const newState: AIUprisingState = {
        ...state,
        gamePhase: 'COMBAT',
        combat: {
          enemy: enemyResult.enemy,
          playerTurn: true,
          combatRound: 1,
          playerActions: 0,
          statusEffects: []
        }
      };

      return {
        newState,
        effects: [],
        success: true,
        message: enemyResult.combatIntro
      };
    } catch (error) {
      logger.error('Failed to initiate combat', error);
      return {
        newState: state,
        effects: [],
        success: false
      };
    }
  }

  private async processPlayerAttack(state: AIUprisingState): Promise<{ newState: AIUprisingState; message: string }> {
    if (!state.combat?.enemy) {
      return { newState: state, message: 'No enemy to attack!' };
    }

    // Calculate player attack damage
    const weaponAttack = state.equipment.weapon?.stats.attack || 0;
    const baseDamage = 10 + weaponAttack + Math.floor(state.player.level / 2);
    const variation = Math.floor(baseDamage * 0.3);
    const damage = baseDamage + Math.floor(Math.random() * variation) - Math.floor(variation / 2);
    
    // Apply enemy defense
    const enemyDefense = state.combat.enemy.defense || 0;
    const finalDamage = Math.max(1, damage - Math.floor(enemyDefense / 2));

    const newState = { ...state };
    if (newState.combat && newState.combat.enemy) {
      newState.combat.enemy = {
        ...newState.combat.enemy,
        health: Math.max(0, newState.combat.enemy.health - finalDamage)
      };
      newState.combat.combatRound += 1;
      newState.combat.playerActions += 1;
    }

    const weaponName = state.equipment.weapon?.name || 'weapon';
    return {
      newState,
      message: `You attack with your ${weaponName} for ${finalDamage} damage!`
    };
  }

  private processPlayerDefend(state: AIUprisingState): AIUprisingState {
    const newState = { ...state };
    if (newState.combat) {
      newState.combat.combatRound += 1;
      newState.combat.playerActions += 1;
      // Defending reduces next incoming damage by 50%
      // This would be handled in enemy attack calculation
    }
    return newState;
  }

  private processPlayerFlee(state: AIUprisingState): GameActionResult {
    const fleeChance = Math.random();
    const baseFleeChance = 0.7; // 70% base flee chance
    
    if (fleeChance < baseFleeChance) {
      // Successful flee - return to exploration
      const newState: AIUprisingState = {
        ...state,
        gamePhase: 'EXPLORING',
        combat: null
      };
      
      return {
        newState,
        effects: [],
        success: true,
        message: 'You successfully escape from combat!'
      };
    } else {
      // Failed to flee
      return {
        newState: state,
        effects: [],
        success: false,
        message: 'You try to flee but the enemy blocks your escape!'
      };
    }
  }

  private async processEnemyTurn(state: AIUprisingState): Promise<{ newState: AIUprisingState; message: string }> {
    if (!state.combat?.enemy) {
      return { newState: state, message: '' };
    }

    try {
      // Get available abilities (not on cooldown)
      const availableAbilities = state.combat.enemy.abilities
        .filter(ability => ability.currentCooldown === 0)
        .map(ability => ability.id);

      // Calculate player stats for AI decision making
      const playerStats = {
        level: state.player.level,
        health: state.player.health,
        maxHealth: state.player.maxHealth,
        energy: state.player.energy,
        attack: 10 + (state.equipment.weapon?.stats.attack || 0),
        defense: (state.equipment.armor?.stats.defense || 0)
      };

      // Get recent combat history (simplified)
      const combatHistory = [`Player attacked for damage`, `Enemy at ${state.combat.enemy.health}HP`];

      // Use AI flow to determine enemy action
      const aiDecision = await combatAIFlow({
        enemy: state.combat.enemy,
        playerStats,
        combatRound: state.combat.combatRound,
        combatHistory,
        availableAbilities
      });

      const newState = { ...state };
      let message = aiDecision.flavorText;

      // Apply enemy action
      if (aiDecision.action === 'ATTACK' || aiDecision.action === 'SPECIAL') {
        const damage = aiDecision.damage || state.combat.enemy.attack;
        const armorDefense = state.equipment.armor?.stats.defense || 0;
        const finalDamage = Math.max(1, damage - Math.floor(armorDefense / 2));
        
        newState.player = {
          ...newState.player,
          health: Math.max(0, newState.player.health - finalDamage)
        };
        
        message += ` You take ${finalDamage} damage!`;
      }

      // Update ability cooldowns
      if (newState.combat?.enemy) {
        newState.combat.enemy = {
          ...newState.combat.enemy,
          abilities: newState.combat.enemy.abilities.map(ability => ({
            ...ability,
            currentCooldown: Math.max(0, ability.currentCooldown - 1)
          }))
        };
      }

      return { newState, message };
    } catch (error) {
      logger.error('Enemy AI turn failed, using fallback', error);
      
      // Fallback: simple attack
      const damage = state.combat.enemy.attack;
      const armorDefense = state.equipment.armor?.stats.defense || 0;
      const finalDamage = Math.max(1, damage - Math.floor(armorDefense / 2));
      
      const newState = { ...state };
      newState.player = {
        ...newState.player,
        health: Math.max(0, newState.player.health - finalDamage)
      };
      
      return {
        newState,
        message: `${state.combat.enemy.name} attacks for ${finalDamage} damage!`
      };
    }
  }

  private async handleCombatVictory(state: AIUprisingState): Promise<GameActionResult> {
    if (!state.combat?.enemy) {
      return {
        newState: state,
        effects: [],
        success: false
      };
    }

    const enemy = state.combat.enemy;
    const baseExpGained = enemy.rewards.experience;
    const baseCreditsGained = enemy.rewards.credits;
    
    // Generate additional loot from combat
    let additionalLoot = null;
    try {
      const currentArea = state.world.currentMap.areas[state.currentArea];
      additionalLoot = await lootGenerationFlow({
        playerLevel: state.player.level,
        areaType: currentArea.type,
        lootType: 'COMBAT_REWARD',
        difficulty: state.settings.difficulty,
        seed: state.lastAIContext.seed
      });
    } catch (error) {
      logger.warn('Failed to generate combat loot, using base rewards', { error });
    }

    // Calculate total rewards
    const totalExpGained = baseExpGained + (additionalLoot?.experience || 0);
    const totalCreditsGained = baseCreditsGained + (additionalLoot?.credits || 0);
    const lootItems = additionalLoot?.items || [];
    
    // Start with base state
    let newState: AIUprisingState = {
      ...state,
      gamePhase: 'EXPLORING',
      combat: null,
      storyProgress: Math.min(100, state.storyProgress + 3)
    };
    
    // Process all loot with auto-equip
    const lootDescription = additionalLoot?.description || `Victory rewards from ${enemy.name}`;
    const lootResult = this.processLootWithAutoEquip(
      newState, 
      lootItems, 
      totalCreditsGained, 
      totalExpGained, 
      lootDescription
    );
    newState = lootResult.newState;
    
    // Handle level up stat bonuses after loot processing
    if (newState.player.experience >= newState.player.experienceToNext) {
      const levelsGained = Math.floor(newState.player.experience / newState.player.experienceToNext);
      newState.player.level += levelsGained;
      newState.player.experience = newState.player.experience % newState.player.experienceToNext;
      newState.player.experienceToNext = newState.player.level * 100;
      
      // Level up stat bonuses
      newState.player.maxHealth += levelsGained * 10;
      newState.player.health = newState.player.maxHealth; // Full heal on level up
      newState.player.maxEnergy += levelsGained * 5;
      newState.player.energy = newState.player.maxEnergy;
    }

    // Check for story milestones after combat victory
    const storyCheckedState = await this.checkStoryMilestones(newState);
    if (storyCheckedState.gamePhase === 'STORY_EVENT') {
      return {
        newState: storyCheckedState,
        effects: [],
        success: true,
        message: `Victory! You defeated ${enemy.name}! Story milestone reached!`
      };
    }

    // Update newState to story-checked version
    Object.assign(newState, storyCheckedState);

    // Create victory message
    const levelUpMessage = newState.player.level > state.player.level ? ` 🎉 LEVEL UP to ${newState.player.level}!` : '';
    const victoryMessage = `Victory! You defeated ${enemy.name}! ${lootResult.lootMessage}${levelUpMessage}`;
    
    // Add detailed loot description if available
    newState.lastAIContext = {
      ...newState.lastAIContext,
      ...(newState.lastAIContext?.currentAction && { lastActionResult: newState.lastAIContext.currentAction }),
      currentAction: additionalLoot?.description || `⚔️ ${victoryMessage}`
    };

    return {
      newState,
      effects: [],
      success: true,
      message: victoryMessage
    };
  }

  private handleCombatDefeat(state: AIUprisingState): GameActionResult {
    const newState: AIUprisingState = {
      ...state,
      gamePhase: 'GAME_OVER',
      isActive: false,
      combat: null
    };

    return {
      newState,
      effects: [
        {
          type: 'END_GAME',
          reason: 'Player was defeated in combat'
        }
      ],
      success: true,
      message: 'You have been defeated! The resistance will remember your sacrifice.'
    };
  }

  render(currentState: GameState): DiscordReply {
    const state = currentState as AIUprisingState;
    
    switch (state.gamePhase) {
      case 'INTRO':
        return this.renderIntro(state);
      case 'EXPLORING':
        return this.renderExploring(state);
      case 'COMBAT':
        return this.renderCombat(state);
      case 'STORY_EVENT':
        return this.renderStoryEvent(state);
      case 'INVENTORY':
        return this.renderInventory(state);
      case 'GAME_OVER':
        return this.renderGameOver(state);
      default:
        return this.renderError(state);
    }
  }

  private renderIntro(state: AIUprisingState): DiscordReply {
    const currentArea = state.world.currentMap.areas[state.currentArea];
    
    const embed = new EmbedBuilder()
      .setTitle('🤖 AI Uprising - Welcome to the Resistance')
      .setColor(0x00AE86)
      .setDescription(`Welcome to the resistance, fighter! ${currentArea.description}`)
      .addFields(
        {
          name: '🎯 Your Mission',
          value: 'Fight against the AI overlords and restore humanity\'s freedom!',
          inline: false
        },
        {
          name: '❤️ Health',
          value: `${state.player.health}/${state.player.maxHealth}`,
          inline: true
        },
        {
          name: '⚡ Energy',
          value: `${state.player.energy}/${state.player.maxEnergy}`,
          inline: true
        },
        {
          name: '💰 Credits',
          value: state.player.credits.toLocaleString(),
          inline: true
        }
      )
      .setFooter({ text: 'Click "Start Adventure" to begin your journey!' });

    const components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('aiuprising_start_adventure')
          .setLabel('🚀 Start Adventure')
          .setStyle(ButtonStyle.Primary)
      )
    ];

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private renderExploring(state: AIUprisingState): DiscordReply {
    const currentArea = state.world.currentMap.areas[state.currentArea];
    const healthBar = this.createHealthBar(state.player.health, state.player.maxHealth);
    const energyBar = this.createHealthBar(state.player.energy, state.player.maxEnergy);
    const xpBar = this.createXPBar(state.player.experience, state.player.experienceToNext);
    
    const embed = new EmbedBuilder()
      .setTitle(`🤖 AI Uprising - ${currentArea.name}`)
      .setColor(this.getAreaColor(currentArea.type))
      .setDescription(currentArea.description)
      .addFields(
        {
          name: '❤️ Health',
          value: `${state.player.health}/${state.player.maxHealth} ${healthBar}`,
          inline: true
        },
        {
          name: '⚡ Energy',
          value: `${state.player.energy}/${state.player.maxEnergy} ${energyBar}`,
          inline: true
        },
        {
          name: '💰 Credits',
          value: state.player.credits.toLocaleString(),
          inline: true
        },
        {
          name: '🎯 Level',
          value: `${state.player.level} ${xpBar}`,
          inline: true
        },
        {
          name: '⚔️ Weapon',
          value: state.equipment.weapon ? `${state.equipment.weapon.name} +${state.equipment.weapon.stats.attack || 0}` : 'None',
          inline: true
        },
        {
          name: '🛡️ Armor',
          value: state.equipment.armor ? `${state.equipment.armor.name} +${state.equipment.armor.stats.defense || 0}` : 'None',
          inline: true
        }
      );

    // Add current action if available (what you're doing now)
    if (state.lastAIContext?.currentAction) {
      embed.addFields({
        name: '🎮 Current Action',
        value: state.lastAIContext.currentAction,
        inline: false
      });
    }

    // Add last action result if different from current action (what just happened)
    if (state.lastAIContext?.lastActionResult && state.lastAIContext.lastActionResult !== state.lastAIContext?.currentAction) {
      embed.addFields({
        name: '📝 Last Action',
        value: state.lastAIContext.lastActionResult,
        inline: false
      });
    }

    embed.setFooter({ text: 'Choose your next action to continue exploring!' });

    const components = this.buildExploringComponents(state);

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private renderCombat(state: AIUprisingState): DiscordReply {
    if (!state.combat?.enemy) {
      return this.renderError(state);
    }

    const enemy = state.combat.enemy;
    const currentArea = state.world.currentMap.areas[state.currentArea];
    const healthBar = this.createHealthBar(state.player.health, state.player.maxHealth);
    const energyBar = this.createHealthBar(state.player.energy, state.player.maxEnergy);
    const enemyHealthBar = this.createHealthBar(enemy.health, enemy.maxHealth);
    
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Combat - ${currentArea.name}`)
      .setColor(0xFF4444)
      .setDescription(`You face **${enemy.name}** in deadly combat!`)
      .addFields(
        {
          name: '❤️ Your Health',
          value: `${state.player.health}/${state.player.maxHealth} ${healthBar}`,
          inline: true
        },
        {
          name: '⚡ Your Energy',
          value: `${state.player.energy}/${state.player.maxEnergy} ${energyBar}`,
          inline: true
        },
        {
          name: '🎯 Combat Round',
          value: `${state.combat.combatRound}`,
          inline: true
        },
        {
          name: `🤖 ${enemy.name} (Level ${enemy.level})`,
          value: `Health: ${enemy.health}/${enemy.maxHealth} ${enemyHealthBar}\nAttack: ${enemy.attack} | Defense: ${enemy.defense}`,
          inline: false
        }
      );

    // Add enemy description if available
    if (enemy.description) {
      embed.addFields({
        name: '👁️ Enemy Info',
        value: enemy.description,
        inline: false
      });
    }

    // Add current action if available (what you're doing now)
    if (state.lastAIContext?.currentAction) {
      embed.addFields({
        name: '🎮 Current Action',
        value: state.lastAIContext.currentAction,
        inline: false
      });
    }

    // Add last action result if different from current action (what just happened)
    if (state.lastAIContext?.lastActionResult && state.lastAIContext.lastActionResult !== state.lastAIContext?.currentAction) {
      embed.addFields({
        name: '📝 Last Action',
        value: state.lastAIContext.lastActionResult,
        inline: false
      });
    }

    embed.setFooter({ text: 'Choose your combat action!' });

    const components = this.buildCombatComponents(state);

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private renderStoryEvent(state: AIUprisingState): DiscordReply {
    if (!state.story?.currentEvent) {
      return this.renderError(state);
    }

    const event = state.story.currentEvent;
    
    const embed = new EmbedBuilder()
      .setTitle(`📖 ${event.title}`)
      .setColor(0x9966CC)
      .setDescription(event.description)
      .addFields(
        {
          name: '❤️ Health',
          value: `${state.player.health}/${state.player.maxHealth}`,
          inline: true
        },
        {
          name: '💰 Credits',
          value: state.player.credits.toLocaleString(),
          inline: true
        },
        {
          name: '🎯 Level',
          value: `${state.player.level}`,
          inline: true
        }
      )
      .setFooter({ text: 'Choose your response to this story event!' });

    const components = this.buildStoryEventComponents(state);

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private renderInventory(state: AIUprisingState): DiscordReply {
    const embed = new EmbedBuilder()
      .setTitle('📦 Inventory Management')
      .setColor(0x00AA00)
      .setDescription('Manage your items and equipment')
      .addFields(
        {
          name: '❤️ Health',
          value: `${state.player.health}/${state.player.maxHealth}`,
          inline: true
        },
        {
          name: '⚡ Energy',
          value: `${state.player.energy}/${state.player.maxEnergy}`,
          inline: true
        },
        {
          name: '💰 Credits',
          value: state.player.credits.toLocaleString(),
          inline: true
        }
      );

    // Add equipped items
    const equippedItems = [];
    if (state.equipment.weapon) {
      equippedItems.push(`⚔️ ${state.equipment.weapon.name} (+${state.equipment.weapon.stats.attack || 0} Attack)`);
    }
    if (state.equipment.armor) {
      equippedItems.push(`🛡️ ${state.equipment.armor.name} (+${state.equipment.armor.stats.defense || 0} Defense)`);
    }
    if (state.equipment.accessory) {
      equippedItems.push(`💍 ${state.equipment.accessory.name}`);
    }
    
    if (equippedItems.length > 0) {
      embed.addFields({
        name: '🎽 Equipped Items',
        value: equippedItems.join('\n'),
        inline: false
      });
    }

    // Add inventory items
    if (state.inventory.items.length > 0) {
      const itemList = state.inventory.items
        .filter(item => item.quantity > 0)
        .map(item => `${item.name} (${item.quantity})`)
        .slice(0, 10)
        .join('\n');
      
      embed.addFields({
        name: '🎒 Items',
        value: itemList || 'No usable items',
        inline: false
      });
    } else {
      embed.addFields({
        name: '🎒 Items',
        value: 'No items in inventory',
        inline: false
      });
    }

    embed.setFooter({ text: 'Click an item to use it, or go back to exploring!' });

    const components = this.buildInventoryComponents(state);

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private renderGameOver(state: AIUprisingState): DiscordReply {
    const embed = new EmbedBuilder()
      .setTitle('💀 Game Over - AI Uprising')
      .setColor(0x666666)
      .setDescription('Your journey with the resistance has come to an end.')
      .addFields(
        {
          name: '🎯 Final Level',
          value: `${state.player.level}`,
          inline: true
        },
        {
          name: '💰 Final Credits',
          value: state.player.credits.toLocaleString(),
          inline: true
        },
        {
          name: '📊 Story Progress',
          value: `${state.storyProgress}/100`,
          inline: true
        },
        {
          name: '🏆 Your Legacy',
          value: 'The resistance will remember your sacrifice and continue the fight against the AI overlords.',
          inline: false
        }
      )
      .setFooter({ text: 'Thank you for playing AI Uprising!' });

    const components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('aiuprising_quit')
          .setLabel('👋 End Game')
          .setStyle(ButtonStyle.Secondary)
      )
    ];

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private renderError(state: AIUprisingState): DiscordReply {
    const embed = new EmbedBuilder()
      .setTitle('❌ Error - AI Uprising')
      .setColor(0xFF0000)
      .setDescription('An error occurred while rendering the game state.')
      .addFields(
        {
          name: '🔧 Debug Info',
          value: `Phase: ${state.gamePhase}\nArea: ${state.currentArea}`,
          inline: false
        }
      )
      .setFooter({ text: 'Please try again or contact support if this persists.' });

    const components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('aiuprising_quit')
          .setLabel('❌ Quit Game')
          .setStyle(ButtonStyle.Danger)
      )
    ];

    return {
      embeds: [embed.toJSON()],
      components: components,
      strategy: state.messageId ? 'edit' : 'reply'
    };
  }

  private buildExploringComponents(state: AIUprisingState): ActionRowBuilder<ButtonBuilder>[] {
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    // Movement buttons (first row) - based on existing buildGameComponents logic
    const movementRow = new ActionRowBuilder<ButtonBuilder>();
    state.world.availableExits.forEach(exit => {
      movementRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`aiuprising_move_${exit.direction.toLowerCase()}`)
          .setLabel(`🧭 ${exit.direction}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(exit.locked && !this.hasRequiredItem(state, exit.requiredItem))
      );
    });
    components.push(movementRow);

    // Action buttons (second row)
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('aiuprising_search')
          .setLabel('🔍 Search Area')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('aiuprising_inventory')
          .setLabel('📦 Inventory')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('aiuprising_rest')
          .setLabel('😴 Rest')
          .setStyle(ButtonStyle.Success)
          .setDisabled(state.world.currentMap.areas[state.currentArea].type !== 'SAFE')
      )
    );

    return components;
  }

  // eslint-disable-next-line no-unused-vars
  private buildCombatComponents(_state: AIUprisingState): ActionRowBuilder<ButtonBuilder>[] {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('aiuprising_attack')
          .setLabel('⚔️ Attack')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('aiuprising_defend')
          .setLabel('🛡️ Defend')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('aiuprising_use_item')
          .setLabel('💊 Use Item')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('aiuprising_flee')
          .setLabel('🏃 Flee')
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  private buildStoryEventComponents(state: AIUprisingState): ActionRowBuilder<ButtonBuilder>[] {
    if (!state.story?.currentEvent?.choices) {
      return [];
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    const choices = state.story.currentEvent.choices;

    // Group choices into rows (max 5 buttons per row)
    for (let i = 0; i < choices.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      const rowChoices = choices.slice(i, i + 5);
      
      rowChoices.forEach(choice => {
        const canSelect = this.meetsChoiceRequirements(state, choice);
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`aiuprising_story_choice_${choice.id}`)
            .setLabel(choice.text)
            .setStyle(canSelect ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(!canSelect)
        );
      });
      
      components.push(row);
    }

    return components;
  }

  private buildInventoryComponents(state: AIUprisingState): ActionRowBuilder<ButtonBuilder>[] {
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    // Usable items (consumables)
    const healthItems = state.inventory.items.filter(item => 
      item.type === 'CONSUMABLE' && item.quantity > 0
    );
    
    if (healthItems.length > 0) {
      const inventoryRow = new ActionRowBuilder<ButtonBuilder>();
      
      healthItems.slice(0, 4).forEach(item => {
        inventoryRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`aiuprising_use_${item.id}`)
            .setLabel(`${item.name} (${item.quantity})`)
            .setStyle(ButtonStyle.Success)
        );
      });
      
      components.push(inventoryRow);
    }

    // Back to exploring button
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('aiuprising_back_to_exploring')
          .setLabel('🔙 Back to Exploring')
          .setStyle(ButtonStyle.Secondary)
      )
    );

    return components;
  }
}