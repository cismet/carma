'use strict';
/**
 * map-relay — a tiny session-state relay for remote-controlling a browser SPA.
 *
 * Design notes:
 *  - Shared state, not commands. The remote writes the whole state object,
 *    the display applies it idempotently. Reconnects and late joiners are free.
 *  - Plain HTTPS only. No WebSockets, no MQTT — survives hostile/inspecting proxies.
 *  - Long polling when the network allows it (~RTT latency), short polling when not.
 *  - Version counter lives in the JSON body, NOT in an ETag header, so requests
 *    stay CORS-"simple" and never trigger a preflight.
 *  - State is in memory. Sessions are ephemeral by design; a restart drops them.
 *
 * Zero dependencies. Node 18+.
 */

const http = require('http');
const crypto = require('crypto');

const PORT            = num(process.env.PORT, 8080);
const ALLOW_ORIGIN    = process.env.ALLOW_ORIGIN || '*';   // e.g. https://cismet.github.io
const HOT_MS          = num(process.env.HOT_MS, 60_000);   // how long a session stays "hot" after activity
const FAST_POLL_MS    = num(process.env.FAST_POLL_MS, 250);
const SLOW_POLL_MS    = num(process.env.SLOW_POLL_MS, 2000);
const MAX_WAIT_MS     = num(process.env.MAX_WAIT_MS, 25_000);      // long-poll hold time
const MAX_BODY_BYTES  = num(process.env.MAX_BODY_BYTES, 256 * 1024);
const SESSION_TTL_MS  = num(process.env.SESSION_TTL_MS, 6 * 60 * 60 * 1000);
const CODE_LEN        = num(process.env.CODE_LEN, 8);
const MAX_SESSIONS    = num(process.env.MAX_SESSIONS, 1000);

// Let a remote bring its own session code instead of taking one from /new.
// Off by default: with it on, the code stops being something an attacker has to
// learn, since any well-formed one they invent becomes a live session. On for
// local development, where it turns driving a display into a single curl.
const AUTO_CREATE     = /^(1|true|yes|on)$/i.test(process.env.AUTO_CREATE || '');

function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }

// Exactly 32 URL-safe, unambiguous characters => 5 clean bits each.
// Digits 2-9 only (no 0/1), letters minus I and O. L is kept because there is
// no 1 to confuse it with. Must stay at 32: a shorter string would bias the
// mask below, a longer one would be unreachable.
// 8 chars ~= 1.1e12 combinations, which with the miss-rate limiter below is
// far beyond brute-forceable for something as low-stakes as a map view.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
if (ALPHABET.length !== 32) throw new Error('ALPHABET must be exactly 32 chars');

function newCode(n = CODE_LEN) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] & 31];
  return s;
}

/** code -> { v, state, createdAt, updatedAt, hotUntil, waiters:Set } */
const sessions = new Map();

/**
 * Which self-chosen codes AUTO_CREATE accepts. Deliberately wider than
 * ALPHABET, which drops look-alike characters only because humans retype the
 * codes it generates, but still bounded so an auto-creating relay cannot be
 * filled with arbitrary keys. Matched after the code has been upper-cased.
 */
const BYO_CODE = /^[A-Z0-9_-]{4,32}$/;

function createSession(code) {
  const now = Date.now();
  const session = {
    v: 0, state: null, createdAt: now, updatedAt: now,
    hotUntil: now + HOT_MS, waiters: new Set(),
  };
  sessions.set(code, session);
  return session;
}

/** ip -> { misses, resetAt } — throttles session-code guessing */
const misses = new Map();
const MISS_LIMIT = 30;
const MISS_WINDOW_MS = 60_000;

function tooManyMisses(ip) {
  const now = Date.now();
  let m = misses.get(ip);
  if (!m || now > m.resetAt) { m = { misses: 0, resetAt: now + MISS_WINDOW_MS }; misses.set(ip, m); }
  return m.misses >= MISS_LIMIT;
}
function noteMiss(ip) {
  const m = misses.get(ip);
  if (m) m.misses++;
}

