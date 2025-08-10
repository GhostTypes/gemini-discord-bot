/**
 * @fileoverview Central flow orchestration service for intelligent message routing.
 * 
 * Acts as the primary routing hub for all incoming Discord messages, analyzing
 * content and directing to appropriate specialized processing flows. Key features:
 * - Intelligent content analysis and routing decisions
 * - Generic cached attachment detection and optimization
 * - Support for multimodal content (images, videos, PDFs, etc.)
 * - Integration with all specialized flows (chat, multimodal, video, PDF, etc.)
 * - Game state awareness and routing to game handlers when appropriate
 * - Streaming response coordination with Discord message editing
 * - Comprehensive error handling and fallback mechanisms
 * 
 * Content Routing Categories:
 * - Cached attachments: Route to conversation flow using pre-processed data
 * - PDF processing: Handle document analysis with download or cached data
 * - Video processing: Route to video analysis flows (YouTube vs general video)
 * - Multimodal content: Handle images and mixed media content
 * - Web URLs: Route to URL context extraction and analysis
 * - Intent-based routing: Use AI routing flow for specialized intents
 * - General conversation: Default chat flow with context optimization
 * 
 * The orchestrator leverages ContentDetectionService for analysis and coordinates
 * with MessageCacheService for attachment caching optimization.
 */

