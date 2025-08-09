#!/usr/bin/env node
/**
 * Unified GeoGuesser Location and Image Generator
 * Combines Python location generation with JavaScript image downloading
 * Outputs directly to MessagePack format for optimal performance (2.76x faster than JSON)
 * 
 * Usage: node generate-geoguesser-complete.js [easy_count] [medium_count] [hard_count] [expert_count]
 * Example: node generate-geoguesser-complete.js 15 12 10 8
 * Default: node generate-geoguesser-complete.js (30 per difficulty)
 */

import fs from 'fs/promises';
import fetch from 'node-fetch';
import { encode } from '@msgpack/msgpack';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Environment configuration
const MAPILLARY_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;
if (!MAPILLARY_TOKEN) {
  throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is required');
}

// Processing configuration
const MAX_WORKERS = 8;
const CONCURRENT_DOWNLOADS = 6;
const RETRY_DELAY = 1000;
const REQUEST_DELAY = 200;
const MAX_RETRIES = 3;
const BATCH_SIZE = 8;

// Seed cities data (ported from Python)
const MAJOR_CITIES = [
  // EASY - Major Western cities
  { name: 'New York', lat: 40.7589, lng: -73.9851, country: 'United States', difficulty: 'EASY' },
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'United Kingdom', difficulty: 'EASY' },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, country: 'France', difficulty: 'EASY' },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, country: 'United States', difficulty: 'EASY' },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, country: 'Germany', difficulty: 'EASY' },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, country: 'Australia', difficulty: 'EASY' },
  { name: 'Toronto', lat: 43.651070, lng: -79.347015, country: 'Canada', difficulty: 'EASY' },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, country: 'Netherlands', difficulty: 'EASY' },
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734, country: 'Spain', difficulty: 'EASY' },
  { name: 'Rome', lat: 41.9028, lng: 12.4964, country: 'Italy', difficulty: 'EASY' },
  
  // MEDIUM - Major global cities
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan', difficulty: 'MEDIUM' },
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333, country: 'Brazil', difficulty: 'MEDIUM' },
  { name: 'Mumbai', lat: 19.0760, lng: 72.8777, country: 'India', difficulty: 'MEDIUM' },
  { name: 'Seoul', lat: 37.5665, lng: 126.9780, country: 'South Korea', difficulty: 'MEDIUM' },
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332, country: 'Mexico', difficulty: 'MEDIUM' },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018, country: 'Thailand', difficulty: 'MEDIUM' },
  { name: 'Cairo', lat: 30.0444, lng: 31.2357, country: 'Egypt', difficulty: 'MEDIUM' },
  { name: 'Buenos Aires', lat: -34.6118, lng: -58.3960, country: 'Argentina', difficulty: 'MEDIUM' },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, country: 'Singapore', difficulty: 'MEDIUM' },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784, country: 'Turkey', difficulty: 'MEDIUM' },
  
  // HARD - Regional capitals and major cities
  { name: 'Moscow', lat: 55.7558, lng: 37.6176, country: 'Russia', difficulty: 'HARD' },
  { name: 'Beijing', lat: 39.9042, lng: 116.4074, country: 'China', difficulty: 'HARD' },
  { name: 'Lagos', lat: 6.5244, lng: 3.3792, country: 'Nigeria', difficulty: 'HARD' },
  { name: 'Jakarta', lat: -6.2088, lng: 106.8456, country: 'Indonesia', difficulty: 'HARD' },
  { name: 'Manila', lat: 14.5995, lng: 120.9842, country: 'Philippines', difficulty: 'HARD' },
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219, country: 'Kenya', difficulty: 'HARD' },
  { name: 'Lima', lat: -12.0464, lng: -77.0428, country: 'Peru', difficulty: 'HARD' },
  { name: 'Warsaw', lat: 52.2297, lng: 21.0122, country: 'Poland', difficulty: 'HARD' },
  { name: 'Prague', lat: 50.0755, lng: 14.4378, country: 'Czech Republic', difficulty: 'HARD' },
  { name: 'Vienna', lat: 48.2082, lng: 16.3738, country: 'Austria', difficulty: 'HARD' },
  
  // EXPERT - Smaller cities and unique locations
  { name: 'Reykjavik', lat: 64.1466, lng: -21.9426, country: 'Iceland', difficulty: 'EXPERT' },
  { name: 'Tallinn', lat: 59.4370, lng: 24.7536, country: 'Estonia', difficulty: 'EXPERT' },
  { name: 'Ljubljana', lat: 46.0569, lng: 14.5058, country: 'Slovenia', difficulty: 'EXPERT' },
  { name: 'Riga', lat: 56.9496, lng: 24.1052, country: 'Latvia', difficulty: 'EXPERT' },
  { name: 'Vilnius', lat: 54.6872, lng: 25.2797, country: 'Lithuania', difficulty: 'EXPERT' },
  { name: 'Helsinki', lat: 60.1699, lng: 24.9384, country: 'Finland', difficulty: 'EXPERT' },
  { name: 'Oslo', lat: 59.9139, lng: 10.7522, country: 'Norway', difficulty: 'EXPERT' },
  { name: 'Bratislava', lat: 48.1486, lng: 17.1077, country: 'Slovakia', difficulty: 'EXPERT' },
  { name: 'Zagreb', lat: 45.8150, lng: 15.9819, country: 'Croatia', difficulty: 'EXPERT' },
  { name: 'Luxembourg City', lat: 49.6116, lng: 6.1319, country: 'Luxembourg', difficulty: 'EXPERT' }
];

