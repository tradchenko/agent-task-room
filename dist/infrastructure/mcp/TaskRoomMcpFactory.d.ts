import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RoomService } from '../../domain/room/RoomService.js';
export declare class TaskRoomMcpFactory {
    private readonly roomService;
    constructor(roomService: RoomService);
    create(): McpServer;
}
