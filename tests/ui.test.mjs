import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../public/", import.meta.url).pathname;
const html = fs.readFileSync(ROOT + "index.html", "utf8").replace(/<script[^>]*><\/script>/g, "");
const css = fs.readFileSync(ROOT + "style.css", "utf8");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

// ---- 정적 점검: 확대 방지·입력칸 16px ----
ok(/maximum-scale=1/.test(html) && /user-scalable=no/.test(html), "viewport blocks page zoom");
ok(/html,body\{touch-action:pan-x pan-y/.test(css), "css: touch-action pan-x pan-y on html/body");
ok(/input\[type=search\],input\[type=password\]\{[^}]*font-size:16px/.test(css) && /select,textarea\{font-size:16px\}/.test(css), "css: inputs/select/textarea are 16px (no iOS focus zoom)");

const vc = new VirtualConsole(); // 화면 이동 같은 jsdom 미구현 경고는 숨김
const errors = []; vc.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { url: "https://app.test/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, ctx = dom.getInternalVMContext();
const run = (code) => vm.runInContext(code, ctx);

// ---- 가짜 환경 ----
w.localStorage.setItem("pass", JSON.stringify("pw"));
w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
w.HTMLImageElement.prototype.decode = () => Promise.resolve();
w.URL.createObjectURL = () => "blob:fake"; w.URL.revokeObjectURL = () => {};
w.matchMedia = () => ({ matches: false });
if (!w.AbortSignal.timeout) w.AbortSignal.timeout = (ms) => { const c = new w.AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
w.scrollTo = () => {}; w.Element.prototype.scrollTo = function () {};
const sources = [
  { id: "pixabay", name: "Pixabay", w: 1.1, en: false, colors: true, desc: "", keyless: false },
  { id: "openverse", name: "Openverse", w: 0.6, en: true, colors: false, desc: "", keyless: true },
];
let cfgCaption = false; const searchCalls = []; let trendsPayload = null;
const mk = (n, src = "pixabay", tags = ["sunset", "beach", "sea"], title = "") => ({ title, thumb: `https://x.test/${src}${n}.jpg`, full: `https://x.test/${src}${n}_full.jpg`, page: `https://x.test/p${n}`, w: 400, h: 300 + n * 10, tags, src, sc: false, adult: false });
w.fetch = async (url) => {
  const u = String(url), res = (o) => ({ ok: true, status: 200, json: async () => o, blob: async () => new w.Blob(["x"], { type: "image/jpeg" }) });
  if (u.startsWith("/api/config")) return res({ sources, locked: [], ai: false, caption: cfgCaption });
  if (u.startsWith("/api/search")) { searchCalls.push(u); const src = u.match(/src=(\w+)/)[1]; return res({ items: [1, 2, 3, 4, 5, 6].map((n) => mk(n, src)) }); }
  if (u.startsWith("/api/trends")) return res(trendsPayload);
  if (u.startsWith("/api/img")) return res({});
  return { ok: false, status: 404, json: async () => ({}) };
};
trendsPayload = { date: "2026-10-24", items: [
  { ...mk(1, "wiki", [], "손흥민"), grp: "news" }, { ...mk(2, "wiki", [], "Mount Fuji"), grp: "news" }, { ...mk(3, "wiki", [], "서울 야경"), grp: "news" },
  { ...mk(4, "pixabay", ["lake"], ""), grp: "pop" }, { ...mk(5, "pixabay", ["tree"], ""), grp: "pop" } ] };

run(fs.readFileSync(ROOT + "color.js", "utf8").replace(/^"use strict";/, ""));
vm.runInContext(fs.readFileSync(ROOT + "app.js", "utf8"), ctx);
await tick(150);
const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];

// ---- 홈: 카테고리 ----
ok(!$("#home").hidden && $("#login").hidden, "boot: home visible, login hidden");
let chips = $$("#homeChips button").map((b) => b.textContent);
ok(chips.length === 10 && chips.every((t) => /\S+ \S+/.test(t)), `home shows 10 broad categories: ${chips.slice(0, 4).join(", ")}…`);
const seen = new Set(chips.join("|").split("|")); let changed = false;
for (let i = 0; i < 6 && !changed; i++) { $("#homeShuffle").click(); const c2 = $$("#homeChips button").map((b) => b.textContent); changed = c2.join() !== chips.join(); }
ok(changed, "shuffle button gives a different set of categories");
$("#homeChips button").click(); await tick();
const sub = $$("#homeChips button").map((b) => b.textContent);
ok(!$("#homeBack").hidden && $("#homeShuffle").hidden && /전체 보기/.test(sub[0]) && sub.length >= 6, `drill-down shows sub topics: ${sub.slice(0, 3).join(", ")}…`);
ok(/^\S+ \S+/.test($("#homeTitle").textContent), "drill-down title shows category: " + $("#homeTitle").textContent);
$("#homeBack").click(); ok($("#homeBack").hidden && $$("#homeChips button").length === 10, "back returns to categories");

// ---- 검색창 ✕ ----
const q = $("#q"), qc = $("#qClear");
ok(qc.hidden, "clear button hidden when empty");
q.value = "바다"; q.dispatchEvent(new w.Event("input", { bubbles: true })); ok(!qc.hidden, "clear button shows when typing");
const pd = new w.Event("pointerdown", { cancelable: true, bubbles: true }); qc.dispatchEvent(pd); ok(pd.defaultPrevented, "clear button keeps keyboard (pointerdown prevented)");
qc.click(); ok(q.value === "" && qc.hidden, "clear button empties input in one tap");

// ---- 검색 + 색상 필터 소스 선택 ----
run('startSearch("sunset")'); await tick(900);
ok(searchCalls.length === 2 && ["pixabay", "openverse"].every((s) => searchCalls.some((c) => c.includes("src=" + s))), "no color: both sources searched");
ok(!$("#qClear").hidden && $("#q").value === "sunset", "clear button visible after a search fills the box");
searchCalls.length = 0;
run('S.color = "red"; rerun()'); await tick(900);
ok(searchCalls.length === 1 && /src=pixabay/.test(searchCalls[0]) && /color=red/.test(searchCalls[0]), "color (accurate mode): only color-capable source queried: " + searchCalls.map((c) => c.match(/src=\w+/)[0]));
ok($$("#stat .sc.idle").length === 1 && /Openverse/.test($("#stat .sc.idle").textContent) && !/…/.test($("#stat .sc.idle").textContent), "unused source is dimmed, not stuck on '…'");
$("#filterBtn").click(); ok(!$("#cwRow").hidden && /빠르고 정확/.test($("#colorNote").textContent), "filter panel shows accurate/wide switch + note");
searchCalls.length = 0; $$("#cwSeg button")[1].click(); await tick(900);
ok(searchCalls.length === 2, "wide mode queries all sources again");
ok(run("S.colorWide") === true && /모든 소스/.test($("#colorNote").textContent), "wide mode remembered and explained");
run('S.colorWide = false; LS.set("cw", false)');
$("#filterBtn").click(); ok(!$("#filters").hidden, "filter panel open"); $("#filterClose").click(); ok($("#filters").hidden, "filter panel closes with its 닫기 button");
$("#srcBtn").click(); ok(!$("#srcPanel").hidden, "source panel open"); $("#srcClose").click(); ok($("#srcPanel").hidden, "source panel closes with its 닫기 button");
run('S.color = ""; rerun()'); await tick(900);

// ---- 뷰어 + 닫기 ----
ok($$("#grid .card").length >= 6, `search cards rendered: ${$$("#grid .card").length}`);
$("#grid .card").click(); await tick(60);
ok(!$("#viewer").hidden, "viewer opens on card tap");
$("#vfab").click(); await tick(60); ok($("#viewer").hidden, "floating 닫기 button closes viewer");
$("#grid .card").click(); await tick(60); $("#vclose").click(); await tick(60); ok($("#viewer").hidden, "top ✕ closes viewer");

// ---- 확대·축소 ----
$("#grid .card").click(); await tick(60);
const wrap = $(".vwrap"), vimg = $("#vimg"), stage = $(".vstage");
Object.defineProperty(wrap, "clientWidth", { value: 400 }); Object.defineProperty(wrap, "clientHeight", { value: 600 });
Object.defineProperty(vimg, "clientWidth", { value: 400 }); Object.defineProperty(vimg, "clientHeight", { value: 300 });
wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 600 });
const ptr = (type, id, x, y, el = wrap) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0 }); el.dispatchEvent(e); };
const Z = () => run("({s:Z.s,x:Z.x,y:Z.y})");
const gs = new w.Event("gesturestart", { cancelable: true, bubbles: true }); w.document.dispatchEvent(gs); ok(gs.defaultPrevented, "iOS pinch gesture on the page is blocked");
ok(Z().s === 1 && !stage.classList.contains("zoomed") && $("#vzreset").hidden, "starts at 1x");
ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300); ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300);
ok(Z().s === 2.5 && stage.classList.contains("zoomed") && !$("#vzreset").hidden && /scale\(2\.5\)/.test(vimg.style.transform), "double-tap zooms to 2.5x and shows reset button");
const idx0 = run("lv().cur");
ptr("pointerdown", 1, 200, 300); ptr("pointermove", 1, 140, 320); ptr("pointerup", 1, 140, 320);
ok(Z().x === -60 && Z().y === 20, `drag pans the zoomed image: ${JSON.stringify(Z())}`);
ok(run("lv().cur") === idx0, "dragging while zoomed does not flip to the next image");
ptr("pointerdown", 1, 100, 300); ptr("pointermove", 1, 800, 300); ptr("pointerup", 1, 800, 300);
ok(Z().x === 300, "pan is clamped to the image edge: x=" + Z().x);
ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300); ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300);
ok(Z().s === 1 && !stage.classList.contains("zoomed") && vimg.style.transform === "", "double-tap again returns to 1x");
ptr("pointerdown", 1, 150, 300); ptr("pointerdown", 2, 250, 300); ptr("pointermove", 1, 100, 300); ptr("pointermove", 2, 300, 300);
ok(Math.abs(Z().s - 2) < 0.01, "pinch out doubles the zoom: " + Z().s);
ptr("pointerup", 1, 100, 300); ptr("pointerup", 2, 300, 300);
ok(Z().s > 1.9, "lifting fingers keeps the zoom");
$("#vzreset").click(); ok(Z().s === 1 && $("#vzreset").hidden, "원래 크기 button resets");
ptr("pointerdown", 1, 150, 300); ptr("pointerdown", 2, 250, 300); ptr("pointermove", 1, 190, 300); ptr("pointermove", 2, 210, 300);
ok(Z().s === 1, "pinch in at 1x does not shrink below 1x"); ptr("pointerup", 1, 190, 300); ptr("pointerup", 2, 210, 300);
const before = run("lv().cur"); ptr("pointerdown", 1, 320, 300); ptr("pointerup", 1, 200, 310); await tick(30);
ok(run("lv().cur") === before + 1, "swipe left at 1x still goes to the next image");
const wheel = new w.Event("wheel", { cancelable: true, bubbles: true }); Object.assign(wheel, { ctrlKey: true, deltaY: -50, clientX: 200, clientY: 300 }); wrap.dispatchEvent(wheel);
ok(Z().s > 1 && wheel.defaultPrevented, "ctrl+wheel zooms on desktop"); $("#vzreset").click();
$("#vclose").click(); await tick(60); ok(Z().s === 1, "zoom resets when viewer closes");