import { Message, AttachmentBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { streamChatResponse } from '../flows/chatFlow.js';
import { streamMultimodalChatResponse } from '../flows/multimodalChatFlow.js';
import { streamVideoProcessingResponse } from '../flows/videoProcessingFlow.js';
import { streamYouTubeProcessingResponse } from '../flows/youtubeProcessingFlow.js';
import { streamCodeExecutionResponse } from '../flows/codeExecutionFlow.js';
import { streamSearchGrounding } from '../flows/searchGroundingFlow.js';
import { streamUrlContext, validateUrls } from '../flows/urlContextFlow.js';
import { UrlDetector, CitationFormatter } from '../flows/schemas/webContext.js';
import { StreamingHandler } from '../utils/streamingHandler.js';
import { RoutingFlow } from '../flows/routingFlow.js';
import { ImageGenerationFlow } from '../flows/imageGenerationFlow.js';
import { streamPDFResponse } from '../flows/pdfFlow.js';
import { MessageCacheService } from './MessageCacheService.js';
import { ContentDetectionService, ContentAnalysis } from './ContentDetectionService.js';
import { GameHandler } from './GameHandler.js';
import { AuthRouter } from './AuthRouter.js';
import { ProcessedMedia } from './MediaProcessor.js';
import { botConfig } from '../config/environment.js';
import { gameManager } from '../flows/gameFlow.js';
import { AuthFlow } from '../flows/authFlow.js';
import { flowLogger } from '../debug/flow-logger.js';

export class FlowOrchestrator {
  private routingFlow: RoutingFlow;
  private imageGenerationFlow: ImageGenerationFlow;
  private messageCacheService: MessageCacheService;
  private contentDetectionService: ContentDetectionService;
  private gameHandler: GameHandler;
  private authRouter: AuthRouter;
  private authFlow: AuthFlow;

  constructor(messageCacheService: MessageCacheService, contentDetectionService: ContentDetectionService, discordClient?: any) {
    this.routingFlow = new RoutingFlow();
    this.imageGenerationFlow = new ImageGenerationFlow();
    this.messageCacheService = messageCacheService;
    this.contentDetectionService = contentDetectionService;
    this.gameHandler = new GameHandler();
    this.authRouter = new AuthRouter();
    this.authFlow = new AuthFlow();
    
    // Set Discord client for GameHandler if provided
    if (discordClient) {
      this.gameHandler.setDiscordClient(discordClient);
    }
    
    // Note: GameManager callback registration will be done later in initializeGameHandlerCallback()
    // because GameManager may not be initialized yet during construction
  }

  initializeGameHandlerCallback() {
    // Register AI move callback with GameManager (called after GameManager is initialized)
    try {
      gameManager().setGameUpdateCallback(this.gameHandler.handleAiMoveCallback.bind(this.gameHandler));
      console.log('FlowOrchestrator: Successfully registered GameHandler callback with GameManager');
    } catch (error) {
      // GameManager not initialized yet, will retry later
      console.warn('GameManager not yet initialized for callback registration:', error);
    }
  }

  async routeMessage(message: Message, cleanMessage: string, referencedMessage: Message | null, contentAnalysis: ContentAnalysis): Promise<void> {
    // Start flow logging
    const flowId = flowLogger.startFlow('MESSAGE_ROUTING', {
      userId: message.author.id,
      channelId: message.channelId,
      message: cleanMessage
    });

    try {
      // Generic cached attachment detection - if we have ANY cached attachments, route to conversation flow
      if (contentAnalysis.attachmentCache.hasCachedData) {
        const cachedTypes = Array.from(contentAnalysis.attachmentCache.attachmentsByType.keys());
        logger.info('Message has cached attachments - routing to conversation flow', { 
          cachedAttachmentCount: contentAnalysis.attachmentCache.cachedAttachments.length,
          cachedTypes: cachedTypes.join(', ')
        });
        flowLogger.onRouteDecision(flowId, 'CACHED_CONVERSATION', { cachedTypes: cachedTypes.join(', ') });
        // Start specific flow type for cached conversation
        const cachedFlowId = flowLogger.startFlow('CACHED_CONVERSATION', {
          userId: message.author.id,
          channelId: message.channelId,
          message: cleanMessage
        });
        await this.handleConversation(message, cleanMessage, contentAnalysis.isMultimodal, referencedMessage, cachedFlowId ?? undefined);
        flowLogger.completeFlow(cachedFlowId, true);
      } else if (contentAnalysis.hasPDFs) {
        // No cached data available, use PDF processing flow with download
        logger.info('Message routed to PDF processing (no cached data)', { pdfCount: contentAnalysis.pdfDetection.pdfUrls.length });
        flowLogger.onRouteDecision(flowId, 'PDF_PROCESSING', { pdfCount: contentAnalysis.pdfDetection.pdfUrls.length });
        // Start specific flow type for PDF processing
        const pdfFlowId = flowLogger.startFlow('PDF_PROCESSING', {
          userId: message.author.id,
          channelId: message.channelId,
          message: cleanMessage
        });
        await this.handlePDFProcessing(message, cleanMessage, contentAnalysis.pdfDetection.pdfUrls, pdfFlowId ?? undefined);
        flowLogger.completeFlow(pdfFlowId, true);
      } else if (contentAnalysis.hasVideos) {
        // For videos, we don't have caching optimization yet, so always use video processing flow
        if (contentAnalysis.videoDetection.youtubeUrls.length > 0) {
          logger.info('Message routed to YouTube processing', { youtubeCount: contentAnalysis.videoDetection.youtubeUrls.length });
          flowLogger.onRouteDecision(flowId, 'YOUTUBE_PROCESSING', { youtubeCount: contentAnalysis.videoDetection.youtubeUrls.length });
          // Start specific flow type for YouTube processing
          const youtubeFlowId = flowLogger.startFlow('YOUTUBE_PROCESSING', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleYouTubeProcessing(message, cleanMessage, contentAnalysis.videoDetection, youtubeFlowId ?? undefined);
          flowLogger.completeFlow(youtubeFlowId, true);
        } else {
          logger.info('Message routed to video processing', { videoCount: contentAnalysis.videoDetection.attachments.length + contentAnalysis.videoDetection.videoUrls.length });
          flowLogger.onRouteDecision(flowId, 'VIDEO_PROCESSING', { videoCount: contentAnalysis.videoDetection.attachments.length + contentAnalysis.videoDetection.videoUrls.length });
          // Start specific flow type for video processing
          const videoFlowId = flowLogger.startFlow('VIDEO_PROCESSING', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleVideoProcessing(message, cleanMessage, contentAnalysis.videoDetection, videoFlowId ?? undefined);
          flowLogger.completeFlow(videoFlowId, true);
        }
    } else {
      // Get conversation context for attachment-aware routing
      let conversationContext: string | undefined;
      try {
        const context = await this.messageCacheService.getFormattedContext(message.channelId, flowId ?? undefined);
        conversationContext = context || undefined;
      } catch (error) {
        logger.debug('Could not retrieve conversation context for routing', { error });
      }

      // For all other cases, use AI routing to determine intent
      const routingDecision = await this.routingFlow.determineIntent({
        message: cleanMessage,
        userId: message.author.id,
        channelId: message.channelId,
        isInGameMode: false,
        currentGameType: undefined,
        conversationContext,
      }, flowId ?? undefined);

        logger.info('Message routed', { intent: routingDecision.intent });
        flowLogger.onRouteDecision(flowId, routingDecision.intent, routingDecision.entities);

        // Handle based on AI-determined intent
        if (routingDecision.intent === 'SEARCH_GROUNDING') {
          // Start specific flow type for search grounding
          const searchFlowId = flowLogger.startFlow('SEARCH_GROUNDING', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleSearchGrounding(message, cleanMessage, searchFlowId ?? undefined);
          flowLogger.completeFlow(searchFlowId, true);
        } else if (routingDecision.intent === 'URL_CONTEXT') {
          // Start specific flow type for URL context
          const urlFlowId = flowLogger.startFlow('URL_CONTEXT', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleUrlContext(message, cleanMessage, contentAnalysis.webUrls, urlFlowId ?? undefined);
          flowLogger.completeFlow(urlFlowId, true);
        } else if (routingDecision.intent === 'IMAGE_GENERATION') {
          // Start specific flow type for image generation
          const imageFlowId = flowLogger.startFlow('IMAGE_GENERATION', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleImageGeneration(message, cleanMessage);
          flowLogger.completeFlow(imageFlowId, true);
        } else if (routingDecision.intent === 'CODE_EXECUTION') {
          // Start specific flow type for code execution
          const codeFlowId = flowLogger.startFlow('CODE_EXECUTION', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleCodeExecution(message, cleanMessage, codeFlowId ?? undefined);
          flowLogger.completeFlow(codeFlowId, true);
        } else if (routingDecision.intent === 'GAME_START') {
          // Start specific flow type for game
          const gameFlowId = flowLogger.startFlow('GAME_START', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.gameHandler.handleGameStart(message, cleanMessage, routingDecision.entities);
          flowLogger.completeFlow(gameFlowId, true);
        } else if (routingDecision.intent === 'GAME_HELP') {
          // Start specific flow type for game help
          const gameHelpFlowId = flowLogger.startFlow('GAME_HELP', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.gameHandler.handleGameHelp(message);
          flowLogger.completeFlow(gameHelpFlowId, true);
        } else if (routingDecision.intent === 'AUTH') {
          // Start specific flow type for auth
          const authFlowId = flowLogger.startFlow('AUTH', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleAuthRequest(message, cleanMessage);
          flowLogger.completeFlow(authFlowId, true);
        } else {
          // Start specific flow type for conversation
          const conversationFlowId = flowLogger.startFlow('CONVERSATION', {
            userId: message.author.id,
            channelId: message.channelId,
            message: cleanMessage
          });
          await this.handleConversation(message, cleanMessage, contentAnalysis.isMultimodal, referencedMessage, conversationFlowId ?? undefined);
          flowLogger.completeFlow(conversationFlowId, true);
        }
      }

      // Complete the flow successfully
      flowLogger.completeFlow(flowId, true);

    } catch (error) {
      // Log the error and complete the flow with failure
      flowLogger.onFlowError(flowId, error as Error, { cleanMessage, userId: message.author.id });
      flowLogger.completeFlow(flowId, false, error as Error | null);
      throw error; // Re-throw to maintain existing error handling
    }
  }

  async handleAuthRequest(message: Message, cleanMessage: string): Promise<void> {
    try {
      logger.info('AUTH: Processing auth request with AI flow', {
        userId: message.author.id,
        channelId: message.channelId,
        message: cleanMessage.substring(0, 50)
      });

      // Extract mentioned user IDs from Discord message
      const mentionedUserIds = Array.from(message.mentions.users.keys());

      // Use AI flow to determine specific auth action and entities
      const authResult = await this.authFlow.determineAuthAction({
        message: cleanMessage,
        userId: message.author.id,
        channelId: message.channelId,
        mentionedUserIds
      });

      // Auth action already logged by AuthFlow

      // Route to AuthRouter with AI-determined action
      await this.authRouter.handleAuthAction(message, authResult);

      logger.info('AUTH: Natural language auth request completed', {
        userId: message.author.id,
        authAction: authResult.authAction
      });

    } catch (error) {
      logger.error('Error in auth request flow:', error);
      
      try {
        await message.reply('❌ Sorry, I encountered an error processing your auth request. Please try again or use the slash commands instead.');
      } catch (replyError) {
        logger.error('AUTH: Error sending error reply:', replyError);
      }
    }
  }

  async handleImageGeneration(message: Message, cleanMessage: string): Promise<void> {
    try {
      // Parse the image request
      const parseResult = await this.imageGenerationFlow.parseImageRequest({
        message: cleanMessage,
        userId: message.author.id,
        channelId: message.channelId,
      });

      // Generate the image
      const imageResult = await this.imageGenerationFlow.generateImage({
        prompt: parseResult.prompt,
        style: parseResult.style,
        userId: message.author.id,
        channelId: message.channelId,
      });

      // Convert data URL to buffer for Discord attachment
      const base64Data = imageResult.dataUrl.split(',')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Create Discord attachment
      const attachment = new AttachmentBuilder(imageBuffer, { 
        name: `generated-image-${Date.now()}.png` 
      });

      // Reply with image
      await message.reply({
        content: '🎨 Here\'s your generated image!',
        files: [attachment],
      });

    } catch (error) {
      logger.error('Error generating image:', error);
      await message.reply('Sorry, I couldn\'t generate that image. Please try again with a different prompt.');
    }
  }

  async handleVideoProcessing(message: Message, cleanMessage: string, videoDetection: { attachments: any[], videoUrls: string[], youtubeUrls: string[] }, _flowId?: string): Promise<void> {
    let streamingHandler: StreamingHandler | null = null;
    
    try {
      logger.info('Video processing requested', {
        userId: message.author.id,
        videoAttachments: videoDetection.attachments.length,
        videoUrls: videoDetection.videoUrls.length,
        youtubeUrls: videoDetection.youtubeUrls.length
      });

      // Process video content
      const processedVideos = await this.contentDetectionService.processVideoContent(message, videoDetection);
      
      if (processedVideos.length === 0) {
        await message.reply('I couldn\'t process any of the videos you shared. Please make sure they are under 30 seconds and in a supported format (MP4, MOV, WebM, etc.).');
        return;
      }

      // Create a callback that maintains state properly
      const handleChunk = async (chunk: string) => {
        if (!streamingHandler) {
          const initialReply = await message.reply(chunk);
          streamingHandler = new StreamingHandler(initialReply);
        } else {
          streamingHandler.onChunk(chunk);
        }
      };

      // Stream video processing response
      await streamVideoProcessingResponse({
        message: cleanMessage,
        userId: message.author.id,
        processedVideos: processedVideos,
      }, handleChunk, _flowId);

      // Finalize the streaming response
      if (streamingHandler) {
        logger.debug('Finalizing video processing response');
        await (streamingHandler as StreamingHandler).finalize();
        logger.debug('Video processing finalized');
      }

    } catch (error) {
      logger.error('Error in video processing flow:', error);
      
      // Clean up streaming handler
      if (streamingHandler) {
        await (streamingHandler as StreamingHandler).cleanup();
      }
      
      throw error; // Re-throw to be handled by parent
    }
  }

  async handleYouTubeProcessing(message: Message, cleanMessage: string, videoDetection: { attachments: any[], videoUrls: string[], youtubeUrls: string[] }, _flowId?: string): Promise<void> {
    let streamingHandler: StreamingHandler | null = null;
    
    try {
      logger.info('YouTube video processing requested', {
        userId: message.author.id,
        youtubeUrls: videoDetection.youtubeUrls.length
      });

      // Process only YouTube videos
      const processedVideos = await this.contentDetectionService.processYouTubeContent(message, videoDetection);
      
      if (processedVideos.length === 0) {
        await message.reply('I couldn\'t process any of the YouTube videos you shared. Please make sure they are valid YouTube URLs.');
        return;
      }

      // Create a callback that maintains state properly
      const handleChunk = async (chunk: string) => {
        if (!streamingHandler) {
          const initialReply = await message.reply(chunk);
          streamingHandler = new StreamingHandler(initialReply);
        } else {
          streamingHandler.onChunk(chunk);
        }
      };

      // Stream YouTube processing response
      await streamYouTubeProcessingResponse({
        message: cleanMessage,
        userId: message.author.id,
        processedVideos: processedVideos,
      }, handleChunk, _flowId);

      // Finalize the streaming response
      if (streamingHandler) {
        logger.debug('Finalizing YouTube processing response');
        await (streamingHandler as StreamingHandler).finalize();
        logger.debug('YouTube processing finalized');
      }

    } catch (error) {
      logger.error('Error in YouTube processing flow:', error);
      
      // Clean up streaming handler
      if (streamingHandler) {
        await (streamingHandler as StreamingHandler).cleanup();
      }
      
      throw error; // Re-throw to be handled by parent
    }
  }

  async handleConversation(message: Message, cleanMessage: string, isMultimodal: boolean = false, referencedMessage: Message | null = null, flowId?: string): Promise<void> {
    let streamingHandler: StreamingHandler | null = null;
    
    try {
      // Handle multimodal content detection and processing
      let processedMessage = cleanMessage;
      let processedMedia: ProcessedMedia[] = [];
      
      // PRIORITY 1: Check for cached attachments first (eliminates downloads)
      const cachedMedia = await this.contentDetectionService.getCachedAttachmentsAsProcessedMedia(message, referencedMessage);
      if (cachedMedia.length > 0) {
        processedMedia = cachedMedia;
        logger.info('Using cached attachment data for conversation', {
          userId: message.author.id,
          cachedMediaCount: cachedMedia.length,
          types: cachedMedia.map(m => m.type)
        });
      } else if (isMultimodal) {
        // PRIORITY 2: Process direct attachments if no cached data
        logger.info('Multimodal content detected - processing fresh attachments', {
          userId: message.author.id,
          attachments: message.attachments.size
        });
        
        // Process media content from both current and referenced messages
        processedMedia = await this.contentDetectionService.processMediaContentWithReplyContext(message, referencedMessage);
      }
      
      // PRIORITY 3: Check conversation context if no direct media processed
      if (processedMedia.length === 0) {
        try {
          const context = await this.messageCacheService.getFormattedContext(message.channelId, flowId ?? undefined);
          const contextHasAttachments = context?.includes('Attachments:') || false;
          
          if (contextHasAttachments) {
            logger.debug('No direct media found, processing from conversation context');
            const contextMedia = await this.contentDetectionService.processMediaFromConversationContext(message.channelId);
            processedMedia.push(...contextMedia);
            logger.debug('Context media processing result', { 
              contextMediaCount: contextMedia.length,
              totalProcessed: processedMedia.length 
            });
          }
        } catch (error) {
          logger.debug('Failed to process media from conversation context', { error });
        }
      }
      
      // Finalize processing based on results
      if (processedMedia.length > 0) {
        const mediaInfo = processedMedia.map(m => `${m.type}: ${m.filename || 'unknown'}`).join(', ');
        processedMessage = `${cleanMessage}`;  // Keep message clean, let AI see the media directly
        logger.info('Media processed successfully', { 
          count: processedMedia.length, 
          types: processedMedia.map(m => m.type),
          mediaInfo 
        });
      }

      // Log media processing if we have processed media
      if (processedMedia.length > 0 && flowId) {
        flowLogger.onMediaProcessing(flowId, 'multimodal', processedMedia.length);
      }

      // Create a callback that maintains state properly
      const handleChunk = async (chunk: string) => {
        if (!streamingHandler) {
          const initialReply = await message.reply(chunk);
          streamingHandler = new StreamingHandler(initialReply, flowId);
        } else {
          streamingHandler.onChunk(chunk);
        }
      };

      // Route to appropriate flow based on media content
      if (processedMedia.length > 0) {
        // Use multimodal flow for media content
        logger.info('MULTIMODAL FLOW: Streaming media response', {
          userId: message.author.id,
          hasProcessedMedia: processedMedia.length > 0,
          processedMediaCount: processedMedia.length
        });
        
        await streamMultimodalChatResponse({
          message: processedMessage,
          userId: message.author.id,
          processedMedia: processedMedia,
          channelId: message.channel.id,
          messageCacheService: this.messageCacheService,
          flowId: flowId,
        }, handleChunk);
      } else {
        // Use regular chat flow for text-only
        logger.info('CHAT FLOW: Processing text-only request', {
          userId: message.author.id,
          channelId: message.channel.id,
          ragEnabled: botConfig.rag.enabled
        });
        
        await streamChatResponse({
          message: processedMessage,
          userId: message.author.id,
          channelId: message.channel.id,
          messageCacheService: this.messageCacheService,
        }, handleChunk, flowId);
      }

      // Finalize the streaming response
      if (streamingHandler) {
        logger.debug('Finalizing streaming response');
        await (streamingHandler as StreamingHandler).finalize();
        logger.debug('Streaming finalized');
      }

    } catch (error) {
      logger.error('Error in conversation flow:', error);
      
      // Clean up streaming handler
      if (streamingHandler) {
        await (streamingHandler as StreamingHandler).cleanup();
      }
      
      throw error; // Re-throw to be handled by parent
    }
  }

  async handleCodeExecution(message: Message, cleanMessage: string, _flowId?: string): Promise<void> {
    try {
      logger.info('CODE EXECUTION: Handling code execution request', { 
        userId: message.author.id,
        message: cleanMessage.substring(0, 50)
      });

      // Create initial reply to start streaming
      const initialReply = await message.reply('🔧 Analyzing and executing...');
      const streamingHandler = new StreamingHandler(initialReply);

      // Handle code chunks with special formatting
      const handleChunk = async (chunk: { type: string; content: string; language?: string }) => {
        await streamingHandler.onCodeChunk(chunk);
      };

      try {
        // Stream the code execution response
        const result = await streamCodeExecutionResponse({
          message: cleanMessage,
          userId: message.author.id,
          channelId: message.channelId,
        }, handleChunk, _flowId);

        // Finalize the streaming
        await streamingHandler.finalize();

        logger.info('CODE EXECUTION: Completed successfully', {
          userId: message.author.id,
          hasCode: result.hasCode,
          hasResults: !!result.executionResult,
          responseLength: result.response.length
        });

      } catch (streamError) {
        logger.error('CODE EXECUTION: Stream error occurred', {
          error: streamError,
          userId: message.author.id
        });

        // Update message with error
        const errorMessage = streamError instanceof Error ? streamError.message : 'Code execution failed.';
        await initialReply.edit(`❌ **Error:** ${errorMessage}`);
      }

    } catch (error) {
      logger.error('CODE EXECUTION: Handler error occurred', {
        error: error,
        userId: message.author.id
      });

      try {
        await message.reply('❌ Sorry, I encountered an error with code execution. Please try again.');
      } catch (replyError) {
        logger.error('CODE EXECUTION: Error sending error reply:', replyError);
      }
    }
  }

  async handlePDFProcessing(message: Message, cleanMessage: string, pdfUrls: string[], _flowId?: string): Promise<void> {
    let streamingHandler: StreamingHandler | null = null;
    
    try {
      logger.info('PDF PROCESSING: Handling PDF processing request', {
        userId: message.author.id,
        pdfCount: pdfUrls.length,
        messageLength: cleanMessage.length
      });

      // Create a callback that maintains state properly
      const handleChunk = async (chunk: string) => {
        if (!streamingHandler) {
          const initialReply = await message.reply(chunk);
          streamingHandler = new StreamingHandler(initialReply);
        } else {
          await streamingHandler.onChunk(chunk);
        }
      };

      // Stream PDF processing response
      await streamPDFResponse({
        message: cleanMessage,
        pdfUrls: pdfUrls,
        userId: message.author.id,
        channelId: message.channelId,
      }, handleChunk, _flowId);

      // Finalize the streaming response
      if (streamingHandler) {
        logger.debug('Finalizing PDF processing response');
        await (streamingHandler as StreamingHandler).finalize();
        logger.debug('PDF processing finalized');
      }

      logger.info('PDF PROCESSING: Completed successfully', {
        userId: message.author.id,
        pdfCount: pdfUrls.length,
        responseLength: streamingHandler ? 'completed' : 'no_response'
      });

    } catch (error) {
      logger.error('Error in PDF processing flow:', error);
      
      // Clean up streaming handler
      if (streamingHandler) {
        await (streamingHandler as StreamingHandler).cleanup();
      }
      
      throw error; // Re-throw to be handled by parent
    }
  }

  async handleSearchGrounding(message: Message, cleanMessage: string, _flowId?: string): Promise<void> {
    let streamingHandler: StreamingHandler | null = null;
    
    try {
      logger.info('SEARCH GROUNDING: Handling search request', { 
        userId: message.author.id,
        queryLength: cleanMessage.length 
      });

      // Create a callback that maintains state properly
      const handleChunk = async (chunk: string) => {
        if (!streamingHandler) {
          const initialReply = await message.reply(chunk);
          streamingHandler = new StreamingHandler(initialReply);
        } else {
          await streamingHandler.onChunk(chunk);
        }
      };

      // Stream search grounding response
      const result = await streamSearchGrounding({
        message: cleanMessage,
        userId: message.author.id,
      }, handleChunk, _flowId);

      // Add citations if available
      if (result.citations && result.citations.length > 0 && streamingHandler) {
        const citationText = CitationFormatter.formatCitations(result.citations);
        if (citationText.trim()) {
          await (streamingHandler as StreamingHandler).onChunk(citationText);
        }
      }

      // Finalize the streaming response
      if (streamingHandler) {
        logger.debug('Finalizing search grounding response');
        await (streamingHandler as StreamingHandler).finalize();
        logger.debug('Search grounding finalized');
      }

      logger.info('SEARCH GROUNDING: Completed successfully', {
        userId: message.author.id,
        citationCount: result.citations?.length || 0,
        queryCount: result.searchQueries?.length || 0,
        responseLength: result.responseText.length
      });

    } catch (error) {
      logger.error('Error in search grounding flow:', error);
      
      // Clean up streaming handler
      if (streamingHandler) {
        await (streamingHandler as StreamingHandler).cleanup();
      }
      
      throw error; // Re-throw to be handled by parent
    }
  }

  async handleUrlContext(message: Message, cleanMessage: string, urls: string[], _flowId?: string): Promise<void> {
    let streamingHandler: StreamingHandler | null = null;
    
    try {
      logger.info('URL CONTEXT: Handling URL analysis request', { 
        userId: message.author.id,
        urlCount: urls.length,
        messageLength: cleanMessage.length
      });

      // Validate URLs
      const validUrls = validateUrls(urls);
      if (validUrls.length === 0) {
        await message.reply('I couldn\'t find any valid URLs to analyze. Please check the URLs and try again.');
        return;
      }

      if (validUrls.length !== urls.length) {
        logger.warn('URL CONTEXT: Some URLs were invalid', { 
          originalCount: urls.length, 
          validCount: validUrls.length 
        });
      }

      // Create a callback that maintains state properly
      const handleChunk = async (chunk: string) => {
        if (!streamingHandler) {
          const initialReply = await message.reply(chunk);
          streamingHandler = new StreamingHandler(initialReply);
        } else {
          await streamingHandler.onChunk(chunk);
        }
      };

      // Stream URL context response
      const result = await streamUrlContext({
        message: UrlDetector.removeUrls(cleanMessage) || 'Please analyze these URLs:',
        urls: validUrls,
        userId: message.author.id,
      }, handleChunk, _flowId);

      // Finalize the streaming response
      if (streamingHandler) {
        logger.debug('Finalizing URL context response');
        await (streamingHandler as StreamingHandler).finalize();
        logger.debug('URL context finalized');
      }

      logger.info('URL CONTEXT: Completed successfully', {
        userId: message.author.id,
        processedUrlCount: result.processedUrls.length,
        responseLength: result.responseText.length
      });

    } catch (error) {
      logger.error('Error in URL context flow:', error);
      
      // Clean up streaming handler
      if (streamingHandler) {
        await (streamingHandler as StreamingHandler).cleanup();
      }
      
      throw error; // Re-throw to be handled by parent
    }
  }
}