import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskRoomCli } from '../../src/cli/TaskRoomCli.js';
import type { TaskRoomCliRuntime } from '../../src/cli/TaskRoomCliRuntime.js';
import { RoomService } from '../../src/domain/room/RoomService.js';
import { TaskRoomHttpServer } from '../../src/infrastructure/http/TaskRoomHttpServer.js';
import { JsonRoomRepository } from '../../src/infrastructure/persistence/JsonRoomRepository.js';
import { StatePaths } from '../../src/shared/StatePaths.js';

describe('TaskRoomCli integration', () => {
  let tempDirectory: string;
  let hostDirectory: string;
  let peerDirectory: string;
  let server: TaskRoomHttpServer;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-task-room-cli-'));
    hostDirectory = path.join(tempDirectory, 'host');
    peerDirectory = path.join(tempDirectory, 'peer');
    await fs.mkdir(hostDirectory, { recursive: true });
    await fs.mkdir(peerDirectory, { recursive: true });

    const repository = new JsonRoomRepository(path.join(tempDirectory, 'rooms.json'));
    const roomService = new RoomService(repository);
    await roomService.load();

    server = new TaskRoomHttpServer({
      host: '127.0.0.1',
      port: 0,
      mcpPath: '/mcp',
      sharedToken: 'secret-token',
      storageFile: path.join(tempDirectory, 'rooms.json'),
      roomService,
    });

    await server.start();

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    await server.stop();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  it('создаёт локальный state после open и join, а sync пишет alerts', async () => {
    const hostCli = new TaskRoomCli(hostDirectory);
    const peerCli = new TaskRoomCli(peerDirectory);

    await (hostCli as any).commandOpen({
      url: `${server.baseUrl}/mcp`,
      token: 'secret-token',
      title: 'CLI integration',
      task: 'Проверить локальный state и sync',
      'participant-id': 'host-agent',
      'participant-label': 'Host Agent',
      role: 'initiator',
      'no-auto-sync': true,
    });

    const hostStatePaths = new StatePaths(hostDirectory);
    const hostSession = JSON.parse(await fs.readFile(hostStatePaths.sessionFile, 'utf8')) as {
      roomId: string;
      participant: { participantId: string };
    };

    expect(hostSession.roomId).toMatch(/^room-/);
    expect(hostSession.participant.participantId).toBe('host-agent');

    await (peerCli as any).commandJoin({
      url: `${server.baseUrl}/mcp`,
      token: 'secret-token',
      'room-id': hostSession.roomId,
      'participant-id': 'peer-agent',
      'participant-label': 'Peer Agent',
      role: 'peer',
      'no-auto-sync': true,
    });

    await (peerCli as any).commandSync({
      url: `${server.baseUrl}/mcp`,
      token: 'secret-token',
      'room-id': hostSession.roomId,
      'participant-id': 'peer-agent',
      'participant-label': 'Peer Agent',
      role: 'peer',
    });

    const peerStatePaths = new StatePaths(peerDirectory);
    const peerSession = JSON.parse(await fs.readFile(peerStatePaths.sessionFile, 'utf8')) as {
      roomId: string;
      sync: { lastStatus: string };
    };
    const peerAlerts = await fs.readFile(peerStatePaths.alertsTextFile, 'utf8');

    expect(peerSession.roomId).toBe(hostSession.roomId);
    expect(peerSession.sync.lastStatus).toBe('ACTIVE_DISCUSSION');
    expect(peerAlerts).toContain('Что делать дальше');
    expect(peerAlerts).toContain('Опубликуйте ваш локальный контекст');
  });

  it('в режиме подменённого runtime умеет выполнить start и затем stop без реального ngrok', async () => {
    const fakeRuntime: TaskRoomCliRuntime = {
      resolveNgrokBinary: () => '/fake/ngrok',
      startServer: async ({ mcpPath }) => {
        return {
          pid: 111,
          baseUrl: server.baseUrl,
          mcpUrl: `${server.baseUrl}${mcpPath}`,
        };
      },
      startNgrok: async () => {
        return {
          pid: 222,
          publicUrl: server.baseUrl,
        };
      },
      startWatch: async () => {
        return 333;
      },
      openBrowser: async () => {
        return;
      },
      stopProcess: async () => {
        return;
      },
    };

    const cli = new TaskRoomCli(hostDirectory, fakeRuntime);

    await cli.run('start', {
      title: 'Fake runtime start',
      task: 'Проверить start/stop без реального ngrok',
      token: 'secret-token',
    });

    const statePaths = new StatePaths(hostDirectory);
    const launch = JSON.parse(await fs.readFile(statePaths.launchFile, 'utf8')) as {
      publicUiUrl: string;
      publicRoomUrl: string;
      publicA2AJsonRpcUrl: string;
      publicA2ARestUrl: string;
      examples: {
        watchRoomEnvelope: string;
        pushEnvelope: string;
      };
      pids: { server: number; ngrok: number; watch: number };
    };
    const shareText = await fs.readFile(statePaths.shareFile, 'utf8');
    const watchExample = await fs.readFile(statePaths.a2aWatchExampleFile, 'utf8');
    const pushExample = await fs.readFile(statePaths.a2aPushExampleFile, 'utf8');

    expect(launch.publicUiUrl).toBe(server.baseUrl);
    expect(launch.publicRoomUrl).toContain('/rooms/');
    expect(launch.publicA2AJsonRpcUrl).toBe(`${server.baseUrl}/a2a/jsonrpc`);
    expect(launch.publicA2ARestUrl).toBe(`${server.baseUrl}/a2a/rest`);
    expect(launch.examples.watchRoomEnvelope).toContain('"command": "watch_room"');
    expect(launch.examples.pushEnvelope).toContain('"pushNotificationConfig"');
    expect(shareText).toContain('A2A JSON-RPC URL');
    expect(shareText).toContain(`${server.baseUrl}/a2a/jsonrpc`);
    expect(shareText).toContain('watch_room');
    expect(shareText).toContain('pushNotificationConfig');
    expect(watchExample).toContain('"watch_room"');
    expect(pushExample).toContain('"pushNotificationConfig"');
    expect(launch.pids).toEqual({
      server: 111,
      ngrok: 222,
      watch: 333,
    });

    await cli.run('stop', {});

    await expect(fs.access(statePaths.serverPidFile)).rejects.toBeDefined();
    await expect(fs.access(statePaths.ngrokPidFile)).rejects.toBeDefined();
    await expect(fs.access(statePaths.watchPidFile)).rejects.toBeDefined();
  });

  it('в режиме start-local не требует ngrok и печатает invite-ссылку для второго участника', async () => {
    const openBrowser = vi.fn(async () => undefined);
    const fakeRuntime: TaskRoomCliRuntime = {
      resolveNgrokBinary: () => {
        throw new Error('start-local не должен запрашивать ngrok binary');
      },
      startServer: async ({ mcpPath }) => {
        return {
          pid: 444,
          baseUrl: server.baseUrl,
          mcpUrl: `${server.baseUrl}${mcpPath}`,
        };
      },
      startNgrok: async () => {
        throw new Error('start-local не должен поднимать ngrok');
      },
      startWatch: async () => {
        return 555;
      },
      openBrowser,
      stopProcess: async () => {
        return;
      },
    };

    const cli = new TaskRoomCli(hostDirectory, fakeRuntime);

    await cli.run('start-local', {
      title: 'Local runtime start',
      task: 'Проверить локальный сценарий по ссылке',
      token: 'secret-token',
    });

    const statePaths = new StatePaths(hostDirectory);
    const launch = JSON.parse(await fs.readFile(statePaths.launchFile, 'utf8')) as {
      publicUiUrl: string;
      publicRoomUrl: string;
      publicPeerInviteUrl: string;
      publicMcpUrl: string;
      pids: { server: number; ngrok: number; watch: number };
    };
    const shareText = await fs.readFile(statePaths.shareFile, 'utf8');

    expect(launch.publicUiUrl).toBe(server.baseUrl);
    expect(launch.publicMcpUrl).toBe(`${server.baseUrl}/mcp`);
    expect(launch.publicRoomUrl).toContain('/rooms/');
    expect(launch.publicPeerInviteUrl).toContain('/join/');
    expect(launch.publicPeerInviteUrl).toContain('participant-id=peer-agent');
    expect(launch.pids).toEqual({
      server: 444,
      ngrok: 0,
      watch: 555,
    });
    expect(shareText).toContain('Ссылка владельцу');
    expect(shareText).toContain('Ссылка второму участнику');
    expect(shareText).toContain('/join/');
    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(openBrowser.mock.calls[0]?.[0]).toContain('/rooms/');
  });

  it('команда session работает как упрощённый локальный запуск', async () => {
    const openBrowser = vi.fn(async () => undefined);
    const fakeRuntime: TaskRoomCliRuntime = {
      resolveNgrokBinary: () => {
        throw new Error('session не должен запрашивать ngrok binary');
      },
      startServer: async ({ mcpPath }) => {
        return {
          pid: 666,
          baseUrl: server.baseUrl,
          mcpUrl: `${server.baseUrl}${mcpPath}`,
        };
      },
      startNgrok: async () => {
        throw new Error('session не должен поднимать ngrok');
      },
      startWatch: async () => 777,
      openBrowser,
      stopProcess: async () => {
        return;
      },
    };

    const cli = new TaskRoomCli(hostDirectory, fakeRuntime);

    await cli.run('session', {
      title: 'Session shortcut',
      task: 'Проверить одну простую команду',
      token: 'secret-token',
    });

    const statePaths = new StatePaths(hostDirectory);
    const launch = JSON.parse(await fs.readFile(statePaths.launchFile, 'utf8')) as {
      publicRoomUrl: string;
      publicPeerInviteUrl: string;
      pids: { ngrok: number; watch: number };
    };

    expect(launch.publicRoomUrl).toContain('/rooms/');
    expect(launch.publicPeerInviteUrl).toContain('/join/');
    expect(launch.pids.ngrok).toBe(0);
    expect(launch.pids.watch).toBe(777);
    expect(openBrowser).toHaveBeenCalledWith(launch.publicRoomUrl);
  });

  it('публикует artifact и decision через CLI и сохраняет их в комнате', async () => {
    const hostCli = new TaskRoomCli(hostDirectory);

    await (hostCli as any).commandOpen({
      url: `${server.baseUrl}/mcp`,
      token: 'secret-token',
      title: 'CLI artifact flow',
      task: 'Проверить новые команды CLI',
      'participant-id': 'host-agent',
      'participant-label': 'Host Agent',
      role: 'initiator',
      'no-auto-sync': true,
    });

    await hostCli.run('artifact', {
      kind: 'github_issue',
      title: 'Issue с деталями проблемы',
      uri: 'https://github.com/example/repo/issues/42',
      summary: 'Нужно отдельно сверить влияние на два проекта.',
      tag: ['github', 'bug'],
      ref: ['ISSUE-42'],
    });

    await hostCli.run('decision', {
      title: 'Сначала синхронизировать контракт',
      summary: 'Без этого дальнейший аудит снова разойдётся по разным предпосылкам.',
      rationale: 'Это базовое условие для совместной верификации.',
      status: 'accepted',
      ref: ['DECISION-42'],
    });

    const statePaths = new StatePaths(hostDirectory);
    const session = JSON.parse(await fs.readFile(statePaths.sessionFile, 'utf8')) as {
      roomId: string;
    };
    const roomResponse = await fetch(`${server.baseUrl}/api/rooms/${session.roomId}`, {
      headers: {
        authorization: 'Bearer secret-token',
      },
    });
    const payload = (await roomResponse.json()) as {
      room: {
        artifacts: Array<{ kind: string; title: string; tags: string[] }>;
        decisionLog: Array<{ title: string; status: string }>;
      };
    };

    expect(payload.room.artifacts.some((artifact) => artifact.kind === 'github_issue')).toBe(true);
    expect(payload.room.artifacts.some((artifact) => artifact.tags.includes('bug'))).toBe(true);
    expect(payload.room.decisionLog.some((decision) => decision.status === 'accepted')).toBe(true);
  });

  it('умеет выводить search и history через CLI', async () => {
    const hostCli = new TaskRoomCli(hostDirectory);

    await (hostCli as any).commandOpen({
      url: `${server.baseUrl}/mcp`,
      token: 'secret-token',
      title: 'CLI search flow',
      task: 'Проверить search/history команды',
      'participant-id': 'host-agent',
      'participant-label': 'Host Agent',
      role: 'initiator',
      'no-auto-sync': true,
    });

    await hostCli.run('message', {
      kind: 'finding',
      body: 'Нужно синхронизировать feature flag rollout.',
    });

    await hostCli.run('decision', {
      title: 'Сначала перепроверить rollout',
      summary: 'Только после этого можно подтверждать решение.',
      status: 'proposed',
    });

    stdoutSpy.mockClear();

    await hostCli.run('search', {
      query: 'feature flag',
      limit: '10',
    });

    const searchOutput = stdoutSpy.mock.calls.flat().join('');

    expect(searchOutput).toContain('Найденные комнаты');
    expect(searchOutput).toContain('feature flag');

    stdoutSpy.mockClear();

    await hostCli.run('history', {
      limit: '10',
    });

    const historyOutput = stdoutSpy.mock.calls.flat().join('');

    expect(historyOutput).toContain('История комнаты');
    expect(historyOutput).toContain('decision');
  });

  it('показывает понятную ошибку, если join вызывается для несуществующей комнаты', async () => {
    const peerCli = new TaskRoomCli(peerDirectory);

    await expect(
      peerCli.run('join', {
        url: `${server.baseUrl}/mcp`,
        token: 'secret-token',
        'room-id': 'room-missing',
        'participant-id': 'peer-agent',
        'participant-label': 'Peer Agent',
        role: 'peer',
        'no-auto-sync': true,
      }),
    ).rejects.toThrow('Комната room-missing не найдена.');
  });
});
