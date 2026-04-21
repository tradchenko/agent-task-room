import type { RoomService } from '../../domain/room/RoomService.js';
export interface TaskRoomHttpServerOptions {
    host: string;
    port: number;
    mcpPath: string;
    sharedToken: string;
    storageFile: string;
    storageMode?: 'json' | 'sqlite';
    roomService: RoomService;
}
export declare class TaskRoomHttpServer {
    private readonly options;
    private readonly app;
    private readonly launchFile;
    private readonly renderer;
    private a2aJsonRpcHandler;
    private a2aRestHandler;
    private server;
    baseUrl: string;
    constructor(options: TaskRoomHttpServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private configure;
    private initializeA2AHandlers;
    private forwardToA2AHandler;
    private resolveExternalBaseUrl;
    private requireAuth;
}