// ---- 비슷한 이미지: 검색어에 색 이름, 색 기준 재정렬 ----
const sc = (it, cap, cw) => run(`simCandidates(${JSON.stringify(it)}, ${JSON.stringify(cap)}, ${JSON.stringify(cw)})`);
let c = sc({ tags: ["sunset", "beach", "sea"], title: "" }, "", "orange");
ok(c[0] === "sunset beach orange" && c.includes("sunset beach sea"), "tags + color word first: " + c.slice(0, 3).join(" / "));
c = sc({ tags: ["red", "poppy"], title: "" }, "", "red"); ok(c[0] === "red poppy", "color word not duplicated: " + c[0]);
c = sc({ tags: [], title: "서울 야경 사진" }, "", "blue"); ok(c[0].endsWith("파랑"), "Korean query gets Korean color word: " + c[0]);
c = sc({ tags: ["a1"], title: "x" }, "city night lights bridge", "blue"); ok(c[0] === "city night lights bridge", "AI caption stays first and unchanged: " + c[0]);
// 재정렬
$("#grid .card").click(); await tick(60);
ok(run("lv()") && true, "viewer open for rerank test");
run(`(() => { const l = lv(); const CT = ColorTools; const rgb = (r,g,b)=>{const a=new Uint8ClampedArray(16*16*4);for(let i=0;i<256;i++){a[i*4]=r;a[i*4+1]=g;a[i*4+2]=b;a[i*4+3]=255;}return CT.shares(a,16,16);};
  l.sig = rgb(40,120,230); l.m.clear(); l.rrDone = 0;
  const cols = [[220,30,30],[220,30,30],[220,30,30],[30,150,60],[30,150,60],[30,150,60],[40,120,230],[40,125,225],[45,118,235]];
  window.__its = cols.map((c,i)=>({ id:"r"+i, title:"c"+i, thumb:"https://x.test/r"+i, full:"https://x.test/r"+i, src:"pixabay", tags:[], sh: rgb(...c) }));
  l.m.add(window.__its.map((it)=>makeCard(it, ()=>{}))); })()`);
