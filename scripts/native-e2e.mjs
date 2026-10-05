import { spawn } from 'node:child_process';
const device = process.env.MAESTRO_DEVICE;
if (!device) { process.stderr.write('Native E2E NOT RUN: build the native app and set MAESTRO_DEVICE; run on macOS for iPhone.\n'); process.exit(2); }
const child = spawn('maestro', ['--device', device, 'test', 'tests/e2e/connect.yaml'], { stdio: 'inherit' });
child.once('error', () => { process.stderr.write('Maestro unavailable. Native E2E did not run.\n'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
