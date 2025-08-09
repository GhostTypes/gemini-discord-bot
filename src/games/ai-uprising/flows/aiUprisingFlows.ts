/**
 * @fileoverview AI-powered game flows for AI Uprising RPG mechanics and content generation.
 * 
 * Provides comprehensive AI-driven game systems for the AI Uprising RPG including
 * procedural content generation, combat logic, and narrative systems. Key flows:
 * - World generation with dynamic environments and story contexts
 * - Enemy generation with balanced stats and compelling descriptions
 * - Combat AI with strategic decision-making and consequence modeling
 * - Loot generation with varied items, rarities, and meaningful progression
 * - Story event creation with branching narratives and player choices
 * 
 * Content Generation Features:
 * - Gemini API compatible schemas for reliable structured output
 * - Balanced game mechanics with appropriate difficulty scaling
 * - Rich narrative content with consistent world-building
 * - Equipment and item systems with strategic depth
 * - Dynamic story progression based on player actions
 * 
 * Integration with AI Uprising Game:
 * - Structured Zod schemas for type-safe game data
 * - Comprehensive error handling for reliable gameplay
 * - Token-optimized prompts for efficient AI usage
 * - Context-aware generation based on game state
 */

import { ai } from '../../../genkit.config.js';
import { z } from 'zod';
import { logger } from '../../../utils/logger.js';
import { GenerationConfigBuilder } from '../../../utils/GenerationConfigBuilder.js';

// --- Item Schema Definitions ---
// Using discriminated union pattern for robust item typing compatible with Gemini API

const RaritySchema = z.enum([
  'COMMON',
  'UNCOMMON', 
  'RARE',
  'EPIC',
  'LEGENDARY',
]).describe("The rarity level of the item, affecting its power and value.");


// Single flexible ItemSchema that avoids union complexity - Gemini API compatible
const ItemSchema = z.object({
  id: z.string().min(1).describe("Unique, machine-readable identifier for the item, e.g., 'plasma_rifle_mk2' or 'health_stim'."),
  name: z.string().min(1).describe("The display name of the item, e.g., 'Plasma Rifle Mk. II'."),
  type: z.enum(['WEAPON', 'ARMOR', 'CONSUMABLE', 'ACCESSORY', 'KEY_ITEM', 'MATERIAL']).describe("The category of the item."),
  quantity: z.number().min(1).describe("The number of items in this stack. Must be 1 or higher."),
  description: z.string().describe("Flavor text or a description of the item's purpose and lore."),
  rarity: RaritySchema,
  usable: z.boolean().describe("Whether the item can be used or equipped."),
  
  // Optional weapon/armor stats - only populated for WEAPON and ARMOR types
  stats: z.object({
    damage: z.number().min(1).optional().describe("Weapon damage per hit."),
    accuracy: z.number().min(0).max(100).optional().describe("Weapon accuracy percentage."),
    criticalChance: z.number().min(0).max(100).optional().describe("Critical hit chance percentage."),
    weaponType: z.enum(['MELEE', 'PISTOL', 'RIFLE', 'HEAVY']).optional().describe("Weapon subcategory."),
    defenseRating: z.number().min(1).optional().describe("Armor defense value."),
    energyResistance: z.number().min(0).optional().describe("Energy damage resistance."),
    slot: z.enum(['HEAD', 'CHEST', 'LEGS', 'ARMS']).optional().describe("Armor equipment slot."),
  }).optional().describe("Combat statistics for weapons and armor."),
  
  // Optional consumable effect - only populated for CONSUMABLE type
  effect: z.object({
    type: z.enum(['HEAL_HP', 'RESTORE_ENERGY', 'BUFF_STAT', 'CURE_STATUS']).describe("The primary effect type."),
    value: z.number().describe("Effect strength or amount."),
    duration: z.number().optional().describe("Effect duration in turns/seconds."),
    stat: z.string().optional().describe("Stat to affect for buffs."),
  }).optional().describe("Effect applied when consumable is used."),
  
  // Optional stat boosts - only populated for ACCESSORY type, using explicit properties
  statsBoost: z.object({
    hacking: z.number().optional().describe("Hacking skill bonus."),
    stealth: z.number().optional().describe("Stealth skill bonus."),
    charisma: z.number().optional().describe("Charisma skill bonus."),
    repair: z.number().optional().describe("Repair skill bonus."),
    leadership: z.number().optional().describe("Leadership skill bonus."),
    combat: z.number().optional().describe("Combat skill bonus."),
    tech: z.number().optional().describe("Technology skill bonus."),
  }).optional().describe("Passive stat bonuses provided by accessories."),
  
  // Optional key item purpose - only populated for KEY_ITEM type
  purpose: z.string().optional().describe("What this key item unlocks or enables."),
  
  // Optional material category - only populated for MATERIAL type
  category: z.enum(['TECH', 'METAL', 'ENERGY', 'BIOLOGICAL']).optional().describe("Material crafting category."),
});