run("simRerank(lv())");
const order = run("lv().m.cards.map(c => c._it.title).join()");
ok(/^c6,c7,c8/.test(order), "similar images re-ordered so same-color ones come first: " + order);
ok(run("lv().rrDone") === 1, "rerank counted");
run("lv().m.reorder((a,b)=> a._it.id < b._it.id ? -1 : 1); lv().rrDone = 2; simRerank(lv())");
ok(run("lv().m.cards[0]._it.title") === "c0", "no more than two reranks per image");
$("#vclose").click(); await tick(60);

// ---- 트렌드: 이미지 그리드 ----
$("#tabTr").click(); await tick(100);
ok(!$("#trends").hidden && $$("#trGrid .card").length === 5, `trends tab shows an image grid: ${$$("#trGrid .card").length} cards`);
ok(!$("#trLang") && !$("#trChips"), "no country/language selector or word chips");
ok(/2026-10-24/.test($("#trNote").textContent), "trend note shows date");
$$("#trSeg button")[2].click(); ok($$("#trGrid .card").length === 2, "인기 사진 filter shows only popular photos");
$$("#trSeg button")[1].click(); ok($$("#trGrid .card").length === 3, "요즘 화제 filter shows only wiki news photos");
$$("#trSeg button")[0].click(); ok($$("#trGrid .card").length === 5, "전체 shows all");
ok($$("#trGrid .card .tag").some((t) => t.textContent === "위키백과"), "wiki items labelled 위키백과");
$("#trGrid .card").click(); await tick(60); ok(!$("#viewer").hidden && /손흥민/.test($("#vtitle").textContent), "trend image opens in viewer");
$("#vfab").click(); await tick(60);
$("#tabFeed").click(); $("#homeBtn").click(); await tick(60);
$("#exTrend").click(); await tick(60); ok(!$("#trends").hidden, "home 요즘 화제 button opens trends tab");

