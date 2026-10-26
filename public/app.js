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
const idle = (ms = 3000) => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: ms }) : setTimeout(r, 300)));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const DEFAULT_CHIPS = ["미니멀 인테리어", "빈티지 포스터", "레트로 타이포", "한옥 풍경", "새벽 안개 숲", "손글씨 캘리그라피", "패키지 디자인", "수채화 풍경", "도시 야경", "보태니컬 일러스트", "잡지 레이아웃", "파스텔 그라데이션"];
// 소스가 실패했을 때 ⚠ 를 누르면 보여주는 이유
const WHY = {
  timeout: "응답이 너무 늦어서 포기했어요 (시간 초과)",
  limit: "요청 한도를 넘었어요. 잠시 뒤 다시 시도해 보세요",
  gone: "소스가 이 주소를 더 이상 제공하지 않거나, 이 서버의 접속을 막았어요",
  denied: "소스가 접속을 거절했어요 (키가 필요하거나, 이 서버 주소가 막혔을 수 있어요)",
  server: "소스 서버에 문제가 있어요",
  badjson: "올바른 응답이 아니에요 (차단 화면일 수 있어요)",
  network: "소스에 연결하지 못했어요",
  error: "알 수 없는 오류예요",
};

// ---------- 상태 (검색어는 저장하지 않음) ----------
// 전역 설정만 S 에 두고, 검색 한 번의 상태(검색어·결과·페이지)는 Feed 객체가 따로 가집니다.
const S = {
  pass: LS.get("pass", ""), blur: LS.get("blur", true), ml: LS.get("ml", true), off: new Set(LS.get("off", [])),
  color: "", orient: "", board: "__all", view: "feed", list: [], bmIds: new Set(),
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
    const ok = await DB.put({ id: it.id, title: it.title, thumb: it.thumb, alt: it.alt, full: it.full, page: it.page, src: it.src, w: it.w, h: it.h, tags: it.tags, adult: it.adult, ts: Date.now(), blob });
    if (!ok) return toast("이 브라우저에서는 북마크를 저장할 수 없어요");
    S.bmIds.add(it.id); toast("북마크에 담았어요");
  }
  refreshStars(); updateCount();
  if (S.view === "bm" && $("#viewer").hidden) showBm();
}
function refreshStars() {
  document.querySelectorAll(".card").forEach((c) => { const b = c.querySelector(".star"); if (b && c._it) b.textContent = S.bmIds.has(c._it.id) ? "★" : "☆"; });
  const it = curItem(); if (it) $("#vstar").textContent = S.bmIds.has(it.id) ? "★ 북마크됨" : "☆ 북마크";
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
let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { feedM.check(); bmM.check(); lv()?.m.check(); }, 200); });

// ---------- 카드 ----------
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); loadCard(e.target); } }), { rootMargin: "800px 0px" });

// open: 카드를 눌렀을 때 뷰어를 여는 방법 (메인 피드 / 북마크 / 비슷한 이미지 피드마다 다름)
function makeCard(it, open) {
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
    open();
  });
  io.observe(el);
  return el;
}

async function loadCard(el) {
  const it = el._it, img = el.querySelector("img");
  const needML = S.blur && S.ml && !it.adult && !it.fromBm;
  el.dataset.st = it.adult ? "flag" : needML ? "pending" : "ok";
  // 큰 썸네일 주소가 안 열리는 소스(예: V&A)는 작은 주소(alt)로 한 번 더 시도
  img.onerror = () => { if (it.alt && img.dataset.alt !== "1") { img.dataset.alt = "1"; img.referrerPolicy = "no-referrer"; img.src = it.alt; } else el.classList.add("broken"); };
  try {
    if (it.blob) img.src = URL.createObjectURL(it.blob);
    else if (needML) { const b = await fetchBlob(`/api/img?u=${enc(it.thumb)}`); it.blob = b; img.src = URL.createObjectURL(b); }
    else { img.referrerPolicy = "no-referrer"; img.src = it.thumb; }
    await img.decode().catch(() => {});
    el.classList.add("loaded");
    // 비율을 모르는 소스(미술관 등)는 불러온 뒤 실제 비율로 맞춤
    if ((!it.w || !it.h) && img.naturalWidth && img.naturalHeight) {
      it.w = img.naturalWidth; it.h = img.naturalHeight;
      el._r = clamp(it.w / it.h, 0.5, 2.2); el.style.aspectRatio = String(el._r);
    }
    if (needML && it.blob) enqueueClassify(el, img, it);
  } catch (e) {
    if (e.message === "auth") return;
    el.dataset.st = it.adult ? "flag" : "ok";
    img.referrerPolicy = "no-referrer"; img.src = it.thumb; el.classList.add("loaded");
  }
}

