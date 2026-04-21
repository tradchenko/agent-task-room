#!/usr/bin/env node
import process from 'node:process';
import { parseCliArgs } from '../shared/CliArgs.js';
import { TaskRoomCli } from '../cli/TaskRoomCli.js';
async function main() {
    const { command, options } = parseCliArgs(process.argv.slice(2));
    const cli = new TaskRoomCli(process.cwd());
    await cli.run(command, options);
}
try {
    await main();
}
catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
}
//# sourceMappingURL=agent-task-room.js.map