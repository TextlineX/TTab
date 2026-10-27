#!/usr/bin/env node
// TTab 云端服务：账号、标签/组合同步、匿名社区标签（比对与纠正）。
// 零依赖，只需要 Node 18+。详见 README.md。
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JsonFile } from './store.mjs';

export const VERSION = '1.0.0';

const TAG_SOURCES = new Set(['manual', 'ai', 'rule', 'cloud']);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const b64u = buf => Buffer.from(buf).toString('base64url');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

export function createApp(opts = {}) {
  const cfg = {
    dataDir: opts.dataDir || process.env.DATA_DIR || './data',
    allowRegister: opts.allowRegister ?? process.env.ALLOW_REGISTER !== '0',
    minVotes: opts.minVotes ?? (Number(process.env.MIN_VOTES) || 2),
    maxBody: 4 * 1024 * 1024,
    tokenDays: 30,
    maxPagesPerUser: 50000,
    contributePerDay: 5000,
  };
  fs.mkdirSync(cfg.dataDir, { recursive: true });

  // 签名密钥：环境变量优先，否则第一次启动时生成并保存在数据目录
  const secretFile = path.join(cfg.dataDir, 'secret');
  let secret = opts.secret || process.env.TTAB_SECRET;
  if (!secret) {
    try { secret = fs.readFileSync(secretFile, 'utf8').trim(); } catch { /* 第一次启动 */ }
    if (!secret) { secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, secret, { mode: 0o600 }); }
  }

  const usersDb = new JsonFile(path.join(cfg.dataDir, 'users.json'), () => ({ users: {} }));
  const communityDb = new JsonFile(path.join(cfg.dataDir, 'community.json'), () => ({ pages: {}, domains: {} }));
  const byEmail = new Map(Object.values(usersDb.data.users).map(u => [u.email, u.id]));
  const syncDbs = new Map();
  const syncDb = uid => {
    let db = syncDbs.get(uid);
    if (!db) { db = new JsonFile(path.join(cfg.dataDir, 'sync', `${uid}.json`), () => ({ rev: 0, pages: {}, collections: {}, tombstones: {} })); syncDbs.set(uid, db); }
    return db;
  };
  const aliasesFile = path.join(cfg.dataDir, 'aliases.json');
  const readAliases = () => { try { const a = JSON.parse(fs.readFileSync(aliasesFile, 'utf8')); return a && typeof a === 'object' ? a : {}; } catch { return {}; } };

  // ---------------------------------------------------------------- 工具
  const sign = payload => { const body = b64u(JSON.stringify(payload)); return `${body}.${b64u(crypto.createHmac('sha256', secret).update(body).digest())}`; };
  const verify = token => {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const want = crypto.createHmac('sha256', secret).update(body).digest();
    let got; try { got = Buffer.from(sig, 'base64url'); } catch { return null; }
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!p.exp || p.exp < Date.now()) return null;
      const u = usersDb.data.users[p.uid];
      return u && u.tv === p.tv ? u : null;
    } catch { return null; }
  };
  const hashPassword = (pw, salt) => crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  const issue = u => sign({ uid: u.id, tv: u.tv, exp: Date.now() + cfg.tokenDays * 864e5 });
  const voterId = uid => crypto.createHmac('sha256', secret).update(`voter:${uid}`).digest('hex').slice(0, 16);

  // 登录/注册限流：同一 IP+邮箱 10 分钟内最多 10 次失败
  const fails = new Map();
  const failKey = (ip, email) => `${ip}|${email}`;
  const tooMany = k => { const f = fails.get(k); return !!f && f.until > Date.now() && f.n >= 10; };
  const noteFail = k => { const f = fails.get(k); const now = Date.now(); fails.set(k, !f || f.until < now ? { n: 1, until: now + 600000 } : { n: f.n + 1, until: f.until }); };
  const dayCount = new Map();
  const spend = (uid, n) => { const day = new Date().toISOString().slice(0, 10); const k = `${uid}|${day}`; const used = (dayCount.get(k) || 0) + n; if (used > cfg.contributePerDay) return false; dayCount.set(k, used); if (dayCount.size > 5000) dayCount.clear(); return true; };

  class HttpError extends Error { constructor(status, code, msg) { super(msg || code); this.status = status; this.code = code; } }

  const cleanTag = t => (typeof t === 'string' ? t.trim().slice(0, 24) : '');
  const cleanPage = (key, p, now) => {
    if (!isStr(key, 2048) || !p || typeof p !== 'object') return null;
    const tags = (Array.isArray(p.tags) ? p.tags : []).slice(0, 50)
      .filter(t => t && isStr(t.name, 40)).map(t => ({ name: t.name, source: TAG_SOURCES.has(t.source) ? t.source : 'manual' }));
    return {
      key, tags,
      removed: (Array.isArray(p.removed) ? p.removed : []).slice(0, 100).filter(r => isStr(r, 40)),
      summary: typeof p.summary === 'string' ? p.summary.slice(0, 500) : undefined,
      opens: Number.isFinite(p.opens) ? clamp(Math.floor(p.opens), 0, 1e7) : undefined,
      lastOpened: Number.isFinite(p.lastOpened) ? p.lastOpened : undefined,
      updatedAt: clamp(Number.isFinite(p.updatedAt) ? p.updatedAt : now, 0, now + 600000),
    };
  };
  const cleanCollection = (c, now) => {
    if (!c || !isStr(c.id, 64) || !isStr(c.name, 80)) return null;
    return {
      id: c.id, name: c.name, description: typeof c.description === 'string' ? c.description.slice(0, 300) : undefined,
      emoji: typeof c.emoji === 'string' ? c.emoji.slice(0, 8) : undefined,
      keys: (Array.isArray(c.keys) ? c.keys : []).slice(0, 5000).filter(k => isStr(k, 2048)),
      query: c.query && Array.isArray(c.query.tags) ? { tags: c.query.tags.slice(0, 20).filter(t => isStr(t, 40)), mode: c.query.mode === 'or' ? 'or' : 'and' } : undefined,
      pinned: !!c.pinned, source: ['manual', 'ai', 'auto'].includes(c.source) ? c.source : 'manual',
      createdAt: Number.isFinite(c.createdAt) ? c.createdAt : now,
      updatedAt: clamp(Number.isFinite(c.updatedAt) ? c.updatedAt : now, 0, now + 600000),
    };
  };

  // ---------------------------------------------------------------- 路由
  const routes = {
    'GET /api/health': async () => ({ ok: true, version: VERSION, registration: cfg.allowRegister }),

    'POST /api/register': async (req, body) => {
      if (!cfg.allowRegister) throw new HttpError(403, 'registration_closed', '这个服务器不开放注册');
      const email = String(body.email || '').trim().toLowerCase();
      const pw = String(body.password || '');
      if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'bad_email', '邮箱格式不对');
      if (pw.length < 8 || pw.length > 200) throw new HttpError(400, 'bad_password', '密码需要 8 到 200 个字符');
      if (byEmail.has(email)) throw new HttpError(409, 'email_taken', '这个邮箱已经注册过了');
      const salt = crypto.randomBytes(16).toString('hex');
      const u = { id: crypto.randomUUID(), email, salt, hash: hashPassword(pw, salt).toString('hex'), tv: 1, createdAt: Date.now() };
      usersDb.data.users[u.id] = u; byEmail.set(email, u.id); usersDb.touch();
      return { token: issue(u), user: { email } };
    },

    'POST /api/login': async (req, body) => {
      const email = String(body.email || '').trim().toLowerCase();
      const k = failKey(req.ip, email);
      if (tooMany(k)) throw new HttpError(429, 'too_many', '尝试次数太多，请 10 分钟后再试');
      const u = usersDb.data.users[byEmail.get(email)];
      // 邮箱不存在时也算一次哈希，避免通过耗时判断邮箱是否注册
      const probe = hashPassword(String(body.password || ''), u ? u.salt : 'x'.repeat(32));
      if (!u || !crypto.timingSafeEqual(probe, Buffer.from(u.hash, 'hex'))) { noteFail(k); throw new HttpError(401, 'bad_credentials', '邮箱或密码不对'); }
      fails.delete(k);
      return { token: issue(u), user: { email } };
    },

    'GET /api/me': async (req) => { const u = auth(req); return { user: { email: u.email }, pages: Object.keys(syncDb(u.id).data.pages).length }; },

    'POST /api/logout': async (req) => { const u = auth(req); u.tv += 1; usersDb.touch(); return { ok: true }; },

    'DELETE /api/account': async (req, body) => {
      const u = auth(req);
      if (!crypto.timingSafeEqual(hashPassword(String(body.password || ''), u.salt), Buffer.from(u.hash, 'hex'))) throw new HttpError(401, 'bad_credentials', '密码不对');
      removeVotes(voterId(u.id));
      const db = syncDb(u.id); db.close(); syncDbs.delete(u.id);
      try { fs.rmSync(path.join(cfg.dataDir, 'sync', `${u.id}.json`)); } catch { /* 没有同步数据 */ }
      delete usersDb.data.users[u.id]; byEmail.delete(u.email); usersDb.touch();
      return { ok: true };
    },

    // ---- 同步：按网页（归一化 URL）和组合做"最后修改者优先"
    'POST /api/sync': async (req, body) => {
      const u = auth(req);
      const db = syncDb(u.id); const d = db.data; const now = Date.now();
      const inPages = body.pages && typeof body.pages === 'object' ? Object.entries(body.pages) : [];
      if (inPages.length > 5000) throw new HttpError(413, 'too_many_pages', '一次最多同步 5000 个网页');
      let changed = false;
      for (const [key, raw] of inPages) {
        const p = cleanPage(key, raw, now); if (!p) continue;
        const old = d.pages[key];
        if (old && old.updatedAt >= p.updatedAt) continue;
        if (!old && Object.keys(d.pages).length >= cfg.maxPagesPerUser) continue;
        d.pages[key] = { ...p, rev: ++d.rev }; changed = true;
      }
      const tomb = body.tombstones && typeof body.tombstones === 'object' ? body.tombstones : {};
      for (const [id, at] of Object.entries(tomb).slice(0, 1000)) {
        if (!isStr(id, 64) || !Number.isFinite(at)) continue;
        const col = d.collections[id]; const t = clamp(at, 0, now + 600000);
        if ((d.tombstones[id]?.at || 0) >= t) continue;
        if (col && col.updatedAt > t) continue;
        delete d.collections[id]; d.tombstones[id] = { at: t, rev: ++d.rev }; changed = true;
      }
      for (const raw of (Array.isArray(body.collections) ? body.collections : []).slice(0, 500)) {
        const c = cleanCollection(raw, now); if (!c) continue;
        const old = d.collections[c.id]; const t = d.tombstones[c.id]?.at || 0;
        if ((old && old.updatedAt >= c.updatedAt) || t >= c.updatedAt) continue;
        d.collections[c.id] = { ...c, rev: ++d.rev }; delete d.tombstones[c.id]; changed = true;
      }
      if (changed) db.touch();
      // 返回游标之后的变化（分批，最多 2000 条）
      const since = Number.isFinite(body.cursor) ? body.cursor : 0;
      const out = { pages: {}, collections: [], tombstones: {} };
      const all = [
        ...Object.values(d.pages).filter(p => p.rev > since).map(p => ['p', p]),
        ...Object.values(d.collections).filter(c => c.rev > since).map(c => ['c', c]),
        ...Object.entries(d.tombstones).filter(([, t]) => t.rev > since).map(([id, t]) => ['t', { id, ...t }]),
      ].sort((a, b) => a[1].rev - b[1].rev);
      const slice = all.slice(0, 2000);
      for (const [kind, v] of slice) {
        const { rev, ...rest } = v;
        if (kind === 'p') out.pages[v.key] = rest; else if (kind === 'c') out.collections.push(rest); else out.tombstones[v.id] = v.at;
      }
      return { ...out, cursor: slice.length ? slice[slice.length - 1][1].rev : Math.max(since, d.rev), more: all.length > slice.length };
    },

    // ---- 社区标签：只收哈希，不收网址；每人对同一个网页的同一个标签只算一票
    'POST /api/contribute': async (req, body) => {
      const u = auth(req);
      const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
      if (!spend(u.id, items.length)) throw new HttpError(429, 'daily_limit', '今天贡献得够多了，明天再来');
      const v = voterId(u.id); let n = 0;
      for (const it of items) {
        if (!it || !isStr(it.h, 64) || !/^[0-9a-f]+$/.test(it.h)) continue;
        const tags = (Array.isArray(it.tags) ? it.tags : []).slice(0, 5).map(cleanTag).filter(Boolean);
        for (const t of tags) { vote(communityDb.data.pages, it.h, t, v); n++; }
        if (isStr(it.d, 64) && /^[0-9a-f]+$/.test(it.d)) for (const t of tags) vote(communityDb.data.domains, it.d, t, v);
      }
      if (n) communityDb.touch();
      return { accepted: n };
    },

    'POST /api/suggest': async (req, body) => {
      auth(req);
      const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
      const top = (map, h, min) => {
        const e = map[h]; if (!e) return [];
        return Object.entries(e).map(([t, vs]) => ({ t, n: vs.length })).filter(x => x.n >= min).sort((a, b) => b.n - a.n).slice(0, 6);
      };
      const out = {};
      for (const it of items) {
        if (!it || !isStr(it.h, 64)) continue;
        const page = top(communityDb.data.pages, it.h, cfg.minVotes);
        const dom = isStr(it.d, 64) ? top(communityDb.data.domains, it.d, cfg.minVotes * 2).slice(0, 3) : [];
        if (page.length || dom.length) out[it.h] = { page, domain: dom };
      }
      return { suggestions: out, minVotes: cfg.minVotes };
    },

    'DELETE /api/contributions': async (req) => { const u = auth(req); const n = removeVotes(voterId(u.id)); return { removed: n }; },

    // 同义词表：服务器管理员可以直接编辑 data/aliases.json，所有用户下次比对时自动生效，不用发新版扩展
    'GET /api/aliases': async () => ({ aliases: readAliases() }),
  };

  function vote(map, h, tag, v) {
    const e = (map[h] ||= {});
    const arr = (e[tag] ||= []);
    if (!arr.includes(v)) arr.push(v);
  }
  function removeVotes(v) {
    let n = 0;
    for (const map of [communityDb.data.pages, communityDb.data.domains]) {
      for (const [h, tags] of Object.entries(map)) {
        for (const [t, vs] of Object.entries(tags)) {
          const i = vs.indexOf(v);
          if (i >= 0) { vs.splice(i, 1); n++; if (!vs.length) delete tags[t]; }
        }
        if (!Object.keys(tags).length) delete map[h];
      }
    }
    if (n) communityDb.touch();
    return n;
  }
  function auth(req) {
    const h = req.headers.authorization || '';
    const u = h.startsWith('Bearer ') ? verify(h.slice(7)) : null;
    if (!u) throw new HttpError(401, 'unauthorized', '登录已失效，请重新登录');
    return u;
  }

  // ---------------------------------------------------------------- HTTP
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  const send = (res, status, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  const readBody = req => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > cfg.maxBody) { reject(new HttpError(413, 'too_large', '请求太大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'bad_json', '请求不是有效的 JSON')); } });
    req.on('error', reject);
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      const url = new URL(req.url, 'http://x');
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) throw new HttpError(404, 'not_found', '没有这个接口');
      req.ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
      const body = req.method === 'GET' ? {} : await readBody(req);
      send(res, 200, await handler(req, body));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
      console.error('[ttab-server]', e);
      send(res, 500, { error: 'internal', message: '服务器出错了' });
    }
  });
  server.close_all = () => { usersDb.close(); communityDb.close(); for (const d of syncDbs.values()) d.close(); };
  return server;
}

// 直接运行：node server.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  createApp().listen(port, host, () => console.log(`TTab 云端服务 v${VERSION} 已启动：http://${host}:${port}（数据目录 ${process.env.DATA_DIR || './data'}）`));
}
