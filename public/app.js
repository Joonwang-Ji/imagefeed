"use strict";
// ---------- 기본 도구 ----------
const $ = (s, r = document) => r.querySelector(s);
const enc = encodeURIComponent;
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const hasHangul = (s) => /[ㄱ-ㆎ가-힣]/.test(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function hashId(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function keyOf(it) { try { const u = new URL(it.full); return (u.host + u.pathname).toLowerCase(); } catch { return it.full || it.thumb; } }
const STOP = new Set(["이미지", "사진", "블로그", "네이버", "다음", "티스토리", "photo", "image", "images", "stock", "free", "무료", "the", "and", "for", "with", "from", "jpg", "png"]);
function tokens(s) { return (String(s).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter((w) => !STOP.has(w) && !/^\d+$/.test(w)); }
function toast(t, ms = 2800) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_CHIPS = ["미니멀 인테리어", "빈티지 포스터", "레트로 타이포", "한옥 풍경", "새벽 안개 숲", "손글씨 캘리그라피", "패키지 디자인", "수채화 풍경", "도시 야경", "보태니컬 일러스트", "잡지 레이아웃", "파스텔 그라데이션"];

// ---------- 상태 (검색어는 저장하지 않음) ----------
const S = {
  pass: LS.get("pass", ""), blur: LS.get("blur", true), ml: LS.get("ml", true), off: new Set(LS.get("off", [])),
  q: "", qe: "", page: 0, gen: 0, loading: false, ended: false, srcEnded: new Set(), stat: {},
  color: "", orient: "", sl: "", board: "__all",
  items: [], keys: new Map(), tags: new Map(), view: "feed", list: [], cur: -1, bmIds: new Set(), trP: null,
};
let cfg = null;
const srcName = (id) => cfg?.sources.find((s) => s.id === id)?.name || id;
document.body.classList.toggle("noblur", !S.blur);

// ---------- 서버 호출 ----------
async function api(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { "x-pass": S.pass, ...(opt.headers || {}) }, cache: "no-store" });
  if (r.status === 401) { showLogin("암호가 맞지 않아요"); throw new Error("auth"); }
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r;
}
const limiter = (n) => { let a = 0; const q = []; const next = () => { if (a < n && q.length) { a++; const { f, ok, no } = q.shift(); f().then(ok, no).finally(() => { a--; next(); }); } }; return (f) => new Promise((ok, no) => { q.push({ f, ok, no }); next(); }); };
const limit = limiter(8);
const fetchBlob = (path) => limit(async () => (await api(path, { signal: AbortSignal.timeout(20000) })).blob());

// ---------- 로그인 ----------
function showLogin(msg) { $("#login").hidden = false; $("#lmsg").textContent = msg || ""; $("#lpass").focus(); }
$("#lf").addEventListener("submit", (e) => { e.preventDefault(); S.pass = $("#lpass").value.trim(); LS.set("pass", S.pass); $("#lpass").value = ""; boot(); });

// ---------- 북마크 DB ----------
const DB = {
  db: null,
  async open() { this.db = await new Promise((res) => { try { const r = indexedDB.open("imgfeed", 1); r.onupgradeneeded = () => r.result.createObjectStore("bm", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } }); },
  store(m) { return this.db.transaction("bm", m).objectStore("bm"); },
  all() { return new Promise((res) => { if (!this.db) return res([]); const r = this.store("readonly").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); },
  put(o) { return new Promise((res) => { if (!this.db) return res(false); const r = this.store("readwrite").put(o); r.onsuccess = () => res(true); r.onerror = () => res(false); }); },
  del(id) { return new Promise((res) => { if (!this.db) return res(false); const r = this.store("readwrite").delete(id); r.onsuccess = () => res(true); r.onerror = () => res(false); }); },
};
const updateCount = () => { $("#bmc").textContent = S.bmIds.size ? `(${S.bmIds.size})` : ""; };

async function toggleBookmark(it) {
  if (S.bmIds.has(it.id)) { await DB.del(it.id); S.bmIds.delete(it.id); toast("북마크에서 뺐어요"); }
  else {
    let blob = it.blob;
    if (!blob) { try { blob = await fetchBlob(`/api/img?u=${enc(it.thumb)}`); } catch {} }
    const ok = await DB.put({ id: it.id, title: it.title, thumb: it.thumb, full: it.full, page: it.page, src: it.src, w: it.w, h: it.h, tags: it.tags, adult: it.adult, ts: Date.now(), blob });
    if (!ok) return toast("이 브라우저에서는 북마크를 저장할 수 없어요");
    S.bmIds.add(it.id); toast("북마크에 담았어요");
  }
  refreshStars(); updateCount();
  if (S.view === "bm" && $("#viewer").hidden) showBm();
}
function refreshStars() {
  document.querySelectorAll(".card").forEach((c) => { const b = c.querySelector(".star"); if (b && c._it) b.textContent = S.bmIds.has(c._it.id) ? "★" : "☆"; });
  if (S.cur >= 0 && S.list[S.cur]) $("#vstar").textContent = S.bmIds.has(S.list[S.cur].id) ? "★ 북마크됨" : "☆ 북마크";
}

// ---------- 메이슨리 ----------
class Masonry {
  constructor(el) { this.el = el; this.all = []; this.cards = []; this.cols = []; this.hs = []; this.n = 0; this.pred = null; }
  count() { const w = this.el.clientWidth || innerWidth; return w < 560 ? 2 : w < 860 ? 3 : w < 1180 ? 4 : 5; }
  build() {
    this.n = this.count(); this.el.textContent = ""; this.cols = []; this.hs = Array(this.n).fill(0);
    for (let i = 0; i < this.n; i++) { const c = document.createElement("div"); c.className = "col"; this.el.appendChild(c); this.cols.push(c); }
    for (const c of this.cards) this.place(c);
  }
  place(c) { let k = 0; for (let i = 1; i < this.n; i++) if (this.hs[i] < this.hs[k]) k = i; this.cols[k].appendChild(c); this.hs[k] += 1 / c._r + 0.04; }
  add(cards) {
    this.all.push(...cards);
    const ok = this.pred ? cards.filter(this.pred) : cards;
    if (!this.cols.length || this.n !== this.count()) { this.cards.push(...ok); this.build(); return; }
    for (const c of ok) { this.cards.push(c); this.place(c); }
  }
  setFilter(p) { this.pred = p; this.cards = p ? this.all.filter(p) : this.all.slice(); this.build(); }
  clear() { this.all = []; this.cards = []; this.cols = []; this.hs = []; this.el.textContent = ""; }
  check() { if (this.cols.length && this.n !== this.count()) this.build(); }
}
const feedM = new Masonry($("#grid"));
const bmM = new Masonry($("#bmgrid"));
let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { feedM.check(); bmM.check(); }, 200); });

