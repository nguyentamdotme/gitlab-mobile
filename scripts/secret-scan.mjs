import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const roots = ['apps', 'packages', 'scripts'];
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /glpat-[A-Za-z0-9_-]{20,}/, /AKIA[0-9A-Z]{16}/];
let failed = false;
async function visit(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'ios', 'android', 'coverage', 'backups'].includes(file.name)) continue;
    const path = join(directory, file.name);
    if (file.isDirectory()) await visit(path);
    else if (/\.(ts|tsx|js|mjs|json|sql|yaml)$/.test(path)) {
      const contents = await readFile(path, 'utf8'); if (patterns.some(pattern => pattern.test(contents))) { process.stderr.write(`Potential secret detected: ${path} (value suppressed)\n`); failed = true; }
    }
  }
}
for (const root of roots) await visit(root);
if (failed) process.exitCode = 1; else process.stdout.write('Secret pattern scan passed; manual config review remains required.\n');
