/**
 * @fileoverview AI-powered code execution flow with real-time streaming capabilities.
 * 
 * Provides server-side Python code execution through Google's Gemini AI model with
 * structured input/output validation. Key features include:
 * - Real-time streaming of code generation, execution, and results
 * - Server-side code execution using Gemini's built-in code execution tools
 * - Structured Zod schemas for type-safe input/output validation
 * - Comprehensive error handling with user-friendly error messages
 * - Support for both synchronous flow execution and streaming responses
 * - Detailed logging and metadata tracking for debugging and analytics
 * 
 * The flow processes user messages, generates executable Python code, runs it
 * server-side, and streams back both the code and execution results in real-time.
 * Integrates with Discord's streaming message system for live code execution feedback.
 */

import { ai } from '../genkit.config.js';
import { GoogleGenAI } from '@google/genai';
import { botConfig } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { 
  CodeExecutionInput, 
  CodeExecutionOutput,
  CodeExecutionInputSchema,
  CodeExecutionOutputSchema
} from './schemas/index.js';

// Direct Google AI client for code execution capabilities
const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });

export const codeExecutionFlow = ai.defineFlow(
  {
    name: 'codeExecutionFlow',
    inputSchema: CodeExecutionInputSchema,
    outputSchema: CodeExecutionOutputSchema,
  },
  async (input) => {
    try {
      logger.info('CODE EXECUTION FLOW: Starting', { 
        message: input.message.substring(0, 50),
        userId: input.userId 
      });

      // Validate input
      CodeExecutionInputSchema.parse(input);

      // Generate streaming response with code execution tools
      const stream = await genaiClient.models.generateContentStream({
        model: botConfig.google.model,
        contents: [{ 
          role: 'user', 
          parts: [{ text: input.message }] 
        }],
        config: {
          tools: [{ codeExecution: {} }], // Enable server-side code execution
        }
      });

      let fullText = '';
      let executableCode = '';
      let executionResult = '';
      let hasCode = false;
      let chunkCount = 0;

      // Process streaming response parts
      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        
        for (const part of parts) {
          chunkCount++;
          
          // Handle text content
          if (part.text) {
            fullText += part.text;
            logger.debug(`CODE EXECUTION: Processing text chunk ${chunkCount}, length: ${part.text.length}`);
          }
          
          // Handle executable code
          if (part.executableCode?.code) {
            executableCode += part.executableCode.code;
            hasCode = true;
            logger.debug(`CODE EXECUTION: Processing code chunk, language: ${part.executableCode.language || 'python'}`);
          }
          
          // Handle code execution results
          if (part.codeExecutionResult?.output) {
            executionResult += part.codeExecutionResult.output;
            logger.debug(`CODE EXECUTION: Processing result chunk, length: ${part.codeExecutionResult.output.length}`);
          }
        }
      }

      // Build the result
      const result: CodeExecutionOutput = {
        response: fullText.trim() || 'Code execution completed.',
        hasCode,
        executableCode: hasCode ? executableCode.trim() : undefined,
        codeLanguage: hasCode ? 'python' : undefined,
        executionResult: executionResult.trim() || undefined,
        timestamp: new Date().toISOString(),
        model: botConfig.google.model,
        metadata: {
          userId: input.userId,
          channelId: input.channelId,
          flowType: 'codeExecution',
          chunkCount,
          hasResults: !!executionResult.trim()
        }
      };

      // Validate output
      CodeExecutionOutputSchema.parse(result);

      logger.info(`CODE EXECUTION FLOW: Completed successfully`, {
        hasCode,
        hasResults: !!executionResult.trim(),
        chunkCount,
        responseLength: result.response.length
      });

      return result;

    } catch (error) {
      logger.error('CODE EXECUTION FLOW: Error occurred', error);
      
      // Handle specific error types with user-friendly messages
      const errorMessage = (error as Error).message.toLowerCase();
      
      if (errorMessage.includes('timeout')) {
        throw new Error('Code execution timed out. Please try a simpler request.');
      }
      
      if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        throw new Error('Code execution service is temporarily unavailable. Please try again later.');
      }
      
      if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
        throw new Error('Code execution was blocked for safety reasons. Please modify your request.');
      }
      
      throw new Error('Code execution failed. Please try rephrasing your request.');
    }
  }
);