// ---------- 카드 ----------
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); loadCard(e.target); } }), { rootMargin: "800px 0px" });

function makeCard(it, list) {
  const el = document.createElement("div");
  el.className = "card"; el._it = it; el._r = clamp(it.w && it.h ? it.w / it.h : 1, 0.5, 2.2);
  el.style.aspectRatio = String(el._r);
  const img = document.createElement("img"); img.alt = it.title || ""; img.decoding = "async"; el.appendChild(img);
  const star = document.createElement("button"); star.className = "star"; star.setAttribute("aria-label", "북마크"); star.textContent = S.bmIds.has(it.id) ? "★" : "☆"; el.appendChild(star);
  const veil = document.createElement("div"); veil.className = "veil"; veil.innerHTML = "민감할 수 있는 이미지<br><small>탭하면 보기</small>"; el.appendChild(veil);
  const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = srcName(it.src); el.appendChild(tag);
  el.addEventListener("click", (e) => {
    if (e.target === star) { e.stopPropagation(); toggleBookmark(it); return; }
    if (el.dataset.st === "flag" && !it.revealed && S.blur) { it.revealed = true; el.classList.add("reveal"); return; }
    const l = S.view === "bm" ? S.list : S.items;
    openViewer(l, l.indexOf(it));
  });
  io.observe(el);
  return el;
}

