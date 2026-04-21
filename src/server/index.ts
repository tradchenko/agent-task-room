import process from 'node:process';

import { RoomService } from '../domain/room/RoomService.js';
import { TaskRoomHttpServer } from '../infrastructure/http/TaskRoomHttpServer.js';
import { createRoomRepository, type StorageBackend } from '../infrastructure/persistence/RoomRepositoryFactory.js';

async function main(): Promise<void> {
  const host = process.env.AGENT_TASK_ROOM_HOST ?? '127.0.0.1';
  const port = Number(process.env.AGENT_TASK_ROOM_PORT ?? '8876');
  const mcpPath = process.env.AGENT_TASK_ROOM_MCP_PATH ?? '/mcp';
  const sharedToken = process.env.AGENT_TASK_ROOM_TOKEN ?? '';
  const storageFile = process.env.AGENT_TASK_ROOM_STORAGE_FILE ?? '.agent-task-room/rooms.sqlite';
  const storageBackend = (process.env.AGENT_TASK_ROOM_STORAGE_BACKEND as StorageBackend | undefined) ?? undefined;
  const { repository, storageMode } = await createRoomRepository({
    storageFile,
    backend: storageBackend,
  });
  const roomService = new RoomService(repository);
  const restored = await roomService.load();
  const server = new TaskRoomHttpServer({
    host,
    port,
    mcpPath,
    sharedToken,
    storageFile,
    storageMode,
    roomService,
  });

  await server.start();

  if (restored > 0) {
    process.stdout.write(`agent-task-room восстановил ${restored} комнат.\n`);
  }

  process.stdout.write(`agent-task-room слушает ${server.baseUrl}${mcpPath}\n`);
  process.stdout.write(`A2A JSON-RPC: ${server.baseUrl}/a2a/jsonrpc\n`);
  process.stdout.write(`A2A REST: ${server.baseUrl}/a2a/rest\n`);
  process.stdout.write(`Agent Card: ${server.baseUrl}/.well-known/agent-card.json\n`);

  if (sharedToken) {
    process.stdout.write('Защита: Bearer token включён.\n');
  } else {
    process.stdout.write('Защита: токен не задан, сервер открыт для всех, кто знает URL.\n');
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void server.stop().finally(() => {
        process.exit(0);
      });
    });
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