// ---- 홈으로 ----
$("#homeBtn").click(); await tick(60); ok(!$("#home").hidden && $("#q").value === "" && $("#qClear").hidden, "⌂ returns to home and clears the box");

// ---- 시트 닫기 ----
$("#gear").click(); ok(!$("#settings").hidden, "settings opens");
$("#settings").click(); ok($("#settings").hidden, "tap outside closes settings");
$("#gear").click(); $("#closeSet").click(); ok($("#settings").hidden, "bottom 닫기 button closes settings");
$("#gear").click(); const grab = $("#settings .grab");
ptr("pointerdown", 5, 100, 100, grab); ptr("pointermove", 5, 100, 130, grab); ptr("pointerup", 5, 100, 130, grab);
ok(!$("#settings").hidden && $("#settings .bsheet").style.transform === "", "short drag on handle snaps back");
ptr("pointerdown", 5, 100, 100, grab); ptr("pointermove", 5, 100, 220, grab); ptr("pointerup", 5, 100, 220, grab);
ok($("#settings").hidden, "dragging the handle down closes settings");
$("#bmSheet").hidden = false; $("#bmSheet").click(); ok($("#bmSheet").hidden, "tap outside closes 보드·메모 sheet");
$("#bmSheet").hidden = false; $("#bmCancel").click(); ok($("#bmSheet").hidden, "취소 closes 보드·메모 sheet");
$("#gear").click(); w.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }), { key: "Escape" })); ok($("#settings").hidden, "Esc closes settings");

// ---- 북마크 검색 ✕ ----
$("#tabBm").click(); await tick(60);
$("#bmq").value = "abc"; $("#bmq").dispatchEvent(new w.Event("input", { bubbles: true })); ok(!$("#bmClear").hidden, "bookmark search ✕ shows");
$("#bmClear").click(); ok($("#bmq").value === "" && run("S.bmq") === "", "bookmark search ✕ clears");

ok(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.slice(0, 3).join(" ; ") : ""));
console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
