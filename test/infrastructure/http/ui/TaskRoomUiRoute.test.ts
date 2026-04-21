import { describe, expect, it } from 'vitest';

import { parseTaskRoomUiRoute } from '../../../../src/infrastructure/http/ui/TaskRoomUiRoute.js';

describe('TaskRoomUiRoute', () => {
  it('разбирает invite-ссылку второго участника', () => {
    const route = parseTaskRoomUiRoute(
      'https://task-room.example/join/room-42?token=secret&participant-id=peer-agent&participant-label=Peer%20Agent&role=peer&prompt=peer',
    );

    expect(route.roomId).toBe('room-42');
    expect(route.inviteMode).toBe(true);
    expect(route.promptMode).toBe('peer');
    expect(route.participant).toEqual({
      participantId: 'peer-agent',
      participantLabel: 'Peer Agent',
      role: 'peer',
    });
  });

  it('разбирает owner-ссылку без invite-режима', () => {
    const route = parseTaskRoomUiRoute(
      'https://task-room.example/rooms/room-42?token=secret&participant-id=host-agent&participant-label=Host%20Agent&role=initiator&prompt=local',
    );

    expect(route.roomId).toBe('room-42');
    expect(route.inviteMode).toBe(false);
    expect(route.promptMode).toBe('local');
    expect(route.participant?.participantId).toBe('host-agent');
  });
});