async function loadCard(el) {
  const it = el._it, img = el.querySelector("img");
  const needML = S.blur && S.ml && !it.adult && !it.fromBm;
  el.dataset.st = it.adult ? "flag" : needML ? "pending" : "ok";
  img.onerror = () => el.classList.add("broken");
  try {
    if (it.blob) img.src = URL.createObjectURL(it.blob);
    else if (needML) { const b = await fetchBlob(`/api/img?u=${enc(it.thumb)}`); it.blob = b; img.src = URL.createObjectURL(b); }
    else { img.referrerPolicy = "no-referrer"; img.src = it.thumb; }
    await img.decode().catch(() => {});
    el.classList.add("loaded");
    if (needML && it.blob) enqueueClassify(el, img, it);
  } catch (e) {
    if (e.message === "auth") return;
    el.dataset.st = it.adult ? "flag" : "ok";
    img.referrerPolicy = "no-referrer"; img.src = it.thumb; el.classList.add("loaded");
  }
}

// ---------- 브라우저 안 AI 검사 (선정성) ----------
let modelP = null, modelFailed = false;
function getModel() {
  if (!modelP) modelP = import("https://esm.sh/nsfwjs@4").then((m) => (m.load || m.default?.load).call(m)).catch((e) => { modelFailed = true; modelP = null; throw e; });
  return modelP;
}
const cq = []; let busy = false;
function enqueueClassify(el, img, it) { cq.push({ el, img, it }); pump(); setTimeout(() => { if (el.dataset.st === "pending") el.dataset.st = "ok"; }, 25000); }
async function pump() {
  if (busy) return; busy = true;
  try {
    const m = await getModel();
    while (cq.length) {
      const { el, img, it } = cq.shift();
      if (!el.isConnected) continue;
      try {
        const p = await m.classify(img);
        const s = Object.fromEntries(p.map((x) => [x.className, x.probability]));
        if ((s.Porn || 0) + (s.Hentai || 0) > 0.45 || (s.Sexy || 0) > 0.7) { it.adult = true; el.dataset.st = "flag"; }
        else el.dataset.st = "ok";
      } catch { el.dataset.st = "ok"; }
      await sleep(0);
    }
  } catch {
    cq.splice(0).forEach((x) => (x.el.dataset.st = "ok"));
    if (!pump._warned) { pump._warned = true; toast("AI 검사를 불러오지 못했어요. 키워드·검색엔진 필터만 적용 중이에요.", 5000); }
  }
  busy = false;
}

// ---------- 검색 ----------
const activeSources = () => (cfg?.sources || []).filter((s) => !S.off.has(s.id) && (!S.color || s.colors));
const predOrient = () => !S.orient ? null : (c) => { const r = c._it.w && c._it.h ? c._it.w / c._it.h : 1; return S.orient === "v" ? r < 0.9 : S.orient === "h" ? r > 1.1 : r >= 0.9 && r <= 1.1; };

async function startSearch(q, opts = {}) {
  q = (q || "").trim().slice(0, 100);
  if (!q || !cfg) return;
  setView("feed");
  S.gen++;
  S.sl = opts.sl || (hasHangul(q) ? "ko" : "");
  Object.assign(S, { q, qe: q, page: 0, ended: false, loading: false, items: [], keys: new Map(), tags: new Map(), srcEnded: new Set(), stat: {} });
  $("#q").value = q; $("#q").blur(); $("#home").hidden = true;
  feedM.clear(); feedM.pred = predOrient(); markFilters(); $("#msg").hidden = true; $("#chips").textContent = ""; renderStat(); scrollTo(0, 0);
  S.trP = S.sl && S.sl !== "en" && cfg.ai
    ? api(`/api/tr?q=${enc(q)}&sl=${S.sl}`).then((r) => r.json()).then((j) => { S.qe = j.t || q; }).catch(() => { S.qe = q; })
    : Promise.resolve();
  await fetchNext();
}

