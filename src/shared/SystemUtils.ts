import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function ensureDir(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}

export function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function readTextIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
}

export function writeJson(filePath: string, payload: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function writeText(filePath: string, payload: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, payload, 'utf8');
}

export function readPid(filePath: string): number | null {
  const pid = Number(readTextIfExists(filePath)?.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export function isProcessAlive(pid: number | null): boolean {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function terminateProcess(pid: number | null, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  if (!pid || !isProcessAlive(pid)) {
    return false;
  }

  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitFor<T>(
  checker: () => Promise<T | null | undefined> | T | null | undefined,
  options: { timeoutMs?: number; intervalMs?: number; label: string },
): Promise<T> {
  const { timeoutMs = 20000, intervalMs = 250, label } = options;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await checker();

    if (result) {
      return result;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Не удалось дождаться: ${label}.`);
}

export async function waitForExit(pid: number, timeoutMs = 5000): Promise<void> {
  await waitFor(() => (!isProcessAlive(pid) ? true : null), {
    timeoutMs,
    intervalMs: 100,
    label: `завершение процесса ${pid}`,
  });
}

export function spawnDetached(
  command: string,
  args: string[],
  logFile: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
): number {
  ensureDir(path.dirname(logFile));
  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  child.unref();
  fs.closeSync(logFd);

  return child.pid ?? 0;
}

export async function openBrowserUrl(url: string): Promise<void> {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args =
    process.platform === 'win32'
      ? ['/c', 'start', '', url]
      : [url];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export function shellEscape(value: string): string {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

export function powerShellEscape(value: string): string {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} для ${url}`);
  }

  return (await response.json()) as T;
}

export async function getRoomServerHealth(baseUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const payload = await fetchJson<Record<string, unknown>>(`${baseUrl}/health`);
    return payload.service === 'agent-task-room' ? payload : null;
  } catch {
    return null;
  }
}

export function resolveNgrokBinary(explicitBinary = process.env.AGENT_TASK_ROOM_NGROK_BIN): string | null {
  if (explicitBinary) {
    return explicitBinary;
  }

  const binaryResolver = process.platform === 'win32' ? 'where' : 'which';

  try {
    const output = execFileSync(binaryResolver, ['ngrok'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split(/\r?\n/)
      .find(Boolean);

    return output ?? null;
  } catch {
    return null;
  }
}

export function buildNgrokInstallHelp(): string {
  if (process.platform === 'darwin') {
    return [
      'Для публичного туннеля нужен ngrok.',
      'Установка на macOS:',
      '1. brew install ngrok/ngrok/ngrok',
      '2. ngrok config add-authtoken <YOUR_TOKEN>',
      '3. Повторите команду start.',
    ].join('\n');
  }

  if (process.platform === 'win32') {
    return [
      'Для публичного туннеля нужен ngrok.',
      'Установка на Windows:',
      '1. winget install --id Ngrok.Ngrok',
      '2. ngrok config add-authtoken <YOUR_TOKEN>',
      '3. Повторите команду start.',
    ].join('\n');
  }

  return [
    'Для публичного туннеля нужен ngrok.',
    'Установка на Linux:',
    '1. Скачайте ngrok с https://ngrok.com/download',
    '2. Распакуйте бинарник и добавьте его в PATH',
    '3. ngrok config add-authtoken <YOUR_TOKEN>',
    '4. Повторите команду start.',
  ].join('\n');
}

export function formatTimestamp(): string {
  return new Date().toISOString();
}
