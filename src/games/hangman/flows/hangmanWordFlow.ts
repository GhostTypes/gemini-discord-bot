/**
 * @fileoverview AI-powered word generation flow for Hangman game.
 * 
 * Generates words using Google's AI with configurable difficulty and categories.
 * Uses structured input/output schemas for type safety and validation.
 * Includes fallback word lists for reliability when AI generation fails.
 * 
 * Features:
 * - Category-based word generation (Animals, Movies, Countries, etc.)
 * - Difficulty levels with appropriate word length and complexity
 * - Progressive hint system with multiple hint options
 * - Fallback word lists for high availability
 * - Input validation and sanitization
 */

import { ai } from '../../../genkit.config.js';
import { z } from 'zod';

const WordGenerationInputSchema = z.object({
  category: z.enum(['ANIMALS', 'MOVIES', 'COUNTRIES', 'FOOD', 'SPORTS', 'TECHNOLOGY', 'RANDOM']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  previousWords: z.array(z.string()).optional(),
});

const WordGenerationOutputSchema = z.object({
  word: z.string().min(3).max(15),
  category: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  hint: z.string(),
  alternativeHints: z.array(z.string()).min(1).max(3),
});

export async function hangmanWordFlow(input: z.infer<typeof WordGenerationInputSchema>): Promise<z.infer<typeof WordGenerationOutputSchema>> {
  const difficultySpecs = {
    EASY: '3-6 letters, common everyday words',
    MEDIUM: '5-9 letters, moderate vocabulary level',
    HARD: '7-15 letters, challenging vocabulary, proper nouns allowed'
  };

  const categoryPrompts = {
    ANIMALS: 'animals, creatures, wildlife, pets, insects, birds, marine life',
    MOVIES: 'movie titles, film names, cinema classics, popular films',
    COUNTRIES: 'countries, nations, territories, places around the world',
    FOOD: 'food items, dishes, ingredients, cuisine, beverages',
    SPORTS: 'sports, games, athletic activities, equipment, terms',
    TECHNOLOGY: 'technology, computers, gadgets, software, digital terms',
    RANDOM: 'any appropriate word from various categories'
  };

  const prompt = `Generate a word for a Hangman game with these requirements:

Category: ${input.category} (${categoryPrompts[input.category]})
Difficulty: ${input.difficulty} (${difficultySpecs[input.difficulty]})
${input.previousWords?.length ? `Avoid these recently used words: ${input.previousWords.join(', ')}` : ''}

Requirements:
- Word must be appropriate for all audiences
- No abbreviations, contractions, or hyphenated words
- For EASY: use common words everyone knows
- For MEDIUM: use moderately challenging words
- For HARD: use advanced vocabulary, proper nouns acceptable
- Provide one main hint and 2-3 alternative hints for progressive difficulty

Return a suitable word with helpful hints that give clues without being too obvious.`;

  try {
    const result = await ai.generate({
      prompt,
      output: {
        schema: WordGenerationOutputSchema,
        format: 'json',
      },
    });

    const wordData = result.output;
    if (!wordData) {
      throw new Error('AI failed to generate word data');
    }

    // Validation and sanitization
    const word = wordData.word.toUpperCase().trim();
    if (!/^[A-Z]+$/.test(word)) {
      throw new Error('Generated word contains invalid characters');
    }

    return {
      ...wordData,
      word: word,
    };
  } catch (error) {
    console.error('AI word generation failed, using fallback:', error);
    return getFallbackWord(input.category, input.difficulty, input.previousWords);
  }
}

// Fallback word lists for when AI fails
export const FALLBACK_WORDS = {
  EASY: {
    ANIMALS: [
      { word: 'CAT', hint: 'A common pet that purrs', alternativeHints: ['Has whiskers', 'Says meow', 'Chases mice'] },
      { word: 'DOG', hint: 'Mans best friend', alternativeHints: ['Barks loudly', 'Wags tail', 'Loyal pet'] },
      { word: 'BIRD', hint: 'Flies in the sky', alternativeHints: ['Has feathers', 'Lays eggs', 'Can sing'] },
      { word: 'FISH', hint: 'Swims in water', alternativeHints: ['Lives in ocean', 'Has fins', 'Breathes through gills'] },
      { word: 'BEAR', hint: 'Large forest animal', alternativeHints: ['Hibernates in winter', 'Loves honey', 'Has claws'] }
    ],
    MOVIES: [
      { word: 'JAWS', hint: 'Famous shark movie', alternativeHints: ['Scary ocean film', 'Big teeth', 'Beach thriller'] },
      { word: 'CARS', hint: 'Animated racing movie', alternativeHints: ['Lightning McQueen', 'Pixar film', 'Fast vehicles'] },
      { word: 'FROZEN', hint: 'Disney ice princess', alternativeHints: ['Let it go', 'Elsa and Anna', 'Snow queen'] },
      { word: 'SHREK', hint: 'Green ogre character', alternativeHints: ['Swamp dweller', 'Princess Fiona', 'Fairy tale'] }
    ],
    COUNTRIES: [
      { word: 'ITALY', hint: 'Boot shaped country', alternativeHints: ['Home of pizza', 'Rome is capital', 'Mediterranean nation'] },
      { word: 'JAPAN', hint: 'Island nation in Asia', alternativeHints: ['Land of rising sun', 'Tokyo capital', 'Sushi origin'] },
      { word: 'EGYPT', hint: 'Land of pyramids', alternativeHints: ['Nile river', 'Ancient pharaohs', 'African desert'] }
    ],
    FOOD: [
      { word: 'PIZZA', hint: 'Round flatbread with toppings', alternativeHints: ['Italian dish', 'Cheese and sauce', 'Slice it up'] },
      { word: 'APPLE', hint: 'Red or green fruit', alternativeHints: ['Grows on trees', 'Healthy snack', 'Teachers gift'] },
      { word: 'BREAD', hint: 'Baked flour product', alternativeHints: ['Made from wheat', 'Breakfast staple', 'Goes with butter'] }
    ],
    SPORTS: [
      { word: 'SOCCER', hint: 'Worlds most popular sport', alternativeHints: ['Kick the ball', 'World Cup game', 'No hands allowed'] },
      { word: 'GOLF', hint: 'Sport with holes and clubs', alternativeHints: ['Green grass course', 'Small white ball', 'Lowest score wins'] }
    ],
    TECHNOLOGY: [
      { word: 'PHONE', hint: 'Device for calling', alternativeHints: ['Rings when called', 'Pocket computer', 'Text messaging'] },
      { word: 'MOUSE', hint: 'Computer pointing device', alternativeHints: ['Click and drag', 'Has buttons', 'Moves cursor'] }
    ],
    RANDOM: [
      { word: 'HOUSE', hint: 'Place where people live', alternativeHints: ['Has rooms', 'Roof and walls', 'Your home'] },
      { word: 'BOOK', hint: 'Collection of pages to read', alternativeHints: ['Has chapters', 'Library item', 'Knowledge source'] }
    ]
  },
  MEDIUM: {
    ANIMALS: [
      { word: 'ELEPHANT', hint: 'Largest land mammal', alternativeHints: ['Has a trunk', 'Never forgets', 'African safari'] },
      { word: 'PENGUIN', hint: 'Flightless Antarctic bird', alternativeHints: ['Black and white', 'Waddles on ice', 'Eats fish'] },
      { word: 'GIRAFFE', hint: 'Tallest animal on Earth', alternativeHints: ['Long spotted neck', 'Eats leaves', 'African savanna'] }
    ],
    MOVIES: [
      { word: 'TITANIC', hint: 'Ship disaster romance', alternativeHints: ['Leonardo DiCaprio', 'Iceberg collision', 'Jack and Rose'] },
      { word: 'AVATAR', hint: 'Blue aliens on Pandora', alternativeHints: ['James Cameron', 'Tree of souls', 'Sky people'] }
    ],
    COUNTRIES: [
      { word: 'AUSTRALIA', hint: 'Island continent down under', alternativeHints: ['Kangaroo homeland', 'Sydney Opera House', 'Outback desert'] },
      { word: 'BRAZIL', hint: 'Largest South American country', alternativeHints: ['Amazon rainforest', 'Carnival festival', 'Portuguese language'] }
    ],
    FOOD: [
      { word: 'SPAGHETTI', hint: 'Long thin Italian pasta', alternativeHints: ['Twirl with fork', 'Marinara sauce', 'Meatballs partner'] },
      { word: 'SANDWICH', hint: 'Food between bread slices', alternativeHints: ['Lunch favorite', 'Stack ingredients', 'Cut diagonally'] }
    ],
    SPORTS: [
      { word: 'BASKETBALL', hint: 'Sport with hoops and dribbling', alternativeHints: ['Orange bouncing ball', 'Slam dunks', 'Five players per team'] },
      { word: 'SWIMMING', hint: 'Water sport activity', alternativeHints: ['Pool or ocean', 'Stroke techniques', 'Olympic event'] }
    ],
    TECHNOLOGY: [
      { word: 'COMPUTER', hint: 'Electronic processing machine', alternativeHints: ['Keyboard and screen', 'Runs software', 'Digital brain'] },
      { word: 'INTERNET', hint: 'Global network connection', alternativeHints: ['World wide web', 'Online browsing', 'Digital highway'] }
    ],
    RANDOM: [
      { word: 'RAINBOW', hint: 'Colorful arc in sky', alternativeHints: ['After the rain', 'Seven colors', 'Pot of gold'] },
      { word: 'MOUNTAIN', hint: 'Tall natural formation', alternativeHints: ['Peak and valleys', 'Snow capped', 'Climbing challenge'] }
    ]
  },
  HARD: {
    ANIMALS: [
      { word: 'RHINOCEROS', hint: 'Horned thick-skinned mammal', alternativeHints: ['African grasslands', 'Endangered species', 'Massive herbivore'] },
      { word: 'CHIMPANZEE', hint: 'Intelligent primate species', alternativeHints: ['Closest human relative', 'Uses tools', 'Lives in groups'] }
    ],
    MOVIES: [
      { word: 'CASABLANCA', hint: 'Classic wartime romance', alternativeHints: ['Humphrey Bogart', 'Play it again Sam', 'Ricks Cafe'] },
      { word: 'INCEPTION', hint: 'Dreams within dreams', alternativeHints: ['Christopher Nolan', 'Mind bending plot', 'Leonardo DiCaprio'] }
    ],
    COUNTRIES: [
      { word: 'MADAGASCAR', hint: 'Large African island nation', alternativeHints: ['Unique wildlife', 'Indian Ocean', 'Lemur habitat'] },
      { word: 'AZERBAIJAN', hint: 'Caucasus region country', alternativeHints: ['Caspian Sea border', 'Oil rich nation', 'Between Europe Asia'] }
    ],
    FOOD: [
      { word: 'CAPPUCCINO', hint: 'Italian coffee drink', alternativeHints: ['Foam milk art', 'Morning beverage', 'Espresso based'] },
      { word: 'QUESADILLA', hint: 'Mexican cheese tortilla', alternativeHints: ['Grilled flatbread', 'Folded and crispy', 'Melted filling'] }
    ],
    SPORTS: [
      { word: 'BADMINTON', hint: 'Racquet sport with shuttlecock', alternativeHints: ['Net game', 'Feathered projectile', 'Quick reflexes'] },
      { word: 'EQUESTRIAN', hint: 'Horse riding competition', alternativeHints: ['Olympic discipline', 'Dressage jumping', 'Rider and mount'] }
    ],
    TECHNOLOGY: [
      { word: 'ALGORITHM', hint: 'Step by step problem solving', alternativeHints: ['Computer instructions', 'Programming logic', 'Mathematical process'] },
      { word: 'CRYPTOCURRENCY', hint: 'Digital decentralized money', alternativeHints: ['Blockchain technology', 'Bitcoin example', 'Virtual currency'] }
    ],
    RANDOM: [
      { word: 'LABYRINTH', hint: 'Complex maze structure', alternativeHints: ['Twisted pathways', 'Greek mythology', 'Minotaur home'] },
      { word: 'KALEIDOSCOPE', hint: 'Colorful pattern viewer', alternativeHints: ['Rotating mirrors', 'Symmetrical designs', 'Tube shaped toy'] }
    ]
  }
};

function getFallbackWord(category: string, difficulty: string, previousWords?: string[]): z.infer<typeof WordGenerationOutputSchema> {
  const categoryWords = FALLBACK_WORDS[difficulty as keyof typeof FALLBACK_WORDS]?.[category as keyof typeof FALLBACK_WORDS.EASY];
  
  if (!categoryWords || categoryWords.length === 0) {
    // Ultimate fallback
    const fallback = FALLBACK_WORDS.EASY.RANDOM[0];
    return {
      word: fallback.word,
      category: 'RANDOM',
      difficulty: difficulty as 'EASY' | 'MEDIUM' | 'HARD',
      hint: fallback.hint,
      alternativeHints: fallback.alternativeHints
    };
  }

  // Filter out previously used words
  const availableWords = previousWords 
    ? categoryWords.filter(w => !previousWords.includes(w.word))
    : categoryWords;
  
  const selectedWords = availableWords.length > 0 ? availableWords : categoryWords;
  const selectedWord = selectedWords[Math.floor(Math.random() * selectedWords.length)];
  
  return {
    word: selectedWord.word,
    category: category,
    difficulty: difficulty as 'EASY' | 'MEDIUM' | 'HARD',
    hint: selectedWord.hint,
    alternativeHints: selectedWord.alternativeHints
  };
}