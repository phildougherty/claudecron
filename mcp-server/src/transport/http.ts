/**
 * HTTP Transport for ClaudeCron MCP Server
 *
 * Implements HTTP/SSE transport for remote server access
 * Based on MCP SDK StreamableHTTPServerTransport
 *
 * % 0 COMPLETE - HTTP Transport
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { HttpTransportConfig } from '../models/types.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

/**
 * HTTP Transport Manager
 * Manages HTTP server and MCP transport connections
 */
export class HttpTransportManager {
  private app: express.Application;
  private transports: Map<string, StreamableHTTPServerTransport>;
  private config: Required<HttpTransportConfig>;
  private httpServer?: any;

  constructor(
    private server: Server,
    config?: HttpTransportConfig
  ) {
    // % 0 COMPLETE - constructor

    // Apply defaults
    this.config = {
      port: config?.port ?? 3000,
      host: config?.host ?? 'localhost',
      auth: config?.auth ?? { type: 'none' },
      cors: {
        enabled: config?.cors?.enabled ?? true,
        origins: config?.cors?.origins ?? ['*'],
      },
    };

    this.app = express();
    this.transports = new Map();

    this.setupMiddleware();
    this.setupRoutes();

    // % 100 COMPLETE - constructor
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // % 0 COMPLETE - setupMiddleware

    // JSON body parser
    this.app.use(express.json());

    // CORS configuration
    if (this.config.cors.enabled) {
      this.app.use(cors({
        origin: this.config.cors.origins,
        exposedHeaders: ['Mcp-Session-Id'],
        credentials: true,
      }));
    }

    // Authentication middleware
    if (this.config.auth.type !== 'none') {
      this.app.use('/mcp', this.authenticationMiddleware.bind(this));
    }

    // % 100 COMPLETE - setupMiddleware
  }

  /**
   * Authentication middleware
   * Validates Bearer tokens or API keys
   */
  private authenticationMiddleware(req: Request, res: Response, next: NextFunction): void {
    // % 0 COMPLETE - authenticationMiddleware

    const { type, token, header } = this.config.auth;

    if (type === 'none') {
      next();
      return;
    }

    let providedToken: string | undefined;

    if (type === 'bearer') {
      // Extract Bearer token from Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        providedToken = authHeader.substring(7);
      }
    } else if (type === 'apikey') {
      // Extract API key from custom header
      const headerName = header ?? 'X-API-Key';
      providedToken = req.headers[headerName.toLowerCase()] as string;
    }