// ---------- 브라우저 안 AI 검사 (선정성) ----------
// 처음 접속할 때 화면이 굳던 문제를 줄이려고, 접속하자마자 내려받지 않고
// 첫 이미지를 검사해야 할 때 + 브라우저가 한가할 때 준비합니다.
let modelP = null, aiState = "idle"; // idle | loading | ready | failed
function getModel() {
  if (!modelP) {
    aiState = "loading"; renderStat();
    modelP = idle(4000).then(() => import("https://esm.sh/nsfwjs@4")).then((m) => (m.load || m.default?.load).call(m))
      .then((mod) => { aiState = "ready"; renderStat(); return mod; })
      .catch((e) => { aiState = "failed"; modelP = null; renderStat(); throw e; });
  }
  return modelP;
}
const cq = []; let busy = false;
function enqueueClassify(el, img, it) { cq.push({ el, img, it }); pump(); setTimeout(() => { if (el.dataset.st === "pending") el.dataset.st = "ok"; }, 40000); }
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

// ---------- 피드 (검색 한 번의 상태와 불러오기 로직) ----------
// 메인 피드와 뷰어 아래 "비슷한 이미지" 피드가 같은 로직을 씁니다.
class Feed {
  constructor(m, o = {}) { this.m = m; this.o = o; this.gen = 0; this.reset(); }
  reset() {
    this.gen++;
    Object.assign(this, { q: "", qe: "", sl: "", page: 0, loading: false, ended: false, blocked: false,
      srcEnded: new Set(), stat: {}, items: [], keys: new Map(), tags: new Map(), trP: Promise.resolve() });
  }
  sources() { return (cfg?.sources || []).filter((s) => !S.off.has(s.id) && (!this.o.filters || !S.color || s.colors)); }
  begin(q, sl = "") {
    this.q = this.qe = q;
    this.sl = sl || (hasHangul(q) ? "ko" : "");
    // 한글 등은 영어 소스용으로 번역해 둡니다
    this.trP = this.sl && this.sl !== "en" && cfg.ai
      ? api(`/api/tr?q=${enc(q)}&sl=${this.sl}`).then((r) => r.json()).then((j) => { this.qe = j.t || q; }).catch(() => { this.qe = q; })
      : Promise.resolve();
  }
  fail(s, r) {
    const st = (this.stat[s.id] ||= { n: 0 });
    if (!st.n) { st.err = r.err || "error"; st.detail = r.detail || ""; } // 이미 결과를 받은 소스가 중간에 막힌 경우는 조용히 끝냄
    this.srcEnded.add(s.id);
  }
  async next() {
    if (this.loading || this.ended || !this.q) return;
    const srcs = this.sources().filter((s) => !this.srcEnded.has(s.id));
    if (!srcs.length) { this.ended = true; this.o.onAfter?.(); return; }
    this.loading = true;
    const gen = this.gen, page = ++this.page, safe = S.blur ? 1 : 0;
    const color = this.o.filters ? S.color : "", orient = this.o.filters ? S.orient : "";
    const batch = []; let timer = null;
    const flush = () => { clearTimeout(timer); timer = null; const arr = batch.splice(0); if (gen === this.gen && arr.length) this.merge(arr); };
    await Promise.all(srcs.map(async (s) => {
      try {
        if (s.en) await this.trP;
        const r = await (await api(`/api/search?src=${s.id}&q=${enc(this.q)}&qe=${enc(this.qe)}&page=${page}&safe=${safe}&color=${color}&orient=${orient}`, { signal: AbortSignal.timeout(16000) })).json();
        if (gen !== this.gen) return;
        if (r.blocked) { this.blocked = true; return; }
        if (r.err) { this.fail(s, r); return; }
        const st = (this.stat[s.id] ||= { n: 0 }); st.n += r.items.length;
        if (!r.items.length) this.srcEnded.add(s.id);
        batch.push({ src: s, items: r.items });
        if (!timer) timer = setTimeout(flush, page === 1 ? 600 : 300);
      } catch (e) {
        if (gen !== this.gen || e.message === "auth") return;
        this.fail(s, { err: e.name === "TimeoutError" ? "timeout" : "network" });
      }
    }));
    flush();
    if (gen !== this.gen) return;
    this.loading = false;
    if (this.blocked) { this.blocked = false; this.ended = true; this.o.onBlocked?.(); this.o.onProgress?.(); return; }
    this.o.onProgress?.();
    if (this.srcEnded.size >= this.sources().length) this.ended = true;
    this.o.onAfter?.();
    this.o.reobserve?.();
  }
  merge(arr) {
    const acc = new Map();
    for (const { src, items } of arr) {
      items.forEach((it, i) => {
        const k = keyOf(it), sc = src.w / (60 + i), ex = this.keys.get(k);
        if (ex) { ex.score = (ex.score || 0) + sc; return; }
        const a = acc.get(k);
        if (a) { a.score += sc; if (!a.tags.length && it.tags.length) a.tags = it.tags; if (!a.title && it.title) a.title = it.title; }
        else acc.set(k, { ...it, id: hashId(k), key: k, score: sc });
      });
    }
    const list = [...acc.values()].sort((a, b) => b.score - a.score);
    if (!list.length) return;
    const cards = list.map((it) => {
      this.keys.set(it.key, it); this.items.push(it);
      for (const t of new Set([...it.tags.map((x) => String(x).toLowerCase()), ...tokens(it.title)])) this.tags.set(t, (this.tags.get(t) || 0) + 1);
      return makeCard(it, () => this.o.open(this, it));
    });
    this.m.add(cards);
  }
}

