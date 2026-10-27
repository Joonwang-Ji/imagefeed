// 선정성 판정·블러 점검: 평범한 사진(성경책 위의 손 등)은 블러하지 않고, 트렌드에서는 노골적인 이미지를 아예 뺀다
// 실행: npm install --no-save jsdom && node tests/safety.test.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../public/", import.meta.url).pathname;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const load = (f) => { const sb = { module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(ROOT + f, "utf8"), sb); return sb.module.exports; };

// ======== 1) 순수 함수: Safety.judge / ColorTools.skin ========
const { judge } = load("safety.js"), CT = load("color.js");
const sc = (o) => ({ Porn: 0, Hentai: 0, Sexy: 0, Neutral: 0, Drawing: 0, ...o });
ok(!judge(sc({ Sexy: 0.75, Neutral: 0.2 }), 0.08, "").adult, "hand on a bible: Sexy 0.75 with little skin is NOT adult (old rule flagged it at 0.7)");
ok(!judge(sc({ Sexy: 0.9, Neutral: 0.1 }), 0.1, "").adult, "high Sexy score but almost no skin area -> not adult");
ok(!judge(sc({ Sexy: 0.9 }), 0.3, "성경책 위에 손").adult, "bible context needs near-certainty: Sexy 0.9 not adult");
ok(!judge(sc({ Sexy: 0.9, Porn: 0.2 }), 0.3, "Open book on a table").adult, "open book context stays unflagged");
ok(judge(sc({ Sexy: 0.9 }), 0.3, "beach photo").adult && !judge(sc({ Sexy: 0.9 }), 0.3, "beach photo").explicit, "real Sexy photo with skin -> adult (blur) but not explicit");
ok(judge(sc({ Porn: 0.8, Sexy: 0.1 }), 0.4, "").explicit, "high Porn with skin -> explicit");
ok(judge(sc({ Hentai: 0.7 }), 0.02, "").explicit, "drawn explicit content (Hentai) is explicit even without photo skin tones");
ok(!judge(sc({ Porn: 0.7 }), 0.03, "").adult, "Porn score with no skin at all is not trusted (false alarm on non-skin images)");
ok(judge(sc({ Porn: 0.9 }), 0.5, "church service").explicit, "even in a safe context, overwhelming evidence still flags");
ok(!judge(sc({ Sexy: 0.5, Porn: 0.2 }), 0.4, "").adult, "moderate scores are not flagged");
ok(judge(sc({ Sexy: 0.5, Porn: 0.5 }), 0.4, "").adult, "combined Porn+Sexy evidence is flagged");
const px = (r, g, b, n = 100) => Array.from({ length: n }).flatMap(() => [r, g, b, 255]);
ok(CT.skin(px(224, 172, 135)) > 0.9, "skin tone pixels -> high skin share");
ok(CT.skin(px(30, 90, 200)) === 0 && CT.skin(px(240, 240, 240)) === 0, "blue and white pixels -> no skin");
ok(CT.skin(px(60, 40, 30)) === 0, "dark brown book cover -> no skin");

