// 23차: 기기 간 동기화 서버 점검 (src/sync.js). D1 은 node:sqlite(진짜 SQL), R2 는 메모리 대역으로 흉내 냅니다.
import worker from "../src/index.js";
import { DatabaseSync } from "node:sqlite";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };

// ---- D1 대역 ----
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql) => {
    const mk = (args) => ({
      bind: (...a) => mk(a),
      run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      all: async () => ({ results: db.prepare(sql).all(...args).map((x) => ({ ...x })) }),
      first: async () => db.prepare(sql).get(...args) || null,
      _exec: () => { if (/^\s*select/i.test(sql)) return { results: db.prepare(sql).all(...args).map((x) => ({ ...x })), meta: { changes: 0 } }; const r = db.prepare(sql).run(...args); return { results: [], meta: { changes: Number(r.changes) } }; },
    });
    return mk([]);
  };
  return { prepare: stmt, batch: async (list) => list.map((s) => s._exec()), _db: db };
}
// ---- R2 대역 ----
function fakeR2() {
  const m = new Map();
  return {
    put: async (k, buf, o) => { m.set(k, { buf: new Uint8Array(buf), type: o?.httpMetadata?.contentType }); },
    get: async (k) => { const x = m.get(k); return x ? { body: x.buf, httpMetadata: { contentType: x.type } } : null; },
    delete: async (k) => { for (const key of Array.isArray(k) ? k : [k]) m.delete(key); },
    list: async ({ prefix }) => ({ objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
    _m: m,
  };
}

const mkEnv = (extra = {}) => ({ PASS: "owner-pw", PASS_MORE: "friend-pw, third-pw", ASSETS: { fetch: () => new Response("a") }, ...extra });
const call = (env, path, pass, init = {}) => worker.fetch(new Request("https://x.test" + path, { ...init, headers: { "x-pass": pass, ...(init.headers || {}) } }), env);
const post = (env, pass, body) => call(env, "/api/sync", pass, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const row = (s, id, v, extra = {}) => ({ s, id, v, j: JSON.stringify({ id, t: "x", ...extra }), ...(extra.d ? { d: 1 } : {}) });

// ---- 계정(암호) ----
let env = mkEnv({ SYNC_DB: fakeD1(), SYNC_THUMBS: fakeR2() });
let r = await call(env, "/api/config", "owner-pw"); let j = await r.json();
ok(r.status === 200 && j.sync === true && j.syncThumbs === true && typeof j.acct === "string" && j.acct.length === 10, "config: sync on, thumbs on, short acct");
const accOwner = j.acct;
r = await call(env, "/api/config", "friend-pw"); j = await r.json();
ok(r.status === 200 && j.acct && j.acct !== accOwner, "PASS_MORE password works and is a different account");
r = await call(env, "/api/config", "nope"); ok(r.status === 401, "wrong password rejected");
r = await call(env, "/api/config", "owner-pw,friend-pw"); ok(r.status === 401, "comma-joined passwords do not match");
r = await call(env, "/api/config", ""); ok(r.status === 401, "empty password rejected");
r = await call({ ...env, PASS: "", PASS_MORE: "" }, "/api/config", ""); ok(r.status === 401, "no PASS configured: everything refused");
r = await call(mkEnv(), "/api/config", "owner-pw"); j = await r.json();
ok(j.sync === false && j.syncThumbs === false, "no D1 bound: sync reported off");
r = await call(mkEnv(), "/api/sync", "owner-pw", { method: "POST", body: "{}" }); ok(r.status === 501, "no D1: /api/sync is 501");
r = await call(env, "/api/sync", "nope", { method: "POST", body: "{}" }); ok(r.status === 401, "sync requires auth");

// ---- 올리기·받기 ----
r = await post(env, "owner-pw", { since: 0, push: [row("bm", "a1", 100), row("act", "a1", 100), row("kv", "boardOrder", 50)] }); j = await r.json();
ok(r.status === 200 && j.pushed === 3 && j.rejected === 0, "push 3 rows");
ok(j.pull.length === 3 && j.pull.some((x) => x.s === "kv" && x.id === "boardOrder"), "pull returns what was pushed (client skips by version)");
const cursor = j.next; ok(cursor > 0, "cursor given");
r = await post(env, "owner-pw", { since: 0, push: [] }); j = await r.json();
ok(j.pull.length === 3, "a second device pulling from 0 gets all rows");
r = await post(env, "friend-pw", { since: 0, push: [] }); j = await r.json();
ok(j.pull.length === 0, "another account sees nothing (isolation)");
r = await post(env, "friend-pw", { since: 0, push: [row("bm", "a1", 5, { t: "friend" })] }); j = await r.json();
r = await post(env, "owner-pw", { since: 0, push: [] }); j = await r.json();
ok(j.pull.find((x) => x.s === "bm" && x.id === "a1").j.includes('"x"') && !j.pull.some((x) => x.j && x.j.includes("friend")), "same id in two accounts stays separate");

// ---- 충돌: 나중에 고친 쪽이 이김 ----
r = await post(env, "owner-pw", { since: 0, push: [row("bm", "a1", 300, { t: "new" })] }); j = await r.json();
ok(j.pushed === 1 && j.rejected === 0, "newer version accepted");
r = await post(env, "owner-pw", { since: 1e18, push: [row("bm", "a1", 200, { t: "old" })] }); j = await r.json();
ok(j.pushed === 0 && j.rejected === 1, "older version rejected");
const fix = j.pull.find((x) => x.s === "bm" && x.id === "a1");
ok(fix && fix.v === 300 && fix.j.includes('"new"'), "rejected row: server returns its current (newer) value even when cursor is past it");
r = await post(env, "owner-pw", { since: 0, push: [row("bm", "a1", 300, { t: "same" })] }); j = await r.json();
ok(j.rejected === 1 && j.pull.find((x) => x.id === "a1" && x.s === "bm").j.includes('"new"'), "same version does not overwrite");

// ---- 삭제(tombstone) ----
r = await post(env, "owner-pw", { since: 0, push: [{ s: "bm", id: "a1", v: 400, d: 1 }] }); j = await r.json();
ok(j.pushed === 1, "delete accepted");
const t = j.pull.find((x) => x.s === "bm" && x.id === "a1");
ok(t && t.d === 1 && !t.j, "tombstone delivered to other devices, no content kept");
r = await post(env, "owner-pw", { since: 0, push: [row("bm", "a1", 350, { t: "zombie" })] }); j = await r.json();
ok(j.rejected === 1 && j.pull.find((x) => x.id === "a1" && x.s === "bm").d === 1, "an older edit cannot resurrect a deleted bookmark");
r = await post(env, "owner-pw", { since: 0, push: [row("bm", "a1", 500, { t: "readded" })] }); j = await r.json();
ok(j.pushed === 1 && j.pull.find((x) => x.id === "a1" && x.s === "bm").d === 0, "re-adding later (newer version) revives it");

// ---- 쪽 나눠 받기 ----
const env2 = mkEnv({ SYNC_DB: fakeD1() });
const many = Array.from({ length: 40 }, (_, i) => row("act", "m" + i, 10 + i));
for (let k = 0; k < 3; k++) await post(env2, "owner-pw", { since: 0, push: many.slice(0, 40).map((x) => ({ ...x, id: x.id + "_" + k })) });
r = await post(env2, "owner-pw", { since: 0, push: [] }); j = await r.json();
ok(j.pull.length === 100 && j.more === true, "pull is paged at 100 rows with more=true: " + j.pull.length);
const seen = new Set(j.pull.map((x) => x.id)); let c = j.next, loops = 0, more = j.more;
while (more && loops++ < 5) { const rr = await (await post(env2, "owner-pw", { since: c, push: [] })).json(); rr.pull.forEach((x) => seen.add(x.id)); c = rr.next; more = rr.more; }
ok(seen.size === 120, "following the cursor reaches all 120 rows: " + seen.size);
// 같은 sv 로 쓰인 줄이 쪽 경계에 걸려도 놓치지 않음
ok(new Set(many.map((x) => x.id + "_0")).size === 40 && [...seen].filter((x) => x.endsWith("_0")).length === 40, "no row lost at page boundaries");

// ---- 입력 검사 ----
r = await post(env, "owner-pw", { since: 0, push: [{ s: "zzz", id: "x", v: 1, j: "{}" }, { s: "bm", id: "", v: 1, j: "{}" }, { s: "bm", id: "x", v: -5, j: "{}" }, { s: "bm", id: "x", v: 1, j: "y".repeat(30000) }, { s: "bm", id: "x", v: 1 }] }); j = await r.json();
ok(r.status === 200 && j.pushed === 0 && j.rejected === 0, "invalid rows (bad store / empty id / bad version / too big / no body) are ignored");
r = await call(env, "/api/sync", "owner-pw", { method: "POST", body: "not json" }); ok(r.status === 400, "bad json is 400");
r = await call(env, "/api/sync", "owner-pw", { method: "POST", body: "{}", headers: { "content-length": "9999999" } }); ok(r.status === 413, "oversized body 413");
const big = await post(env, "owner-pw", { since: 0, push: Array.from({ length: 80 }, (_, i) => row("act", "big" + i, 1000 + i)) }); j = await big.json();
ok(j.pushed === 40, "at most 40 rows are taken per request: " + j.pushed);
const kvBig = await post(env, "owner-pw", { since: 0, push: [{ s: "kv", id: "taste", v: 9, j: "z".repeat(150000) }] }); j = await kvBig.json();
ok(j.pushed === 1, "kv values may be large (taste/avoid)");

// ---- 썸네일(R2) ----
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
r = await call(env, "/api/sync/thumb?id=abc", "owner-pw", { method: "PUT", body: png, headers: { "content-type": "image/png" } }); ok(r.status === 200, "thumb upload");
r = await call(env, "/api/sync/thumb?id=abc", "owner-pw"); const buf = new Uint8Array(await r.arrayBuffer());
ok(r.status === 200 && r.headers.get("content-type") === "image/png" && buf.length === 7 && r.headers.get("x-content-type-options") === "nosniff", "thumb download: same bytes, type, nosniff");
r = await call(env, "/api/sync/thumb?id=abc", "friend-pw"); ok(r.status === 404, "another account cannot read my thumbnail");
r = await call(env, "/api/sync/thumb?id=nope", "owner-pw"); ok(r.status === 404, "missing thumb 404");
r = await call(env, "/api/sync/thumb?id=abc", "owner-pw", { method: "PUT", body: "<svg/>", headers: { "content-type": "image/svg+xml" } }); ok(r.status === 415, "svg / non-bitmap rejected");
r = await call(env, "/api/sync/thumb?id=abc", "owner-pw", { method: "PUT", body: png, headers: { "content-type": "text/html" } }); ok(r.status === 415, "html rejected");
r = await call(env, "/api/sync/thumb?id=abc", "owner-pw", { method: "PUT", body: png, headers: { "content-type": "image/png", "content-length": "9000000" } }); ok(r.status === 413, "too large thumb rejected");
r = await call(env, "/api/sync/thumb", "owner-pw"); ok(r.status === 400, "thumb without id is 400");
r = await call(mkEnv({ SYNC_DB: fakeD1() }), "/api/sync/thumb?id=abc", "owner-pw"); ok(r.status === 501, "no R2: thumb route is 501 (records still sync)");
// 북마크를 지우면 서버의 썸네일도 지워짐
await call(env, "/api/sync/thumb?id=gone1", "owner-pw", { method: "PUT", body: png, headers: { "content-type": "image/png" } });
const before = env.SYNC_THUMBS._m.size;
await post(env, "owner-pw", { since: 0, push: [row("bm", "gone1", 10), { s: "bm", id: "gone1", v: 20, d: 1 }] });
ok(env.SYNC_THUMBS._m.size === before - 1, "deleting a bookmark deletes its stored thumbnail");

// ---- 서버 데이터 지우기 ----
await call(env, "/api/sync/thumb?id=friend1", "friend-pw", { method: "PUT", body: png, headers: { "content-type": "image/png" } });
r = await call(env, "/api/sync/wipe", "owner-pw", { method: "POST" }); j = await r.json();
ok(r.status === 200 && j.ok && j.rows > 0, "wipe ok: " + JSON.stringify(j));
r = await post(env, "owner-pw", { since: 0, push: [] }); j = await r.json(); ok(j.pull.length === 0, "owner data gone after wipe");
r = await post(env, "friend-pw", { since: 0, push: [] }); j = await r.json(); ok(j.pull.length === 1, "friend data untouched by owner wipe");
r = await call(env, "/api/sync/thumb?id=friend1", "friend-pw"); ok(r.status === 200, "friend thumbnail untouched by owner wipe");
r = await call(env, "/api/sync/thumb?id=abc", "owner-pw"); ok(r.status === 404, "owner thumbnails removed by wipe");
r = await call(env, "/api/sync/wipe", "owner-pw", { method: "GET" }); ok(r.status === 404, "wipe needs POST");

// ---- 기존 API 는 그대로 ----
r = await call(env, "/api/nothing", "owner-pw"); ok(r.status === 404, "unknown api route still 404");

console.log(fail ? `\n${fail} FAILED` : "\nall passed"); process.exit(fail ? 1 : 0);