// Type inference for TypeScript
export type Item = z.infer<typeof ItemSchema>;

const AreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['SAFE', 'DANGEROUS', 'BOSS', 'SPECIAL']),
  exits: z.array(z.object({
    direction: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST', 'UP', 'DOWN']),
    targetAreaId: z.string(),
    name: z.string(),
    locked: z.boolean(),
    requiredItem: z.string().nullable().optional()
  })),
  encounters: z.array(z.object({
    type: z.enum(['ENEMY', 'TREASURE', 'EVENT']),
    chance: z.number(),
    data: z.any()
  })),
  discovered: z.boolean()
});

const EnemySchema = z.object({
  id: z.string().describe("Unique identifier for the enemy."),
  name: z.string().describe("The name of the enemy AI or robot."),
  level: z.number().min(1).describe("The enemy's combat level."),
  health: z.number().min(1).describe("Current health points of the enemy."),
  maxHealth: z.number().min(1).describe("Maximum health points of the enemy."),
  attack: z.number().min(1).describe("Base attack damage of the enemy."),
  defense: z.number().min(0).describe("Defense rating reducing incoming damage."),
  abilities: z.array(z.object({
    id: z.string().describe("Unique ability identifier."),
    name: z.string().describe("Display name of the ability."),
    description: z.string().describe("Description of what the ability does."),
    energyCost: z.number().min(0).describe("Energy cost to use this ability."),
    cooldown: z.number().min(0).describe("Turns before ability can be used again."),
    currentCooldown: z.number().min(0).describe("Current cooldown remaining.")
  })).describe("Special abilities the enemy can use in combat."),
  description: z.string().describe("Physical description and lore of the enemy."),
  aiPersonality: z.string().describe("Behavioral traits that influence combat decisions."),
  rewards: z.object({
    experience: z.number().min(1).describe("Experience points awarded for defeating the enemy."),
    credits: z.number().min(0).describe("Currency awarded for defeating the enemy."),
    items: z.array(ItemSchema).describe("Array of items dropped by the enemy. Can be empty for no drops.")
  }).describe("Rewards granted upon defeating this enemy.")
});

const StoryEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  choices: z.array(z.object({
    id: z.string(),
    text: z.string(),
    requirements: z.object({
      level: z.number().optional(),
      item: z.string().optional(),
      credits: z.number().optional()
    }).optional(),
    outcome: z.object({
      type: z.enum(['STORY', 'COMBAT', 'REWARD', 'TRAVEL']),
      data: z.any()
    })
  })),
  context: z.string()
});

export const worldGenerationFlow = ai.defineFlow(
  {
    name: 'worldGeneration',
    inputSchema: z.object({
      currentArea: z.string(),
      playerLevel: z.number(),
      storyProgress: z.number(),
      exploredAreas: z.array(z.string()),
      direction: z.string(),
      seed: z.string()
    }),
    outputSchema: z.object({
      newArea: AreaSchema,
      flavorText: z.string(),
      immediateEvent: z.string().optional()
    }),
  },
  async (input) => {
  logger.info('Generating new world area', { 
    currentArea: input.currentArea, 
    direction: input.direction,
    playerLevel: input.playerLevel 
  });

  const prompt = `You are creating a new area for an AI Uprising RPG game. The player is moving ${input.direction} from ${input.currentArea}.

Player Context:
- Level: ${input.playerLevel}
- Story Progress: ${input.storyProgress}%
- Previously explored: ${input.exploredAreas.join(', ')}
- World Seed: ${input.seed}

Generate a new area that fits the AI robot uprising theme. The world is post-apocalyptic, controlled by AI overlords. Areas should feel dangerous and oppressive, with signs of AI surveillance and control.

Area Types:
- SAFE: Rare hidden locations, resistance hideouts
- DANGEROUS: Patrolled zones, abandoned buildings
- BOSS: Major AI facilities, important targets
- SPECIAL: Unique locations with story significance

Create 2-3 exits from this area with appropriate directions. Make the area appropriate for player level ${input.playerLevel}.

For encounters, only use these types: ENEMY, TREASURE, EVENT.`;

  try {
    const config = GenerationConfigBuilder.build({
      temperature: 0.8,
      maxOutputTokens: 1000
    });

    const response = await ai.generate({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      config,
      output: {
        schema: z.object({
          newArea: AreaSchema,
          flavorText: z.string(),
          immediateEvent: z.string().optional()
        })
      }
    });

    logger.info('Successfully generated world area with structured output');
    
    if (!response.output) {
      throw new Error('No output received from AI');
    }
    
    return response.output;

  } catch (error) {
    logger.error('World generation failed, using fallback', { error });
    const fallbackArea = createFallbackArea(input);
    return {
      newArea: fallbackArea,
      flavorText: `You move ${input.direction.toLowerCase()} into ${fallbackArea.name}. ${fallbackArea.description}`,
      immediateEvent: undefined
    };
  }
});

