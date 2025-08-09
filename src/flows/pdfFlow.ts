/**
 * @fileoverview PDF processing flow with streaming support and Google AI integration.
 * 
 * This module implements specialized PDF document analysis for the Discord bot, providing:
 * - Secure PDF download and validation from Discord CDN
 * - Google Genkit flow integration for PDF document analysis
 * - Real-time streaming responses with proper message editing
 * - Comprehensive security controls including domain whitelisting
 * - Advanced thinking/reasoning support for complex document analysis
 * 
 * Key Features:
 * - Multi-layer PDF validation (content-type, signature, size limits)
 * - Discord CDN domain whitelisting for security
 * - Base64 encoding for Google AI API compatibility
 * - Streaming document analysis with async callback support
 * - Integration with GenerationConfigBuilder for optimal PDF processing
 * 
 * Security Controls:
 * - Domain validation (Discord CDN only)
 * - File size limits (8MB maximum)
 * - PDF signature verification (%PDF- header)
 * - Content-type validation
 * - Download timeout protection (15 seconds)
 * 
 * Critical Implementation Details:
 * The streaming function uses CRITICAL async callback handling to prevent
 * race conditions that would create multiple Discord messages instead of
 * editing existing ones. All chunk callbacks must be awaited properly.
 * 
 * Usage Context:
 * Specialized flow for PDF document analysis, called by DiscordBot service
 * when PDF attachments are detected in messages or message replies.
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import { botConfig } from '../config/environment.js';

// PDF processing input schema
const PDFInput = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  pdfUrls: z.array(z.string().url()).min(1, 'At least one PDF URL required'),
  userId: z.string(),
  channelId: z.string().optional(),
});

export type PDFInputType = z.infer<typeof PDFInput>;

// PDF processing output schema
const PDFOutput = z.object({
  response: z.string(),
  processedPDFs: z.array(z.object({
    url: z.string().url(),
    filename: z.string().optional(),
    pageCount: z.number().optional(),
  })),
});

// Allowed Discord CDN domains for security
const ALLOWED_DOMAINS = [
  'cdn.discordapp.com',
  'media.discordapp.net',
  'attachments.discord.com'
];

// File size limit (8MB)
const MAX_FILE_SIZE = 8 * 1024 * 1024;

// Download timeout (15 seconds)
const DOWNLOAD_TIMEOUT = 15000;

/**
 * Validates if a content type is a PDF
 */
function isPDFContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('application/pdf');
}

/**
 * Validates if a buffer contains PDF signature
 */
function isPDFBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF';
}

/**
 * Validates if a URL is from an allowed Discord domain
 */
function isAllowedDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ALLOWED_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

/**
 * Downloads and converts a PDF to base64 for Google AI API
 */
export async function downloadAndConvertPDFToBase64(url: string): Promise<{ data: string; filename?: string }> {
  logger.info('PDF FLOW: Starting PDF download', { url });

  // Validate domain
  if (!isAllowedDomain(url)) {
    throw new Error('PDF must be hosted on Discord CDN for security reasons');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'DiscordBot/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }

    // Validate content type
    const contentType = response.headers.get('content-type') || '';
    if (!isPDFContentType(contentType)) {
      throw new Error(`Invalid content type: ${contentType}. Expected application/pdf.`);
    }

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      throw new Error(`PDF file too large: ${contentLength} bytes. Maximum allowed: ${MAX_FILE_SIZE} bytes.`);
    }

    // Download the file
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file size after download
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`PDF file too large: ${buffer.length} bytes. Maximum allowed: ${MAX_FILE_SIZE} bytes.`);
    }

    // Validate PDF signature
    if (!isPDFBuffer(buffer)) {
      throw new Error('Invalid PDF file: Missing PDF signature');
    }

    // Extract filename from URL if possible
    const filename = url.split('/').pop()?.split('?')[0];

    logger.info('PDF FLOW: PDF download completed', { 
      url, 
      size: buffer.length, 
      filename 
    });

    return {
      data: buffer.toString('base64'),
      ...(filename && { filename }),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    logger.error('PDF FLOW: PDF download failed', { url, error });
    throw error;
  }
}

