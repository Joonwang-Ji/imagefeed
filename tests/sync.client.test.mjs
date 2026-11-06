// 23차: 기기 간 동기화 앱 쪽 점검 (public/sync.js). 기기 두 대를 메모리로 흉내 내고, 진짜 서버 코드(src/)와 D1 대역(node:sqlite)에 연결합니다.
import worker from "../src/index.js";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs"; import vm from "node:vm";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const ROOT = new URL("../public/", import.meta.url).pathname;
const sb = { module: { exports: {} }, Int8Array, Uint8Array, btoa, atob, String, Object, Array, JSON, Date, Math, Promise, setTimeout, clearTimeout, Number, Error };
vm.runInNewContext(fs.readFileSync(ROOT + "sync.js", "utf8"), sb);
const SyncStore = sb.module.exports;

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql) => { const mk = (args) => ({ bind: (...a) => mk(a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    all: async () => ({ results: db.prepare(sql).all(...args).map((x) => ({ ...x })) }),
    _exec: () => { if (/^\s*select/i.test(sql)) return { results: db.prepare(sql).all(...args).map((x) => ({ ...x })), meta: { changes: 0 } }; const r = db.prepare(sql).run(...args); return { results: [], meta: { changes: Number(r.changes) } }; } }); return mk([]); };
  return { prepare: stmt, batch: async (l) => l.map((s) => s._exec()) };
}
function fakeR2() { const m = new Map(); return { put: async (k, b, o) => { m.set(k, { b: new Uint8Array(b), t: o?.httpMetadata?.contentType }); }, get: async (k) => { const x = m.get(k); return x ? { body: x.b, httpMetadata: { contentType: x.t } } : null; }, delete: async (k) => { for (const x of Array.isArray(k) ? k : [k]) m.delete(x); }, list: async ({ prefix }) => ({ objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }), _m: m }; }
const mkEnv = (o = {}) => ({ PASS: "pw1", PASS_MORE: "pw2", ASSETS: { fetch: () => new Response("a") }, SYNC_DB: fakeD1(), SYNC_THUMBS: fakeR2(), ...o });

let clock = 1_000_000;
const now = () => ++clock;

// 기기 한 대: 북마크(bm)·활동(act) 저장소, localStorage(ls), 메타 저장소를 메모리로
function device(env, pass = "pw1", opt = {}) {
  const d = { bm: new Map(), act: new Map(), ls: new Map(), meta: null, applied: [], calls: [], thumbUp: 0, thumbDown: 0, authFail: false, thumbsOn: opt.thumbs !== false, on: true };
  d.call = async (path, init = {}) => {
    d.calls.push(path);
    if (d.authFail) throw new Error("auth");
    if (path.startsWith("/api/sync/thumb")) { if (init.method === "PUT") d.thumbUp++; else d.thumbDown++; }
    const r = await worker.fetch(new Request("https://x.test" + path, { ...init, headers: { "x-pass": pass, ...(init.headers || {}) } }), env);
    if (r.status === 401) throw new Error("auth");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  };
  const store = (m) => ({ get: async (id) => m.get(id) || null, all: async () => [...m.values()], putRaw: async (r) => { m.set(r.id, r); }, delRaw: async (id) => { m.delete(id); } });
  d.sy = SyncStore.create({
    call: d.call, bm: store(d.bm), act: store(d.act),
    ls: { has: (k) => d.ls.has(k), getRaw: (k) => d.ls.get(k), setRaw: (k, v) => { d.ls.set(k, v); } },
    meta: { get: () => d.metaVal || null, set: (v) => { d.metaVal = JSON.parse(JSON.stringify(v)); } },
    now, enabled: () => d.on, thumbs: () => d.thumbsOn,
    putThumb: async (id, blob) => { await d.call(`/api/sync/thumb?id=${encodeURIComponent(id)}`, { method: "PUT", body: new Uint8Array(await blob.arrayBuffer()), headers: { "content-type": blob.type || "image/jpeg" } }); },
    getThumb: async (id) => { try { return await (await d.call(`/api/sync/thumb?id=${encodeURIComponent(id)}`)).blob(); } catch (e) { if (e.message === "auth") throw e; return null; } },
    onApply: async (i) => { d.applied.push(i); },
    timers: { set: () => 0, clear: () => {} }, // 자동 예약은 끄고 run() 을 직접 부름
  });
  // 앱이 하는 것처럼: 저장할 때 고친 시각 + 올릴 목록 표시
  d.putBm = async (rec) => { rec._v = now(); d.bm.set(rec.id, rec); d.sy.mark("bm", rec.id, rec._v); };
  d.delBm = async (id) => { d.bm.delete(id); d.sy.mark("bm", id, now(), true); };
  d.putAct = async (rec) => { rec._v = now(); d.act.set(rec.id, rec); d.sy.mark("act", rec.id, rec._v); };
  d.setLs = (k, v) => { d.ls.set(k, v); d.sy.markKv(k); };
  return d;
}
const png = (n) => new Blob([new Uint8Array([137, 80, 78, 71, n, n, n])], { type: "image/png" });
const vecOf = () => Int8Array.from({ length: 1024 }, (_, i) => ((i * 7) % 255) - 127);

