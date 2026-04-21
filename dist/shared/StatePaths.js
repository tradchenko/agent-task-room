import path from 'node:path';
export const LOCAL_STATE_DIR_NAME = '.agent-task-room';
export class StatePaths {
    stateDir;
    alertsDir;
    promptsDir;
    examplesDir;
    sessionFile;
    launchFile;
    shareFile;
    alertsTextFile;
    alertsJsonFile;
    localPromptFile;
    peerPromptFile;
    a2aWatchExampleFile;
    a2aPushExampleFile;
    serverPidFile;
    serverLogFile;
    ngrokPidFile;
    ngrokLogFile;
    watchPidFile;
    watchLogFile;
    storageFile;
    constructor(cwd) {
        this.stateDir = path.join(cwd, LOCAL_STATE_DIR_NAME);
        this.alertsDir = path.join(this.stateDir, 'alerts');
        this.promptsDir = path.join(this.stateDir, 'prompts');
        this.examplesDir = path.join(this.stateDir, 'examples');
        this.sessionFile = path.join(this.stateDir, 'session.json');
        this.launchFile = path.join(this.stateDir, 'launch.json');
        this.shareFile = path.join(this.stateDir, 'share.txt');
        this.alertsTextFile = path.join(this.alertsDir, 'latest.txt');
        this.alertsJsonFile = path.join(this.alertsDir, 'latest.json');
        this.localPromptFile = path.join(this.promptsDir, 'local-agent.txt');
        this.peerPromptFile = path.join(this.promptsDir, 'peer-agent.txt');
        this.a2aWatchExampleFile = path.join(this.examplesDir, 'a2a-watch.json');
        this.a2aPushExampleFile = path.join(this.examplesDir, 'a2a-push.json');
        this.serverPidFile = path.join(this.stateDir, 'server.pid');
        this.serverLogFile = path.join(this.stateDir, 'server.log');
        this.ngrokPidFile = path.join(this.stateDir, 'ngrok.pid');
        this.ngrokLogFile = path.join(this.stateDir, 'ngrok.log');
        this.watchPidFile = path.join(this.stateDir, 'watch.pid');
        this.watchLogFile = path.join(this.stateDir, 'watch.log');
        this.storageFile = path.join(this.stateDir, 'rooms.sqlite');
    }
}
//# sourceMappingURL=StatePaths.js.map