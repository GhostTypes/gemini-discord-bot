/**
 * @fileoverview Google Genkit configuration and AI client initialization.
 * 
 * This module configures the Google Genkit framework for AI flow orchestration,
 * providing a centralized AI client instance used throughout the application:
 * - Google AI plugin configuration with API key management
 * - Model selection and parameter configuration (default: Gemini 2.5 Flash Lite)
 * - AI client instance export for flow definitions and streaming operations
 * - Integration with environment configuration for secure credential management
 * 
 * Key Features:
 * - Unified AI client configuration for consistent model usage
 * - Environment-based model selection with fallback defaults
 * - Plugin architecture supporting Google AI services
 * - Seamless integration with streaming flows and generation operations
 * 
 * Model Configuration:
 * Uses Gemini 2.5 Flash Lite by default for balanced performance and cost,
 * with support for thinking/reasoning capabilities when enabled in environment.
 * All model parameters are managed through GenerationConfigBuilder utility.
 * 
 * Usage Context:
 * Core dependency imported by all flow modules (chatFlow, multimodalChatFlow, etc.)
 * and any service requiring AI generation capabilities. Must be imported early
 * in application bootstrap to ensure proper Genkit initialization.
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { botConfig } from './config/environment.js';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: botConfig.google.apiKey,
    }),
  ],
  model: googleAI.model(botConfig.google.model),
});