// ---------- 메인 검색 ----------
const M = new Feed(feedM, {
  filters: true,
  open: (f, it) => openViewer(f.items, f.items.indexOf(it)),
  onProgress: () => { renderStat(); renderChips(); },
  onAfter: () => checkEmpty(),
  onBlocked: () => showMsg("이 주제는 차단된 주제예요. (공포·잔혹 필터는 해제할 수 없어요)"),
  reobserve: () => { sio.unobserve($("#sentinel")); sio.observe($("#sentinel")); },
});
const predOrient = () => !S.orient ? null : (c) => { const r = c._it.w && c._it.h ? c._it.w / c._it.h : 1; return S.orient === "v" ? r < 0.9 : S.orient === "h" ? r > 1.1 : r >= 0.9 && r <= 1.1; };

async function startSearch(q, opts = {}) {
  q = (q || "").trim().slice(0, 100);
  if (!q || !cfg) return;
  if (V.stack.length) closeViewer();
  setView("feed");
  M.reset(); M.begin(q, opts.sl);
  $("#q").value = q; $("#q").blur(); $("#home").hidden = true; $("#filters").hidden = true;
  feedM.clear(); feedM.pred = predOrient(); markFilters(); $("#msg").hidden = true; $("#msg").textContent = ""; renderChips(); renderStat(); scrollTo(0, 0);
  await M.next();
}

function renderChips() {
  const box = $("#chips"), wrap = $("#chipsWrap");
  if (S.view === "feed") {
    $("#chipsLbl").textContent = "관련 주제";
    box.textContent = "";
    const qt = new Set(tokens(M.q));
    [...M.tags.entries()].filter(([t, n]) => n >= 2 && !qt.has(t) && !M.q.toLowerCase().includes(t)).sort((a, b) => b[1] - a[1]).slice(0, 14)
      .forEach(([t]) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => startSearch(t); box.appendChild(b); });
  }
  wrap.hidden = S.view === "tr" || !box.children.length;
}
function renderStat() {
  const box = $("#stat"); box.textContent = "";
  if (!M.q) return;
  M.sources().forEach((s) => {
    const st = M.stat[s.id], bad = !!st?.err;
    const el = document.createElement(bad ? "button" : "span");
    el.className = "st" + (bad ? " bad" : "");
    el.textContent = st ? `${s.name} ${bad ? "⚠" : st.n}` : `${s.name} …`;
    if (bad) el.onclick = () => toast(`${s.name}: ${WHY[st.err] || WHY.error}${st.detail ? ` (${st.detail})` : ""}`, 7000);
    box.appendChild(el);
  });
  if (aiState === "loading") { const el = document.createElement("span"); el.className = "st"; el.textContent = "AI 검사 준비 중…"; box.appendChild(el); }
}
function showMsg(t) { const m = $("#msg"); m.textContent = t; m.hidden = false; }
function checkEmpty() {
  if (M.items.length) return;
  const act = M.sources();
  if (S.color && !act.length) return showMsg("색상 필터는 Pixabay · Unsplash · Pexels (키 필요)에서만 동작해요. 필터에서 색상을 해제해 주세요.");
  const allErr = act.length && act.every((s) => M.stat[s.id]?.err);
  if (M.ended || allErr) showMsg(!act.length ? "켜져 있는 검색 소스가 없어요. 설정에서 켜 주세요." : allErr ? "검색 소스에 연결하지 못했어요. 위쪽 소스 이름의 ⚠ 를 눌러 이유를 확인해 보세요." : "결과가 없어요. 다른 말로 검색해 보세요.");
}
const sio = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && S.view === "feed") M.next(); }, { rootMargin: "1200px 0px" });
sio.observe($("#sentinel"));

