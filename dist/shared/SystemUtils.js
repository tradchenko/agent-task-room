import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
export function ensureDir(directoryPath) {
    fs.mkdirSync(directoryPath, { recursive: true });
}
export function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
export function readTextIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return fs.readFileSync(filePath, 'utf8');
}
export function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
export function writeText(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, payload, 'utf8');
}
export function readPid(filePath) {
    const pid = Number(readTextIfExists(filePath)?.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
}
export function isProcessAlive(pid) {
    if (!pid) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export function terminateProcess(pid, signal = 'SIGTERM') {
    if (!pid || !isProcessAlive(pid)) {
        return false;
    }
    try {
        process.kill(pid, signal);
        return true;
    }
    catch {
        return false;
    }
}
export function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
export async function waitFor(checker, options) {
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
export async function waitForExit(pid, timeoutMs = 5000) {
    await waitFor(() => (!isProcessAlive(pid) ? true : null), {
        timeoutMs,
        intervalMs: 100,
        label: `завершение процесса ${pid}`,
    });
}
export function spawnDetached(command, args, logFile, env, cwd) {
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
export async function openBrowserUrl(url) {
    const command = process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open';
    const args = process.platform === 'win32'
        ? ['/c', 'start', '', url]
        : [url];
    await new Promise((resolve, reject) => {
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
export function shellEscape(value) {
    return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}
export function powerShellEscape(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}
export async function fetchJson(url, init) {
    const response = await fetch(url, init);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} для ${url}`);
    }
    return (await response.json());
}
export async function getRoomServerHealth(baseUrl) {
    try {
        const payload = await fetchJson(`${baseUrl}/health`);
        return payload.service === 'agent-task-room' ? payload : null;
    }
    catch {
        return null;
    }
}
export function resolveNgrokBinary(explicitBinary = process.env.AGENT_TASK_ROOM_NGROK_BIN) {
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
    }
    catch {
        return null;
    }
}
export function buildNgrokInstallHelp() {
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
export function formatTimestamp() {
    return new Date().toISOString();
}
//# sourceMappingURL=SystemUtils.js.map