/**
 * @fileoverview Location API service for GeoGuesser game integration.
 * 
 * Provides comprehensive location and image retrieval services for the GeoGuesser
 * Discord bot game. Features curated location database with verified Mapillary 
 * coverage for reliable image availability. Key capabilities include:
 * - Random location generation with difficulty-based filtering
 * - Real street-level imagery from Mapillary API
 * - Curated database of worldwide locations with guaranteed image coverage
 * - Geographic data normalization and validation
 * - High-quality locations sourced from major cities worldwide
 * 
 * Database Strategy:
 * - Primary: Curated location database generated from major cities
 * - Images: Mapillary street-level imagery with verified coverage
 * - All locations tested and verified to have available imagery
 * - Covers all difficulty levels from major cities to remote locations
 */

import { logger } from '../../../utils/logger.js';
import { getRandomLocation, getLocationsByDifficulty } from '../data/locations.js';

export interface LocationData {
  latitude: number;
  longitude: number;
  city: string;
  state?: string | undefined;
  country: string;
  countryCode: string;
  geoCode: string;
  imageData: string; // Changed from imageUrl to imageData
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  source: 'SEED' | 'GENERATED';
  baseCity?: string | undefined;
}

export class LocationAPIService {
  constructor() {
    logger.info('LocationAPIService: Initialized with curated location database');
  }

  async getRandomLocation(difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'): Promise<LocationData> {
    try {
      // Get a random location from our curated database
      const databaseLocation = getRandomLocation(difficulty);
      
      logger.info(`LocationAPIService: Selected ${difficulty} location: ${databaseLocation.city}, ${databaseLocation.country}`);
      // Log location details with truncated imageData
      const logLocation = {
        ...databaseLocation,
        imageData: databaseLocation.imageData ? `${databaseLocation.imageData.substring(0, 50)}... (${databaseLocation.imageData.length} chars)` : 'none'
      };
      logger.debug('LocationAPIService: Location details:', JSON.stringify(logLocation, null, 2));
      
      // Convert database format to service format
      const locationData: LocationData = {
        latitude: databaseLocation.latitude,
        longitude: databaseLocation.longitude,
        city: databaseLocation.city,
        state: databaseLocation.state || undefined,
        country: databaseLocation.country,
        countryCode: databaseLocation.countryCode,
        geoCode: databaseLocation.geoCode,
        imageData: databaseLocation.imageData,
        difficulty: databaseLocation.difficulty,
        source: databaseLocation.source,
        baseCity: databaseLocation.baseCity || undefined
      };
      
      return locationData;
    } catch (error) {
      logger.error('LocationAPIService: Failed to get location from database:', error);
      
      // Fallback: if no locations available for difficulty, try EASY
      if (difficulty !== 'EASY') {
        logger.warn(`LocationAPIService: No ${difficulty} locations available, falling back to EASY`);
        return this.getRandomLocation('EASY');
      }
      
      // Ultimate fallback: return New York as a hard-coded location
      logger.error('LocationAPIService: Database completely unavailable, using hard-coded fallback');
      return {
        latitude: 40.7589,
        longitude: -73.9851,
        city: 'New York',
        country: 'United States',
        countryCode: 'US',
        geoCode: 'NEW YORK-UNITED STATES',
        imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A==', // Minimal base64 image as fallback
        difficulty: 'EASY',
        source: 'GENERATED'
      };
    }
  }


  async validateLocationExists(latitude: number, longitude: number): Promise<boolean> {
    try {
      // Simple validation - check if coordinates are within valid ranges
      return (
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180 &&
        !isNaN(latitude) && !isNaN(longitude)
      );
    } catch (error) {
      logger.warn('LocationAPIService: Location validation failed:', error);
      return false;
    }
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  getLocationStats() {
    try {
      const stats = getLocationsByDifficulty('EASY').length > 0 ? {
        total: getLocationsByDifficulty('EASY').length + 
               getLocationsByDifficulty('MEDIUM').length + 
               getLocationsByDifficulty('HARD').length + 
               getLocationsByDifficulty('EXPERT').length,
        byDifficulty: {
          EASY: getLocationsByDifficulty('EASY').length,
          MEDIUM: getLocationsByDifficulty('MEDIUM').length,
          HARD: getLocationsByDifficulty('HARD').length,
          EXPERT: getLocationsByDifficulty('EXPERT').length,
        }
      } : { total: 0, byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 } };
      
      logger.info('LocationAPIService: Database stats:', stats);
      return stats;
    } catch (error) {
      logger.warn('LocationAPIService: Failed to get database stats:', error);
      return { total: 0, byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 } };
    }
  }
}