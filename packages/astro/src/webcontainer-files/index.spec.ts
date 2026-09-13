import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { WebContainerFiles } from './index.js';

test('discovers atomically added native maps after setup without changing serialization or inheritance', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tk-native-filemaps-'));
  const integration = new WebContainerFiles();
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  let middleware: any;
  async function file(relative: string, body: string) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }
  async function request(url: string) {
    let body: string | undefined;
    let status: number | undefined;
    let passed = false;
    await middleware({ url }, { writeHead(code: number) { status = code; }, end(value: string) { body = value; } }, () => { passed = true; });
    return { status, body, passed };
  }
  try {
    await file('src/content/tutorial/welcome/_files/main.js', 'welcome');
    await integration.serverSetup(root, { logger, server: {
      middlewares: { use(fn: any) { middleware = fn; } }, hot: { send: vi.fn() },
    } } as any);
    const original = await request('/welcome-files.json');
    expect(original).toEqual({ status: 200, body: '{"/main.js":"welcome"}', passed: false });
    // Deterministically model the missed watcher notification observed for atomic publication.
    // Request discovery must recover even when no watcher event reaches the cache.
    await integration.serverDone();
    await file('staged/new-lesson/_files/main.mjs', 'starter');
    await file('staged/new-lesson/_files/checks.mjs', 'checks');
    await file('staged/new-lesson/_solution/.tk-config.json', JSON.stringify({ extends: '../_files' }));
    await file('staged/new-lesson/_solution/main.mjs', 'solution');
    await fs.rename(path.join(root, 'staged/new-lesson'), path.join(root, 'src/content/tutorial/new-lesson'));
    const initial = await request('/new-lesson-files.json');
    expect(initial.status).toBe(200);
    expect(JSON.parse(initial.body!)).toEqual({ '/checks.mjs': 'checks', '/main.mjs': 'starter' });
    const solution = await request('/new-lesson-solution.json');
    expect(solution.status).toBe(200);
    expect(JSON.parse(solution.body!)).toEqual({ '/checks.mjs': 'checks', '/main.mjs': 'solution' });
    expect(await request('/welcome-files.json')).toEqual(original);
    expect(await request('/not-a-real-lesson-files.json')).toEqual({ status: undefined, body: undefined, passed: true });
    expect(await request('/src/content/tutorial/new-lesson/_files/main.mjs')).toEqual({ status: undefined, body: undefined, passed: true });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  } finally {
    await integration.serverDone();
    await fs.rm(root, { recursive: true, force: true });
  }
});