// ---- 1. A → 서버 → B ----
let env = mkEnv();
const A = device(env), B = device(env);
await A.putBm({ id: "i1", title: "벚꽃 길", thumb: "https://x/i1.jpg", tags: ["벚꽃", "봄"], boards: ["봄"], board: "봄", ts: 5, blob: png(1), an: { tone: "pastel", cols: ["pink"] } });
await A.putBm({ id: "i2", title: "바다", thumb: "https://x/i2.jpg", tags: [], boards: [], ts: 6, blob: png(2) });
const vec = vecOf();
await A.putAct({ id: "i1", title: "벚꽃 길", wt: 3, ts: 5, first: 5, tags: ["벚꽃"], vec, cap: "pink blossoms along a road" });
A.setLs("taste", { v: 1, tags: { 벚꽃: [2, 5] }, colors: {}, tones: {}, mute: { daum: 1 } });
A.setLs("blur", false); A.setLs("boardOrder", ["봄", "여름"]);
await A.sy.run();
ok(A.sy.status().err === "" && A.sy.status().pending === 0, "A: all pushed, nothing pending");
ok(A.thumbUp === 2, "A: both thumbnails uploaded once: " + A.thumbUp);
await B.sy.run();
ok(B.bm.size === 2 && B.bm.get("i1").title === "벚꽃 길" && B.bm.get("i1").boards[0] === "봄" && B.bm.get("i1").an.tone === "pastel", "B: bookmarks arrived with boards + analysis");
ok(B.bm.get("i1").blob instanceof Blob && B.bm.get("i1").blob.size === 7 && B.bm.get("i2").blob.size === 7, "B: thumbnails downloaded into bookmarks (" + B.thumbDown + " downloads)");
ok(B.act.get("i1").vec instanceof Int8Array && B.act.get("i1").vec.length === 1024 && B.act.get("i1").vec.every((x, i) => x === vec[i]) && B.act.get("i1").cap === "pink blossoms along a road" && !("vec64" in B.act.get("i1")), "B: activity record + meaning vector restored exactly (no vec64 leftover)");
ok(JSON.stringify(B.ls.get("taste")) === JSON.stringify(A.ls.get("taste")) && B.ls.get("blur") === false && JSON.stringify(B.ls.get("boardOrder")) === '["봄","여름"]', "B: taste (incl. muted words) and settings arrived");
ok(B.applied.length === 1 && B.applied[0].bm === 2 && B.applied[0].act === 1 && B.applied[0].kv.includes("taste") && B.applied[0].thumbs === 2, "B: onApply told the screen what changed: " + JSON.stringify(B.applied[0]));
ok(B.bm.get("i1")._th === 1, "B: record knows its thumbnail is on the server");
ok(Object.keys(JSON.parse(JSON.stringify(B.metaVal.q))).length === 0 && B.sy.status().pending === 0, "B: applying remote changes does not queue them for re-upload (no echo loop)");
const callsBefore = B.calls.length; await B.sy.run();
ok(B.thumbUp === 0 && B.applied.length === 1, "B: a second run with nothing new changes nothing");

// ---- 2. B 가 고치면 A 에 반영 ----
const b1 = B.bm.get("i1"); b1.boards = ["봄", "여행"]; b1.board = "봄"; b1.memo = "라일락도"; await B.putBm(b1);
await B.sy.run(); await A.sy.run();
ok(A.bm.get("i1").boards.length === 2 && A.bm.get("i1").memo === "라일락도", "edit on B shows up on A");
ok(B.thumbUp === 0, "editing metadata does not re-upload the thumbnail");
ok(A.bm.get("i1").blob && A.bm.get("i1").blob.size === 7, "A keeps its own local thumbnail through a remote edit");