export const pdfFlow = ai.defineFlow(
  {
    name: 'pdfFlow',
    inputSchema: PDFInput,
    outputSchema: PDFOutput,
  },
  async (input: z.infer<typeof PDFInput>) => {
    const { message, pdfUrls, userId } = input;

    logger.info('PDF FLOW: Processing PDF request', { 
      userId, 
      pdfCount: pdfUrls.length,
      messageLength: message.length 
    });

    try {
      // Process the first PDF (extend later for multiple PDFs)
      const pdfUrl = pdfUrls[0];
      const { data: pdfData, filename } = await downloadAndConvertPDFToBase64(pdfUrl);

      // Create prompt for PDF analysis using Genkit media format
      const prompt = [
        { text: `You are a helpful Discord bot assistant analyzing a PDF document. 

User question: ${message}

Please analyze the PDF document and provide a helpful response. Keep your response under 2000 characters for Discord compatibility.` },
        {
          media: {
            url: `data:application/pdf;base64,${pdfData}`
          }
        }
      ];

      const { text } = await ai.generate({
        prompt,
        config: GenerationConfigBuilder.build({
          temperature: 0.3, // Lower temperature for document analysis
          maxOutputTokens: 3000,
        }),
      });

      return {
        response: text || 'Sorry, I couldn\'t analyze the PDF document.',
        processedPDFs: [{
          url: pdfUrl,
          ...(filename && { filename }),
        }],
      };
    } catch (error) {
      logger.error('PDF FLOW: Processing failed', { error, userId });
      throw error;
    }
  }
);

/**
 * PDF processing with streaming support
 */
export async function streamPDFResponse(
  input: PDFInputType,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const { message, pdfUrls, userId } = input;

  logger.info('PDF FLOW: Processing streaming PDF request', { 
    userId, 
    pdfCount: pdfUrls.length,
    messageLength: message.length 
  });

  try {
    // Process the first PDF (extend later for multiple PDFs)
    const pdfUrl = pdfUrls[0];
    const { data: pdfData, filename } = await downloadAndConvertPDFToBase64(pdfUrl);

    logger.info('PDF FLOW: Starting PDF analysis stream', { userId, filename });

    // Create prompt for PDF analysis using Genkit media format
    const prompt = [
      { text: `You are a helpful Discord bot assistant analyzing a PDF document. 

User question: ${message}

Please analyze the PDF document and provide a helpful response. Keep your response under 2000 characters for Discord compatibility.` },
      {
        media: {
          url: `data:application/pdf;base64,${pdfData}`
        }
      }
    ];

    const { stream } = await ai.generateStream({
      prompt,
      config: GenerationConfigBuilder.build({
        temperature: 0.3, // Lower temperature for document analysis
        maxOutputTokens: 3000,
      }),
    });

    let fullResponse = '';
    let chunkCount = 0;
    
    for await (const chunk of stream) {
      // CRITICAL: Filter out thinking chunks, only process final response text
      const chunkAny = chunk as any;
      if (chunk.text && !chunkAny.thoughts) {
        chunkCount++;
        logger.debug(`PDF FLOW: Processing response chunk ${chunkCount}, length: ${chunk.text.length}`);
        fullResponse += chunk.text;
        await onChunk(chunk.text);
      } else if (chunkAny.thoughts) {
        // Log thinking activity but don't stream to user
        logger.debug(`PDF FLOW: Processing thinking chunk (${chunkAny.thoughts.length} chars) - not streaming to user`);
      }
    }

    // Log thinking usage if enabled
    if (botConfig.thinking.enabled) {
      logger.info(`PDF FLOW: Completed with thinking enabled (budget: ${botConfig.thinking.budget === -1 ? 'dynamic' : botConfig.thinking.budget})`);
    }

    logger.info(`PDF FLOW: Stream completed`, { 
      userId, 
      filename,
      chunkCount, 
      responseLength: fullResponse.length 
    });

    return fullResponse || 'Sorry, I couldn\'t analyze the PDF document.';

  } catch (error) {
    logger.error('PDF FLOW: Streaming failed', { error, userId });
    
    // Return user-friendly error message
    if (error instanceof Error) {
      if (error.message.includes('too large')) {
        return 'Sorry, the PDF file is too large to process. Please try a smaller file (max 8MB).';
      } else if (error.message.includes('Invalid PDF')) {
        return 'Sorry, the uploaded file doesn\'t appear to be a valid PDF document.';
      } else if (error.message.includes('Discord CDN')) {
        return 'Sorry, I can only process PDF files uploaded directly to Discord.';
      } else if (error.message.includes('timeout') || error.message.includes('AbortError')) {
        return 'Sorry, the PDF download timed out. Please try again.';
      }
    }
    
    return 'Sorry, I encountered an error while processing the PDF. Please try again.';
  }
}