// ---------- 홈 / 처음으로 ----------
function renderHome() {
  const box = $("#homeChips"); box.textContent = "";
  DEFAULT_CHIPS.forEach((t) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => startSearch(t); box.appendChild(b); });
  $("#home").hidden = !!M.q || S.view !== "feed";
}
function goHome() {
  if (V.stack.length) closeViewer();
  M.reset(); feedM.clear(); feedM.pred = null;
  S.color = ""; S.orient = ""; markFilters();
  $("#q").value = ""; $("#q").blur(); $("#msg").hidden = true; $("#msg").textContent = ""; $("#filters").hidden = true;
  setView("feed"); renderChips(); renderStat(); renderHome(); scrollTo(0, 0);
}
$("#homeBtn").onclick = goHome;
$("#sf").addEventListener("submit", (e) => { e.preventDefault(); startSearch($("#q").value); });

// 둘러보기 버튼 3종
$("#exRand").onclick = () => startSearch(pick(DEFAULT_CHIPS));
$("#exTrend").onclick = async () => {
  const lang = LS.get("trLang", "ko");
  try {
    const j = await (await api(`/api/trends?lang=${lang}`)).json();
    if (!j.items?.length) throw new Error("none");
    startSearch(pick(j.items.slice(0, 25)), { sl: lang });
  } catch (e) { if (e.message !== "auth") { toast("요즘 화제 주제를 불러오지 못해서 랜덤 주제로 찾아요"); startSearch(pick(DEFAULT_CHIPS)); } }
};
$("#exBm").onclick = async () => {
  const cnt = new Map();
  for (const x of await DB.all()) for (const t of new Set([...(x.tags || []).map((v) => String(v).toLowerCase()), ...tokens(x.title || "")])) cnt.set(t, (cnt.get(t) || 0) + 1);
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  if (!top.length) { toast("북마크한 이미지에 태그가 아직 없어서 랜덤 주제로 찾아요"); return startSearch(pick(DEFAULT_CHIPS)); }
  startSearch(pick(top));
};

