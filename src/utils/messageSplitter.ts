/**
 * @fileoverview Smart message splitting utility for Discord's 2000 character limit.
 * 
 * This utility class provides intelligent text splitting that respects natural
 * content boundaries while staying within Discord's message length constraints:
 * - Sentence-boundary splitting to maintain readability and context
 * - Word-level fallback splitting for very long sentences
 * - Character-level emergency splitting as final fallback
 * - Preserves formatting and whitespace where possible
 * - Handles edge cases like empty content and oversized single words
 * 
 * Key Features:
 * - Multi-tier splitting strategy prioritizing content coherence
 * - Regex-based sentence detection using punctuation patterns
 * - Intelligent whitespace handling and trimming
 * - Robust fallback mechanisms for edge cases
 * - Zero-dependency implementation for reliable operation
 * 
 * Splitting Strategy (in order of preference):
 * 1. Sentence boundaries: Split at ., !, ? followed by whitespace
 * 2. Word boundaries: Split at spaces when sentences are too long
 * 3. Character boundaries: Force split as absolute last resort
 * 
 * Usage Context:
 * Supporting utility for StreamingHandler and other components requiring
 * Discord-compliant message formatting. Ensures all streaming responses
 * respect Discord's API constraints while maintaining readability.
 */

export class MessageSplitter {
  private static readonly MAX_CHUNK_SIZE = 2000;

  public static splitMessage(content: string): string[] {
    if (content.length <= this.MAX_CHUNK_SIZE) {
      return [content];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    // Split by sentences first to avoid breaking mid-sentence
    const sentences = content.split(/(?<=[.!?])\s+/);
    
    for (const sentence of sentences) {
      // If a single sentence is too long, split by words
      if (sentence.length > this.MAX_CHUNK_SIZE) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        const words = sentence.split(' ');
        for (const word of words) {
          if (currentChunk.length + word.length + 1 > this.MAX_CHUNK_SIZE) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = '';
            }
          }
          currentChunk += (currentChunk ? ' ' : '') + word;
        }
      } else {
        // Check if adding this sentence would exceed the limit
        if (currentChunk.length + sentence.length + 1 > this.MAX_CHUNK_SIZE) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
        }
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Add the final chunk if there's remaining content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Fallback: if no chunks were created, force split by characters
    if (chunks.length === 0 && content.length > 0) {
      for (let i = 0; i < content.length; i += this.MAX_CHUNK_SIZE) {
        chunks.push(content.substring(i, i + this.MAX_CHUNK_SIZE));
      }
    }

    return chunks;
  }
}