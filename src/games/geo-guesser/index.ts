/**
 * @fileoverview GeoGuesser game module exports.
 * 
 * Provides centralized exports for all GeoGuesser game components,
 * enabling clean imports and integration with the game registry system.
 * 
 * Exported Components:
 * - GeoGuesserGame: Main game implementation extending BaseGame
 * - GeoGuesserInteractionHandler: Discord button interaction handler
 * - LocationAPIService: Location and image API service
 * - geoGuesserValidationFlow: AI-powered guess validation flow
 * 
 * This module serves as the entry point for the GeoGuesser game system
 * and provides all necessary components for game registration and operation.
 */

export { GeoGuesserGame } from './GeoGuesserGame.js';
export { GeoGuesserInteractionHandler } from './interactions/GeoGuesserInteractionHandler.js';
export { LocationAPIService } from './services/LocationAPIService.js';
export { geoGuesserValidationFlow, validateLocationGuess } from './flows/geoGuesserValidationFlow.js';

export type { LocationData } from './services/LocationAPIService.js';
export type { 
  GeoGuesserValidationInput, 
  GeoGuesserValidationOutput 
} from './flows/geoGuesserValidationFlow.js';