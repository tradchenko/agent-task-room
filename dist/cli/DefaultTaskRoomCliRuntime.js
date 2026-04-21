import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fetchJson, getRoomServerHealth, isProcessAlive, openBrowserUrl, readPid, resolveNgrokBinary, spawnDetached, terminateProcess, waitFor, waitForExit, writeText, } from '../shared/SystemUtils.js';
const RUNTIME_FILE = fileURLToPath(import.meta.url);
const SERVER_FILE = path.resolve(path.dirname(RUNTIME_FILE), '../server/index.js');
const CLI_FILE = path.resolve(path.dirname(RUNTIME_FILE), '../bin/agent-task-room.js');
export class DefaultTaskRoomCliRuntime {
    resolveNgrokBinary() {
        return resolveNgrokBinary();
    }
    async startServer(params) {
        const localBaseUrl = `http://${params.host}:${params.port}`;
        const existingHealth = await getRoomServerHealth(localBaseUrl);
        const existingPid = readPid(params.statePaths.serverPidFile);
        const existingPidAlive = isProcessAlive(existingPid);
        if (existingHealth && existingPidAlive && existingPid) {
            return {
                pid: existingPid,
                baseUrl: localBaseUrl,
                mcpUrl: `${localBaseUrl}${params.mcpPath}`,
            };
        }
        if (existingHealth) {
            const adoptedPid = this.getAdoptableServerPid(existingHealth, params.statePaths.storageFile);
            if (adoptedPid) {
                return {
                    pid: adoptedPid,
                    baseUrl: localBaseUrl,
                    mcpUrl: `${localBaseUrl}${params.mcpPath}`,
                };
            }
            const conflictingStorage = this.getHealthStorageFile(existingHealth);
            const conflictingPid = this.getHealthPid(existingHealth);
            throw new Error('На этом адресе уже отвечает agent-task-room, но локальный PID-файл отсутствует или устарел. ' +
                `Конфликтующий сервер: pid=${conflictingPid ?? 'unknown'}, storage=${conflictingStorage ?? 'unknown'}. ` +
                'Остановите конфликтующий сервер вручную и повторите start.');
        }
        const serverPid = spawnDetached(process.execPath, [SERVER_FILE], params.statePaths.serverLogFile, {
            ...process.env,
            AGENT_TASK_ROOM_HOST: params.host,
            AGENT_TASK_ROOM_PORT: String(params.port),
            AGENT_TASK_ROOM_MCP_PATH: params.mcpPath,
            AGENT_TASK_ROOM_TOKEN: params.token,
            AGENT_TASK_ROOM_STORAGE_FILE: params.statePaths.storageFile,
        }, params.cwd);
        await waitFor(async () => {
            if (!isProcessAlive(serverPid)) {
                throw new Error('Запущенный agent-task-room сервер завершился до готовности.');
            }
            return getRoomServerHealth(localBaseUrl);
        }, {
            timeoutMs: 20000,
            intervalMs: 250,
            label: 'запуск agent-task-room сервера',
        });
        return {
            pid: serverPid,
            baseUrl: localBaseUrl,
            mcpUrl: `${localBaseUrl}${params.mcpPath}`,
        };
    }
    async startNgrok(params) {
        const apiUrl = 'http://127.0.0.1:4040/api/tunnels';
        const existingPid = readPid(params.statePaths.ngrokPidFile);
        const existingUrl = await this.getNgrokPublicUrl(apiUrl, params.localPort);
        if (existingPid && existingUrl) {
            return {
                pid: existingPid,
                publicUrl: existingUrl,
            };
        }
        if (existingPid && !existingUrl) {
            await this.stopProcess(existingPid, 'SIGTERM');
        }
        writeText(params.statePaths.ngrokLogFile, '');
        const ngrokPid = spawnDetached(params.binary, ['http', String(params.localPort), '--log', 'stdout', '--log-format', 'json'], params.statePaths.ngrokLogFile, process.env, params.cwd);
        const publicUrl = await waitFor(async () => {
            const apiResult = await this.getNgrokPublicUrl(apiUrl, params.localPort);
            return apiResult ?? this.getNgrokPublicUrlFromLog(params.statePaths.ngrokLogFile, params.localPort);
        }, {
            timeoutMs: 20000,
            intervalMs: 500,
            label: 'публичный URL ngrok',
        });
        await waitFor(() => getRoomServerHealth(publicUrl), {
            timeoutMs: 20000,
            intervalMs: 500,
            label: 'публичный /health через ngrok',
        });
        return {
            pid: ngrokPid,
            publicUrl,
        };
    }
    async startWatch(params) {
        const existingWatchPid = readPid(params.statePaths.watchPidFile);
        if (existingWatchPid) {
            await this.stopProcess(existingWatchPid, 'SIGTERM');
        }
        return spawnDetached(process.execPath, [CLI_FILE, 'watch', '--interval', String(params.intervalSeconds)], params.statePaths.watchLogFile, process.env, params.cwd);
    }
    async openBrowser(url) {
        await openBrowserUrl(url);
    }
    async stopProcess(pid, signal = 'SIGTERM') {
        terminateProcess(pid, signal);
        try {
            await waitForExit(pid, signal === 'SIGTERM' ? 3000 : 5000);
        }
        catch {
            if (signal !== 'SIGKILL') {
                terminateProcess(pid, 'SIGKILL');
                await waitForExit(pid, 3000).catch(() => null);
            }
        }
    }
    async getNgrokPublicUrl(apiUrl, localPort) {
        try {
            const payload = await fetchJson(apiUrl);
            const tunnels = Array.isArray(payload.tunnels) ? payload.tunnels : [];
            const matched = tunnels.find((tunnel) => {
                const publicUrl = String(tunnel.public_url ?? '');
                const address = String(tunnel.config?.addr ?? '');
                return publicUrl.startsWith('https://') && address.includes(`:${localPort}`);
            });
            return matched?.public_url ?? null;
        }
        catch {
            return null;
        }
    }
    getNgrokPublicUrlFromLog(logFile, localPort) {
        if (!fs.existsSync(logFile)) {
            return null;
        }
        const lines = fs
            .readFileSync(logFile, 'utf8')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            try {
                const entry = JSON.parse(lines[index] ?? '{}');
                if (entry.msg === 'started tunnel' && String(entry.addr ?? '').includes(`:${localPort}`) && String(entry.url ?? '').startsWith('https://')) {
                    return String(entry.url);
                }
            }
            catch {
                continue;
            }
        }
        return null;
    }
    getAdoptableServerPid(health, expectedStorageFile) {
        const healthPid = this.getHealthPid(health);
        const healthStorageFile = this.getHealthStorageFile(health);
        if (!healthPid || !healthStorageFile) {
            return null;
        }
        if (!isProcessAlive(healthPid)) {
            return null;
        }
        if (this.normalizeStorageFile(healthStorageFile) !== this.normalizeStorageFile(expectedStorageFile)) {
            return null;
        }
        return healthPid;
    }
    getHealthPid(health) {
        const pid = Number(health.serverPid);
        return Number.isInteger(pid) && pid > 0 ? pid : null;
    }
    getHealthStorageFile(health) {
        const storage = health.storage;
        if (!storage || typeof storage !== 'object') {
            return null;
        }
        const file = storage.file;
        return typeof file === 'string' && file.length > 0 ? file : null;
    }
    normalizeStorageFile(filePath) {
        const resolved = path.resolve(filePath);
        const missingSegments = [];
        let existingPath = resolved;
        while (!fs.existsSync(existingPath)) {
            const parentPath = path.dirname(existingPath);
            if (parentPath === existingPath) {
                return resolved;
            }
            missingSegments.unshift(path.basename(existingPath));
            existingPath = parentPath;
        }
        try {
            const realExistingPath = fs.realpathSync.native(existingPath);
            return path.join(realExistingPath, ...missingSegments);
        }
        catch {
            return resolved;
        }
    }
}
//# sourceMappingURL=DefaultTaskRoomCliRuntime.js.map