/**
 * @fileoverview Simple flow monitoring web server for debugging Discord bot flows.
 * 
 * Provides a lightweight Express.js server with WebSocket support for real-time
 * flow monitoring and debugging. Features include:
 * - Live flow monitoring with real-time status updates
 * - Flow history browser with in-memory storage
 * - WebSocket communication for instant UI updates
 * - Simple REST API for flow data queries
 * - Minimal dependencies using only Express and built-in WebSocket
 */

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface FlowData {
  flowId: string;
  flowType: string;
  userId: string;
  channelId: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'completed' | 'error';
  message: string;
  logs: LogEntry[];
  metrics: FlowMetrics;
  duration?: number;
  success?: boolean;
  error?: string;
}

interface LogEntry {
  timestamp: string;
  message: string;
  level: string;
  metadata?: any;
}

interface FlowMetrics {
  chunkCount: number;
  editCount: number;
  processingTime: number;
  inputTokens?: number;
  outputTokens?: number;
}

interface FlowStartData {
  flowId: string;
  flowType: string;
  userId: string;
  channelId: string;
  message?: string;
}

interface FlowUpdateData {
  log?: {
    message: string;
    level: string;
    timestamp?: string;
    metadata?: any;
    data?: any; // Keep for backwards compatibility
  };
  metrics?: Partial<FlowMetrics>;
  status?: string;
}

interface FlowCompletionData {
  success?: boolean;
  error?: string;
}

class FlowMonitor {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private activeFlows: Map<string, FlowData>;
  private flowHistory: FlowData[];
  private maxHistory: number;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // In-memory storage
    this.activeFlows = new Map<string, FlowData>();
    this.flowHistory = [];
    this.maxHistory = 200;
    
    this.setupRoutes();
    this.setupWebSocket();
    
    console.log('Flow Monitor initialized');
  }
  
  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static(join(__dirname, 'public')));
    
    // API routes
    this.app.get('/api/flows/active', (_req: Request, res: Response) => {
      res.json(Array.from(this.activeFlows.values()));
    });
    
    this.app.get('/api/flows/history', (req: Request, res: Response) => {
      const { type, userId, limit = 50 } = req.query;
      let filteredHistory = [...this.flowHistory];
      
      if (type && typeof type === 'string') {
        filteredHistory = filteredHistory.filter(f => f.flowType === type);
      }
      
      if (userId && typeof userId === 'string') {
        filteredHistory = filteredHistory.filter(f => f.userId === userId);
      }
      
      const limitNum = typeof limit === 'string' ? parseInt(limit) : 50;
      res.json(filteredHistory.slice(-limitNum));
    });
    
    this.app.get('/api/flows/:flowId', (req: Request, res: Response) => {
      const flowId = req.params.flowId;
      const activeFlow = this.activeFlows.get(flowId);
      
      if (activeFlow) {
        res.json(activeFlow);
      } else {
        const historyFlow = this.flowHistory.find(f => f.flowId === flowId);
        res.json(historyFlow || { error: 'Flow not found' });
      }
    });
  }
  
  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');
      
      // Send current state to new client
      ws.send(JSON.stringify({
        type: 'initial_state',
        activeFlows: Array.from(this.activeFlows.values()),
        recentHistory: this.flowHistory.slice(-20)
      }));
      
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });
  }
  
  // Flow event handlers
  onFlowStart(flowData: FlowStartData): void {
    const flow: FlowData = {
      flowId: flowData.flowId,
      flowType: flowData.flowType,
      userId: flowData.userId,
      channelId: flowData.channelId,
      startTime: new Date().toISOString(),
      status: 'active',
      message: flowData.message?.substring(0, 100) || '',
      logs: [],
      metrics: {
        chunkCount: 0,
        editCount: 0,
        processingTime: 0
      }
    };
    
    this.activeFlows.set(flowData.flowId, flow);
    this.broadcast({
      type: 'flow_started',
      flow: flow
    });
    
    console.log(`Flow started: ${flowData.flowType} (${flowData.flowId})`);
  }
  
  onFlowUpdate(flowId: string, updateData: FlowUpdateData): void {
    const flow = this.activeFlows.get(flowId);
    if (!flow) {return;}
    
    if (updateData.log) {
      flow.logs.push({
        timestamp: updateData.log.timestamp || new Date().toISOString(),
        message: updateData.log.message,
        level: updateData.log.level || 'info',
        metadata: updateData.log.metadata || updateData.log.data || {}
      });
    }
    
    if (updateData.metrics) {
      Object.assign(flow.metrics, updateData.metrics);
    }
    
    if (updateData.status) {
      flow.status = updateData.status as 'active' | 'completed' | 'error';
    }
    
    this.broadcast({
      type: 'flow_updated',
      flowId: flowId,
      update: updateData
    });
  }
  
  onFlowComplete(flowId: string, completionData: FlowCompletionData = {}): void {
    const flow = this.activeFlows.get(flowId);
    if (!flow) {return;}
    
    // Complete the flow
    flow.endTime = new Date().toISOString();
    flow.status = 'completed';
    flow.duration = Date.now() - new Date(flow.startTime).getTime();
    
    if (completionData.success !== undefined) {
      flow.success = completionData.success;
    }
    
    if (completionData.error) {
      flow.error = completionData.error;
      flow.status = 'error';
    }
    
    // Move to history
    this.flowHistory.push({ ...flow });
    this.activeFlows.delete(flowId);
    
    // Maintain history limit
    if (this.flowHistory.length > this.maxHistory) {
      this.flowHistory = this.flowHistory.slice(-this.maxHistory);
    }
    
    this.broadcast({
      type: 'flow_completed',
      flowId: flowId,
      flow: flow
    });
    
    console.log(`Flow completed: ${flow.flowType} (${flowId}) - Duration: ${flow.duration}ms`);
  }
  
  private broadcast(message: any): void {
    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
  
  start(port = 3001): void {
    this.server.listen(port, () => {
      console.log(`Flow Monitor running on http://localhost:${port}`);
    });
  }
  
  // Helper to generate flow IDs
  static generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const flowMonitor = new FlowMonitor();

// Export class for testing
export { FlowMonitor };