// ======== 2) 화면: 트렌드에서 노골적 이미지 제거, 블러 오탐 줄이기, 이미지별 블러 해제, 북마크 재검사 ========
const html = fs.readFileSync(ROOT + "index.html", "utf8").replace(/<script[^>]*><\/script>/g, "");
const vc = new VirtualConsole(); const errors = []; vc.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { url: "https://app.test/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, ctx = dom.getInternalVMContext(), run = (c) => vm.runInContext(c, ctx);
w.localStorage.setItem("pass", JSON.stringify("pw"));
// 이미지 로딩 감시기는 즉시 "보임"으로 처리, 무한 스크롤 감시기는 가만히 둠
w.IntersectionObserver = class { constructor(cb, o) { this.cb = cb; this.auto = o?.rootMargin === "800px 0px"; } observe(el) { if (this.auto) setTimeout(() => this.cb([{ isIntersecting: true, target: el }]), 0); } unobserve() {} disconnect() {} };
w.HTMLImageElement.prototype.decode = () => Promise.resolve();
w.URL.createObjectURL = () => "blob:fake"; w.URL.revokeObjectURL = () => {};
w.matchMedia = () => ({ matches: false });
if (!w.AbortSignal.timeout) w.AbortSignal.timeout = (ms) => { const c = new w.AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
w.scrollTo = () => {}; w.Element.prototype.scrollTo = function () {};
const sources = [{ id: "pixabay", name: "Pixabay", w: 1.1, en: false, colors: true, desc: "", keyless: false }];
const it = (n, title, tags = []) => ({ title, tags, thumb: `https://x.test/${n}.jpg`, full: `https://x.test/${n}_full.jpg`, page: `https://x.test/p${n}`, w: 400, h: 300 + n * 7, src: "pixabay", adult: false });
let trends = [], results = [];
w.fetch = async (url) => {
  const u = String(url), res = (o) => ({ ok: true, status: 200, json: async () => o, blob: async () => new w.Blob(["x"], { type: "image/jpeg" }) });
  if (u.startsWith("/api/config")) return res({ sources, locked: [], ai: false, caption: false });
  if (u.startsWith("/api/trends")) return res({ date: "2026-10-27", items: trends });
  if (u.startsWith("/api/search")) return res({ items: results });
  if (u.startsWith("/api/img")) return res({});
  return { ok: false, status: 404, json: async () => ({}) };
};
for (const f of ["color.js", "relevance.js", "safety.js", "taste.js", "avoid.js"]) run(fs.readFileSync(ROOT + f, "utf8").replace(/^"use strict";/, ""));
vm.runInContext(fs.readFileSync(ROOT + "app.js", "utf8"), ctx);
// 가짜 AI 모델: 카드 제목에 따라 점수를 돌려줌
const SCORES = { "Normal view": { Neutral: 0.95 }, "Explicit thing": { Porn: 0.9 }, "Marble statue": { Sexy: 0.95 }, "Bible with hand": { Sexy: 0.9, Neutral: 0.1 }, "beach photo": { Sexy: 0.92 }, "Saved bible": { Sexy: 0.9 }, "Saved normal": { Neutral: 0.9 } };
await tick(150);
run(`getModel = async () => ({ classify: async (img) => { const t = img.closest(".card")._it.title; const s = ${JSON.stringify(SCORES)}[t] || {}; return ["Porn", "Hentai", "Sexy", "Neutral", "Drawing"].map((k) => ({ className: k, probability: s[k] || 0 })); } })`);
const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
const stOf = (grid) => Object.fromEntries($$(grid + " .card").map((c) => [c._it.title, c.dataset.st]));

// -- 트렌드 --
trends = [{ ...it(1, "Normal view"), grp: "pop" }, { ...it(2, "Explicit thing"), grp: "pop" }, { ...it(3, "Marble statue"), grp: "pop", adult: false }];
$("#tabTr").click(); await tick(400);
let st = stOf("#trGrid");
ok(st["Normal view"] === "ok", "trends: normal image shown normally");
ok(!("Explicit thing" in st), "trends: explicit image (AI Porn score) is removed, not blurred: " + JSON.stringify(st));
ok(st["Marble statue"] === "flag", "trends: non-explicit nude-looking art stays but is blurred");
run("S.blur = false");
trends = [{ ...it(4, "Explicit thing"), grp: "pop" }, { ...it(5, "Normal view"), grp: "pop" }];
$("#trRefresh").click(); await tick(400);
st = stOf("#trGrid");
ok(!("Explicit thing" in st) && st["Normal view"] === "ok", "trends: explicit image is removed even when the blur setting is off");
run("S.blur = true");
$("#tabFeed").click(); await tick(50);

// -- 검색 결과 블러 오탐 --
results = [it(10, "Bible with hand"), it(11, "beach photo"), it(12, "Normal view")];
run('startSearch("photo")'); await tick(500);
st = stOf("#grid");
ok(st["Bible with hand"] === "ok", "search: bible-with-hand is not blurred even with a high Sexy score");
ok(st["beach photo"] === "flag", "search: a genuinely flagged photo is still blurred");
ok(st["Normal view"] === "ok", "search: normal image not blurred");

// -- 이미지별 블러 해제 --
const flagged = $$("#grid .card").find((c) => c._it.title === "beach photo");
flagged.click(); await tick(50); // 블러 상태에서 탭하면 먼저 블러를 풀어 보여 줌(기존 동작)
flagged.classList.remove("reveal"); flagged._it.revealed = false;
run("openViewer(M.items, M.items.findIndex((x) => x.title === 'beach photo'))"); await tick(100);
ok(!$("#vsafe").hidden && !$("#vveil").hidden, "viewer: a blurred image shows the [블러 해제] button");
$("#vsafe").click(); await tick(50);
ok($("#vsafe").hidden && $("#vveil").hidden && !$("#vimg").classList.contains("blur"), "viewer: pressing it removes the blur");
ok(flagged.dataset.st === "ok" && flagged._it.safe === true && flagged._it.adult === false, "the card in the feed is also unblurred and remembered as safe");
$("#vclose").click(); await tick(50);

// -- 북마크: AI가 걸었던 것은 지금 기준으로 다시 검사, 키워드로 걸린 것은 유지, 직접 해제한 것은 유지 --
const blob = new w.Blob(["x"], { type: "image/jpeg" });
const recs = [
  { id: "b1", title: "Saved bible", thumb: "https://x.test/b1.jpg", full: "https://x.test/b1.jpg", src: "pixabay", tags: [], adult: true, ts: 3, blob },            // 예전 기준에서 오탐으로 저장됨
  { id: "b2", title: "Saved normal", thumb: "https://x.test/b2.jpg", full: "https://x.test/b2.jpg", src: "pixabay", tags: [], adult: true, adultSrc: "kw", ts: 2, blob }, // 키워드로 걸림
  { id: "b3", title: "Hand released", thumb: "https://x.test/b3.jpg", full: "https://x.test/b3.jpg", src: "pixabay", tags: [], adult: false, safe: true, ts: 1, blob },
];
w.__recs = recs; run("DB.all = async () => __recs");
$("#tabBm").click(); await tick(500);
st = stOf("#bmgrid");
ok(st["Saved bible"] === "ok", "bookmarks: an old AI false alarm (bible) is cleared by the new check: " + JSON.stringify(st));
ok(st["Saved normal"] === "flag", "bookmarks: a keyword-flagged bookmark stays blurred");
ok(st["Hand released"] === "ok", "bookmarks: an image the user released stays unblurred");

ok(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.slice(0, 3).join(" ; ") : ""));
console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
