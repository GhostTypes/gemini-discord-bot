/**
 * @fileoverview Image utilities for GeoGuesser game Discord integration.
 * 
 * Provides utilities for converting base64 image data to Discord AttachmentBuilder
 * objects for proper image display in Discord embeds.
 */

import { AttachmentBuilder } from 'discord.js';
import { logger } from '../../../utils/logger.js';

/**
 * Creates a Discord AttachmentBuilder from base64 image data.
 * Converts data URI format (data:image/jpeg;base64,xxx) to Discord attachment.
 * 
 * @param imageData - Base64 data URI string
 * @param roundNumber - Round number for filename generation
 * @returns AttachmentBuilder instance for Discord message
 * @throws Error if image data is invalid
 */
export function createLocationImageAttachment(imageData: string, roundNumber: number): AttachmentBuilder {
  try {
    // Validate input
    if (!imageData || typeof imageData !== 'string') {
      throw new Error('Invalid image data: must be a non-empty string');
    }

    // Check if it's a data URI
    if (!imageData.startsWith('data:')) {
      throw new Error('Invalid image data: must be a data URI');
    }

    // Split the data URI
    const commaIndex = imageData.indexOf(',');
    if (commaIndex === -1) {
      throw new Error('Invalid image data: missing comma separator');
    }

    const header = imageData.substring(0, commaIndex);
    const base64Data = imageData.substring(commaIndex + 1);

    // Validate header format
    const mimeMatch = header.match(/data:(.+);base64/);
    if (!mimeMatch) {
      throw new Error('Invalid image data: incorrect header format');
    }

    const mimeType = mimeMatch[1] || 'image/jpeg';
    const extension = mimeType.split('/')[1] || 'jpg';
    
    // Validate base64 data
    if (!base64Data || base64Data.length === 0) {
      throw new Error('Invalid image data: empty base64 content');
    }

    // Create buffer from base64
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Validate buffer size
    if (buffer.length === 0) {
      throw new Error('Invalid image data: empty buffer after decoding');
    }

    if (buffer.length > 8 * 1024 * 1024) { // 8MB limit
      throw new Error('Invalid image data: file too large (>8MB)');
    }

    const filename = `geoguesser-round-${roundNumber}.${extension}`;
    
    logger.debug(`Creating image attachment: ${filename}, size: ${buffer.length} bytes`);
    
    return new AttachmentBuilder(buffer, { name: filename });
  } catch (error) {
    logger.error('Failed to create image attachment:', error);
    // Log more details for debugging (with truncated data)
    logger.error('Image data details:', {
      type: typeof imageData,
      length: imageData?.length,
      starts_with: imageData?.substring(0, 50) + '...',
      roundNumber
    });
    throw new Error(`Invalid image data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}