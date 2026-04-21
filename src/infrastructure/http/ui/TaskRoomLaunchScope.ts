export interface LaunchPayload {
  roomId?: string;
  publicMcpUrl?: string;
  publicA2AJsonRpcUrl?: string;
  publicA2ARestUrl?: string;
  publicRoomUrl?: string;
  publicPeerInviteUrl?: string;
  commands?: {
    joinPosixCommand?: string;
    joinPowerShellCommand?: string;
  };
  prompts?: {
    localPrompt?: string;
    peerPrompt?: string;
  };
  examples?: {
    watchRoomEnvelope?: string;
    pushEnvelope?: string;
  };
}

export interface LaunchScope {
  roomLink: string;
  peerInviteUrl: string;
  publicMcpUrl: string;
  publicA2AJsonRpcUrl: string;
  publicA2ARestUrl: string;
  joinPosixCommand: string;
  joinPowerShellCommand: string;
  localPrompt: string;
  peerPrompt: string;
  watchRoomEnvelope: string;
  pushEnvelope: string;
}

function buildFallbackRoomLink(origin: string, roomId: string, token: string): string {
  if (!roomId) {
    return '';
  }

  return `${origin}/rooms/${encodeURIComponent(roomId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function resolveLaunchScope(input: {
  launch: LaunchPayload | null;
  roomId: string;
  token: string;
  origin: string;
}): LaunchScope {
  const { launch, roomId, token, origin } = input;
  const isScopedLaunch = Boolean(roomId) && launch?.roomId === roomId;

  if (!isScopedLaunch) {
    return {
      roomLink: buildFallbackRoomLink(origin, roomId, token),
      peerInviteUrl: '',
      publicMcpUrl: '',
      publicA2AJsonRpcUrl: '',
      publicA2ARestUrl: '',
      joinPosixCommand: '',
      joinPowerShellCommand: '',
      localPrompt: '',
      peerPrompt: '',
      watchRoomEnvelope: '',
      pushEnvelope: '',
    };
  }

  return {
    roomLink: launch?.publicRoomUrl || buildFallbackRoomLink(origin, roomId, token),
    peerInviteUrl: launch?.publicPeerInviteUrl || '',
    publicMcpUrl: launch?.publicMcpUrl || '',
    publicA2AJsonRpcUrl: launch?.publicA2AJsonRpcUrl || '',
    publicA2ARestUrl: launch?.publicA2ARestUrl || '',
    joinPosixCommand: launch?.commands?.joinPosixCommand || '',
    joinPowerShellCommand: launch?.commands?.joinPowerShellCommand || '',
    localPrompt: launch?.prompts?.localPrompt || '',
    peerPrompt: launch?.prompts?.peerPrompt || '',
    watchRoomEnvelope: launch?.examples?.watchRoomEnvelope || '',
    pushEnvelope: launch?.examples?.pushEnvelope || '',
  };
}
