/**
 * @fileoverview Environment configuration management with validation and type safety.
 * 
 * This module handles all environment variable loading, validation, and type conversion
 * for the Discord bot application. It provides a centralized configuration system with:
 * - Strict validation for required environment variables
 * - Type-safe configuration interfaces with proper TypeScript typing
 * - Default value handling for optional configuration parameters
 * - Special validation for thinking/reasoning configuration with Gemini models
 * 
 * Key Configuration Areas:
 * - Discord API credentials (token, client ID)
 * - Google AI API settings (API key, model selection)
 * - Development settings (log levels, debugging options)
 * - Thinking/reasoning budget configuration for advanced AI capabilities
 * 
 * The configuration supports both traditional environment variables and
 * specialized validation for Google Genkit thinking features, including
 * dynamic budget allocation and reasoning token management.
 * 
 * Usage Context:
 * Core configuration module imported throughout the application, particularly
 * by services, flows, and utility modules requiring environment-specific settings.
 */

import { config } from 'dotenv';

// Load environment variables
config();

export interface BotConfig {
  discord: {
    token: string;
    clientId: string;
  };
  google: {
    apiKey: string;
    model: string;
  };
  development: {
    logLevel: string;
  };
  thinking: {
    enabled: boolean;
    budget: number;
  };
  database: {
    url: string;
    messageCacheSize: number;
  };
  rag: {
    enabled: boolean;
    maxContextMessages: number;
    relevanceThreshold: number;
  };
  mapillary: {
    accessToken?: string;
    enabled: boolean;
  };
  operator: {
    primaryOperatorId: string;
  };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function validateBoolean(value: string): boolean {
  const lowerStr = value.toLowerCase().trim();
  return lowerStr === 'true' || lowerStr === '1' || lowerStr === 'yes';
}

function validateThinkingEnabled(enabledStr: string): boolean {
  const lowerStr = enabledStr.toLowerCase().trim();
  if (lowerStr === 'true' || lowerStr === '1' || lowerStr === 'yes') {
    return true;
  }
  if (lowerStr === 'false' || lowerStr === '0' || lowerStr === 'no' || lowerStr === '') {
    return false;
  }
  console.warn(`Invalid THINKING_ENABLED "${enabledStr}", defaulting to false`);
  return false;
}

function validateThinkingBudget(budgetStr: string): number {
  const budget = parseInt(budgetStr, 10);
  
  // 0 = disabled, -1 = dynamic, positive values = specific budget
  if (budget === 0 || budget === -1) {
    return budget;
  }
  
  // Valid range is 128 to 32768 for Gemini models
  if (budget >= 128 && budget <= 32768) {
    return budget;
  }
  
  console.warn(`Invalid THINKING_BUDGET "${budgetStr}", defaulting to -1 (dynamic)`);
  return -1;
}

const thinkingEnabledStr = optionalEnv('THINKING_ENABLED', 'false');
const thinkingBudgetStr = optionalEnv('THINKING_BUDGET', '-1');

const thinkingEnabled = validateThinkingEnabled(thinkingEnabledStr);
const thinkingBudget = validateThinkingBudget(thinkingBudgetStr);

export const botConfig: BotConfig = {
  discord: {
    token: getRequiredEnv('DISCORD_TOKEN'),
    clientId: getRequiredEnv('DISCORD_CLIENT_ID'),
  },
  google: {
    apiKey: getRequiredEnv('GOOGLE_AI_API_KEY'),
    model: process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash-lite',
  },
  development: {
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  thinking: {
    enabled: thinkingEnabled,
    budget: thinkingBudget,
  },
  database: {
    url: optionalEnv('DATABASE_URL', 'postgresql://localhost:5432/discord_bot_cache'),
    messageCacheSize: parseInt(optionalEnv('MESSAGE_CACHE_SIZE', '64')),
  },
  rag: {
    enabled: validateBoolean(optionalEnv('RAG_ENABLED', 'true')),
    maxContextMessages: parseInt(optionalEnv('RAG_MAX_CONTEXT_MESSAGES', '12')),
    relevanceThreshold: parseFloat(optionalEnv('RAG_RELEVANCE_THRESHOLD', '0.3')),
  },
  mapillary: {
    ...(process.env.MAPILLARY_ACCESS_TOKEN && { accessToken: process.env.MAPILLARY_ACCESS_TOKEN }),
    enabled: validateBoolean(optionalEnv('MAPILLARY_ENABLED', 'true')),
  },
  operator: {
    primaryOperatorId: optionalEnv('PRIMARY_OPERATOR_ID', '638632525744439297'),
  },
};