// Streaming function for Discord integration
export async function streamCodeExecutionResponse(
  input: CodeExecutionInput,
  onChunk: (chunk: { type: string; content: string; language?: string }) => Promise<void>
): Promise<CodeExecutionOutput> {
  try {
    logger.info('CODE EXECUTION: Starting streaming response', { 
      message: input.message.substring(0, 50),
      userId: input.userId 
    });

    // Validate input
    CodeExecutionInputSchema.parse(input);

    // Generate streaming response with code execution tools
    const stream = await genaiClient.models.generateContentStream({
      model: botConfig.google.model,
      contents: [{ 
        role: 'user', 
        parts: [{ text: input.message }] 
      }],
      config: {
        tools: [{ codeExecution: {} }], // Enable server-side code execution
      }
    });

    let fullText = '';
    let executableCode = '';
    let executionResult = '';
    let hasCode = false;
    let chunkCount = 0;

    // Process streaming response parts with callbacks
    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      
      for (const part of parts) {
        chunkCount++;
        
        // Handle text content
        if (part.text) {
          fullText += part.text;
          logger.debug(`CODE EXECUTION: Processing text chunk ${chunkCount}, length: ${part.text.length}`);
          await onChunk({ 
            type: 'text', 
            content: part.text 
          });
        }
        
        // Handle executable code
        if (part.executableCode?.code) {
          executableCode += part.executableCode.code;
          hasCode = true;
          logger.debug(`CODE EXECUTION: Processing code chunk, language: ${part.executableCode.language || 'python'}`);
          await onChunk({ 
            type: 'code', 
            content: part.executableCode.code,
            language: part.executableCode.language || 'python'
          });
        }
        
        // Handle code execution results
        if (part.codeExecutionResult?.output) {
          executionResult += part.codeExecutionResult.output;
          logger.debug(`CODE EXECUTION: Processing result chunk, length: ${part.codeExecutionResult.output.length}`);
          await onChunk({ 
            type: 'result', 
            content: part.codeExecutionResult.output 
          });
        }
      }
    }

    // Build the result
    const result: CodeExecutionOutput = {
      response: fullText.trim() || 'Code execution completed.',
      hasCode,
      executableCode: hasCode ? executableCode.trim() : undefined,
      codeLanguage: hasCode ? 'python' : undefined,
      executionResult: executionResult.trim() || undefined,
      timestamp: new Date().toISOString(),
      model: botConfig.google.model,
      metadata: {
        userId: input.userId,
        channelId: input.channelId,
        flowType: 'codeExecution',
        chunkCount,
        hasResults: !!executionResult.trim()
      }
    };

    // Validate output
    CodeExecutionOutputSchema.parse(result);

    logger.info(`CODE EXECUTION: Streaming completed successfully`, {
      hasCode,
      hasResults: !!executionResult.trim(),
      chunkCount,
      responseLength: result.response.length
    });

    return result;

  } catch (error) {
    logger.error('CODE EXECUTION STREAMING: Error occurred', error);
    
    // Handle specific error types with user-friendly messages
    const errorMessage = (error as Error).message.toLowerCase();
    
    if (errorMessage.includes('timeout')) {
      throw new Error('Code execution timed out. Please try a simpler request.');
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
      throw new Error('Code execution service is temporarily unavailable. Please try again later.');
    }
    
    if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
      throw new Error('Code execution was blocked for safety reasons. Please modify your request.');
    }
    
    throw new Error('Code execution failed. Please try rephrasing your request.');
  }
}