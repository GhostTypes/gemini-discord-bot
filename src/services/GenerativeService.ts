/**
 * @fileoverview Centralized Google AI service for direct model interactions.
 * 
 * Provides a unified interface for Google AI model interactions outside of
 * Genkit flows, offering specialized methods for different AI capabilities.
 * Key features include:
 * - Direct GoogleGenAI client access for specialized use cases
 * - Search grounding integration for real-time information retrieval
 * - URL context analysis for web content processing
 * - Configurable generation parameters through GenerationConfigBuilder
 * - Centralized API key and model configuration management
 * 
 * Service Methods:
 * - Search grounding: Web search integration for current information
 * - URL context: Web page analysis and content extraction
 * - Direct generation: Standard text generation without specialized tools
 * 
 * This service complements Genkit flows by providing direct access to Google AI
 * capabilities for scenarios requiring fine-tuned control or specialized tools
 * like search grounding and URL analysis.
 */

import { GoogleGenAI } from '@google/genai';
import { botConfig } from '../config/environment.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import { logger } from '../utils/logger.js';

/**
 * Centralized service for managing Google Genitive AI interactions
 * Provides direct access to GoogleGenAI client for different use cases
 */
export class GenerativeService {
  private readonly genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: botConfig.google.apiKey });
    
    logger.info('GenerativeService initialized', { 
      model: botConfig.google.model,
      thinkingEnabled: botConfig.thinking.enabled 
    });
  }

  /**
   * Generate content with search grounding
   */
  async generateSearchGrounded(userPrompt: string, systemPrompt?: string) {
    return await this.genAI.models.generateContent({
      model: botConfig.google.model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        ...(systemPrompt && { systemInstruction: systemPrompt }),
        ...GenerationConfigBuilder.buildSearchGrounding(),
      },
    });
  }

  /**
   * Generate streaming content with search grounding
   */
  async generateSearchGroundedStream(userPrompt: string, systemPrompt?: string) {
    return await this.genAI.models.generateContentStream({
      model: botConfig.google.model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        ...(systemPrompt && { systemInstruction: systemPrompt }),
        ...GenerationConfigBuilder.buildSearchGrounding(),
      },
    });
  }

  /**
   * Generate content for URL context analysis
   */
  async generateUrlContext(userPrompt: string, systemPrompt?: string) {
    return await this.genAI.models.generateContent({
      model: botConfig.google.model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        ...(systemPrompt && { systemInstruction: systemPrompt }),
        ...GenerationConfigBuilder.buildUrlContext(),
      },
    });
  }

  /**
   * Generate streaming content for URL context analysis
   */
  async generateUrlContextStream(userPrompt: string, systemPrompt?: string) {
    return await this.genAI.models.generateContentStream({
      model: botConfig.google.model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        ...(systemPrompt && { systemInstruction: systemPrompt }),
        ...GenerationConfigBuilder.buildUrlContext(),
      },
    });
  }

  /**
   * Get the raw GoogleGenAI client for advanced usage
   */
  getClient(): GoogleGenAI {
    return this.genAI;
  }
}

// Export singleton instance
export const generativeService = new GenerativeService();