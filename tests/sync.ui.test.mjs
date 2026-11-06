// 23차: 기기 간 동기화 화면 점검. 진짜 app.js + sync.js 를 가상 브라우저(jsdom + fake-indexeddb)에서 돌리고, 서버는 진짜 src/ 코드 + D1 대역에 연결합니다.
// 기기 두 대(= 가상 브라우저 두 개)로 북마크 저장 → 동기화 → 다른 기기에 나타나는지 확인합니다.
//   준비: npm install --no-save jsdom fake-indexeddb
import { JSDOM, VirtualConsole } from "jsdom";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs"; import vm from "node:vm";
import worker from "../src/index.js";
const ROOT = new URL("../public/", import.meta.url).pathname;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql) => { const mk = (args) => ({ bind: (...a) => mk(a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    all: async () => ({ results: db.prepare(sql).all(...args).map((x) => ({ ...x })) }),
    _exec: () => { if (/^\s*select/i.test(sql)) return { results: db.prepare(sql).all(...args).map((x) => ({ ...x })), meta: { changes: 0 } }; const r = db.prepare(sql).run(...args); return { results: [], meta: { changes: Number(r.changes) } }; } }); return mk([]); };
  return { prepare: stmt, batch: async (l) => l.map((s) => s._exec()) };
}
function fakeR2() { const m = new Map(); return { put: async (k, b, o) => { m.set(k, { b: new Uint8Array(b), t: o?.httpMetadata?.contentType }); }, get: async (k) => { const x = m.get(k); return x ? { body: x.b, httpMetadata: { contentType: x.t } } : null; }, delete: async (k) => { for (const x of Array.isArray(k) ? k : [k]) m.delete(x); }, list: async ({ prefix }) => ({ objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }), _m: m }; }

const html = fs.readFileSync(ROOT + "index.html", "utf8").replace(/<script[^>]*><\/script>/g, "");
const SCRIPTS = ["color.js", "relevance.js", "safety.js", "taste.js", "interests.js", "avoid.js", "sync.js", "app.js"];
const env = { PASS: "pw", PASS_MORE: "pw-b", ASSETS: { fetch: () => new Response("a") }, SYNC_DB: fakeD1(), SYNC_THUMBS: fakeR2(), PIXABAY_KEY: "" };

