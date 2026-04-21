import type { StartNgrokParams, StartServerParams, StartWatchParams, StartedServer, StartedTunnel, TaskRoomCliRuntime } from './TaskRoomCliRuntime.js';
export declare class DefaultTaskRoomCliRuntime implements TaskRoomCliRuntime {
    resolveNgrokBinary(): string | null;
    startServer(params: StartServerParams): Promise<StartedServer>;
    startNgrok(params: StartNgrokParams): Promise<StartedTunnel>;
    startWatch(params: StartWatchParams): Promise<number>;
    openBrowser(url: string): Promise<void>;
    stopProcess(pid: number, signal?: NodeJS.Signals): Promise<void>;
    private getNgrokPublicUrl;
    private getNgrokPublicUrlFromLog;
    private getAdoptableServerPid;
    private getHealthPid;
    private getHealthStorageFile;
    private normalizeStorageFile;
}
