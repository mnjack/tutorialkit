import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Runs after `astro build`. It checks the routes TutorialKit actually built, so the
// welcome page and its bundled manifest can't drift apart through TutorialKit's slug rule.
const app = fileURLToPath(new URL('..', import.meta.url));
const dist = `${app}dist`;
const problems = [];

const welcome = JSON.parse(await readFile(`${app}public/forge-manifest.json`, 'utf8'));
for (const route of Object.keys(welcome.lessons || {})) {
  if (!existsSync(`${dist}${route.replace(/\/$/, '')}/index.html`)) problems.push(`${route} has no built page`);
}

const files = (await readdir(dist, { recursive: true })).map((path) => path.split('\\').join('/'));
for (const path of files.filter((path) => path.startsWith('welcome/') && path.endsWith('.html'))) {
  // A numbered folder name in a welcome page path means its slug was not applied.
  if (path.split('/').some((part) => /^\d+-/.test(part))) problems.push(`welcome page built at a numbered path: ${path}`);
}
for (const path of files.filter((path) => /\.(html|js|css)$/.test(path))) {
  if ((await readFile(`${dist}/${path}`, 'utf8')).includes('forge-mentor')) problems.push(`${path} still uses forge-mentor`);
}

if (problems.length) {
  console.error(`Build check failed:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log('Build check passed: the welcome page builds at its manifest route.');
