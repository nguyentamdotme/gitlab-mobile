const instance = process.env.GITLAB_SANDBOX_URL;
const allowlist = (process.env.GITLAB_READ_ALLOWLIST || '').split(',');
const token = process.env.GITLAB_SANDBOX_TOKEN;
if (!instance || !token || !allowlist.includes(instance)) {
  process.stderr.write('Live read contracts NOT RUN: set an explicit allowlisted sandbox and token in secure environment.\n'); process.exit(2);
}
const url = new URL(instance);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid sandbox URL');
for (const path of ['/user', '/projects?membership=true&per_page=1', '/metadata']) {
  const response = await fetch(instance.replace(/\/$/, '') + '/api/v4' + path, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) { await response.body?.cancel(); process.stderr.write(`Read contract ${path.split('?')[0]} failed: HTTP ${response.status}\n`); process.exit(1); }
  const data = await response.json();
  if (path === '/user' && !(Number.isSafeInteger(data.id) && data.id > 0)) throw new Error('Invalid user contract');
  if (path.startsWith('/projects') && !Array.isArray(data)) throw new Error('Invalid project contract');
  if (path === '/metadata') process.stdout.write(`GitLab version: ${String(data.version)}\n`);
  process.stdout.write(`PASS GET ${path.split('?')[0]}\n`);
}
