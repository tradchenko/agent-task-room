export declare const LOCAL_STATE_DIR_NAME = ".agent-task-room";
export declare class StatePaths {
    readonly stateDir: string;
    readonly alertsDir: string;
    readonly promptsDir: string;
    readonly examplesDir: string;
    readonly sessionFile: string;
    readonly launchFile: string;
    readonly shareFile: string;
    readonly alertsTextFile: string;
    readonly alertsJsonFile: string;
    readonly localPromptFile: string;
    readonly peerPromptFile: string;
    readonly a2aWatchExampleFile: string;
    readonly a2aPushExampleFile: string;
    readonly serverPidFile: string;
    readonly serverLogFile: string;
    readonly ngrokPidFile: string;
    readonly ngrokLogFile: string;
    readonly watchPidFile: string;
    readonly watchLogFile: string;
    readonly storageFile: string;
    constructor(cwd: string);
}
