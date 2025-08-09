/**
 * @fileoverview Intelligent conversation context optimization using relevance scoring.
 * 
 * Provides sophisticated relevance analysis for conversation history to optimize
 * AI context windows by identifying the most pertinent messages. Key features:
 * - Multi-dimensional relevance scoring with configurable weightings
 * - Token estimation and optimization for efficient context management
 * - Temporal, lexical, thread, engagement, and quality signal analysis
 * - Keyword similarity matching using advanced text analysis
 * - Context window optimization with substantial token savings
 * 
 * Relevance Scoring Dimensions:
 * - Temporal (30%): Recent messages weighted higher for conversation flow
 * - Lexical (40%): Keyword matching and semantic similarity (primary signal)
 * - Thread (15%): Reply chain context and conversation continuity
 * - Engagement (10%): User interactions, mentions, and reactions
 * - Quality (5%): Message length and content richness indicators
 * 
 * The service integrates with textAnalyzer utilities for advanced semantic
 * analysis and provides optimized context selection for improved AI responses
 * while reducing token usage and processing costs.
 */

import { analyzeQuery, analyzeMessage, calculateKeywordSimilarity, estimateTokens } from '../utils/textAnalyzer.js';

export interface MessageWithRelevance {
  message: any;
  relevanceScore: number;
  signals: RelevanceSignals;
}

export interface RelevanceSignals {
  temporal: number;
  lexical: number;
  thread: number;
  engagement: number;
  quality: number;
}

export interface OptimizedContext {
  messages: any[];
  relevanceScores: number[];
  tokenSavings: number;
  originalTokens: number;
  optimizedTokens: number;
}

export class RelevanceScorer {
  private readonly weights = {
    temporal: 0.3,    // Recent messages more important
    lexical: 0.4,     // Keyword matching (primary signal)
    thread: 0.15,     // Reply chains
    engagement: 0.1,  // Mentions/reactions
    quality: 0.05     // Message quality
  };

  public async optimizeContext(
    query: string,
    messages: any[],
    maxMessages: number = 12
  ): Promise<OptimizedContext> {
    if (messages.length <= maxMessages) {
      const originalTokens = this.calculateTotalTokens(messages);
      return {
        messages,
        relevanceScores: messages.map(() => 1.0),
        tokenSavings: 0,
        originalTokens,
        optimizedTokens: originalTokens
      };
    }

    const queryAnalysis = analyzeQuery(query);
    const scoredMessages = messages.map(message => ({
      message,
      relevanceScore: this.calculateRelevanceScore(query, message, messages, queryAnalysis),
      signals: this.calculateSignals(query, message, messages, queryAnalysis)
    }));

    // Sort by relevance and take top messages
    scoredMessages.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topMessages = scoredMessages.slice(0, Math.floor(maxMessages * 0.7)); // 70% top scored

    // Add recent messages for context continuity
    const recentMessages = scoredMessages
      .slice(-Math.ceil(maxMessages * 0.3)) // 30% most recent
      .filter(sm => !topMessages.some(tm => tm.message.id === sm.message.id));

    const selectedMessages = [...topMessages, ...recentMessages];
    
    // Sort chronologically for proper conversation flow
    selectedMessages.sort((a, b) => 
      new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime()
    );

    const optimizedMessages = selectedMessages.map(sm => sm.message);
    const relevanceScores = selectedMessages.map(sm => sm.relevanceScore);
    
    const originalTokens = this.calculateTotalTokens(messages);
    const optimizedTokens = this.calculateTotalTokens(optimizedMessages);
    const tokenSavings = ((originalTokens - optimizedTokens) / originalTokens) * 100;

    return {
      messages: optimizedMessages,
      relevanceScores,
      tokenSavings,
      originalTokens,
      optimizedTokens
    };
  }

  private calculateRelevanceScore(
    query: string,
    message: any,
    allMessages: any[],
    queryAnalysis: any
  ): number {
    const signals = this.calculateSignals(query, message, allMessages, queryAnalysis);
    
    return (
      this.weights.temporal * signals.temporal +
      this.weights.lexical * signals.lexical +
      this.weights.thread * signals.thread +
      this.weights.engagement * signals.engagement +
      this.weights.quality * signals.quality
    );
  }

  private calculateSignals(
    _query: string,
    message: any,
    allMessages: any[],
    queryAnalysis: any
  ): RelevanceSignals {
    return {
      temporal: this.calculateTemporalScore(message),
      lexical: this.calculateLexicalScore(queryAnalysis.keywords, message),
      thread: this.calculateThreadScore(message, allMessages),
      engagement: this.calculateEngagementScore(message),
      quality: this.calculateQualityScore(message)
    };
  }

  private calculateTemporalScore(message: any): number {
    const hoursOld = (Date.now() - new Date(message.createdAt).getTime()) / (1000 * 60 * 60);
    return Math.exp(-hoursOld / 24); // Exponential decay with 24-hour half-life
  }

  private calculateLexicalScore(queryKeywords: string[], message: any): number {
    const messageAnalysis = analyzeMessage(message.content);
    return calculateKeywordSimilarity(queryKeywords, messageAnalysis.keywords);
  }

  private calculateThreadScore(message: any, allMessages: any[]): number {
    let score = 0;
    
    // Is this a reply to another message?
    if (message.replyToMessageId) {score += 0.5;}
    
    // Does this message have replies?
    const hasReplies = allMessages.some(m => m.replyToMessageId === message.id);
    if (hasReplies) {score += 0.5;}
    
    return Math.min(score, 1.0);
  }

  private calculateEngagementScore(message: any): number {
    let score = 0;
    
    // Check for mentions (simplified check)
    if (message.content.includes('<@')) {score += 0.4;}
    
    // Check for reactions (if available)
    if (message.reactions && Object.keys(message.reactions).length > 0) {score += 0.3;}
    
    // From bot (important context)
    if (message.author?.bot) {score += 0.3;}
    
    return Math.min(score, 1.0);
  }

  private calculateQualityScore(message: any): number {
    const messageAnalysis = analyzeMessage(message.content);
    return messageAnalysis.hasSubstance ? 1.0 : 0.2;
  }

  private calculateTotalTokens(messages: any[]): number {
    return messages.reduce((total, message) => total + estimateTokens(message.content), 0);
  }
}