// ---- 3. 삭제 ----
await A.delBm("i2"); await A.sy.run(); await B.sy.run();
ok(!B.bm.has("i2") && B.bm.has("i1"), "bookmark deleted on A disappears on B");
ok(B.applied.at(-1).bmGone.includes("i2"), "onApply lists the removed bookmark ids");

// ---- 4. 충돌: 나중에 고친 쪽이 이김 ----
const a1 = A.bm.get("i1"); a1.memo = "A가 먼저"; await A.putBm(a1);
const b1b = B.bm.get("i1"); b1b.memo = "B가 나중"; await B.putBm(b1b);
await A.sy.run(); await B.sy.run(); await A.sy.run();
ok(A.bm.get("i1").memo === "B가 나중" && B.bm.get("i1").memo === "B가 나중", "conflict: the later edit wins on both devices");
// 기기 시계가 뒤처져 서버에 거절돼도 서버 값을 따라감
const a1c = A.bm.get("i1"); a1c.memo = "시계 느린 기기"; a1c._v = 5; A.bm.set("i1", a1c); A.sy.mark("bm", "i1", 5);
await A.sy.run();
ok(A.bm.get("i1").memo === "B가 나중", "an older edit (slow clock) is overwritten by the server's newer value");

// ---- 5. 설정·취향 ----
B.setLs("blur", true); await B.sy.run(); await A.sy.run();
ok(A.ls.get("blur") === true && A.applied.at(-1).kv.includes("blur"), "setting changed on B reaches A");
A.setLs("recent", [{ q: "벚꽃", ts: 1 }]); await A.sy.run(); await B.sy.run();
ok(JSON.stringify(B.ls.get("recent")) === JSON.stringify([{ q: "벚꽃", ts: 1 }]), "recent searches sync");
A.setLs("pass", "secret"); A.setLs("priv", true); A.setLs("capDay", { d: "x", n: 3 });
await A.sy.run(); await B.sy.run();
ok(!B.ls.has("pass") && !B.ls.has("priv") && !B.ls.has("capDay"), "password, private mode and per-device counters never sync");

// ---- 6. 새 기기: 이미 쓰던 데이터 합치기 ----
const C = device(env);
await C.putBm({ id: "c1", title: "C 전용", thumb: "https://x/c1.jpg", tags: [], boards: [], ts: 9, blob: png(9) });
C.ls.set("blur", false); C.ls.set("boardOrder", ["덮어쓰면 안 됨"]); // 동기화 전부터 있던 값
await C.sy.run();
ok(C.bm.has("i1") && C.bm.has("c1"), "new device: server bookmarks arrive and its own bookmark is kept");
ok(JSON.stringify(C.ls.get("boardOrder")) === '["봄","여름"]' && C.ls.get("blur") === true, "new device: existing server settings win over fresh local defaults");
await A.sy.run(); ok(A.bm.has("c1") && A.bm.get("c1").blob?.size === 7, "A receives C's bookmark and thumbnail");

// ---- 7. R2 없음: 썸네일은 건너뛰고 레코드만 ----
const env2 = mkEnv({ SYNC_THUMBS: undefined });
const D = device(env2, "pw1", { thumbs: false }), E = device(env2, "pw1", { thumbs: false });
await D.putBm({ id: "d1", title: "R2 없음", thumb: "https://x/d1.jpg", tags: ["a"], boards: [], ts: 1, blob: png(4) });
await D.sy.run(); await E.sy.run();
ok(D.thumbUp === 0 && E.thumbDown === 0 && E.bm.get("d1")?.title === "R2 없음" && !E.bm.get("d1").blob, "no R2: records sync, thumbnails are not attempted, bookmark falls back to its source url");
ok(D.sy.status().err === "", "no R2: no error shown");

// ---- 8. 오프라인·오류 ----
const F = device(env), G = device(env);
await F.sy.run();
F.on = false; await F.putBm({ id: "f1", title: "오프라인에서 담음", thumb: "https://x/f1.jpg", tags: [], boards: [], ts: 1 });
ok(await F.sy.run() === null && F.sy.status().pending === 1, "offline: nothing is sent, the change waits in the queue");
F.on = true; await F.sy.run(); await G.sy.run();
ok(G.bm.has("f1") && F.sy.status().pending === 0, "back online: queued change goes out");
F.authFail = true; await F.putBm({ id: "f2", title: "암호 오류", thumb: "https://x/f2.jpg", tags: [], boards: [], ts: 2 });
await F.sy.run(); ok(F.sy.status().err === "auth" && F.sy.status().pending === 1, "auth error: reported, change kept for later");
F.authFail = false; await F.sy.run(); ok(F.sy.status().err === "" && F.sy.status().pending === 0, "recovers after the error");

