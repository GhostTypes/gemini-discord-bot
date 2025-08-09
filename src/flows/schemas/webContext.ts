/**
 * @fileoverview Zod schemas and utilities for web content processing and citation handling.
 * 
 * Provides comprehensive schemas and utility classes for web content analysis,
 * search grounding, and URL context extraction. These schemas support both
 * search grounding flows and direct URL analysis with proper citation
 * formatting for Discord integration.
 * 
 * Schema Categories:
 * - SearchGroundingInput/Output: Google Search grounding with citation support
 * - UrlContextInput/Output: Direct URL analysis and content extraction
 * - CitationSchema: Structured citation data with URI, title, and indexing
 * 
 * Key Features:
 * - Citation tracking with proper URI validation and indexing
 * - URL quantity limits (max 5) for performance and rate limiting
 * - Message length validation optimized for AI processing
 * - Structured output with searchable citations and processed URL tracking
 * 
 * Utility Classes:
 * - CitationFormatter: Discord-optimized citation formatting utilities
 * - UrlDetector: URL extraction and validation from Discord messages
 * 
 * These schemas ensure reliable web content processing with proper citation
 * management and Discord integration throughout the bot's web analysis features.
 */

import { z } from 'zod';

// Citation types for search grounding results
export const CitationSchema = z.object({
  uri: z.string().url(),
  title: z.string(),
  index: z.number(),
});

export type Citation = z.infer<typeof CitationSchema>;

// Search grounding flow schemas
export const SearchGroundingInputSchema = z.object({
  message: z.string().min(1).max(1000),
  userId: z.string(),
});

export const SearchGroundingOutputSchema = z.object({
  response: z.string(),
  citations: z.array(CitationSchema).optional(),
  searchQueries: z.array(z.string()).optional(),
});

export type SearchGroundingInput = z.infer<typeof SearchGroundingInputSchema>;
export type SearchGroundingOutput = z.infer<typeof SearchGroundingOutputSchema>;

// URL context flow schemas
export const UrlContextInputSchema = z.object({
  message: z.string().min(1).max(1000),
  urls: z.array(z.string().url()).min(1).max(5), // Limit to 5 URLs for performance
  userId: z.string(),
});

export const UrlContextOutputSchema = z.object({
  response: z.string(),
  processedUrls: z.array(z.string().url()),
});

export type UrlContextInput = z.infer<typeof UrlContextInputSchema>;
export type UrlContextOutput = z.infer<typeof UrlContextOutputSchema>;

// Citation formatting utilities
export class CitationFormatter {
  /**
   * Format citations for Discord message (compact format to save space)
   */
  static formatCitations(citations: Citation[]): string {
    if (!citations || citations.length === 0) {
      return '';
    }

    const formatted = citations
      .map((citation, index) => `${index + 1}. [${citation.title}](<${citation.uri}>)`)
      .join('\n');

    return `\n\n**Sources:**\n${formatted}`;
  }

  /**
   * Truncate response to fit Discord's 2000 character limit with citations
   */
  static truncateWithCitations(response: string, citations: Citation[]): string {
    const citationText = this.formatCitations(citations);
    const maxResponseLength = 2000 - citationText.length - 10; // 10 chars buffer

    if (response.length <= maxResponseLength) {
      return response + citationText;
    }

    // Find last complete sentence that fits
    const truncatedResponse = response.substring(0, maxResponseLength);
    const lastSentenceEnd = Math.max(
      truncatedResponse.lastIndexOf('.'),
      truncatedResponse.lastIndexOf('!'),
      truncatedResponse.lastIndexOf('?')
    );

    if (lastSentenceEnd > 0) {
      return truncatedResponse.substring(0, lastSentenceEnd + 1) + citationText;
    }

    // Fallback to word boundary
    const lastSpace = truncatedResponse.lastIndexOf(' ');
    if (lastSpace > 0) {
      return truncatedResponse.substring(0, lastSpace) + '...' + citationText;
    }

    // Last resort - hard truncate
    return truncatedResponse + '...' + citationText;
  }
}

// URL detection utilities
export class UrlDetector {
  private static readonly URL_REGEX = /https?:\/\/[^\s]+/gi;

  /**
   * Extract URLs from a message
   */
  static extractUrls(message: string): string[] {
    const matches = message.match(this.URL_REGEX);
    return matches ? [...new Set(matches)] : []; // Remove duplicates
  }

  /**
   * Check if message contains URLs
   */
  static hasUrls(message: string): boolean {
    return this.URL_REGEX.test(message);
  }

  /**
   * Remove URLs from message text
   */
  static removeUrls(message: string): string {
    return message.replace(this.URL_REGEX, '').trim();
  }
}