async function fetchNext() {
  if (S.loading || S.ended || !S.q) return;
  const srcs = activeSources().filter((s) => !S.srcEnded.has(s.id));
  if (!srcs.length) { S.ended = true; checkEmpty(); return; }
  S.loading = true;
  const gen = S.gen, page = ++S.page, safe = S.blur ? 1 : 0;
  const batch = []; let timer = null;
  const flush = () => { clearTimeout(timer); timer = null; const arr = batch.splice(0); if (gen === S.gen && arr.length) mergeAndRender(arr, page); };
  await Promise.all(srcs.map(async (s) => {
    try {
      if (s.en) await S.trP;
      const r = await (await api(`/api/search?src=${s.id}&q=${enc(S.q)}&qe=${enc(S.qe)}&page=${page}&safe=${safe}&color=${S.color}&orient=${S.orient}`, { signal: AbortSignal.timeout(12000) })).json();
      if (gen !== S.gen) return;
      if (r.blocked) { S.blocked = true; return; }
      S.stat[s.id] = { n: (S.stat[s.id]?.n || 0) + r.items.length };
      if (!r.items.length) S.srcEnded.add(s.id);
      batch.push({ src: s, items: r.items });
      if (!timer) timer = setTimeout(flush, page === 1 ? 600 : 300);
    } catch (e) {
      if (gen !== S.gen || e.message === "auth") return;
      S.stat[s.id] = { n: S.stat[s.id]?.n || 0, err: true }; S.srcEnded.add(s.id);
    }
  }));
  flush();
  if (gen !== S.gen) return;
  S.loading = false;
  if (S.blocked) { S.blocked = false; S.ended = true; showMsg("이 주제는 차단된 주제예요. (공포·잔혹 필터는 해제할 수 없어요)"); renderStat(); return; }
  renderStat(); renderChips();
  if (S.srcEnded.size >= activeSources().length) S.ended = true;
  checkEmpty();
  sio.unobserve($("#sentinel")); sio.observe($("#sentinel"));
}

function mergeAndRender(arr, page) {
  const acc = new Map();
  for (const { src, items } of arr) {
    items.forEach((it, i) => {
      const k = keyOf(it), sc = src.w / (60 + i), ex = S.keys.get(k);
      if (ex) { ex.score = (ex.score || 0) + sc; return; }
      const a = acc.get(k);
      if (a) { a.score += sc; if (!a.tags.length && it.tags.length) a.tags = it.tags; if (!a.title && it.title) a.title = it.title; }
      else acc.set(k, { ...it, id: hashId(k), key: k, score: sc });
    });
  }
  const list = [...acc.values()].sort((a, b) => b.score - a.score);
  if (!list.length) return;
  const cards = list.map((it) => { S.keys.set(it.key, it); S.items.push(it); bumpTags(it); return makeCard(it); });
  feedM.add(cards);
}

function bumpTags(it) { for (const t of new Set([...it.tags.map((x) => x.toLowerCase()), ...tokens(it.title)])) S.tags.set(t, (S.tags.get(t) || 0) + 1); }
function renderChips() {
  if (S.view !== "feed") return;
  const qt = new Set(tokens(S.q)), box = $("#chips"); box.textContent = "";
  [...S.tags.entries()].filter(([t, n]) => n >= 2 && !qt.has(t) && !S.q.toLowerCase().includes(t)).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .forEach(([t]) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => startSearch(t); box.appendChild(b); });
}
function renderStat() {
  const parts = activeSources().map((s) => { const st = S.stat[s.id]; return st ? `${s.name} ${st.err ? "⚠" : st.n}` : `${s.name} …`; });
  $("#stat").textContent = S.q ? parts.join(" · ") : "";
}
function showMsg(t) { const m = $("#msg"); m.textContent = t; m.hidden = false; }
function checkEmpty() {
  if (S.items.length) return;
  if (S.color && !activeSources().length) return showMsg("색상 필터는 Pixabay · Unsplash · Pexels (키 필요)에서만 동작해요. 색상을 다시 눌러 해제하세요.");
  const allErr = activeSources().length && activeSources().every((s) => S.stat[s.id]?.err);
  if (S.ended || allErr) showMsg(!activeSources().length ? "켜져 있는 검색 소스가 없어요. 설정에서 켜 주세요." : allErr ? "검색 소스에 연결하지 못했어요. 설정의 키(변수)를 확인해 주세요." : "결과가 없어요. 다른 말로 검색해 보세요.");
}
const sio = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && S.view === "feed") fetchNext(); }, { rootMargin: "1200px 0px" });
sio.observe($("#sentinel"));