async function bootDevice(pass, { sync = true } = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { url: "https://app.test/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, ctx = dom.getInternalVMContext(), run = (c) => vm.runInContext(c, ctx);
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
  w.localStorage.setItem("pass", JSON.stringify(pass));
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLImageElement.prototype.decode = () => Promise.resolve();
  w.URL.createObjectURL = () => "blob:fake"; w.URL.revokeObjectURL = () => {};
  w.matchMedia = () => ({ matches: false }); w.scrollTo = () => {}; w.Element.prototype.scrollTo = function () {};
  if (!w.AbortSignal.timeout) w.AbortSignal.timeout = (ms) => { const c = new w.AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  w.confirm = () => true;
  const dev = { w, run, errors, calls: [], $: (s) => w.document.querySelector(s), $$: (s) => [...w.document.querySelectorAll(s)], confirmAnswer: true };
  w.confirm = () => dev.confirmAnswer;
  w.fetch = async (url, init = {}) => {
    const u = String(url); dev.calls.push(u);
    const wrap = (r) => ({ ok: r.ok, status: r.status, json: () => r.json(), blob: async () => { const b = await r.blob(); return new Blob([await b.arrayBuffer()], { type: b.type }); }, clone() { return wrap(r.clone()); } });
    if (u.startsWith("/api/sync") && !sync) return { ok: false, status: 501, json: async () => ({ error: "sync off" }) };
    if (u.startsWith("/api/config") || u.startsWith("/api/sync")) {
      let body = init.body; if (body && typeof body.arrayBuffer === "function") body = new Uint8Array(await body.arrayBuffer());
      const r = await worker.fetch(new Request("https://x.test" + u, { method: init.method || "GET", body, headers: { ...(init.headers || {}) } }), sync ? env : { ...env, SYNC_DB: undefined, SYNC_THUMBS: undefined });
      return wrap(r);
    }
    if (u.startsWith("/api/search") || u.startsWith("/api/trends")) return { ok: true, status: 200, json: async () => ({ items: [], topics: [], more: false }) };
    if (u.startsWith("/api/img")) return { ok: true, status: 200, json: async () => ({}), blob: async () => new Blob([new Uint8Array([137, 80, 78, 71, 7, 7, 7])], { type: "image/png" }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  for (const f of SCRIPTS) run(fs.readFileSync(ROOT + f, "utf8").replace(/^"use strict";/, ""));
  await tick(250);
  return dev;
}
const item = (n, extra = {}) => ({ id: "it" + n, title: "벚꽃 " + n, thumb: `https://x.test/t${n}.jpg`, full: `https://x.test/f${n}.jpg`, page: `https://x.test/p${n}`, src: "pixabay", w: 400, h: 300, tags: ["벚꽃", "봄", "t" + n], ...extra });
const bmCount = (d) => d.run("DB.all().then((a) => a.length)");

// ---- 1. 설정 화면: 서버가 지원하면 켜져 있음, 아니면 안내 ----
const A = await bootDevice("pw");
A.$("#gear").click(); await tick();
ok(!A.$("#syncCtl").hidden && A.$("#syncOff").hidden && A.$("#sSync").checked, "settings: sync controls shown and ON by default when the server supports it");
A.$("#closeSet").click();
const NO = await bootDevice("pw", { sync: false });
NO.$("#gear").click(); await tick();
ok(NO.$("#syncCtl").hidden && !NO.$("#syncOff").hidden && /docs\/sync-setup/.test(NO.$("#syncOff").textContent), "settings: server without D1 shows a how-to note and no controls");
ok(!NO.calls.some((c) => c.startsWith("/api/sync")), "server without D1: the app never calls /api/sync");
ok(NO.errors.length === 0, "no page errors without sync: " + NO.errors.join("|"));

// ---- 2. A 에서 북마크 → 동기화 → B 에 나타남 ----
await A.run(`toggleBookmark(${JSON.stringify(item(1))}, "봄")`); await tick(100);
await A.run(`toggleBookmark(${JSON.stringify(item(2))})`); await tick(100);
ok(await bmCount(A) === 2, "A: two bookmarks saved locally");
A.$("#gear").click(); await tick();
A.$("#syncNow").click(); await tick(600);
ok(/마지막 동기화/.test(A.$("#syncNote").textContent) && !/대기 \d+개/.test(A.$("#syncNote").textContent), "A: status shows last sync time, nothing waiting: " + A.$("#syncNote").textContent);
ok(env.SYNC_THUMBS._m.size === 2, "A: both bookmark thumbnails are on the server (R2)");
A.run('LS.set("blur", false); LS.set("boardOrder", ["봄", "여름"])'); await tick(50);
A.$("#syncNow").click(); await tick(600);

const B = await bootDevice("pw");
await B.run("SYN.sy.run()"); await tick(300);
ok(await bmCount(B) === 2, "B: both bookmarks arrived from A");
const bRec = await B.run("DB.all().then((a) => a.find((x) => x.id === 'it1'))");
ok(bRec && bRec.title === "벚꽃 1" && (bRec.boards || []).includes("봄") && bRec.blob, "B: bookmark keeps title, board and its thumbnail image");
ok(await B.run("S.bmIds.size") === 2 && /\(2\)/.test(B.$("#bmc").textContent), "B: screen count/stars updated after sync: " + B.$("#bmc").textContent);
ok(await B.run('LS.get("blur", true)') === false && await B.run("S.blur") === false && B.$("#bmsort") && B.w.document.body.classList.contains("noblur"), "B: setting from A applied live (blur off → body.noblur)");
ok(JSON.stringify(await B.run('LS.get("boardOrder", [])')) === '["봄","여름"]', "B: board order arrived");
ok(await B.run("SYN.sy.status().pending") === 0, "B: nothing queued after receiving (no echo)");

// ---- 3. B 에서 지움 → A 에서 사라짐 ----
await B.run("(async () => { await DB.del('it2'); S.bmIds.delete('it2'); })()"); await tick(50);
ok(await B.run("SYN.sy.status().pending") === 1, "B: delete queued");
await B.run("SYN.sy.run()"); await A.run("SYN.sy.run()"); await tick(200);
ok(await bmCount(A) === 1 && await A.run("S.bmIds.size") === 1 && await A.run("S.bmIds.has('it2')") === false, "A: bookmark deleted on B is gone from A (list and star state)");
ok(env.SYNC_THUMBS._m.size === 1, "server: the deleted bookmark's thumbnail was removed");

// ---- 4. 활동 기록(취향 학습) 이 같이 움직임 ----
ok(await A.run("ACT.load().then((m) => m.size)") >= 1, "A: activity recorded for the bookmark");
await B.run("SYN.sy.run()"); await tick(100);
ok(await B.run("ACT.load().then((m) => m.has('it1'))") === true, "B: the activity record (bookmark = reaction) arrived too");
await A.run("ACT.clear()"); await tick(50);
await A.run("SYN.sy.run()"); await B.run("SYN.sy.run()"); await tick(100);
ok(await B.run("ACT.load().then((m) => m.size)") === 0, "clearing taste/activity on A clears it on B too (deletes sync)");

// ---- 5. 다른 암호 = 다른 계정 ----
const C = await bootDevice("pw-b");
await C.run("SYN.sy.run()"); await tick(200);
ok(await bmCount(C) === 0, "other password sees none of these bookmarks");

// ---- 6. 끄기·서버 지우기 ----
A.$("#gear").click(); await tick();
A.$("#sSync").checked = false; A.$("#sSync").dispatchEvent(new A.w.Event("change", { bubbles: true })); await tick();
ok(/꺼져/.test(A.$("#syncNote").textContent) && await A.run("SYN.sy.isOn()") === false, "turning the checkbox off stops syncing");
await A.run(`toggleBookmark(${JSON.stringify(item(9))}, "봄")`); await tick(100);
ok(await A.run("SYN.sy.status().pending") === 0, "while off, new bookmarks are not queued");
A.$("#sSync").checked = true; A.$("#sSync").dispatchEvent(new A.w.Event("change", { bubbles: true })); await tick(800);
ok(await A.run("SYN.sy.isOn()") === true, "turning it back on re-syncs everything on this device");
const D = await bootDevice("pw"); await D.run("SYN.sy.run()"); await tick(300);
ok(await D.run("DB.all().then((a) => a.some((x) => x.id === 'it9'))") === true, "…including what was saved while it was off");
A.confirmAnswer = false; A.$("#syncWipe").click(); await tick(100);
ok(env.SYNC_THUMBS._m.size > 0, "wipe asks first: cancel keeps the server data");
A.confirmAnswer = true; A.$("#syncWipe").click(); await tick(400);
ok(env.SYNC_THUMBS._m.size === 0 && await A.run("SYN.sy.isOn()") === false && await bmCount(A) >= 1, "wipe: server data gone, sync turned off, this device keeps its bookmarks");

// ---- 7. 다른 계정 데이터가 남은 기기: 확인 후 합치기 / 안 합치기 ----
const E = await bootDevice("pw-b");
await E.run(`toggleBookmark(${JSON.stringify(item(30))}, "")`); await tick(100);
await E.run("SYN.sy.run()"); await tick(200);
E.w.localStorage.setItem("pass", JSON.stringify("pw")); // 같은 기기에서 다른 암호로 다시 접속
const metaBefore = JSON.parse(E.w.localStorage.getItem("sync")); ok(!!metaBefore.acct, "device remembers which account its data belongs to");
E.run('S.pass = "pw"; cfg = null'); let asked = 0; E.confirmAnswer = false; E.w.confirm = (m) => { asked++; return E.confirmAnswer; };
await E.run('(async () => { cfg = await (await api("/api/config")).json(); setupSync(); })()'); await tick(100);
ok(asked === 1 && await E.run("SYN.sy.isOn()") === false, "different account on this device: asks once, 'cancel' turns sync off here");
await E.run('setupSync()'); ok(asked === 1, "after saying no it does not ask again every launch");
E.run('SYN.sy.setOn(true)');
const metaMid = JSON.parse(E.w.localStorage.getItem("sync")); metaMid.acct = "other"; E.w.localStorage.setItem("sync", JSON.stringify(metaMid));
E.w.confirm = () => true; E.run('SYN.sy = null'); await E.run('(async () => { cfg = await (await api("/api/config")).json(); ensureSync(); setupSync(); })()'); await tick(900);
const F = await bootDevice("pw"); await F.run("SYN.sy.run()"); await tick(300);
ok(await F.run("DB.all().then((a) => a.some((x) => x.id === 'it30'))") === true, "'OK' merges this device's old bookmarks into the new account");

// ---- 8. 오류 없음 ----
ok([A, B, C, D, E, F].every((d) => d.errors.length === 0), "no page errors in any device: " + [A, B, C, D, E, F].flatMap((d) => d.errors).join("|"));

console.log(fail ? `\n${fail} FAILED` : "\nall passed"); process.exit(fail ? 1 : 0);