// ---------------------------------------------------------------- helpers

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, obj) {
  if (res.writableEnded) return;
  const body = Buffer.from(JSON.stringify(obj));
  cors(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', body.length);
  // Nothing here may ever be cached by an intermediary proxy.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Accel-Buffering', 'no');
  res.writeHead(status);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function isHot(s)      { return Date.now() < s.hotUntil; }
function pollHint(s)   { return isHot(s) ? FAST_POLL_MS : SLOW_POLL_MS; }

function snapshot(s) {
  return {
    v: s.v,
    state: s.state,
    ts: s.updatedAt,          // server clock, so the display can estimate staleness
    now: Date.now(),          // lets the client correct for clock skew
    hot: isHot(s),
    pollAfterMs: pollHint(s),
  };
}

/** Wake everyone waiting on this session. */
function flush(s) {
  if (s.waiters.size === 0) return;
  const snap = snapshot(s);
  for (const w of s.waiters) {
    clearTimeout(w.timer);
    send(w.res, 200, snap);
  }
  s.waiters.clear();
}

function touch(s) {
  s.hotUntil = Date.now() + HOT_MS;
}

// ---------------------------------------------------------------- routes

async function route(req, res, url, ip) {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (path === '/healthz') {
    return send(res, 200, { ok: true, sessions: sessions.size, uptime: process.uptime() });
  }

  // --- create a session -------------------------------------------------
  if (path === '/new' && req.method === 'POST') {
    if (sessions.size >= MAX_SESSIONS) return send(res, 503, { error: 'too many sessions' });
    let code;
    do { code = newCode(); } while (sessions.has(code));
    createSession(code);
    return send(res, 201, { code, pollAfterMs: FAST_POLL_MS });
  }

  const m = /^\/s\/([^/]+)(\/hello)?$/.exec(path);
  if (!m) return send(res, 404, { error: 'not found' });

  const code = m[1].toUpperCase();
  const isHello = Boolean(m[2]);

  if (tooManyMisses(ip)) return send(res, 429, { error: 'too many attempts' });

  let s = sessions.get(code);
  if (!s) {
    // A writer may open the session it names, so a fixed code can be driven
    // straight from curl. Readers never do: a display polling a code nobody
    // writes to must keep failing rather than sit on an empty session forever.
    const mayAutoCreate =
      AUTO_CREATE && req.method === 'POST' && BYO_CODE.test(code) && sessions.size < MAX_SESSIONS;
    if (!mayAutoCreate) { noteMiss(ip); return send(res, 404, { error: 'unknown session' }); }
    s = createSession(code);
    console.log(`auto-created session ${code}`);
  }

  // --- remote announces itself (wakes the display's poll rate) ----------
  if (isHello) {
    if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
    touch(s);
    flush(s);                       // let waiting displays pick up the new poll hint
    return send(res, 200, { v: s.v, pollAfterMs: FAST_POLL_MS });
  }

  // --- remote writes state ---------------------------------------------
  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return send(res, 413, { error: e.message }); }

    if (!('state' in body)) return send(res, 400, { error: 'expected {state: ...}' });

    // Optimistic concurrency: if the caller passes ifV, reject stale writes.
    if (body.ifV !== undefined && body.ifV !== s.v) {
      return send(res, 409, { error: 'version conflict', v: s.v, state: s.state });
    }

    s.state = body.state;
    s.v += 1;
    s.updatedAt = Date.now();
    touch(s);
    flush(s);
    return send(res, 200, { v: s.v, ts: s.updatedAt });
  }

  // --- display reads state ---------------------------------------------
  if (req.method === 'GET') {
    const since = Number(url.searchParams.get('since'));
    const wait  = Math.min(num(url.searchParams.get('wait'), 0), MAX_WAIT_MS);

    // Nothing new and the caller is willing to hang: park the request.
    if (Number.isFinite(since) && since === s.v && wait > 0) {
      const waiter = { res, timer: null };
      waiter.timer = setTimeout(() => {
        s.waiters.delete(waiter);
        send(res, 200, snapshot(s));      // timed out, state unchanged
      }, wait);
      s.waiters.add(waiter);
      res.on('close', () => { clearTimeout(waiter.timer); s.waiters.delete(waiter); });
      return;
    }

    return send(res, 200, snapshot(s));
  }

  return send(res, 405, { error: 'method not allowed' });
}

// ---------------------------------------------------------------- server

const server = http.createServer((req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket.remoteAddress || 'unknown';
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { return send(res, 400, { error: 'bad url' }); }

  route(req, res, url, ip).catch((err) => {
    console.error('unhandled', err);
    send(res, 500, { error: 'internal' });
  });
});

// Must exceed MAX_WAIT_MS or Node kills parked long-poll requests itself.
server.keepAliveTimeout = MAX_WAIT_MS + 15_000;
server.headersTimeout   = MAX_WAIT_MS + 20_000;
server.requestTimeout   = 0;

// Drop idle sessions.
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [code, s] of sessions) {
    if (s.updatedAt < cutoff && s.waiters.size === 0) sessions.delete(code);
  }
  const now = Date.now();
  for (const [ip, m] of misses) if (now > m.resetAt) misses.delete(ip);
}, 60_000).unref();

server.listen(PORT, () => {
  console.log(`map-relay listening on :${PORT}  origin=${ALLOW_ORIGIN}  autoCreate=${AUTO_CREATE}  fast=${FAST_POLL_MS}ms slow=${SLOW_POLL_MS}ms wait=${MAX_WAIT_MS}ms`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { server.close(() => process.exit(0)); });
}