export const enemyGenerationFlow = ai.defineFlow(
  {
    name: 'enemyGeneration',
    inputSchema: z.object({
      playerLevel: z.number(),
      areaType: z.enum(['SAFE', 'DANGEROUS', 'BOSS', 'SPECIAL']),
      storyProgress: z.number(),
      difficulty: z.enum(['EASY', 'NORMAL', 'HARD']),
      areaName: z.string(),
      seed: z.string()
    }),
    outputSchema: z.object({
      enemy: EnemySchema,
      flavorText: z.string(),
      combatIntro: z.string()
    }),
  },
  async (input) => {
  logger.info('Generating enemy encounter', { 
    playerLevel: input.playerLevel, 
    areaType: input.areaType,
    areaName: input.areaName 
  });

  const difficultyMultiplier = { EASY: 0.8, NORMAL: 1.0, HARD: 1.3 }[input.difficulty];
  const baseLevel = Math.max(1, input.playerLevel + Math.floor((input.storyProgress / 100) * 3));
  const enemyLevel = Math.floor(baseLevel * difficultyMultiplier);

  const prompt = `Generate an AI robot enemy for a post-apocalyptic RPG. 

Context:
- Player Level: ${input.playerLevel}
- Enemy Level: ${enemyLevel}
- Area: ${input.areaName} (${input.areaType})
- Story Progress: ${input.storyProgress}%
- Difficulty: ${input.difficulty}
- Seed: ${input.seed}

Create an enemy that fits the AI uprising theme:
- Robotic/mechanical opponents
- Various AI types: patrol drones, security bots, hunter-killers, etc.
- Abilities should match their design (scanning, shields, weapons)
- Personality traits for combat AI behavior
- Appropriate rewards for the level

Enemy should be challenging but fair for level ${input.playerLevel}. 
For ${input.areaType} areas, adjust threat level accordingly.

Include 2-3 special abilities and describe the enemy's appearance and behavior.
Generate combat intro text describing how the encounter begins.

Return JSON format with enemy data, plus separate flavor text and combat intro.`;

  try {
    const config = GenerationConfigBuilder.build({
      temperature: 0.7,
      maxOutputTokens: 800
    });

    const response = await ai.generate({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      config,
      output: {
        schema: z.object({
          enemy: EnemySchema,
          flavorText: z.string(),
          combatIntro: z.string()
        })
      }
    });

    logger.info('Successfully generated enemy with structured output');
    
    if (!response.output) {
      throw new Error('No output received from AI');
    }
    
    return response.output;

  } catch (error) {
    logger.error('Enemy generation failed, using fallback', { error });
    const fallbackEnemy = createFallbackEnemy(input, enemyLevel);
    return {
      enemy: fallbackEnemy,
      flavorText: "A mechanical threat emerges from the shadows!",
      combatIntro: `${fallbackEnemy.name} powers up its weapons systems!`
    };
  }
});

