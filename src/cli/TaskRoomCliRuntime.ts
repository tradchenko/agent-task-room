import type { StatePaths } from '../shared/StatePaths.js';

export interface StartServerParams {
  host: string;
  port: number;
  mcpPath: string;
  token: string;
  cwd: string;
  statePaths: StatePaths;
}

export interface StartNgrokParams {
  binary: string;
  localPort: number;
  cwd: string;
  statePaths: StatePaths;
}

export interface StartWatchParams {
  intervalSeconds: number;
  cwd: string;
  statePaths: StatePaths;
}

export interface StartedServer {
  pid: number;
  baseUrl: string;
  mcpUrl: string;
}

export interface StartedTunnel {
  pid: number;
  publicUrl: string;
}

export interface TaskRoomCliRuntime {
  resolveNgrokBinary(): string | null;
  startServer(params: StartServerParams): Promise<StartedServer>;
  startNgrok(params: StartNgrokParams): Promise<StartedTunnel>;
  startWatch(params: StartWatchParams): Promise<number>;
  openBrowser(url: string): Promise<void>;
  stopProcess(pid: number, signal?: NodeJS.Signals): Promise<void>;
}
