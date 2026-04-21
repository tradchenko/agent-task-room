export function parseCliArgs(argv) {
    const [command = 'help', ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token?.startsWith('--')) {
            continue;
        }
        const key = token.slice(2);
        const next = rest[index + 1];
        if (next === undefined || next.startsWith('--')) {
            pushOption(options, key, true);
            continue;
        }
        pushOption(options, key, next);
        index += 1;
    }
    return { command, options };
}
function pushOption(options, key, value) {
    const current = options[key];
    if (current === undefined) {
        options[key] = value;
        return;
    }
    if (Array.isArray(current)) {
        current.push(String(value));
        return;
    }
    options[key] = [String(current), String(value)];
}
export function getStringOption(options, key, fallback) {
    const value = options[key];
    if (Array.isArray(value)) {
        return value.at(-1);
    }
    if (typeof value === 'string') {
        return value;
    }
    return fallback;
}
export function getBooleanOption(options, key, fallback = false) {
    const value = options[key];
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return value === 'true';
    }
    return fallback;
}
export function getListOption(options, key) {
    const value = options[key];
    if (value === undefined) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.map(String);
    }
    return [String(value)];
}
//# sourceMappingURL=CliArgs.js.map