// ---------- 홈 ----------
function renderHome() {
  const box = $("#homeChips"); box.textContent = "";
  DEFAULT_CHIPS.forEach((t) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => startSearch(t); box.appendChild(b); });
  $("#home").hidden = !!S.q || S.view !== "feed";
}
$("#rand").onclick = () => startSearch(DEFAULT_CHIPS[Math.floor(Math.random() * DEFAULT_CHIPS.length)]);
$("#sf").addEventListener("submit", (e) => { e.preventDefault(); startSearch($("#q").value); });

// ---------- 탭/북마크 보기 ----------
function setView(v) {
  S.view = v;
  $("#tabFeed").classList.toggle("on", v === "feed"); $("#tabBm").classList.toggle("on", v === "bm"); $("#tabTr").classList.toggle("on", v === "tr");
  $("#grid").hidden = v !== "feed"; $("#bmgrid").hidden = v !== "bm"; $("#trends").hidden = v !== "tr";
  $("#chips").hidden = v === "tr"; $("#stat").hidden = v !== "feed"; $("#filters").hidden = v !== "feed";
  $("#home").hidden = !(v === "feed" && !S.q);
  if (v === "feed") { feedM.check(); renderChips(); const m = $("#msg"); m.hidden = !(S.q && !S.items.length && m.textContent); }
  else if (v === "tr") { $("#msg").hidden = true; loadTrends(); }
}
async function showBm() {
  setView("bm");
  const all = (await DB.all()).sort((a, b) => b.ts - a.ts).map((x) => ({ ...x, fromBm: true, tags: x.tags || [] }));
  renderBoardChips(all);
  const shown = all.filter((x) => S.board === "__all" || (x.board || "") === S.board);
  S.list = shown; bmM.clear();
  if (!shown.length) { showMsg(all.length ? "이 보드는 비어 있어요." : "아직 북마크가 없어요. 이미지의 ☆ 를 눌러 담아 보세요."); return; }
  $("#msg").hidden = true;
  bmM.add(shown.map((it) => makeCard(it)));
}
function renderBoardChips(all) {
  const box = $("#chips"); box.textContent = "";
  const boards = [...new Set(all.map((x) => x.board).filter(Boolean))].sort();
  if (!boards.length) { if (S.board !== "__all") S.board = "__all"; return; }
  const mk = (label, val) => { const b = document.createElement("button"); b.textContent = label; if (S.board === val) b.classList.add("on"); b.onclick = () => { S.board = val; showBm(); }; box.appendChild(b); };
  mk("전체", "__all"); boards.forEach((n) => mk(n, n)); if (all.some((x) => !x.board)) mk("미분류", "");
}
$("#tabFeed").onclick = () => setView("feed");
$("#tabTr").onclick = () => setView("tr");
$("#tabBm").onclick = showBm;

