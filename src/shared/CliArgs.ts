export type CliOptions = Record<string, string | boolean | string[]>;

export interface ParsedCliArgs {
  command: string;
  options: CliOptions;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command = 'help', ...rest] = argv;
  const options: CliOptions = {};

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

function pushOption(options: CliOptions, key: string, value: string | boolean): void {
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

export function getStringOption(options: CliOptions, key: string, fallback?: string): string | undefined {
  const value = options[key];

  if (Array.isArray(value)) {
    return value.at(-1);
  }

  if (typeof value === 'string') {
    return value;
  }

  return fallback;
}

export function getBooleanOption(options: CliOptions, key: string, fallback = false): boolean {
  const value = options[key];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value === 'true';
  }

  return fallback;
}

export function getListOption(options: CliOptions, key: string): string[] {
  const value = options[key];

  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [String(value)];
}
