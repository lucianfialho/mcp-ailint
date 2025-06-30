// src/transports/http.ts - FIXED VERSION
import express, { Request, Response, NextFunction } from 'express';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Server } from 'http';

export class HTTPTransport implements Transport {
  private app: express.Application;
  private serverInstance?: Server;
  private messageHandler?: (message: any) => Promise<any>;
  private port: number;
  private isReady = false;

  constructor(port: number) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    
    // Basic CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, MCP-Protocol-Version');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // ✅ FIXED: More lenient MCP header validation (only warn, don't block)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'POST' && req.path === '/') {
        const protocolVersion = req.headers['mcp-protocol-version'];
        
        if (!protocolVersion) {
          console.log('⚠️ Warning: Missing MCP-Protocol-Version header');
        } else if (protocolVersion !== '2025-06-18') {
          console.log(`⚠️ Warning: Protocol version ${protocolVersion} (expected 2025-06-18)`);
        }
        
        // ✅ Continue processing instead of blocking
      }
      next();
    });
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        ready: this.isReady,
        timestamp: new Date().toISOString(),
        transport: 'http',
        port: this.port
      });
    });

    // ✅ FIXED: Simplified MCP endpoint
    this.app.post('/', (req: Request, res: Response) => {
      (async () => {
        console.log('📨 Received MCP request:', req.body?.method || 'unknown method');
        
        // Check if server is ready
        if (!this.isReady || !this.messageHandler) {
          console.log('⚠️ Server not ready yet');
          return res.status(503).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Server initializing, please retry in a moment',
              data: {
                ready: this.isReady,
                hasHandler: !!this.messageHandler
              }
            }
          });
        }

        try {
          const response = await this.messageHandler(req.body);
          console.log('✅ MCP request processed successfully');
          return res.json(response);
        } catch (error: any) {
          console.error('❌ MCP request error:', error);
          return res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: error.message || 'Internal server error',
              data: { 
                type: error.constructor.name,
                timestamp: new Date().toISOString()
              }
            }
          });
        }
      })();
    });

    // Basic GET endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        service: 'AILint MCP Server',
        transport: 'HTTP',
        ready: this.isReady,
        endpoints: {
          mcp: 'POST /',
          health: 'GET /health'
        }
      });
    });
  }

  // ✅ This is called by server.connect()
  onMessage(handler: (message: any) => Promise<any>): void {
    console.log('🔧 Setting up MCP message handler...');
    this.messageHandler = handler;
    this.isReady = true;
    console.log('✅ MCP message handler ready - server can now process requests');
  }

  // ✅ Start HTTP server
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.serverInstance = this.app.listen(this.port, () => {
          console.log(`🚀 AILint MCP HTTP server listening on port ${this.port}`);
          console.log(`🏥 Health check: http://localhost:${this.port}/health`);
          console.log(`📡 MCP endpoint: http://localhost:${this.port}/`);
          resolve();
        });

        this.serverInstance.on('error', (error: any) => {
          console.error('❌ HTTP server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    if (this.serverInstance) {
      return new Promise((resolve) => {
        this.serverInstance!.close(() => {
          console.log('🔴 HTTP server closed');
          resolve();
        });
      });
    }
  }

  // Transport interface methods
  async send(message: any): Promise<void> {
    console.log('📤 Transport send called:', message);
  }

  onClose(handler: () => void): void {
    if (this.serverInstance) {
      this.serverInstance.on('close', handler);
    }
  }

  onError(handler: (error: Error) => void): void {
    if (this.serverInstance) {
      this.serverInstance.on('error', handler);
    }
  }
}