// ---------- 뷰어 ----------
let vTok = 0, vUrl = null;
function openViewer(list, i) { if (i < 0) return; S.list = list; S.cur = i; $("#viewer").hidden = false; document.body.classList.add("lock"); showItem(); }
function closeViewer() { $("#viewer").hidden = true; document.body.classList.remove("lock"); vTok++; S.cur = -1; if (S.view === "bm") showBm(); }
function showItem() {
  const it = S.list[S.cur]; if (!it) return;
  const img = $("#vimg"), token = ++vTok;
  const hide = it.adult && S.blur && !it.revealed;
  img.classList.toggle("blur", hide); $("#vveil").hidden = !hide;
  $("#vtitle").textContent = it.title || srcName(it.src);
  $("#vsrc").textContent = srcName(it.src) + (it.w ? ` · ${it.w}×${it.h}` : "");
  refreshStars(); $("#vboard").textContent = it.board ? "보드: " + it.board : "보드";
  img.referrerPolicy = "no-referrer";
  img.src = it.blob ? URL.createObjectURL(it.blob) : it.thumb;
  fetchBlob(`/api/img?u=${enc(it.full)}`).then((b) => {
    if (token !== vTok) return;
    it.fullBlob = b; if (vUrl) URL.revokeObjectURL(vUrl); vUrl = URL.createObjectURL(b); img.src = vUrl;
  }).catch(() => {
    if (token !== vTok) return;
    const t = new Image(); t.referrerPolicy = "no-referrer"; t.onload = () => { if (token === vTok) img.src = it.full; }; t.src = it.full;
  });
}
$("#vveil").parentElement.addEventListener("click", () => { const it = S.list[S.cur]; if (it && !$("#vveil").hidden) { it.revealed = true; showItem(); } });
const step = (d) => { const n = S.cur + d; if (n >= 0 && n < S.list.length) { S.cur = n; showItem(); } };
$("#vprev").onclick = () => step(-1); $("#vnext").onclick = () => step(1); $("#vclose").onclick = closeViewer;
addEventListener("keydown", (e) => { if ($("#viewer").hidden) return; if (e.key === "Escape") closeViewer(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
let tx = 0; $("#viewer").addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; }, { passive: true });
$("#viewer").addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 70) step(dx < 0 ? 1 : -1); }, { passive: true });
$("#vstar").onclick = () => { const it = S.list[S.cur]; if (it) toggleBookmark(it); };
$("#vopen").onclick = () => { const it = S.list[S.cur]; if (it) window.open(it.page || it.full, "_blank", "noopener"); };
$("#vsim").onclick = () => {
  const it = S.list[S.cur]; if (!it) return;
  const t = it.tags.length ? it.tags.slice(0, 3) : [...new Set(tokens(it.title))].slice(0, 3);
  const q = t.join(" ") || S.q; closeViewerQuiet(); startSearch(q); toast("비슷한 주제로 찾는 중: " + q);
};
function closeViewerQuiet() { $("#viewer").hidden = true; document.body.classList.remove("lock"); vTok++; S.cur = -1; }
$("#vdl").onclick = async () => {
  const it = S.list[S.cur]; if (!it) return;
  try {
    toast("내려받는 중…");
    const blob = it.fullBlob || (await fetchBlob(`/api/img?u=${enc(it.full)}&dl=1`));
    const ext = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" })[blob.type] || ".jpg";
    const name = ((it.title || it.src || "image").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "image") + ext;
    const file = new File([blob], name, { type: blob.type });
    if (matchMedia("(pointer:coarse)").matches && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { if (e.name !== "AbortError") toast("다운로드에 실패했어요. '원본 페이지'에서 받아 보세요."); }
};

// ---------- 트렌드 (위키백과 많이 본 문서) ----------
async function loadTrends() {
  const sel = $("#trLang"), lang = sel.value, box = $("#trChips");
  LS.set("trLang", lang); box.textContent = ""; $("#trNote").textContent = "불러오는 중…";
  try {
    const j = await (await api(`/api/trends?lang=${lang}`)).json();
    if (sel.value !== lang) return;
    $("#trNote").textContent = `위키백과 ${sel.selectedOptions[0].textContent} · ${j.date} 기준 많이 본 문서예요. 주제를 누르면 이미지를 찾아요. (사람·사건 위주라 디자인 유행과는 달라요)`;
    j.items.forEach((t) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => startSearch(t, { sl: lang }); box.appendChild(b); });
  } catch (e) { if (e.message !== "auth") $("#trNote").textContent = "트렌드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."; }
}
$("#trLang").value = LS.get("trLang", "ko");
$("#trLang").onchange = loadTrends;

// ---------- 색상·방향 필터 ----------
const COLORS = { red: "#e53935", orange: "#fb8c00", yellow: "#fdd835", green: "#43a047", teal: "#00acc1", blue: "#1e88e5", purple: "#8e24aa", pink: "#ec407a", brown: "#6d4c41", black: "#111", white: "#fff", gray: "#9e9e9e" };
function markFilters() {
  document.querySelectorAll("#colors .dot").forEach((b) => b.classList.toggle("on", b.dataset.c === S.color));
  document.querySelectorAll("#orient button").forEach((b) => b.classList.toggle("on", b.dataset.o === S.orient));
}
Object.entries(COLORS).forEach(([k, c]) => {
  const b = document.createElement("button"); b.className = "dot"; b.style.background = c; b.dataset.c = k; b.setAttribute("aria-label", k);
  b.onclick = () => { S.color = S.color === k ? "" : k; markFilters(); if (S.q) startSearch(S.q, { sl: S.sl }); };
  $("#colors").appendChild(b);
});
document.querySelectorAll("#orient button").forEach((b) => { b.onclick = () => { S.orient = b.dataset.o; markFilters(); if (S.q) startSearch(S.q, { sl: S.sl }); else feedM.pred = predOrient(); }; });

// ---------- 보드 ----------
$("#vboard").onclick = async () => {
  const it = S.list[S.cur]; if (!it) return;
  if (!S.bmIds.has(it.id)) await toggleBookmark(it);
  const all = await DB.all(), rec = all.find((x) => x.id === it.id); if (!rec) return;
  const names = [...new Set(all.map((x) => x.board).filter(Boolean))];
  const v = prompt("보드 이름을 입력하세요 (비우면 미분류)" + (names.length ? "\n기존 보드: " + names.join(", ") : ""), rec.board || "");
  if (v === null) return;
  rec.board = v.trim().slice(0, 30); it.board = rec.board; await DB.put(rec);
  $("#vboard").textContent = rec.board ? "보드: " + rec.board : "보드";
  toast(rec.board ? `'${rec.board}' 보드에 담았어요` : "미분류로 옮겼어요");
};

// ---------- 설정 ----------
function renderSettings() {
  $("#sBlur").checked = S.blur; $("#sMl").checked = S.ml;
  const box = $("#srcList"); box.textContent = "";
  (cfg?.sources || []).forEach((s) => {
    const l = document.createElement("label"); l.className = "row";
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = !S.off.has(s.id);
    c.onchange = () => { c.checked ? S.off.delete(s.id) : S.off.add(s.id); LS.set("off", [...S.off]); };
    l.append(c, " " + s.name); box.appendChild(l);
  });
}
$("#gear").onclick = () => { renderSettings(); $("#settings").hidden = false; };
$("#closeSet").onclick = () => { $("#settings").hidden = true; };
$("#sBlur").onchange = (e) => {
  if (!e.target.checked && !confirm("선정적일 수 있는 이미지가 그대로 보여요. 블러를 해제할까요?")) { e.target.checked = true; return; }
  S.blur = e.target.checked; LS.set("blur", S.blur); document.body.classList.toggle("noblur", !S.blur);
  toast("다음 검색부터 모두 적용돼요");
};
$("#sMl").onchange = (e) => { S.ml = e.target.checked; LS.set("ml", S.ml); toast("다음 검색부터 적용돼요"); };
$("#logout").onclick = () => { $("#settings").hidden = true; LS.set("pass", ""); S.pass = ""; showLogin(); };

const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
$("#expBm").onclick = async () => {
  const all = await DB.all();
  const out = []; for (const x of all) out.push({ ...x, blob: undefined, thumbData: x.blob ? await blobToDataURL(x.blob) : null });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, items: out })], { type: "application/json" }));
  a.download = "imagefeed-bookmarks.json"; document.body.appendChild(a); a.click(); a.remove(); toast(`${out.length}개를 내보냈어요`);
};
$("#impBmBtn").onclick = () => $("#impBm").click();
$("#impBm").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); let n = 0;
    for (const x of d.items || []) {
      if (!x.id || !x.thumb) continue;
      let blob; if (x.thumbData) { try { blob = await (await fetch(x.thumbData)).blob(); } catch {} }
      const { thumbData, ...rest } = x; if (await DB.put({ ...rest, blob })) { S.bmIds.add(x.id); n++; }
    }
    updateCount(); toast(`${n}개를 가져왔어요`); if (S.view === "bm") showBm();
  } catch { toast("파일을 읽지 못했어요"); }
  e.target.value = "";
};

// ---------- 시작 ----------
async function boot() {
  if (!S.pass) return showLogin();
  try { cfg = await (await api("/api/config")).json(); }
  catch (e) { if (e.message !== "auth") showLogin("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
  $("#login").hidden = true;
  await DB.open(); S.bmIds = new Set((await DB.all()).map((x) => x.id)); updateCount();
  renderHome();
  if (S.blur && S.ml) setTimeout(() => getModel().catch(() => {}), 1500);
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
boot();