export const combatAIFlow = ai.defineFlow(
  {
    name: 'combatAI',
    inputSchema: z.object({
      enemy: EnemySchema,
      playerStats: z.object({
        level: z.number(),
        health: z.number(),
        maxHealth: z.number(),
        energy: z.number(),
        attack: z.number(),
        defense: z.number()
      }),
      combatRound: z.number(),
      combatHistory: z.array(z.string()),
      availableAbilities: z.array(z.string())
    }),
    outputSchema: z.object({
      action: z.enum(['ATTACK', 'DEFEND', 'SPECIAL', 'ANALYZE']),
      abilityId: z.string().optional(),
      flavorText: z.string(),
      damage: z.number().optional(),
      effect: z.string().optional()
    }),
  },
  async (input) => {
  logger.info('Processing combat AI turn', { 
    enemy: input.enemy.name, 
    round: input.combatRound,
    enemyHealth: input.enemy.health 
  });

  const prompt = `You are controlling ${input.enemy.name} in combat.

Enemy Stats:
- Health: ${input.enemy.health}/${input.enemy.maxHealth}
- Attack: ${input.enemy.attack}
- Defense: ${input.enemy.defense}
- Personality: ${input.enemy.aiPersonality}
- Available Abilities: ${input.availableAbilities.join(', ')}

Player Stats:
- Level: ${input.playerStats.level}
- Health: ${input.playerStats.health}/${input.playerStats.maxHealth}
- Attack: ${input.playerStats.attack}
- Defense: ${input.playerStats.defense}

Combat Round: ${input.combatRound}
Recent Actions: ${input.combatHistory.slice(-3).join(', ') || 'None'}

Based on the enemy's personality and current situation, choose the best action:
- ATTACK: Basic attack
- DEFEND: Reduce incoming damage
- SPECIAL: Use an ability
- ANALYZE: Scan player for weaknesses

Consider:
- Enemy health vs player health
- Available abilities and their cooldowns  
- Combat round (early/mid/late fight tactics)
- Enemy AI personality traits

Respond with JSON containing action, ability (if special), damage amount, and dramatic flavor text describing the action.`;

  try {
    const config = GenerationConfigBuilder.build({
      temperature: 0.6,
      maxOutputTokens: 400
    });

    const response = await ai.generate({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      config,
      output: {
        schema: z.object({
          action: z.enum(['ATTACK', 'DEFEND', 'SPECIAL', 'ANALYZE']),
          abilityId: z.string().optional(),
          flavorText: z.string(),
          damage: z.number().optional(),
          effect: z.string().optional()
        })
      }
    });

    logger.info('Successfully generated combat AI decision with structured output');
    
    if (!response.output) {
      throw new Error('No output received from AI');
    }
    
    // Calculate damage if it's an attack and not already provided
    let finalDamage = response.output.damage;
    if (!finalDamage && (response.output.action === 'ATTACK' || response.output.action === 'SPECIAL')) {
      const baseDamage = input.enemy.attack;
      const variation = Math.floor(baseDamage * 0.2);
      finalDamage = baseDamage + Math.floor(Math.random() * variation) - Math.floor(variation / 2);
      finalDamage = Math.max(1, finalDamage);
    }

    return {
      ...response.output,
      damage: finalDamage
    };

  } catch (error) {
    logger.error('Combat AI failed, using fallback', { error });
    return {
      action: 'ATTACK' as const,
      flavorText: `${input.enemy.name} launches an attack!`,
      damage: Math.max(1, input.enemy.attack)
    };
  }
});

export const storyEventFlow = ai.defineFlow(
  {
    name: 'storyEventGeneration',
    inputSchema: z.object({
      currentArea: z.string(),
      playerLevel: z.number(),
      storyProgress: z.number(),
      completedEvents: z.array(z.string()),
      recentActions: z.array(z.string()),
      seed: z.string()
    }),
    outputSchema: z.object({
      event: StoryEventSchema,
      immediateConsequences: z.string(),
      longTermEffects: z.array(z.string())
    }),
  },
  async (input) => {
  logger.info('Generating story event', { 
    area: input.currentArea, 
    storyProgress: input.storyProgress,
    playerLevel: input.playerLevel 
  });

  const prompt = `Generate a story event for AI Uprising RPG.

Context:
- Current Area: ${input.currentArea}
- Player Level: ${input.playerLevel}
- Story Progress: ${input.storyProgress}%
- Completed Events: ${input.completedEvents.length}
- Recent Actions: ${input.recentActions.join(', ') || 'None'}
- Seed: ${input.seed}

Create a meaningful story event that:
- Advances the resistance vs AI narrative
- Offers 2-4 meaningful choices
- Has consequences that matter
- Fits the current story progress level
- Relates to fighting AI overlords theme

Event types could include:
- Discovery of AI intelligence
- Rescue operations
- Sabotage opportunities
- Information gathering
- Moral dilemmas
- Resource decisions

Each choice should have clear trade-offs and requirements.
Include immediate consequences and potential long-term story effects.

Return JSON with event data, plus immediate consequences text and array of long-term effects.`;

  try {
    const config = GenerationConfigBuilder.build({
      temperature: 0.8,
      maxOutputTokens: 600
    });

    const response = await ai.generate({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      config,
      output: {
        schema: z.object({
          event: StoryEventSchema,
          immediateConsequences: z.string(),
          longTermEffects: z.array(z.string())
        })
      }
    });

    logger.info('Successfully generated story event with structured output');
    
    if (!response.output) {
      throw new Error('No output received from AI');
    }
    
    return response.output;

  } catch (error) {
    logger.error('Story event generation failed, using fallback', { error });
    return createFallbackStoryEvent();
  }
});

