/**
 * @fileoverview AI-powered guess validation for GeoGuesser game.
 * 
 * Provides intelligent validation of user guesses against correct locations
 * using Google AI models. Features sophisticated geographic knowledge for
 * handling spelling variations, alternative names, and proximity-based scoring.
 * Key capabilities include:
 * - Structured input/output validation using Gemini API compatible schemas
 * - Geographic knowledge for alternative city/country names
 * - Partial credit scoring based on proximity and specificity
 * - Intelligent reasoning for educational feedback
 * - Fallback validation for AI service failures
 * 
 * The AI analyzes user guesses against the correct location data and provides
 * accuracy scores, reasoning, and partial credit calculations to create an
 * engaging and educational geographic guessing experience.
 */

import { ai } from '../../../genkit.config.js';
import { z } from 'zod';
import { logger } from '../../../utils/logger.js';

export const GeoGuesserValidationInputSchema = z.object({
  userGuess: z.string().min(1),
  correctLocation: z.object({
    city: z.string(),
    state: z.string().optional(),
    country: z.string(),
    countryCode: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']),
  allowPartialCredit: z.boolean(),
  hintLevel: z.number().min(0).max(3).optional(),
});

export const GeoGuesserValidationOutputSchema = z.object({
  isCorrect: z.boolean(),
  accuracy: z.number().min(0).max(1),
  distance: z.number().min(0).optional(),
  reasoning: z.string(),
  partialCreditPoints: z.number().min(0).max(100),
  suggestedAnswer: z.string().optional(),
  matchType: z.enum(['EXACT', 'CITY', 'COUNTRY', 'REGION', 'CONTINENT', 'NONE']),
});

export type GeoGuesserValidationInput = z.infer<typeof GeoGuesserValidationInputSchema>;
export type GeoGuesserValidationOutput = z.infer<typeof GeoGuesserValidationOutputSchema>;

export async function geoGuesserValidationFlow(input: GeoGuesserValidationInput): Promise<GeoGuesserValidationOutput> {
  try {
    const difficultyScoring = {
      EASY: { exactBonus: 100, cityMatch: 80, countryMatch: 60, regionMatch: 40 },
      MEDIUM: { exactBonus: 100, cityMatch: 75, countryMatch: 50, regionMatch: 30 },
      HARD: { exactBonus: 100, cityMatch: 70, countryMatch: 40, regionMatch: 20 },
      EXPERT: { exactBonus: 100, cityMatch: 65, countryMatch: 30, regionMatch: 15 }
    };

    const scoring = difficultyScoring[input.difficulty];
    const location = input.correctLocation;
    
    const prompt = `You are an expert geography validator for a guessing game. Analyze the user's guess against the correct location.

USER GUESS: "${input.userGuess}"

CORRECT LOCATION:
- City: ${location.city}
- State/Province: ${location.state || 'N/A'}
- Country: ${location.country}
- Country Code: ${location.countryCode}
- Coordinates: ${location.latitude}, ${location.longitude}

DIFFICULTY LEVEL: ${input.difficulty}
ALLOW PARTIAL CREDIT: ${input.allowPartialCredit}

Your task is to determine:
1. How accurate is the user's guess?
2. What type of match is this? (exact city, country only, region, etc.)
3. What points should they receive based on accuracy?
4. Provide helpful reasoning/feedback

SCORING GUIDELINES for ${input.difficulty} difficulty:
- Exact city + country match: ${scoring.exactBonus} points
- City name correct (any country): ${scoring.cityMatch} points  
- Country correct only: ${scoring.countryMatch} points
- Region/continent correct: ${scoring.regionMatch} points
- Completely wrong: 0 points

IMPORTANT CONSIDERATIONS:
- Handle alternative spellings and names (e.g., "NYC" = "New York City")
- Consider common abbreviations and alternate names
- Account for different languages/translations
- Be lenient with minor spelling errors
- Consider if user mentioned right general area even if not exact
- For country guesses, accept various forms (USA/United States/America)

Be generous but fair in your assessment. The goal is education and fun, not perfection.

Respond with your analysis of the guess accuracy and appropriate scoring.`;

    const result = await ai.generate({
      prompt,
      output: {
        schema: GeoGuesserValidationOutputSchema,
        format: 'json',
      },
    });

    const validation = result.output;

    if (!validation) {
      throw new Error('AI failed to generate validation result');
    }

    // Ensure accuracy is within bounds
    validation.accuracy = Math.max(0, Math.min(1, validation.accuracy));
    validation.partialCreditPoints = Math.max(0, Math.min(100, validation.partialCreditPoints));

    logger.info(`GeoGuesser validation: "${input.userGuess}" vs "${location.city}, ${location.country}" -> ${validation.accuracy} accuracy, ${validation.partialCreditPoints} points`);

    return validation;

  } catch (error) {
    logger.warn('GeoGuesser AI validation failed, using fallback:', error);
    return getFallbackValidation(input);
  }
}

function getFallbackValidation(input: GeoGuesserValidationInput): GeoGuesserValidationOutput {
  const guess = input.userGuess.toLowerCase().trim();
  const location = input.correctLocation;
  const city = location.city.toLowerCase();
  const country = location.country.toLowerCase();
  const state = location.state?.toLowerCase();

  // Simple string matching fallback
  let matchType: 'EXACT' | 'CITY' | 'COUNTRY' | 'REGION' | 'CONTINENT' | 'NONE' = 'NONE';
  let accuracy = 0;
  let points = 0;
  let reasoning = 'Fallback validation used due to AI service unavailability.';

  // Check for exact matches or close matches
  if (guess.includes(city) && guess.includes(country)) {
    matchType = 'EXACT';
    accuracy = 1.0;
    points = 100;
    reasoning = `Excellent! You correctly identified ${location.city}, ${location.country}.`;
  } else if (guess.includes(city)) {
    matchType = 'CITY';
    accuracy = 0.8;
    points = 75;
    reasoning = `Good job! You got the city (${location.city}) correct, but missed the country.`;
  } else if (guess.includes(country)) {
    matchType = 'COUNTRY';
    accuracy = 0.6;
    points = 50;
    reasoning = `Not bad! You correctly identified the country (${location.country}), but not the specific city.`;
  } else if (state && guess.includes(state)) {
    matchType = 'REGION';
    accuracy = 0.4;
    points = 30;
    reasoning = `You got the general region correct, but missed the specific location.`;
  } else {
    matchType = 'NONE';
    accuracy = 0.0;
    points = 0;
    reasoning = `Your guess didn't match the correct location: ${location.city}, ${location.country}.`;
  }

  // Apply difficulty multiplier
  const difficultyMultiplier = {
    EASY: 1.0,
    MEDIUM: 0.9,
    HARD: 0.8,
    EXPERT: 0.7
  };

  points = Math.round(points * difficultyMultiplier[input.difficulty]);

  return {
    isCorrect: accuracy >= 0.8,
    accuracy,
    reasoning,
    partialCreditPoints: points,
    matchType,
    suggestedAnswer: `${location.city}, ${location.country}`
  };
}

export async function validateLocationGuess(
  userGuess: string,
  correctLocation: {
    city: string;
    state?: string;
    country: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  },
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT',
  allowPartialCredit = true
): Promise<GeoGuesserValidationOutput> {
  return geoGuesserValidationFlow({
    userGuess,
    correctLocation,
    difficulty,
    allowPartialCredit
  });
}