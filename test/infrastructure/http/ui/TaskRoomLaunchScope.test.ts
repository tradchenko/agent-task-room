import { describe, expect, it } from 'vitest';

import { resolveLaunchScope } from '../../../../src/infrastructure/http/ui/TaskRoomLaunchScope.js';

describe('TaskRoomLaunchScope', () => {
  it('не отдаёт join-команду и peer prompt для комнаты, не связанной с текущим launch', () => {
    const scoped = resolveLaunchScope({
      launch: {
        roomId: 'room-started',
        publicRoomUrl: 'https://task-room.example/rooms/room-started?token=secret',
        publicPeerInviteUrl: 'https://task-room.example/join/room-started?token=secret',
        publicMcpUrl: 'https://task-room.example/mcp',
        publicA2AJsonRpcUrl: 'https://task-room.example/a2a/jsonrpc',
        publicA2ARestUrl: 'https://task-room.example/a2a/rest',
        commands: {
          joinPosixCommand: 'agent-task-room join --room-id room-started',
          joinPowerShellCommand: 'agent-task-room join --room-id room-started',
        },
        prompts: {
          localPrompt: 'local prompt',
          peerPrompt: 'peer prompt',
        },
        examples: {
          watchRoomEnvelope: '{"roomId":"room-started"}',
          pushEnvelope: '{"roomId":"room-started"}',
        },
      },
      roomId: 'room-archived',
      token: 'secret',
      origin: 'https://task-room.example',
    });

    expect(scoped.roomLink).toBe('https://task-room.example/rooms/room-archived?token=secret');
    expect(scoped.joinPosixCommand).toBe('');
    expect(scoped.joinPowerShellCommand).toBe('');
    expect(scoped.peerPrompt).toBe('');
    expect(scoped.watchRoomEnvelope).toBe('');
    expect(scoped.publicMcpUrl).toBe('');
    expect(scoped.peerInviteUrl).toBe('');
  });

  it('отдаёт launch-артефакты только для той комнаты, для которой они были созданы', () => {
    const scoped = resolveLaunchScope({
      launch: {
        roomId: 'room-started',
        publicRoomUrl: 'https://task-room.example/rooms/room-started?token=secret',
        publicPeerInviteUrl: 'https://task-room.example/join/room-started?token=secret',
        publicMcpUrl: 'https://task-room.example/mcp',
        publicA2AJsonRpcUrl: 'https://task-room.example/a2a/jsonrpc',
        publicA2ARestUrl: 'https://task-room.example/a2a/rest',
        commands: {
          joinPosixCommand: 'agent-task-room join --room-id room-started',
          joinPowerShellCommand: 'agent-task-room join --room-id room-started',
        },
        prompts: {
          localPrompt: 'local prompt',
          peerPrompt: 'peer prompt',
        },
        examples: {
          watchRoomEnvelope: '{"roomId":"room-started"}',
          pushEnvelope: '{"roomId":"room-started"}',
        },
      },
      roomId: 'room-started',
      token: 'secret',
      origin: 'https://task-room.example',
    });

    expect(scoped.roomLink).toBe('https://task-room.example/rooms/room-started?token=secret');
    expect(scoped.joinPosixCommand).toContain('room-started');
    expect(scoped.peerPrompt).toBe('peer prompt');
    expect(scoped.watchRoomEnvelope).toContain('room-started');
    expect(scoped.publicMcpUrl).toBe('https://task-room.example/mcp');
    expect(scoped.peerInviteUrl).toBe('https://task-room.example/join/room-started?token=secret');
  });
});
