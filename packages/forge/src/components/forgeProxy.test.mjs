import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { forgeOriginGate } from '../lib/forgeProxy.mjs';

test('only the actual native loopback origin crosses the proxy mutation boundary', async () => {
  const gate = forgeOriginGate('http://127.0.0.1:8876');
  const server = http.createServer((req, res) => gate(req, res, () => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ origin: req.headers.origin, cookie: req.headers.cookie, csrf: req.headers['x-forge-csrf'] }));
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const authority = `127.0.0.1:${port}`;
  async function request(headers, method = 'POST', url = '/api/owner/session') {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.end();
    });
  }
  try {
    const allowed = await request({ Origin: `http://${authority}`, Cookie: 'owner=session', 'X-Forge-CSRF': 'unchanged-token' });
    assert.equal(allowed.status, 200);
    assert.deepEqual(allowed.body, { origin: 'http://127.0.0.1:8876', cookie: 'owner=session', csrf: 'unchanged-token' });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const origin of [undefined, 'null', 'https://evil.example', 'http://127.0.0.1:8876', `http://localhost:${port}`]) {
        const headers = { 'X-Forwarded-Host': authority, 'X-Forwarded-Proto': 'http' };
        if (origin) headers.Origin = origin;
        assert.equal((await request(headers, method)).status, 403, `${method} ${origin}`);
      }
    }
    assert.equal((await request({ Host: 'evil.example', Origin: 'http://evil.example' })).status, 403);
    assert.equal((await request({ Host: 'evil.example', Origin: `http://${authority}` })).status, 403);
    const read = await request({ Origin: 'https://evil.example' }, 'GET', '/api/health');
    assert.equal(read.body.origin, 'https://evil.example');
    assert.equal((await request({}, 'POST', '/unrelated')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('proxy fails closed for non-loopback target configuration', () => {
  for (const target of ['https://example.com', 'http://0.0.0.0:8876', 'http://user:pass@127.0.0.1:8876']) {
    assert.throws(() => forgeOriginGate(target), /HTTP loopback target/);
  }
});
