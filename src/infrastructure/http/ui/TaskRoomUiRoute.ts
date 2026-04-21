export interface TaskRoomInviteParticipant {
  participantId: string;
  participantLabel: string;
  role: string;
}

export interface TaskRoomUiRoute {
  roomId: string;
  inviteMode: boolean;
  promptMode: 'local' | 'peer';
  participant: TaskRoomInviteParticipant | null;
}

function normalizePromptMode(value: string | null): 'local' | 'peer' {
  return value === 'peer' ? 'peer' : 'local';
}

export function parseTaskRoomUiRoute(href: string): TaskRoomUiRoute {
  const url = new URL(href);
  const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)$/);
  const joinMatch = url.pathname.match(/^\/join\/([^/]+)$/);
  const routeMatch = joinMatch ?? roomMatch;
  const roomId = routeMatch ? decodeURIComponent(routeMatch[1] ?? '') : '';
  const participantId = url.searchParams.get('participant-id')?.trim() ?? '';
  const participantLabel = url.searchParams.get('participant-label')?.trim() ?? '';
  const role = url.searchParams.get('role')?.trim() ?? '';

  return {
    roomId,
    inviteMode: Boolean(joinMatch),
    promptMode: normalizePromptMode(url.searchParams.get('prompt')),
    participant:
      participantId && participantLabel
        ? {
            participantId,
            participantLabel,
            role: role || 'peer',
          }
        : null,
  };
}
