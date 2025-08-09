/**
 * @fileoverview Google AI generation configuration builder with thinking support.
 * 
 * This utility class provides centralized configuration management for Google AI
 * generation parameters, with specialized support for different use cases:
 * - Automatic thinking/reasoning configuration based on environment settings
 * - Pre-configured parameter sets optimized for specific flows (chat, search, images)
 * - Dynamic thinking budget allocation with validation
 * - Consistent model parameter application across all AI operations
 * - Type-safe configuration interfaces with extensible options
 * 
 * Key Features:
 * - Environment-driven thinking configuration with budget management
 * - Specialized configs for different interaction types (chat, search, image generation)
 * - Temperature and token limit optimization per use case
 * - Extensible interface allowing custom parameter overrides
 * - Integration with botConfig for centralized environment management
 * 
 * Configuration Presets:
 * - Chat: Balanced creativity (temp: 0.7) with standard token limits
 * - Search: Low temperature (temp: 0.2) for factual accuracy
 * - Image: Higher creativity (temp: 0.8) for diverse visual outputs
 * - URL Context: Conservative settings (temp: 0.3) for content analysis
 * 
 * Thinking Integration:
 * Automatically includes thinking configuration when enabled in environment,
 * supporting both fixed token budgets and dynamic allocation strategies.
 * 
 * Usage Context:
 * Core utility used by all AI flows to ensure consistent model behavior
 * and optimal parameter selection based on interaction context.
 */

import { botConfig } from '../config/environment.js';

export interface GenerationConfigOptions {
  temperature?: number;
  maxOutputTokens?: number;
  [key: string]: unknown;
}

export class GenerationConfigBuilder {
  /**
   * Build generation config with automatic thinking support
   */
  static build(options: GenerationConfigOptions = {}): Record<string, unknown> {
    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      ...options,
    };

    // Add thinking configuration if enabled
    if (botConfig.thinking.enabled && botConfig.thinking.budget !== 0) {
      generationConfig.thinkingConfig = {
        thinkingBudget: botConfig.thinking.budget,
        includeThoughts: true,
      };
    }

    return generationConfig;
  }

  /**
   * Build config for chat flows
   */
  static buildChat(options: GenerationConfigOptions = {}): Record<string, unknown> {
    return this.build({
      temperature: 0.7,
      maxOutputTokens: 4096,
      ...options,
    });
  }

  /**
   * Build config for image generation
   */
  static buildImage(options: GenerationConfigOptions = {}): Record<string, unknown> {
    return this.build({
      temperature: 0.8,
      maxOutputTokens: 2048,
      ...options,
    });
  }

  /**
   * Build config for search grounding (lower temperature for accuracy)
   */
  static buildSearchGrounding(options: GenerationConfigOptions = {}): Record<string, unknown> {
    return this.build({
      temperature: 0.2,
      maxOutputTokens: 1500,
      ...options,
    });
  }

  /**
   * Build config for URL context analysis
   */
  static buildUrlContext(options: GenerationConfigOptions = {}): Record<string, unknown> {
    return this.build({
      temperature: 0.3,
      maxOutputTokens: 1500,
      ...options,
    });
  }
}