/**
 * @fileoverview GeoGuesser location database with MessagePack loading.
 * 
 * Provides access to curated location database with embedded base64 images
 * for optimal performance and offline functionality. Uses MessagePack format
 * for 2.76x faster loading compared to JSON.
 */

import { decode } from '@msgpack/msgpack';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface LocationData {
  latitude: number;
  longitude: number;
  city: string;
  state?: string | undefined;
  country: string;
  countryCode: string;
  geoCode: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  source: 'SEED' | 'GENERATED';
  imageData: string; // Changed from imageUrl to imageData
  baseCity?: string | undefined;
}

interface LocationDatabase {
  metadata: {
    generatedAt: string;
    totalLocations: number;
    totalAttempts: number;
    successRate: string;
    failedDownloads: number;
    breakdown: {
      EASY: number;
      MEDIUM: number;
      HARD: number;
      EXPERT: number;
    };
  };
  locations: LocationData[];
}

let cachedDatabase: LocationDatabase | null = null;

function loadLocationDatabase(): LocationDatabase {
  if (cachedDatabase) {
    return cachedDatabase;
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dbPath = path.join(__dirname, 'geoguesser-complete-database.msgpack');
    
    const buffer = fs.readFileSync(dbPath);
    cachedDatabase = decode(buffer) as LocationDatabase;
    
    return cachedDatabase;
  } catch (error) {
    throw new Error(`Failed to load MessagePack database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
export function getLocationsByDifficulty(difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'): LocationData[] {
  const db = loadLocationDatabase();
  return db.locations.filter(loc => loc.difficulty === difficulty);
}

export function getRandomLocation(difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'): LocationData {
  const locations = getLocationsByDifficulty(difficulty);
  if (locations.length === 0) {
    throw new Error(`No locations available for difficulty: ${difficulty}`);
  }
  return locations[Math.floor(Math.random() * locations.length)];
}

export function getAllLocations(): LocationData[] {
  const db = loadLocationDatabase();
  return db.locations;
}

export function getDatabaseMetadata() {
  const db = loadLocationDatabase();
  return db.metadata;
}

export function reloadDatabase(): void {
  cachedDatabase = null;
}
