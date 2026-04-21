import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatePaths } from '../../src/shared/StatePaths.js';

const systemUtilsMocks = vi.hoisted(() => ({
  getRoomServerHealth: vi.fn(),
  isProcessAlive: vi.fn(),
  openBrowserUrl: vi.fn(async () => undefined),
  readPid: vi.fn(),
  spawnDetached: vi.fn(),
  terminateProcess: vi.fn(),
  waitFor: vi.fn(async (checker: () => unknown) => checker()),
  waitForExit: vi.fn(async () => undefined),
}));

vi.mock('../../src/shared/SystemUtils.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/shared/SystemUtils.js')>(
    '../../src/shared/SystemUtils.js',
  );

  return {
    ...actual,
    getRoomServerHealth: systemUtilsMocks.getRoomServerHealth,
    isProcessAlive: systemUtilsMocks.isProcessAlive,
    openBrowserUrl: systemUtilsMocks.openBrowserUrl,
    readPid: systemUtilsMocks.readPid,
    spawnDetached: systemUtilsMocks.spawnDetached,
    terminateProcess: systemUtilsMocks.terminateProcess,
    waitFor: systemUtilsMocks.waitFor,
    waitForExit: systemUtilsMocks.waitForExit,
  };
});

const { DefaultTaskRoomCliRuntime } = await import('../../src/cli/DefaultTaskRoomCliRuntime.js');

describe('DefaultTaskRoomCliRuntime', () => {
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-task-room-runtime-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  it('не пытается стартовать новый сервер, если порт уже занят живым server health без валидного PID', async () => {
    systemUtilsMocks.getRoomServerHealth.mockResolvedValue({
      ok: true,
      service: 'agent-task-room',
    });
    systemUtilsMocks.readPid.mockReturnValue(null);
    systemUtilsMocks.isProcessAlive.mockReturnValue(false);

    const runtime = new DefaultTaskRoomCliRuntime();

    await expect(
      runtime.startServer({
        host: '127.0.0.1',
        port: 8876,
        mcpPath: '/mcp',
        token: 'secret-token',
        cwd: tempDirectory,
        statePaths: new StatePaths(tempDirectory),
      }),
    ).rejects.toThrow(/PID/i);

    expect(systemUtilsMocks.spawnDetached).not.toHaveBeenCalled();
  });

  it('падает, если только что запущенный дочерний сервер умер до готовности', async () => {
    systemUtilsMocks.getRoomServerHealth.mockResolvedValueOnce(null);
    systemUtilsMocks.readPid.mockReturnValue(null);
    systemUtilsMocks.isProcessAlive.mockReturnValue(false);
    systemUtilsMocks.spawnDetached.mockReturnValue(777);

    const runtime = new DefaultTaskRoomCliRuntime();

    await expect(
      runtime.startServer({
        host: '127.0.0.1',
        port: 8876,
        mcpPath: '/mcp',
        token: 'secret-token',
        cwd: tempDirectory,
        statePaths: new StatePaths(tempDirectory),
      }),
    ).rejects.toThrow(/завершился до готовности/i);
  });
});