// ---- 9. 많은 레코드 ----
const H = device(env), I = device(env);
for (let i = 0; i < 130; i++) await H.putAct({ id: "bulk" + i, title: "t" + i, wt: 2, ts: i, first: i, tags: ["x"], vec: i % 2 ? vecOf() : undefined });
await H.sy.run(); await I.sy.run();
ok(I.act.size >= 130 && [...I.act.keys()].filter((k) => k.startsWith("bulk")).length === 130, "130 activity records move in batches (25 up, 100 down per call): " + I.act.size);

// ---- 10. 계정·켜기/끄기·서버 지우기 ----
const J = device(env, "pw2");
await J.sy.run(); ok(J.bm.size === 0 && J.act.size === 0, "other password = empty separate account");
ok(A.sy.adopt("acctA") === "ok" && A.sy.adopt("acctA") === "ok" && A.sy.adopt("acctB") === "mismatch", "adopt: same account ok, different account detected");
A.sy.setOn(false); ok(A.sy.adopt("acctB") === "ok" && A.sy.isOn() === false, "when sync is off, no account prompt");
await A.putBm({ id: "off1", title: "꺼진 동안", thumb: "https://x/o.jpg", tags: [], boards: [], ts: 1 });
ok(A.sy.status().pending === 0, "marks while off are ignored (queue stays empty)");
const K = device(env); await K.sy.run();
ok(!K.bm.has("off1"), "changes made while sync was off are not uploaded");
A.sy.setOn(true); A.sy.merge("acctB"); await A.sy.run(); const K2 = device(env); await K2.sy.run();
ok(K2.bm.has("off1") && A.sy.adopt("acctB") === "ok", "turning sync back on (merge) uploads everything this device has");
await A.sy.wipeRemote(); ok(A.sy.isOn() === false, "wipe turns sync off on this device");
const L = device(env); await L.sy.run(); ok(L.bm.size === 0 && L.act.size === 0 && env.SYNC_THUMBS._m.size === 0, "wipe: server data and thumbnails are gone for this account");
const M = device(env, "pw2"); await M.putBm({ id: "p2", title: "다른 계정", thumb: "https://x/p2.jpg", tags: [], boards: [], ts: 1, blob: png(7) }); await M.sy.run();
await L.sy.wipeRemote?.(); const N = device(env, "pw2"); await N.sy.run(); ok(N.bm.has("p2"), "wiping one account leaves other accounts alone");

// ---- 11. 변경 목록이 앱을 껐다 켜도 남음 ----
const P = device(env); await P.sy.run();
await P.putBm({ id: "q1", title: "재시작 전", thumb: "https://x/q.jpg", tags: [], boards: [], ts: 1 });
const saved = JSON.parse(JSON.stringify(P.metaVal));
ok(P.sy.status().pending === 1, "pending queue counted");
await new Promise((r) => setTimeout(r, 0)); // 저장을 모으는 타이머는 시험에서 꺼 두었으므로 run 때 저장됨
await P.sy.run(); ok(P.metaVal.since > 0 && Object.keys(P.metaVal.q).length === 0, "after a run the cursor is saved and the queue is empty");


// ---- 12. 한 번에 25개를 넘게 고쳐도 아직 못 올린 내 변경이 서버의 옛 값에 덮이지 않음 ----
const Q = device(env), R = device(env);
for (let i = 0; i < 40; i++) await Q.putBm({ id: "many" + i, title: "m" + i, thumb: "https://x/m.jpg", tags: [], boards: [], ts: i, memo: "처음" });
await Q.sy.run(); await R.sy.run();
for (let i = 0; i < 40; i++) { const x = Q.bm.get("many" + i); x.memo = "고침"; await Q.putBm(x); }
await Q.sy.run(); await R.sy.run();
ok([...Array(40).keys()].every((i) => Q.bm.get("many" + i).memo === "고침" && R.bm.get("many" + i).memo === "고침"), "40 edits at once (more than one batch): none is reverted by older server values, all reach the other device");

console.log(fail ? `\n${fail} FAILED` : "\nall passed"); process.exit(fail ? 1 : 0);
