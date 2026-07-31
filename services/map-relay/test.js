'use strict';
/**
 * Self-contained test for map-relay. Spawns the server on a scratch port,
 * exercises every route and both transports, prints a pass/fail table.
 *
 *   node test.js
 */

const { spawn } = require('child_process');
const assert = require('assert');

const PORT = 8731;
const BASE = `http://127.0.0.1:${PORT}`;
const HOT_MS = 800;                       // short, so the cool-down is testable

let failures = 0;
const results = [];

function ok(name, detail = '') { results.push(['PASS', name, detail]); }
function bad(name, detail) { results.push(['FAIL', name, detail]); failures++; }

async function test(name, fn) {
  try { const d = await fn(); ok(name, d || ''); }
  catch (e) { bad(name, e.message); }
}

const get = (path) => fetch(BASE + path, { cache: 'no-store' });
const post = (path, body) => fetch(BASE + path, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  body: body === undefined ? '' : JSON.stringify(body),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newCode() {
  const r = await post('/new');
  return (await r.json()).code;
}

(async () => {
  const srv = spawn(process.execPath, [`${__dirname}/server.js`], {
    env: { ...process.env, PORT: String(PORT), ALLOW_ORIGIN: 'https://cismet.github.io', HOT_MS: String(HOT_MS) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => srv.stdout.once('data', r));

  // ---------------------------------------------------------------- basics

  await test('healthz responds', async () => {
    const d = await (await get('/healthz')).json();
    assert.strictEqual(d.ok, true);
  });

  await test('session code is 8 chars, URL-safe, unambiguous', async () => {
    const code = await newCode();
    assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/, `got ${code}`);
    // The bug that bit us: a stray '#' would silently truncate the path.
    assert.ok(code === encodeURIComponent(code), 'code must survive a URL path');
    return code;
  });

  await test('fresh session reads as v0 / null state', async () => {
    const code = await newCode();
    const d = await (await get(`/s/${code}`)).json();
    assert.strictEqual(d.v, 0);
    assert.strictEqual(d.state, null);
  });

  await test('CORS allows the Pages origin and forbids caching', async () => {
    const code = await newCode();
    const r = await get(`/s/${code}`);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), 'https://cismet.github.io');
    assert.match(r.headers.get('cache-control'), /no-store/);
    assert.strictEqual(r.headers.get('x-accel-buffering'), 'no');
  });

  await test('preflight returns 204', async () => {
    const code = await newCode();
    const r = await fetch(`${BASE}/s/${code}`, { method: 'OPTIONS' });
    assert.strictEqual(r.status, 204);
  });

  // ------------------------------------------------------------ long poll

  await test('long poll wakes within ~10ms of a write', async () => {
    const code = await newCode();
    const parked = get(`/s/${code}?since=0&wait=25000`);
    await sleep(300);
    const t0 = Date.now();
    await post(`/s/${code}`, { state: { layers: { Orthophoto: true } } });
    const d = await (await parked).json();
    const lag = Date.now() - t0;
    assert.strictEqual(d.v, 1);
    assert.strictEqual(d.state.layers.Orthophoto, true);
    assert.ok(lag < 150, `woke after ${lag}ms, expected <150`);
    return `${lag}ms after the write`;
  });

  await test('one write wakes every parked display', async () => {
    const code = await newCode();
    const parked = [0, 1, 2].map(() => get(`/s/${code}?since=0&wait=25000`));
    await sleep(300);
    await post(`/s/${code}`, { state: { n: 1 } });
    const all = await Promise.all(parked.map(async (p) => (await p).json()));
    assert.ok(all.every((d) => d.v === 1), 'all waiters must see v1');
    return `${all.length} displays`;
  });

  await test('hello wakes parked displays (poll-hint refresh)', async () => {
    const code = await newCode();
    await post(`/s/${code}`, { state: { n: 1 } });
    const parked = get(`/s/${code}?since=1&wait=25000`);
    await sleep(300);
    const t0 = Date.now();
    await post(`/s/${code}/hello`);
    const d = await (await parked).json();
    const lag = Date.now() - t0;
    assert.strictEqual(d.v, 1);
    assert.ok(lag < 150, `woke after ${lag}ms`);
    return `${lag}ms`;
  });

  await test('long poll times out cleanly with unchanged version', async () => {
    const code = await newCode();
    const t0 = Date.now();
    const d = await (await get(`/s/${code}?since=0&wait=1000`)).json();
    const held = Date.now() - t0;
    assert.strictEqual(d.v, 0);
    assert.ok(held >= 950 && held < 1600, `held ${held}ms, expected ~1000`);
    return `held ${held}ms`;
  });

  await test('aborted long poll does not leak a waiter', async () => {
    const code = await newCode();
    const ac = new AbortController();
    const p = fetch(`${BASE}/s/${code}?since=0&wait=25000`, { signal: ac.signal }).catch(() => {});
    await sleep(200);
    ac.abort();
    await p;
    await sleep(100);
    // If the waiter leaked, this write would try to respond on a dead socket.
    const r = await post(`/s/${code}`, { state: { n: 1 } });
    assert.strictEqual(r.status, 200);
    const d = await (await get(`/s/${code}`)).json();
    assert.strictEqual(d.v, 1);
  });

  // ------------------------------------------------------- adaptive rate

  await test('poll hint speeds up when hot, slows when cold', async () => {
    const code = await newCode();
    const hot = await (await get(`/s/${code}`)).json();
    assert.strictEqual(hot.pollAfterMs, 250, 'fresh session should be hot');
    await sleep(HOT_MS + 250);
    const cold = await (await get(`/s/${code}`)).json();
    assert.strictEqual(cold.pollAfterMs, 2000, 'should have cooled down');
    await post(`/s/${code}/hello`);
    const rehot = await (await get(`/s/${code}`)).json();
    assert.strictEqual(rehot.pollAfterMs, 250, 'hello should re-heat it');
    return '250 -> 2000 -> 250';
  });

  // ------------------------------------------------------------- failures

  await test('stale write is rejected with 409', async () => {
    const code = await newCode();
    await post(`/s/${code}`, { state: { n: 1 } });
    const r = await post(`/s/${code}`, { state: { n: 2 }, ifV: 99 });
    assert.strictEqual(r.status, 409);
  });

  await test('malformed write is rejected with 400', async () => {
    const code = await newCode();
    const r = await post(`/s/${code}`, { nope: true });
    assert.strictEqual(r.status, 400);
  });

  await test('oversized body is rejected with 413', async () => {
    const code = await newCode();
    const r = await post(`/s/${code}`, { state: { blob: 'x'.repeat(300_000) } }).catch((e) => ({ status: 413, err: e }));
    assert.ok(r.status === 413 || r.err, `got ${r.status}`);
  });

  await test('unknown session is 404, then rate-limited to 429', async () => {
    let saw404 = false, at = null;
    for (let i = 1; i <= 45; i++) {
      const r = await get(`/s/GUESS${String(i).padStart(3, '2')}`);
      if (r.status === 404) saw404 = true;
      if (r.status === 429) { at = i; break; }
    }
    assert.ok(saw404, 'expected 404s');
    assert.ok(at !== null && at <= 40, `429 should trigger, got ${at}`);
    return `429 after ${at} guesses`;
  });

  // --------------------------------------------------- AUTO_CREATE (dev mode)

  // Needs its own process: the flag is read once at startup, and the point of
  // the checks above is that the default build does NOT behave this way.
  const AUTO_PORT = PORT + 1;
  const AUTO_BASE = `http://127.0.0.1:${AUTO_PORT}`;
  const auto = spawn(process.execPath, [`${__dirname}/server.js`], {
    env: { ...process.env, PORT: String(AUTO_PORT), AUTO_CREATE: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => auto.stdout.once('data', r));

  const autoPost = (path, body) => fetch(AUTO_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: body === undefined ? '' : JSON.stringify(body),
  });

  await test('AUTO_CREATE: a write opens the session it names', async () => {
    const r = await autoPost('/s/ooc0eeQu', { state: { config: 'abc' } });
    assert.strictEqual(r.status, 200, `got ${r.status}`);
    assert.strictEqual((await r.json()).v, 1);
    // codes are case-insensitive, so the display may spell it either way
    const read = await (await fetch(`${AUTO_BASE}/s/OOC0EEQU?since=-1`, { cache: 'no-store' })).json();
    assert.deepStrictEqual(read.state, { config: 'abc' });
    return 'ooc0eeQu == OOC0EEQU';
  });

  await test('AUTO_CREATE: a read never opens a session', async () => {
    const r = await fetch(`${AUTO_BASE}/s/NEVERSEEN?since=-1`, { cache: 'no-store' });
    assert.strictEqual(r.status, 404, `got ${r.status}`);
    const h = await (await fetch(`${AUTO_BASE}/healthz`)).json();
    assert.strictEqual(h.sessions, 1, `expected only the written session, got ${h.sessions}`);
  });

  await test('AUTO_CREATE: a malformed code is still rejected', async () => {
    for (const code of ['ab', 'has.dot', 'x'.repeat(33)] ) {
      const r = await autoPost(`/s/${encodeURIComponent(code)}`, { state: {} });
      assert.strictEqual(r.status, 404, `${code} got ${r.status}`);
    }
    return 'too short, bad char, too long';
  });

  // ------------------------------------------------------------- teardown

  auto.kill('SIGTERM');
  srv.kill('SIGTERM');

  const w = Math.max(...results.map((r) => r[1].length));
  console.log();
  for (const [s, name, detail] of results) {
    const mark = s === 'PASS' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`${mark} ${name.padEnd(w)}  ${detail ? '\x1b[2m' + detail + '\x1b[0m' : ''}`);
  }
  console.log(`\n${results.length - failures}/${results.length} passed\n`);
  process.exit(failures ? 1 : 0);
})();
