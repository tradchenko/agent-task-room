import type { AgentExecutor, ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import type { RoomService } from '../../domain/room/RoomService.js';
export declare class TaskRoomA2AExecutor implements AgentExecutor {
    private readonly roomService;
    private readonly activeWatchTasks;
    constructor(roomService: RoomService);
    cancelTask: (taskId: string) => Promise<void>;
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private executeCommand;
    private executeWatchRoom;
    private queueWatchFlush;
    private flushWatchTask;
    private finishWatchTask;
    private buildWatchTask;
    private buildDirectCommandTask;
    private buildWatchArtifactUpdate;
    private buildWatchStatusUpdate;
    private extractCommand;
    private extractRawEnvelope;
    private buildAgentMessage;
}