// ---------- 탭/북마크 보기 ----------
function setView(v) {
  S.view = v;
  $("#tabFeed").classList.toggle("on", v === "feed"); $("#tabBm").classList.toggle("on", v === "bm"); $("#tabTr").classList.toggle("on", v === "tr");
  $("#grid").hidden = v !== "feed"; $("#bmgrid").hidden = v !== "bm"; $("#trends").hidden = v !== "tr";
  $("#stat").hidden = v !== "feed"; $("#filterBtn").hidden = v !== "feed"; if (v !== "feed") $("#filters").hidden = true;
  $("#home").hidden = !(v === "feed" && !M.q);
  if (v === "feed") { feedM.check(); renderChips(); const m = $("#msg"); m.hidden = !(M.q && !M.items.length && m.textContent); }
  else if (v === "tr") { $("#msg").hidden = true; renderChips(); loadTrends(); }
}
async function showBm() {
  setView("bm");
  const all = (await DB.all()).sort((a, b) => b.ts - a.ts).map((x) => ({ ...x, fromBm: true, tags: x.tags || [] }));
  renderBoardChips(all);
  const shown = all.filter((x) => S.board === "__all" || (x.board || "") === S.board);
  S.list = shown; bmM.clear();
  if (!shown.length) { showMsg(all.length ? "이 보드는 비어 있어요." : "아직 북마크가 없어요. 이미지의 ☆ 를 눌러 담아 보세요."); return; }
  $("#msg").hidden = true;
  bmM.add(shown.map((it) => makeCard(it, () => openViewer(S.list, S.list.indexOf(it)))));
}
function renderBoardChips(all) {
  const box = $("#chips"); box.textContent = ""; $("#chipsLbl").textContent = "보드";
  const boards = [...new Set(all.map((x) => x.board).filter(Boolean))].sort();
  if (!boards.length) { if (S.board !== "__all") S.board = "__all"; $("#chipsWrap").hidden = true; return; }
  const mk = (label, val) => { const b = document.createElement("button"); b.textContent = label; if (S.board === val) b.classList.add("on"); b.onclick = () => { S.board = val; showBm(); }; box.appendChild(b); };
  mk("전체", "__all"); boards.forEach((n) => mk(n, n)); if (all.some((x) => !x.board)) mk("미분류", "");
  $("#chipsWrap").hidden = false;
}
$("#tabFeed").onclick = () => setView("feed");
$("#tabTr").onclick = () => setView("tr");
$("#tabBm").onclick = showBm;

// ---------- 뷰어: 이미지 아래로 "비슷한 이미지" 피드가 이어집니다 ----------
// V.stack 의 각 칸(level)이 "지금 보는 이미지 + 그 아래 비슷한 이미지 피드" 한 세트입니다.
// 비슷한 이미지를 누르면 새 칸이 쌓이고, 뒤로 가기(또는 스와이프 뒤로)로 이전 칸에 돌아갑니다.
const V = { stack: [], pushed: 0, unwinding: false };
let vTok = 0, vUrl = null;
const lv = () => V.stack[V.stack.length - 1];
const curItem = () => { const l = lv(); return l ? l.list[l.cur] : null; };
const vio = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  const l = V.stack.find((x) => x.sent === e.target);
  if (l && l === lv()) l.feed.next();
}), { root: $("#viewer"), rootMargin: "1200px 0px" });

function newLevel(list, i) {
  const wrap = document.createElement("div"); wrap.className = "simlevel";
  wrap.innerHTML = '<div class="grid"></div><div class="simmsg" hidden></div><div class="simsent"></div>';
  $("#vsimlevels").appendChild(wrap);
  const level = { list, cur: i, wrap, scrollTop: 0, simQ: "", cands: [], ci: 0 };
  level.m = new Masonry(wrap.querySelector(".grid"));
  level.sent = wrap.querySelector(".simsent"); level.msg = wrap.querySelector(".simmsg");
  level.feed = new Feed(level.m, {
    filters: false,
    open: (f, it) => pushLevel(f.items, f.items.indexOf(it)),
    onAfter: () => simAfter(level),
    reobserve: () => { vio.unobserve(level.sent); vio.observe(level.sent); },
  });
  vio.observe(level.sent);
  return level;
}
function openViewer(list, i) {
  if (i < 0) return;
  V.stack.forEach((l) => { l.feed.reset(); vio.unobserve(l.sent); });
  V.stack = []; $("#vsimlevels").textContent = "";
  V.stack.push(newLevel(list, i));
  $("#viewer").hidden = false; document.body.classList.add("lock");
  history.pushState({ iv: 1 }, ""); V.pushed = 1;
  showItem(false); $("#viewer").scrollTop = 0;
}
function pushLevel(list, i) {
  if (i < 0 || !lv()) return;
  const cur = lv(); cur.scrollTop = $("#viewer").scrollTop; cur.wrap.hidden = true;
  V.stack.push(newLevel(list, i));
  history.pushState({ iv: V.stack.length }, ""); V.pushed++;
  showItem(false); $("#viewer").scrollTop = 0;
}
function popLevel() {
  const top = V.stack.pop(); top.feed.reset(); vio.unobserve(top.sent); top.wrap.remove();
  const l = lv(); l.wrap.hidden = false;
  showItem(true); updateSimHead();
  $("#viewer").scrollTop = l.scrollTop;
}
function finishClose() {
  V.stack.forEach((l) => { l.feed.reset(); vio.unobserve(l.sent); });
  V.stack = []; V.pushed = 0; $("#vsimlevels").textContent = "";
  $("#viewer").hidden = true; document.body.classList.remove("lock"); vTok++;
  if (vUrl) { URL.revokeObjectURL(vUrl); vUrl = null; }
  if (S.view === "bm") showBm();
}
function closeViewer() {
  if (!V.stack.length) return;
  const n = V.pushed; finishClose();
  // 뷰어를 열면서 쌓은 브라우저 기록을 되돌려, 뒤로 가기 버튼이 어긋나지 않게 함
  if (n > 0) { V.unwinding = true; history.go(-n); setTimeout(() => { V.unwinding = false; }, 1000); }
}
addEventListener("popstate", () => {
  if (V.unwinding) { V.unwinding = false; return; }
  if (!V.stack.length) return;
  if (V.stack.length > 1) { V.pushed = Math.max(0, V.pushed - 1); popLevel(); }
  else { V.pushed = 0; finishClose(); }
});