    if (!providedToken || providedToken !== token) {
      console.error('[HTTP Transport] Authentication failed');
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Invalid or missing authentication token',
        },
        id: null,
      });
      return;
    }

    console.error('[HTTP Transport] Authentication successful');
    next();

    // % 100 COMPLETE - authenticationMiddleware
  }

  /**
   * Setup Express routes for MCP protocol
   */
  private setupRoutes(): void {
    // % 0 COMPLETE - setupRoutes

    // POST /mcp - Handle MCP JSON-RPC requests
    this.app.post('/mcp', this.handlePostRequest.bind(this));

    // GET /mcp - Handle SSE stream connections
    this.app.get('/mcp', this.handleGetRequest.bind(this));

    // DELETE /mcp - Handle session termination
    this.app.delete('/mcp', this.handleDeleteRequest.bind(this));

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        service: 'claudecron-mcp-server',
        version: '2.0.0',
        transport: 'http',
        activeSessions: this.transports.size,
      });
    });

    // % 100 COMPLETE - setupRoutes
  }

  /**
   * Handle POST requests containing JSON-RPC messages
   */
  private async handlePostRequest(req: Request, res: Response): Promise<void> {
    // % 0 COMPLETE - handlePostRequest

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    console.error(`[HTTP Transport] POST request ${sessionId ? `for session ${sessionId}` : '(new)'}`);

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport for this session
        transport = this.transports.get(sessionId)!;
        console.error(`[HTTP Transport] Reusing transport for session ${sessionId}`);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request - create new transport
        console.error('[HTTP Transport] Creating new transport for initialization');

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            console.error(`[HTTP Transport] Session initialized: ${sid}`);
            this.transports.set(sid, transport);
          },
          onsessionclosed: (sid: string) => {
            console.error(`[HTTP Transport] Session closed: ${sid}`);
            this.transports.delete(sid);
          },
        });

        // Setup close handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports.has(sid)) {
            console.error(`[HTTP Transport] Transport closed for session ${sid}`);
            this.transports.delete(sid);
          }
        };

        // Connect transport to MCP server
        await this.server.connect(transport);
        await transport.handleRequest(req as any, res as any, req.body);
        return;
      } else {
        // Invalid request
        console.error('[HTTP Transport] Invalid request: no session ID or not initialization');
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or not an initialization request',
          },
          id: null,
        });
        return;
      }

      // Handle request with existing transport
      await transport.handleRequest(req as any, res as any, req.body);
    } catch (error: any) {
      console.error('[HTTP Transport] Error handling POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: `Internal server error: ${error.message}`,
          },
          id: null,
        });
      }
    }

    // % 100 COMPLETE - handlePostRequest
  }

  /**
   * Handle GET requests for SSE streams
   */
  private async handleGetRequest(req: Request, res: Response): Promise<void> {
    // % 0 COMPLETE - handleGetRequest

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.transports.has(sessionId)) {
      console.error('[HTTP Transport] Invalid or missing session ID for GET request');
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const lastEventId = req.headers['last-event-id'] as string | undefined;
    if (lastEventId) {
      console.error(`[HTTP Transport] Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.error(`[HTTP Transport] Establishing SSE stream for session ${sessionId}`);
    }

    const transport = this.transports.get(sessionId)!;

    try {
      await transport.handleRequest(req as any, res as any);
    } catch (error: any) {
      console.error('[HTTP Transport] Error handling GET request:', error);
      if (!res.headersSent) {
        res.status(500).send(`Error establishing SSE stream: ${error.message}`);
      }
    }

    // % 100 COMPLETE - handleGetRequest
  }

  /**
   * Handle DELETE requests for session termination
   */
  private async handleDeleteRequest(req: Request, res: Response): Promise<void> {
    // % 0 COMPLETE - handleDeleteRequest

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.transports.has(sessionId)) {
      console.error('[HTTP Transport] Invalid or missing session ID for DELETE request');
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.error(`[HTTP Transport] Session termination request for ${sessionId}`);

    const transport = this.transports.get(sessionId)!;

    try {
      await transport.handleRequest(req as any, res as any);
    } catch (error: any) {
      console.error('[HTTP Transport] Error handling DELETE request:', error);
      if (!res.headersSent) {
        res.status(500).send(`Error terminating session: ${error.message}`);
      }
    }

    // % 100 COMPLETE - handleDeleteRequest
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    // % 0 COMPLETE - start

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.config.port, this.config.host, () => {
          console.error(`[HTTP Transport] Server listening on http://${this.config.host}:${this.config.port}/mcp`);
          console.error(`[HTTP Transport] Health check: http://${this.config.host}:${this.config.port}/health`);

          if (this.config.auth.type !== 'none') {
            console.error(`[HTTP Transport] Authentication enabled: ${this.config.auth.type}`);
          } else {
            console.error('[HTTP Transport] WARNING: No authentication configured - server is open to all clients');
          }

          resolve();
        });

        this.httpServer.on('error', (error: any) => {
          console.error('[HTTP Transport] Server error:', error);
          reject(error);
        });
      } catch (error) {
        console.error('[HTTP Transport] Failed to start server:', error);
        reject(error);
      }
    });

    // % 100 COMPLETE - start
  }

  /**
   * Stop the HTTP server and cleanup
   */
  async stop(): Promise<void> {
    // % 0 COMPLETE - stop

    console.error('[HTTP Transport] Shutting down...');

    // Close all active transports
    for (const [sessionId, transport] of this.transports.entries()) {
      try {
        console.error(`[HTTP Transport] Closing transport for session ${sessionId}`);
        await transport.close();
      } catch (error: any) {
        console.error(`[HTTP Transport] Error closing transport ${sessionId}:`, error);
      }
    }

    this.transports.clear();

    // Close HTTP server
    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer.close((error: any) => {
          if (error) {
            console.error('[HTTP Transport] Error closing HTTP server:', error);
            reject(error);
          } else {
            console.error('[HTTP Transport] HTTP server closed');
            resolve();
          }
        });
      });
    }

    // % 100 COMPLETE - stop
  }
}

/**
 * % 100 COMPLETE - HTTP Transport
 */
