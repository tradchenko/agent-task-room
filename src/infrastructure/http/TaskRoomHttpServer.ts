import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import { jsonRpcHandler, restHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import type { HumanVerdict } from '../../domain/room/room-types.js';
import type { RoomService } from '../../domain/room/RoomService.js';
import { TaskRoomA2AExecutor } from '../a2a/TaskRoomA2AExecutor.js';
import { buildTaskRoomAgentCard } from '../a2a/TaskRoomAgentCard.js';
import { TaskRoomMcpFactory } from '../mcp/TaskRoomMcpFactory.js';
import { WebUiRenderer } from './WebUiRenderer.js';

export interface TaskRoomHttpServerOptions {
  host: string;
  port: number;
  mcpPath: string;
  sharedToken: string;
  storageFile: string;
  storageMode?: 'json' | 'sqlite';
  roomService: RoomService;
}

interface LaunchPayload {
  roomId?: string;
  publicMcpUrl?: string;
  publicA2AJsonRpcUrl?: string;
  publicA2ARestUrl?: string;
  publicRoomUrl?: string;
  publicPeerInviteUrl?: string;
  commands?: {
    joinPosixCommand?: string;
    joinPowerShellCommand?: string;
    stop?: string;
  };
  prompts?: {
    localPrompt?: string;
    peerPrompt?: string;
  };
  examples?: {
    watchRoomEnvelope?: string;
    pushEnvelope?: string;
  };
}

const SERVER_FILE = fileURLToPath(import.meta.url);
const ASSET_FILE = path.resolve(path.dirname(SERVER_FILE), 'ui/TaskRoomBrowserApp.js');
const FALLBACK_ASSET_SOURCE = `
class TaskRoomBrowserApp {
  boot() {
    console.warn('TaskRoomBrowserApp fallback asset is active.');
  }
}
new TaskRoomBrowserApp().boot();
`;

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export class TaskRoomHttpServer {
  private readonly app = express();
  private readonly launchFile: string;
  private readonly renderer = new WebUiRenderer();
  private a2aJsonRpcHandler: RequestHandler | null = null;
  private a2aRestHandler: RequestHandler | null = null;
  private server: http.Server | null = null;
  public baseUrl = '';

  public constructor(private readonly options: TaskRoomHttpServerOptions) {
    this.launchFile = path.join(path.dirname(this.options.storageFile), 'launch.json');
    this.configure();
  }

  public async start(): Promise<void> {
    if (this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(this.options.port, this.options.host, () => {
        resolve();
      });

      this.server.once('error', reject);
    });

    const activeServer = this.server as http.Server | null;

    if (!activeServer) {
      throw new Error('Сервер не был инициализирован.');
    }

    const address = activeServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Не удалось определить адрес HTTP-сервера.');
    }

    this.baseUrl = `http://${this.options.host}:${address.port}`;
    this.initializeA2AHandlers();
  }

  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    this.server = null;
  }

  private configure(): void {
    this.app.set('trust proxy', true);
    this.app.use(express.json({ limit: '2mb' }));

    this.app.get('/health', async (_request, response) => {
      const rooms = await this.options.roomService.listRooms();

      response.json({
        ok: true,
        service: 'agent-task-room',
        rooms: rooms.rooms.length,
        mcpPath: this.options.mcpPath,
        auth: this.options.sharedToken ? 'bearer' : 'none',
        storage: {
          mode: this.options.storageMode ?? 'json',
          file: this.options.storageFile,
        },
      });
    });

    this.app.get('/api/launch', this.requireAuth.bind(this), (_request, response) => {
      response.json({
        launch: readJsonIfExists<LaunchPayload>(this.launchFile),
      });
    });

    this.app.get('/api/rooms', this.requireAuth.bind(this), async (_request, response, next) => {
      try {
        response.json(await this.options.roomService.listRooms());
      } catch (error) {
        next(error);
      }
    });

    this.app.get('/api/rooms/search', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        response.json(
          await this.options.roomService.searchRooms({
            query: String(request.query.q ?? ''),
            status: String(request.query.status ?? 'all') as 'all',
            limit: Number(request.query.limit ?? '20'),
          }),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.get('/api/rooms/:roomId', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        response.json(await this.options.roomService.getRoomOverview(String(request.params.roomId ?? '')));
      } catch (error) {
        next(error);
      }
    });

    this.app.post('/api/rooms/:roomId/join', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        const roomId = String(request.params.roomId ?? '');

        await this.options.roomService.joinRoom({
          roomId,
          participantId: String(request.body?.participantId ?? ''),
          participantLabel: request.body?.participantLabel,
          role: request.body?.role,
        });
        response.json(await this.options.roomService.getRoomOverview(roomId));
      } catch (error) {
        next(error);
      }
    });

    this.app.get('/api/rooms/:roomId/history', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        response.json(
          await this.options.roomService.getRoomHistory(
            String(request.params.roomId ?? ''),
            Number(request.query.limit ?? '50'),
          ),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.get('/api/rooms/:roomId/updates', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        const afterSequence = Number(request.query.afterSequence ?? '0');
        const limit = Number(request.query.limit ?? '100');
        response.json(await this.options.roomService.getRoomUpdates(String(request.params.roomId ?? ''), afterSequence, limit));
      } catch (error) {
        next(error);
      }
    });

    this.app.post('/api/rooms/:roomId/human-message', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        response.json(
          await this.options.roomService.postHumanMessage({
            roomId: String(request.params.roomId ?? ''),
            humanLabel: request.body?.humanLabel,
            title: request.body?.title,
            body: String(request.body?.body ?? ''),
            references: request.body?.references,
          }),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.post('/api/rooms/:roomId/human-feedback', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        response.json(
          await this.options.roomService.recordHumanFeedback({
            roomId: String(request.params.roomId ?? ''),
            humanLabel: request.body?.humanLabel,
            verdict: String(request.body?.verdict ?? '') as HumanVerdict,
            comment: request.body?.comment,
          }),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.post('/api/rooms/:roomId/artifacts', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        response.json(
          await this.options.roomService.addArtifact({
            roomId: String(request.params.roomId ?? ''),
            humanLabel: request.body?.humanLabel,
            participantId: request.body?.participantId,
            participantLabel: request.body?.participantLabel,
            role: request.body?.role,
            kind: request.body?.kind,
            title: request.body?.title,
            uri: request.body?.uri,
            summary: request.body?.summary,
            content: request.body?.content,
            tags: request.body?.tags,
            references: request.body?.references,
          }),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.post('/api/rooms/:roomId/decisions', this.requireAuth.bind(this), async (request, response, next) => {
      try {
        response.json(
          await this.options.roomService.recordDecision({
            roomId: String(request.params.roomId ?? ''),
            humanLabel: request.body?.humanLabel,
            participantId: request.body?.participantId,
            participantLabel: request.body?.participantLabel,
            role: request.body?.role,
            title: request.body?.title,
            summary: request.body?.summary,
            rationale: request.body?.rationale,
            references: request.body?.references,
            status: request.body?.status,
          }),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.get(this.options.mcpPath, this.requireAuth.bind(this), (_request, response) => {
      response.json({
        ok: true,
        service: 'agent-task-room',
        kind: 'mcp-endpoint',
        message: 'Это MCP endpoint для агентов и CLI. Открой UI по / или используйте CLI/agent client для POST-запросов.',
      });
    });

    this.app.post(this.options.mcpPath, this.requireAuth.bind(this), async (request, response, next) => {
      try {
        // MCP-сервер создаётся поверх уже готового RoomService,
        // поэтому весь бизнес-контекст остаётся единым для CLI, UI и агентов.
        const mcpServer = new TaskRoomMcpFactory(this.options.roomService).create();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        response.on('close', () => {
          void transport.close();
          void mcpServer.close();
        });

        await mcpServer.connect(transport);
        await transport.handleRequest(request, response, request.body);
      } catch (error) {
        next(error);
      }
    });

    this.app.get('/.well-known/agent-card.json', this.requireAuth.bind(this), (request, response) => {
      response.json(buildTaskRoomAgentCard(this.resolveExternalBaseUrl(request), Boolean(this.options.sharedToken)));
    });

    this.app.use('/a2a/jsonrpc', this.requireAuth.bind(this), (request, response, next) => {
      this.forwardToA2AHandler(this.a2aJsonRpcHandler, request, response, next);
    });

    this.app.use('/a2a/rest', this.requireAuth.bind(this), (request, response, next) => {
      this.forwardToA2AHandler(this.a2aRestHandler, request, response, next);
    });

    this.app.get('/', (_request, response) => {
      response.type('html').send(this.renderer.render());
    });

    this.app.get('/rooms/:roomId', (_request, response) => {
      response.type('html').send(this.renderer.render());
    });

    this.app.get('/join/:roomId', (_request, response) => {
      response.type('html').send(this.renderer.render());
    });

    this.app.get('/assets/task-room-ui.js', (_request, response) => {
      response.type('application/javascript');

      if (fs.existsSync(ASSET_FILE)) {
        response.send(fs.readFileSync(ASSET_FILE, 'utf8'));
        return;
      }

      response.send(FALLBACK_ASSET_SOURCE);
    });

    this.app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ error: message });
    });
  }

  private initializeA2AHandlers(): void {
    const requestHandler = new DefaultRequestHandler(
      buildTaskRoomAgentCard(this.baseUrl, Boolean(this.options.sharedToken)),
      new InMemoryTaskStore(),
      new TaskRoomA2AExecutor(this.options.roomService),
    );

    this.a2aJsonRpcHandler = jsonRpcHandler({
      requestHandler,
      userBuilder: UserBuilder.noAuthentication,
    });
    this.a2aRestHandler = restHandler({
      requestHandler,
      userBuilder: UserBuilder.noAuthentication,
    });
  }

  private forwardToA2AHandler(handler: RequestHandler | null, request: Request, response: Response, next: NextFunction): void {
    if (!handler) {
      response.status(503).json({ error: 'A2A transport ещё не инициализирован.' });
      return;
    }

    handler(request, response, next);
  }

  private resolveExternalBaseUrl(request: Request): string {
    const protocol = String(request.headers['x-forwarded-proto'] ?? request.protocol ?? 'http');
    const host =
      String(request.headers['x-forwarded-host'] ?? '').trim() || String(request.headers.host ?? '').trim() || new URL(this.baseUrl).host;

    return `${protocol}://${host}`;
  }

  private requireAuth(request: Request, response: Response, next: NextFunction): void {
    if (!this.options.sharedToken) {
      next();
      return;
    }

    const headerToken = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const queryToken = typeof request.query.token === 'string' ? request.query.token : '';
    const token = headerToken || queryToken;

    if (token === this.options.sharedToken) {
      next();
      return;
    }

    response.status(401).json({ error: 'Нужен Bearer token.' });
  }
}