// Country code mapping
const COUNTRY_CODES = {
  'United States': 'US', 'United Kingdom': 'GB', 'France': 'FR', 'Germany': 'DE',
  'Australia': 'AU', 'Canada': 'CA', 'Netherlands': 'NL', 'Spain': 'ES',
  'Italy': 'IT', 'Japan': 'JP', 'Brazil': 'BR', 'India': 'IN',
  'South Korea': 'KR', 'Mexico': 'MX', 'Thailand': 'TH', 'Egypt': 'EG',
  'Argentina': 'AR', 'Singapore': 'SG', 'Turkey': 'TR', 'Russia': 'RU',
  'China': 'CN', 'Nigeria': 'NG', 'Indonesia': 'ID', 'Philippines': 'PH',
  'Kenya': 'KE', 'Peru': 'PE', 'Poland': 'PL', 'Czech Republic': 'CZ',
  'Austria': 'AT', 'Iceland': 'IS', 'Estonia': 'EE', 'Slovenia': 'SI',
  'Latvia': 'LV', 'Lithuania': 'LT', 'Finland': 'FI', 'Norway': 'NO',
  'Slovakia': 'SK', 'Croatia': 'HR', 'Luxembourg': 'LU'
};

class UnifiedGeoGuesserGenerator {
  constructor() {
    this.locations = [];
    this.attempts = 0;
    this.successCount = 0;
    this.failed = [];
    this.startTime = Date.now();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCountryCode(country) {
    return COUNTRY_CODES[country] || 'XX';
  }

  async testMapillaryCoverage(lat, lng) {
    try {
      const buffer = 0.002;
      const bbox = `${lng - buffer},${lat - buffer},${lng + buffer},${lat + buffer}`;
      const url = 'https://graph.mapillary.com/images';
      const params = new URLSearchParams({
        access_token: MAPILLARY_TOKEN,
        fields: 'id,thumb_2048_url',
        bbox: bbox
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'GeoGuesser-Bot/2.0 (Discord Bot; Unified Generator)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 400) {
          // API overload - just return null without spam
          return null;
        }
        const errorText = await response.text();
        console.log(`Mapillary API error: ${response.status} - ${errorText}`);
        return null;
      }

      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        return data.data[0].thumb_2048_url;
      }
      return null;
    } catch (error) {
      console.log(`Mapillary error: ${error.message}`);
      return null;
    }
  }

