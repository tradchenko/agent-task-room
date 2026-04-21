export type CliOptions = Record<string, string | boolean | string[]>;
export interface ParsedCliArgs {
    command: string;
    options: CliOptions;
}
export declare function parseCliArgs(argv: string[]): ParsedCliArgs;
export declare function getStringOption(options: CliOptions, key: string, fallback?: string): string | undefined;
export declare function getBooleanOption(options: CliOptions, key: string, fallback?: boolean): boolean;
export declare function getListOption(options: CliOptions, key: string): string[];