function showItem(keepSim) {
  const level = lv(), it = level?.list[level.cur]; if (!it) return;
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
  if (!keepSim) simStart(level, 0);
}
// 비슷한 이미지 검색어: 태그 → 제목 키워드 → 현재 검색어 순서로 시도
function simCandidates(it) {
  const tags = (it.tags || []).map((t) => String(t).toLowerCase().trim()).filter((t) => t.length > 1);
  const tt = [...new Set(tokens(it.title || ""))];
  const c = [];
  if (tags.length) { c.push(tags.slice(0, 3).join(" ")); if (tags.length > 1) c.push(tags[0]); }
  if (tt.length) { c.push(tt.slice(0, 3).join(" ")); if (tt.length > 1) c.push(tt[0]); }
  if (M.q) c.push(M.q);
  return [...new Set(c.filter(Boolean))];
}
function simStart(level, ci) {
  const it = level.list[level.cur]; if (!it) return;
  if (ci === 0) level.cands = simCandidates(it);
  const q = level.cands[ci]; level.ci = ci;
  level.m.clear(); level.msg.hidden = true;
  const f = level.feed; f.reset();
  level.simQ = q || ""; updateSimHead();
  if (!q) { level.msg.textContent = "비슷한 이미지를 찾을 단서(태그·제목)가 없어요."; level.msg.hidden = false; return; }
  f.keys.set(keyOf(it), it); // 지금 보는 이미지는 목록에서 제외
  f.begin(q); f.next();
}
function simAfter(level) {
  const f = level.feed;
  if (f.items.length) { level.msg.hidden = true; return; }
  if (!f.ended) return;
  const act = f.sources(), allErr = act.length && act.every((s) => f.stat[s.id]?.err);
  if (!allErr && level.ci + 1 < level.cands.length) return simStart(level, level.ci + 1);
  level.msg.textContent = allErr ? "비슷한 이미지를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." : "비슷한 이미지를 찾지 못했어요.";
  level.msg.hidden = false;
}
function updateSimHead() { const l = lv(); $("#vsimq").textContent = l?.simQ ? `‘${l.simQ}’` : ""; }