export const lootGenerationFlow = ai.defineFlow(
  {
    name: 'lootGeneration',
    inputSchema: z.object({
      playerLevel: z.number().min(1).describe("The player's current level."),
      areaType: z.string().describe("The type of area where loot is found."),
      lootType: z.enum(['COMBAT_REWARD', 'TREASURE_CHEST', 'QUEST_REWARD', 'SEARCH_RESULT']).describe("The source of the loot."),
      difficulty: z.enum(['EASY', 'NORMAL', 'HARD']).describe("Game difficulty setting."),
      seed: z.string().describe("Random seed for consistent generation.")
    }),
    outputSchema: z.object({
      items: z.array(ItemSchema).describe("Array of items found. Can be empty for no item drops."),
      credits: z.number().min(0).describe("Currency amount found."),
      experience: z.number().min(0).describe("Experience points gained from finding loot."),
      description: z.string().describe("Descriptive text of what the player finds and why it's valuable.")
    }),
  },
  async (input) => {
  logger.info('Generating loot', { 
    playerLevel: input.playerLevel, 
    lootType: input.lootType,
    areaType: input.areaType 
  });

  const prompt = `Generate loot for AI Uprising RPG.

Context:
- Player Level: ${input.playerLevel}
- Area Type: ${input.areaType}
- Loot Source: ${input.lootType}
- Difficulty: ${input.difficulty}
- Seed: ${input.seed}

IMPORTANT: Generate 1-3 items per loot drop. For COMBAT_REWARD, focus on:
- 60% chance: Weapons (WEAPON type with stats.damage, stats.accuracy, stats.weaponType)
- 30% chance: Armor pieces (ARMOR type with stats.defenseRating, stats.slot)
- 20% chance: Consumables (CONSUMABLE type with effect.type and effect.value)
- 10% chance: Accessories (ACCESSORY type with statsBoost properties)

Generate appropriate rewards:
- WEAPONS: Must have stats object with damage (5-50), accuracy (60-95), weaponType (MELEE/PISTOL/RIFLE/HEAVY)
- ARMOR: Must have stats object with defenseRating (3-25), slot (HEAD/CHEST/LEGS/ARMS)
- CONSUMABLES: Must have effect object with type (HEAL_HP/RESTORE_ENERGY) and value (15-50)
- ACCESSORIES: Must have statsBoost object with skill bonuses (hacking, stealth, combat, etc.)

Sci-fi theme examples:
- Weapons: Plasma rifles, pulse pistols, energy blades, ion cannons
- Armor: Tactical vests, power suits, shield generators, combat helmets
- Consumables: nano-heal injectors, energy cells, combat stims, repair kits

Balance for level ${input.playerLevel}:
- Level 1-3: Basic/COMMON equipment (damage 5-15, defense 3-8)
- Level 4-6: Improved/UNCOMMON gear (damage 12-25, defense 6-15)
- Level 7+: Advanced/RARE+ items (damage 20-40, defense 12-25)

Item rarities: COMMON, UNCOMMON, RARE, EPIC, LEGENDARY

Include vivid description of what the player finds and why it's valuable to the resistance.

Return JSON with items array, credits amount, experience gained, and descriptive text.`;

  try {
    const config = GenerationConfigBuilder.build({
      temperature: 0.7,
      maxOutputTokens: 500
    });

    const response = await ai.generate({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      config,
      output: {
        schema: z.object({
          items: z.array(ItemSchema).describe("Array of items found. Can be empty for no item drops."),
          credits: z.number().min(0).describe("Currency amount found."),
          experience: z.number().min(0).describe("Experience points gained from finding loot."),
          description: z.string().describe("Descriptive text of what the player finds and why it's valuable.")
        })
      }
    });

    logger.info('Successfully generated loot with structured output');
    
    if (!response.output) {
      throw new Error('No output received from AI');
    }
    
    return response.output;

  } catch (error) {
    logger.error('Loot generation failed, using fallback', { error });
    return createFallbackLoot(input);
  }
});

