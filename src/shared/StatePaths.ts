import path from 'node:path';

export const LOCAL_STATE_DIR_NAME = '.agent-task-room';

export class StatePaths {
  public readonly stateDir: string;
  public readonly alertsDir: string;
  public readonly promptsDir: string;
  public readonly examplesDir: string;
  public readonly sessionFile: string;
  public readonly launchFile: string;
  public readonly shareFile: string;
  public readonly alertsTextFile: string;
  public readonly alertsJsonFile: string;
  public readonly localPromptFile: string;
  public readonly peerPromptFile: string;
  public readonly a2aWatchExampleFile: string;
  public readonly a2aPushExampleFile: string;
  public readonly serverPidFile: string;
  public readonly serverLogFile: string;
  public readonly ngrokPidFile: string;
  public readonly ngrokLogFile: string;
  public readonly watchPidFile: string;
  public readonly watchLogFile: string;
  public readonly storageFile: string;

  public constructor(cwd: string) {
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