$("#vveil").parentElement.addEventListener("click", () => { const it = curItem(); if (it && !$("#vveil").hidden) { it.revealed = true; showItem(true); } });
const step = (d) => { const l = lv(); if (!l) return; const n = l.cur + d; if (n >= 0 && n < l.list.length) { l.cur = n; showItem(false); $("#viewer").scrollTop = 0; } };
$("#vprev").onclick = () => step(-1); $("#vnext").onclick = () => step(1); $("#vclose").onclick = closeViewer;
addEventListener("keydown", (e) => { if ($("#viewer").hidden) return; if (e.key === "Escape") closeViewer(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
let tx = 0; const stage = $(".vstage");
stage.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; }, { passive: true });
stage.addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 70) step(dx < 0 ? 1 : -1); }, { passive: true });
$("#vstar").onclick = () => { const it = curItem(); if (it) toggleBookmark(it); };
$("#vopen").onclick = () => { const it = curItem(); if (it) window.open(it.page || it.full, "_blank", "noopener"); };
$("#vsim").onclick = () => { const box = $("#vsimbox"), v = $("#viewer"); v.scrollTo({ top: box.offsetTop - 56, behavior: "smooth" }); };
$("#vsimgo").onclick = () => { const q = lv()?.simQ; if (q) startSearch(q); };
$("#vdl").onclick = async () => {
  const it = curItem(); if (!it) return;
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

// ---------- 필터 (방향·색상) ----------
const COLORS = { red: "#e53935", orange: "#fb8c00", yellow: "#fdd835", green: "#43a047", teal: "#00acc1", blue: "#1e88e5", purple: "#8e24aa", pink: "#ec407a", brown: "#6d4c41", black: "#111", white: "#fff", gray: "#9e9e9e" };
const colorSources = () => (cfg?.sources || []).filter((s) => s.colors && !S.off.has(s.id));
function markFilters() {
  document.querySelectorAll("#colors .dot").forEach((b) => b.classList.toggle("on", b.dataset.c === S.color));
  document.querySelectorAll("#orient button").forEach((b) => b.classList.toggle("on", b.dataset.o === S.orient));
  const n = (S.color ? 1 : 0) + (S.orient ? 1 : 0);
  $("#filterBadge").textContent = n ? String(n) : "";
  const cs = colorSources();
  $("#colors").classList.toggle("dis", !cs.length);
  $("#colorNote").textContent = !cfg ? "" : cs.length
    ? `색상은 ${cs.map((s) => s.name).join("·")}에서만 적용돼요. 색상을 고르면 다른 소스는 그 검색에서 빠져요.`
    : "색상 필터는 Pixabay·Unsplash·Pexels 키를 등록해야 쓸 수 있어요. (설정 → 키 안내) 방향 필터는 지금도 돼요.";
}
const rerun = () => { markFilters(); if (M.q) startSearch(M.q, { sl: M.sl }); else feedM.pred = predOrient(); };
Object.entries(COLORS).forEach(([k, c]) => {
  const b = document.createElement("button"); b.className = "dot"; b.style.background = c; b.dataset.c = k; b.setAttribute("aria-label", k);
  b.onclick = () => {
    if (!colorSources().length) return toast("색상 필터는 Pixabay·Unsplash·Pexels 키가 있어야 해요. 설정에서 안내를 확인하세요.", 4500);
    S.color = S.color === k ? "" : k; rerun();
  };
  $("#colors").appendChild(b);
});
document.querySelectorAll("#orient button").forEach((b) => { b.onclick = () => { S.orient = b.dataset.o; rerun(); }; });
$("#filterBtn").onclick = () => { markFilters(); $("#filters").hidden = !$("#filters").hidden; };
$("#filterReset").onclick = () => { S.color = ""; S.orient = ""; rerun(); };

// ---------- 보드 ----------
$("#vboard").onclick = async () => {
  const it = curItem(); if (!it) return;
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
    const l = document.createElement("label"); l.className = "row src";
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = !S.off.has(s.id);
    c.onchange = () => { c.checked ? S.off.delete(s.id) : S.off.add(s.id); LS.set("off", [...S.off]); markFilters(); };
    const t = document.createElement("span"); t.textContent = s.name;
    if (s.desc) { const d = document.createElement("small"); d.textContent = s.desc + (s.keyless ? " · 키 불필요" : ""); t.appendChild(d); }
    l.append(c, t); box.appendChild(l);
  });
  const locked = cfg?.locked || [];
  $("#lockBox").hidden = !locked.length;
  const lb = $("#lockList"); lb.textContent = "";
  locked.forEach((s) => { const d = document.createElement("div"); d.className = "lockrow"; d.textContent = s.name + " "; const sm = document.createElement("small"); sm.textContent = `${s.desc ? s.desc + " · " : ""}변수 이름: ${s.need.join(", ")}`; d.appendChild(sm); lb.appendChild(d); });
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
  // 미국 의회도서관은 분당 20회 제한을 넘기면 1시간 차단되므로 처음에는 꺼 둡니다 (설정에서 켤 수 있음)
  if (!LS.get("locInit", false)) { S.off.add("loc"); LS.set("off", [...S.off]); LS.set("locInit", true); }
  await DB.open(); S.bmIds = new Set((await DB.all()).map((x) => x.id)); updateCount();
  markFilters(); setView("feed"); renderHome();
  // AI 검사 모델은 접속 직후에 내려받지 않고, 첫 이미지를 검사할 때 준비합니다 (첫 화면이 굳는 문제 완화)
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
boot();
