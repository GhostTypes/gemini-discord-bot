/**
 * @fileoverview System prompt loader utility for centralized prompt management.
 * 
 * This module provides a centralized way to load and manage the bot's system prompt
 * from a single source file. This enables easy iteration and testing of different
 * prompts without modifying code in multiple places.
 * 
 * Key Features:
 * - Single source of truth for system prompt (system_prompt.txt)
 * - Caching to avoid repeated file reads
 * - Graceful fallback if file is missing
 * - Easy integration across all flows and services
 * 
 * Usage:
 * Import and call getSystemPrompt() wherever the system prompt is needed.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let cachedSystemPrompt: string | null = null;

/**
 * Get the system prompt from system_prompt.txt file
 * @returns The system prompt string
 */
export function getSystemPrompt(): string {
  // Return cached version if available
  if (cachedSystemPrompt !== null) {
    return cachedSystemPrompt;
  }

  try {
    // Get the project root directory (go up from src/utils/)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectRoot = join(__dirname, '..', '..');
    const systemPromptPath = join(projectRoot, 'system_prompt.txt');
    
    // Read and cache the system prompt
    cachedSystemPrompt = readFileSync(systemPromptPath, 'utf-8').trim();
    return cachedSystemPrompt;
  } catch (error) {
    console.error('Failed to load system prompt from system_prompt.txt:', error);
    
    // Fallback to basic prompt if file is missing
    const fallbackPrompt = 'You are a helpful Discord bot assistant.';
    cachedSystemPrompt = fallbackPrompt;
    return fallbackPrompt;
  }
}

/**
 * Clear the cached system prompt (useful for testing or dynamic reloading)
 */
export function clearSystemPromptCache(): void {
  cachedSystemPrompt = null;
}