// Fallback functions for when AI generation fails
function createFallbackArea(input: any): any {
  const areaTypes = ['DANGEROUS', 'SAFE', 'SPECIAL'];
  const randomType = areaTypes[Math.floor(Math.random() * areaTypes.length)] as 'DANGEROUS' | 'SAFE' | 'SPECIAL';
  
  const areaId = `area_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const sectorNumber = Math.floor(Math.random() * 100);
  
  // Create exits with proper directions
  const exits = [
    {
      direction: getOppositeDirection(input.direction) as 'NORTH' | 'SOUTH' | 'EAST' | 'WEST',
      targetAreaId: input.currentArea,
      name: "Back to previous area",
      locked: false
    }
  ];
  
  // Add additional exits
  const possibleDirections = ['NORTH', 'SOUTH', 'EAST', 'WEST'].filter(dir => 
    dir !== input.direction && dir !== getOppositeDirection(input.direction)
  );
  
  if (possibleDirections.length > 0 && Math.random() > 0.5) {
    const randomDir = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
    exits.push({
      direction: randomDir as 'NORTH' | 'SOUTH' | 'EAST' | 'WEST',
      targetAreaId: `area_${randomDir.toLowerCase()}_${Date.now()}`,
      name: `Passage ${randomDir.toLowerCase()}`,
      locked: false
    });
  }
  
  return {
    id: areaId,
    name: `Sector ${sectorNumber}`,
    description: "A desolate area under AI surveillance. The resistance must be careful here. Broken screens flicker with warning messages and the air hums with electronic interference.",
    type: randomType,
    exits,
    encounters: [
      {
        type: 'ENEMY' as const,
        chance: randomType === 'SAFE' ? 15 : randomType === 'DANGEROUS' ? 45 : 60,
        data: {}
      },
      {
        type: 'TREASURE' as const,
        chance: randomType === 'SAFE' ? 25 : 20,
        data: {}
      }
    ],
    discovered: true
  };
}

function createFallbackEnemy(_input: any, level: number): any {
  const enemyTypes = ['Security Drone', 'Patrol Bot', 'Scanner Unit'];
  const randomType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
  
  return {
    id: `enemy_${Date.now()}`,
    name: randomType,
    level,
    health: level * 20,
    maxHealth: level * 20,
    attack: level * 3 + 5,
    defense: level * 2,
    abilities: [
      {
        id: 'scan',
        name: 'Target Scan',
        description: 'Analyzes target weaknesses',
        energyCost: 5,
        cooldown: 3,
        currentCooldown: 0
      }
    ],
    description: `A standard AI enforcement unit, level ${level}.`,
    aiPersonality: 'Aggressive and calculating',
    rewards: {
      experience: level * 15,
      credits: level * 10,
      items: []
    }
  };
}

function createFallbackStoryEvent(): any {
  return {
    event: {
      id: `event_${Date.now()}`,
      title: 'Resistance Contact',
      description: 'You receive a coded transmission from another resistance cell.',
      choices: [
        {
          id: 'help',
          text: 'Offer assistance',
          outcome: { type: 'STORY', data: { storyProgress: 5 } }
        },
        {
          id: 'ignore',
          text: 'Ignore the transmission',
          outcome: { type: 'STORY', data: { credits: 50 } }
        }
      ],
      context: 'resistance_contact'
    },
    immediateConsequences: 'Your choice affects the resistance network.',
    longTermEffects: ['May influence future resistance support']
  };
}

function createFallbackLoot(input: any): any {
  return {
    items: [
      {
        id: 'health_stim',
        name: 'Health Stimpack',
        type: 'CONSUMABLE',
        quantity: 1,
        description: 'A basic medical stimpack that restores health points',
        rarity: 'COMMON',
        usable: true,
        effect: {
          type: 'HEAL_HP',
          value: 25
        }
      }
    ],
    credits: Math.floor(input.playerLevel * 15),
    experience: Math.floor(input.playerLevel * 8),  
    description: "You scavenge some useful supplies from the area."
  };
}

function getOppositeDirection(direction: string): string {
  const opposites: Record<string, string> = {
    'NORTH': 'SOUTH',
    'SOUTH': 'NORTH',
    'EAST': 'WEST',
    'WEST': 'EAST',
    'UP': 'DOWN',
    'DOWN': 'UP'
  };
  return opposites[direction] || 'BACK';
}