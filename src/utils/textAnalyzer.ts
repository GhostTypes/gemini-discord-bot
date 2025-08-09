/**
 * @fileoverview Advanced text analysis utilities for natural language processing and content understanding.
 * 
 * Provides comprehensive text analysis capabilities for Discord bot message processing,
 * including keyword extraction, query analysis, message quality assessment, and semantic
 * similarity calculations. These utilities enable intelligent content understanding and
 * help optimize AI interactions based on message characteristics and user intent.
 * 
 * Key features:
 * - Intelligent keyword extraction with stop word filtering and length optimization
 * - Query intent classification (search, conversation, command) with pattern recognition
 * - Message quality analysis with substance detection and low-quality pattern filtering
 * - Keyword similarity calculation using Jaccard similarity algorithm
 * - Token estimation for AI model input planning and cost optimization
 * - Configurable stop word filtering for improved keyword relevance
 * 
 * Core exports:
 * - QueryAnalysis and MessageAnalysis interfaces for type-safe analysis results
 * - extractKeywords() for intelligent keyword extraction from text content
 * - analyzeQuery() for user intent classification and question detection
 * - analyzeMessage() for content quality assessment and keyword analysis
 * - calculateKeywordSimilarity() for semantic similarity scoring between texts
 * - estimateTokens() for approximate token count calculation for AI models
 */

export interface QueryAnalysis {
  keywords: string[];
  isQuestion: boolean;
  intent: 'search' | 'conversation' | 'command';
}

export interface MessageAnalysis {
  keywords: string[];
  length: number;
  hasSubstance: boolean;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with',
  'i', 'you', 'we', 'they', 'me', 'my', 'your', 'our', 'their', 'this', 'that',
  'can', 'could', 'should', 'would', 'have', 'had', 'do', 'does', 'did', 'will',
  'what', 'where', 'when', 'why', 'how', 'who', 'which', 'there', 'here', 'then'
]);

const LOW_QUALITY_PATTERNS = /^(ok|lol|👍|😂|yes|no|k|hmm|ah|oh|wow)$/i;

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 20); // Limit to top 20 keywords
}

export function analyzeQuery(query: string): QueryAnalysis {
  const keywords = extractKeywords(query);
  const isQuestion = /\?/.test(query) || /^(what|how|why|when|where|who|which|can|could|should|would|is|are|do|does|did)/i.test(query.trim());
  
  let intent: QueryAnalysis['intent'] = 'conversation';
  if (isQuestion || keywords.some(k => ['explain', 'tell', 'show', 'help', 'find'].includes(k))) {
    intent = 'search';
  } else if (query.startsWith('/') || keywords.some(k => ['generate', 'create', 'make', 'run'].includes(k))) {
    intent = 'command';
  }
  
  return { keywords, isQuestion, intent };
}

export function analyzeMessage(content: string): MessageAnalysis {
  const keywords = extractKeywords(content);
  const length = content.length;
  const hasSubstance = length >= 10 && !LOW_QUALITY_PATTERNS.test(content.trim());
  
  return { keywords, length, hasSubstance };
}

export function calculateKeywordSimilarity(queryKeywords: string[], messageKeywords: string[]): number {
  if (queryKeywords.length === 0 || messageKeywords.length === 0) {return 0;}
  
  const intersection = queryKeywords.filter(kw => messageKeywords.includes(kw));
  const union = [...new Set([...queryKeywords, ...messageKeywords])];
  
  return intersection.length / union.length; // Jaccard similarity
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // Rough approximation: 1 token ≈ 4 characters
}