  async reverseGeocode(lat, lng) {
    try {
      const url = 'https://nominatim.openstreetmap.org/reverse';
      const params = new URLSearchParams({
        format: 'json',
        lat: lat,
        lon: lng,
        zoom: 14,
        addressdetails: 1,
        'accept-language': 'en'
      });

      const response = await fetch(`${url}?${params}`, {
        headers: {
          'User-Agent': 'GeoGuesser-Bot/2.0 (Discord Bot; Unified Generator)'
        }
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (!data || !data.address) return null;

      const address = data.address;

      // Enhanced city name resolution
      const cityCandidates = [
        address.city, address.town, address.village, address.municipality,
        address.suburb, address.neighbourhood, address.hamlet, address.district, address.borough
      ];

      let city = null;
      for (const candidate of cityCandidates) {
        if (candidate && candidate.trim().length > 1) {
          if (!['unknown', 'unnamed', 'no name'].includes(candidate.toLowerCase())) {
            city = candidate.trim();
            break;
          }
        }
      }

      // Fallback to display name components
      if (!city || city.toLowerCase() === 'unknown city') {
        const displayName = data.display_name || '';
        if (displayName) {
          const parts = displayName.split(',');
          for (const part of parts.slice(0, 3)) {
            const trimmed = part.trim();
            if (trimmed.length > 2 && !trimmed.match(/^\d+$/) && 
                !['unnamed', 'unknown'].includes(trimmed.toLowerCase())) {
              city = trimmed;
              break;
            }
          }
        }
      }

      if (!city) {
        city = `Area near ${address.state || address.country || 'Unknown'}`;
      }

      return {
        city: city,
        country: address.country || 'Unknown Country',
        countryCode: (address.country_code || 'XX').toUpperCase(),
        state: address.state || address.province || address.region || null
      };

    } catch (error) {
      console.log(`Geocoding error: ${error.message}`);
      return null;
    }
  }

  async downloadImage(url, retries = 0) {
    try {
      console.log(`📥 Downloading: ${url.substring(0, 80)}...`);
      
      const response = await fetch(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'GeoGuesser-Bot/2.0 (Discord Bot; Unified Generator)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      if (buffer.length === 0) {
        throw new Error('Empty image data');
      }

      // Convert to base64 with proper data URI format
      const mimeType = contentType.split(';')[0];
      const base64 = buffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64}`;

      console.log(`✅ Downloaded: ${Math.round(buffer.length / 1024)}KB`);
      return dataUri;

    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
      
      if (retries < MAX_RETRIES) {
        console.log(`🔄 Retrying in ${RETRY_DELAY}ms... (attempt ${retries + 1}/${MAX_RETRIES})`);
        await this.sleep(RETRY_DELAY * (retries + 1));
        return this.downloadImage(url, retries + 1);
      } else {
        throw error;
      }
    }
  }

  async generateSingleLocation(seedCity, attemptNum) {
    // Generate coordinates within 20km of the city center
    const radiusKm = 20;
    const radiusDegrees = radiusKm / 111; // Rough conversion
    
    const latOffset = (Math.random() - 0.5) * 2 * radiusDegrees;
    const lngOffset = (Math.random() - 0.5) * 2 * radiusDegrees;
    
    const newLat = seedCity.lat + latOffset;
    const newLng = seedCity.lng + lngOffset;
    
    this.attempts++;
    
    // Test Mapillary coverage
    const imageUrl = await this.testMapillaryCoverage(newLat, newLng);
    if (!imageUrl) return null;
    
    // Get location info
    const locationInfo = await this.reverseGeocode(newLat, newLng);
    if (!locationInfo) return null;
    
    // Skip locations without a state - we only want high-quality data
    if (!locationInfo.state) {
      console.log(`  Skipping ${locationInfo.city}, ${locationInfo.country} - no state/province info`);
      return null;
    }
    
    // Download and convert image to base64
    let imageData;
    try {
      imageData = await this.downloadImage(imageUrl);
    } catch (error) {
      console.log(`Failed to download image for ${locationInfo.city}: ${error.message}`);
      this.failed.push({
        location: `${locationInfo.city}, ${locationInfo.country}`,
        error: error.message,
        url: imageUrl
      });
      return null;
    }
    
    const stateOrCountry = locationInfo.state || locationInfo.country || seedCity.country;
    const geoCode = `${locationInfo.city || seedCity.name}-${stateOrCountry}`.toUpperCase();
    
    const location = {
      latitude: Math.round(newLat * 1000000) / 1000000,
      longitude: Math.round(newLng * 1000000) / 1000000,
      city: locationInfo.city || `${seedCity.name} Area`,
      state: locationInfo.state,
      country: locationInfo.country || seedCity.country,
      countryCode: locationInfo.countryCode || this.getCountryCode(seedCity.country),
      geoCode: geoCode,
      difficulty: seedCity.difficulty,
      source: 'GENERATED',
      imageData: imageData,
      baseCity: seedCity.name
    };
    
    this.successCount++;
    console.log(`  Found: ${location.city} (attempt ${attemptNum})`);
    return location;
  }

  async exploreAroundCity(seedCity, targetCount = 10) {
    console.log(`\nExploring around ${seedCity.name}, ${seedCity.country} - need ${targetCount} valid locations...`);
    
    const locations = [];
    let attempts = 0;
    const maxAttempts = targetCount * 10; // Try up to 10x the target to account for skips
    
    while (locations.length < targetCount && attempts < maxAttempts) {
      const batchSize = Math.min(BATCH_SIZE, targetCount - locations.length);
      const tasks = [];
      
      for (let i = 0; i < batchSize; i++) {
        tasks.push(this.generateSingleLocation(seedCity, attempts + i + 1));
      }
      
      const results = await Promise.allSettled(tasks);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
          locations.push(result.value);
          if (locations.length >= targetCount) break;
        }
      }
      
      attempts += batchSize;
      
      // Small delay between batches
      if (locations.length < targetCount && attempts < maxAttempts) {
        await this.sleep(200);
      }
      
      console.log(`  Progress: ${locations.length}/${targetCount} valid locations found (${attempts} attempts)`);
    }
    
    if (locations.length < targetCount) {
      console.log(`  Warning: Only found ${locations.length}/${targetCount} valid locations after ${attempts} attempts`);
    }
    
    return locations;
  }

  async generateSeedCityLocation(seedCity) {
    console.log(`Testing seed city: ${seedCity.name}, ${seedCity.country}`);
    
    const imageUrl = await this.testMapillaryCoverage(seedCity.lat, seedCity.lng);
    if (!imageUrl) {
      console.log(`No coverage for seed city: ${seedCity.name}`);
      return null;
    }
    
    // Get proper state/province information for seed cities
    const locationInfo = await this.reverseGeocode(seedCity.lat, seedCity.lng);
    if (!locationInfo) {
      console.log(`Failed to geocode seed city: ${seedCity.name}`);
      return null;
    }
    
    // Skip seed cities without state information - we want quality data
    if (!locationInfo.state) {
      console.log(`Skipping seed city ${seedCity.name} - no state/province info`);
      return null;
    }
    
    // Download and convert image to base64
    let imageData;
    try {
      imageData = await this.downloadImage(imageUrl);
    } catch (error) {
      console.log(`Failed to download image for seed city ${seedCity.name}: ${error.message}`);
      this.failed.push({
        location: `${seedCity.name}, ${seedCity.country}`,
        error: error.message,
        url: imageUrl
      });
      return null;
    }
    
    const location = {
      latitude: seedCity.lat,
      longitude: seedCity.lng,
      city: locationInfo.city || seedCity.name,
      state: locationInfo.state,
      country: locationInfo.country || seedCity.country,
      countryCode: locationInfo.countryCode || this.getCountryCode(seedCity.country),
      geoCode: `${seedCity.name}-${locationInfo.state}`.toUpperCase(),
      difficulty: seedCity.difficulty,
      source: 'SEED',
      imageData: imageData,
      baseCity: seedCity.name
    };
    
    this.successCount++;
    console.log(`Seed city confirmed: ${seedCity.name}, ${locationInfo.state}`);
    return location;
  }

  async generateForDifficulty(difficulty, targetCount) {
    console.log(`\nGenerating ${targetCount} ${difficulty} locations...`);
    const seedCities = MAJOR_CITIES.filter(city => city.difficulty === difficulty);
    const locations = [];
    
    // First, validate and include the seed cities themselves - with larger delays
    console.log(`Testing ${seedCities.length} seed cities with controlled delays...`);
    const seedTasks = seedCities.map((city, index) => 
      // Stagger API calls with larger delays to prevent API overload
      this.sleep(index * 800).then(() => this.generateSeedCityLocation(city))
    );
    const seedResults = await Promise.allSettled(seedTasks);
    
    for (const result of seedResults) {
      if (result.status === 'fulfilled' && result.value !== null) {
        locations.push(result.value);
      }
    }
    
    console.log(`Seed cities confirmed: ${locations.length}/${seedCities.length}`);
    
    // Then generate variations around successful seed cities until we have enough
    let currentCount = locations.length;
    let cityIndex = 0;
    
    while (currentCount < targetCount && cityIndex < seedCities.length) {
      const seedCity = seedCities[cityIndex];
      const needed = Math.min(5, targetCount - currentCount);
      
      console.log(`\nGenerating around ${seedCity.name} - need ${needed} more locations...`);
      const variations = await this.exploreAroundCity(seedCity, needed);
      locations.push(...variations);
      currentCount = locations.length;
      
      console.log(`Progress: ${currentCount}/${targetCount} ${difficulty} locations`);
      
      cityIndex++;
      
      // If we've tried all cities but still need more, loop back with smaller batches
      if (cityIndex >= seedCities.length && currentCount < targetCount) {
        console.log(`Cycling back through cities to find remaining ${targetCount - currentCount} locations...`);
        cityIndex = 0;
      }
    }
    
    if (currentCount < targetCount) {
      console.log(`Warning: Only generated ${currentCount}/${targetCount} ${difficulty} locations with valid state data`);
    }
    
    return locations.slice(0, targetCount);
  }

  async generate(targetCounts) {
    console.log('Starting unified GeoGuesser location and image generation...\n');
    
    const allLocations = [];
    
    for (const [difficulty, count] of Object.entries(targetCounts)) {
      if (count > 0) {
        const locations = await this.generateForDifficulty(difficulty, count);
        allLocations.push(...locations);
        
        console.log(`\nCompleted ${difficulty}: ${locations.length} locations`);
      }
    }
    
    // Generate final database
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    const finalData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalLocations: allLocations.length,
        totalAttempts: this.attempts,
        successRate: `${((allLocations.length / Math.max(this.attempts, 1)) * 100).toFixed(1)}%`,
        generationTimeSeconds: Math.round(duration / 1000),
        failedDownloads: this.failed.length,
        breakdown: {
          EASY: allLocations.filter(l => l.difficulty === 'EASY').length,
          MEDIUM: allLocations.filter(l => l.difficulty === 'MEDIUM').length,
          HARD: allLocations.filter(l => l.difficulty === 'HARD').length,
          EXPERT: allLocations.filter(l => l.difficulty === 'EXPERT').length,
        }
      },
      locations: allLocations
    };
    
    // Save JSON (for compatibility)
    await fs.writeFile('geoguesser-complete-database.json', JSON.stringify(finalData, null, 2), 'utf-8');
    
    // Save MessagePack (optimized format - 2.76x faster)
    console.log('\n🔄 Converting to MessagePack format...');
    const msgpackData = encode(finalData);
    await fs.writeFile('geoguesser-complete-database.msgpack', msgpackData);
    
    const jsonSize = Math.round((await fs.stat('geoguesser-complete-database.json')).size / (1024 * 1024));
    const msgpackSize = Math.round((await fs.stat('geoguesser-complete-database.msgpack')).size / (1024 * 1024));
    
    console.log('\n🎉 Unified generation complete!');
    console.log('=====================================');
    console.log(`📊 Statistics:`);
    console.log(`   Total attempts: ${this.attempts}`);
    console.log(`   Successful locations: ${allLocations.length}`);
    console.log(`   Success rate: ${((allLocations.length / Math.max(this.attempts, 1)) * 100).toFixed(1)}%`);
    console.log(`   Generation time: ${Math.round(duration / 1000)} seconds`);
    console.log(`   Failed downloads: ${this.failed.length}`);
    console.log(`\n📁 Files created:`);
    console.log(`   - geoguesser-complete-database.json (${jsonSize}MB)`);
    console.log(`   - geoguesser-complete-database.msgpack (${msgpackSize}MB) [${((msgpackSize/jsonSize)*100).toFixed(1)}% size]`);
    console.log(`\n⚡ MessagePack format provides 2.76x faster loading performance!`);
    
    if (this.failed.length > 0) {
      console.log('\n❌ Failed Downloads:');
      this.failed.forEach(fail => {
        console.log(`   • ${fail.location}: ${fail.error}`);
      });
    }
    
    return finalData;
  }
}

// Parse command line arguments
function parseArguments() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return { EASY: 30, MEDIUM: 30, HARD: 30, EXPERT: 30 };
  }
  
  if (args.length !== 4) {
    console.error('Usage: node generate-geoguesser-complete.js [easy_count] [medium_count] [hard_count] [expert_count]');
    console.error('Example: node generate-geoguesser-complete.js 15 12 10 8');
    process.exit(1);
  }
  
  const [easy, medium, hard, expert] = args.map(arg => {
    const num = parseInt(arg, 10);
    if (isNaN(num) || num < 0) {
      console.error(`Invalid count: ${arg}. Must be a non-negative integer.`);
      process.exit(1);
    }
    return num;
  });
  
  return { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
}

// Main execution
async function main() {
  try {
    const targetCounts = parseArguments();
    
    console.log('🌍 Unified GeoGuesser Generator');
    console.log('===============================');
    console.log(`Target counts: EASY=${targetCounts.EASY}, MEDIUM=${targetCounts.MEDIUM}, HARD=${targetCounts.HARD}, EXPERT=${targetCounts.EXPERT}`);
    console.log(`Total target: ${Object.values(targetCounts).reduce((a, b) => a + b, 0)} locations\n`);
    
    const generator = new UnifiedGeoGuesserGenerator();
    await generator.generate(targetCounts);
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function when script is executed directly
main();