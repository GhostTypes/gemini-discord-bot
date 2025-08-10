/**
 * @fileoverview Flow event logging integration for debugging interface.
 * 
 * Provides simple event emission and logging utilities that integrate with
 * the flow monitor for real-time debugging. Features include:
 * - Flow lifecycle event emission (start, update, complete)
 * - Integration with existing logger for structured debug output
 * - Helper methods for common flow events and metrics
 * - Optional monitoring based on environment configuration
 */

import { logger } from '../utils/logger.js';
import { FlowMonitor } from './flow-monitor.js';

interface FlowOptions {
  userId?: string;
  channelId?: string;
  message?: string;
}

class FlowLogger {
  private flowMonitor: FlowMonitor | null = null;
  private enabled: boolean = false;
  
  // Initialize with flow monitor instance
  initialize(flowMonitor: FlowMonitor): void {
    this.flowMonitor = flowMonitor;
    this.enabled = true;
    logger.info('FlowLogger initialized with monitoring enabled');
  }
  
  // Start a flow
  startFlow(flowType: string, options: FlowOptions = {}): string | null {
    if (!this.enabled) {return null;}
    
    const flowId = FlowMonitor.generateFlowId();
    const flowData = {
      flowId,
      flowType,
      userId: options.userId || 'unknown',
      channelId: options.channelId || 'unknown',
      message: options.message || ''
    };
    
    if (this.flowMonitor) {
      this.flowMonitor.onFlowStart(flowData);
    }
    
    logger.info(`FLOW START: ${flowType}`, {
      flowId,
      userId: flowData.userId,
      channelId: flowData.channelId
    });
    
    return flowId;
  }
  
  // Update flow with log message
  logFlow(flowId: string | null, message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info', data: any = {}): void {
    if (!this.enabled || !flowId) {return;}
    
    const updateData = {
      log: {
        message,
        level,
        timestamp: new Date().toISOString(),
        metadata: data
      }
    };
    
    if (this.flowMonitor) {
      this.flowMonitor.onFlowUpdate(flowId, updateData);
    }
    
    (logger as any)[level](`FLOW LOG (${flowId}): ${message}`, data);
  }
  
  // Update flow metrics
  updateFlowMetrics(flowId: string | null, metrics: Record<string, any>): void {
    if (!this.enabled || !flowId) {return;}
    
    const updateData = {
      metrics
    };
    
    if (this.flowMonitor) {
      this.flowMonitor.onFlowUpdate(flowId, updateData);
    }
    
    logger.debug(`FLOW METRICS (${flowId}):`, metrics);
  }
  
  // Update flow status
  updateFlowStatus(flowId: string | null, status: string): void {
    if (!this.enabled || !flowId) {return;}
    
    const updateData = {
      status
    };
    
    if (this.flowMonitor) {
      this.flowMonitor.onFlowUpdate(flowId, updateData);
    }
    
    logger.info(`FLOW STATUS (${flowId}): ${status}`);
  }
  
  // Complete a flow
  completeFlow(flowId: string | null, success: boolean = true, error?: Error | null): void {
    if (!this.enabled || !flowId) {return;}
    
    const completionData: { success: boolean; error?: string } = {
      success
    };
    
    if (error) {
      completionData.error = error instanceof Error ? error.message : String(error);
    }
    
    if (this.flowMonitor) {
      this.flowMonitor.onFlowComplete(flowId, completionData);
    }
    
    const status = success ? 'SUCCESS' : 'FAILED';
    logger.info(`FLOW COMPLETE: ${status} (${flowId})`, completionData);
  }
  
  // Helper for streaming handler events
  onStreamingChunk(flowId: string | null, chunkCount: number, editCount: number): void {
    this.updateFlowMetrics(flowId, {
      chunkCount,
      editCount
    });
  }
  
  // Helper for route decisions
  onRouteDecision(flowId: string | null, intent: string, entities: Record<string, any> = {}): void {
    this.logFlow(flowId, `Routed to intent: ${intent}`, 'info', {
      intent,
      entities
    });
  }
  
  // Helper for media processing
  onMediaProcessing(flowId: string | null, mediaType: string, count: number): void {
    this.logFlow(flowId, `Processing ${count} ${mediaType} items`, 'info', {
      mediaType,
      count
    });
  }
  
  // Helper for AI model calls
  onAICall(flowId: string | null, model: string, inputTokens?: number, outputTokens?: number): void {
    this.logFlow(flowId, `AI model call: ${model}`, 'info', {
      model,
      inputTokens,
      outputTokens
    });
    
    this.updateFlowMetrics(flowId, {
      inputTokens: (this.getFlowMetric(flowId) || 0) + (inputTokens || 0),
      outputTokens: (this.getFlowMetric(flowId) || 0) + (outputTokens || 0)
    });
  }
  
  // Helper to get current flow metric (for accumulation)
  getFlowMetric(flowId: string | null): number {
    if (!this.enabled || !flowId || !this.flowMonitor) {return 0;}
    
    // This is a simplified version - in practice you'd need a public method on FlowMonitor
    return 0;
  }
  
  // Helper for error tracking
  onFlowError(flowId: string | null, error: Error, context: Record<string, any> = {}): void {
    this.logFlow(flowId, `Flow error: ${error.message || error}`, 'error', {
      error: error.stack || error.message || error,
      context
    });
  }
}

// Export singleton instance
export const flowLogger = new FlowLogger();

// Export class for testing
export { FlowLogger };