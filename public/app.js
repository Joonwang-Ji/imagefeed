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

// 홈의 추천 주제: 넓은 카테고리 [이모지, 이름, 세부 주제들]. 홈을 열 때마다 무작위로 몇 개만 보여 주고, 누르면 세부 주제로 내려갑니다.
const CATS = [
  ["🏞️", "풍경", ["바다 수평선", "안개 낀 산", "숲길", "노을 하늘", "호수 반영", "폭포", "사막 모래언덕", "초원"]],
  ["🌆", "도시", ["도시 야경", "비 오는 거리", "골목길", "고층 빌딩", "지하철역", "다리 야경", "옥상 전망"]],
  ["🛋️", "인테리어", ["미니멀 거실", "아늑한 침실", "북유럽 주방", "작은 서재", "호텔 욕실", "카페 인테리어", "빈티지 소품"]],
  ["🏛️", "건축", ["한옥 처마", "고딕 성당", "현대 건축", "나선 계단", "전통 사원", "스테인드글라스", "노출 콘크리트"]],
  ["🍜", "음식", ["한식 한 상", "디저트", "브런치", "라떼아트", "갓 구운 빵", "길거리 음식", "과일 접시"]],
  ["🌸", "꽃과 식물", ["벚꽃", "들꽃", "다육식물", "온실 정원", "이끼", "단풍잎", "해바라기 밭"]],
  ["🐈", "동물", ["고양이", "강아지", "새", "바다 생물", "야생동물", "곤충 접사", "말"]],
  ["🌌", "우주", ["은하수", "보름달", "오로라", "행성", "성운", "우주 정거장", "일식"]],
  ["🎨", "미술", ["유화 풍경", "수채화", "조각상", "추상화", "동양화", "판화", "인상주의"]],
  ["✒️", "디자인", ["포스터 디자인", "로고 디자인", "패키지 디자인", "타이포그래피", "잡지 레이아웃", "일러스트", "브랜딩 목업"]],
  ["👗", "패션", ["스트리트 패션", "빈티지 옷", "운동화", "가방", "한복", "모자 스타일", "니트"]],
  ["✈️", "여행", ["유럽 골목", "일본 소도시", "동남아 해변", "캠핑", "기차 여행", "섬 여행", "시장 풍경"]],
  ["🎞️", "빈티지", ["레트로 포스터", "옛날 사진", "필름 카메라", "오래된 간판", "복고풍 가전", "옛 지도"]],
  ["🌈", "색감", ["파스텔 톤", "네온 불빛", "흑백 사진", "따뜻한 색감", "모노톤", "그라데이션", "보색 대비"]],
  ["🧱", "질감", ["종이 질감", "대리석", "나무 결", "천 주름", "녹슨 철", "유리 반사", "돌담"]],
  ["💡", "빛과 그림자", ["역광", "골든아워", "창가 햇살", "그림자 놀이", "네온사인", "촛불", "안개 속 빛"]],
  ["🌊", "물과 불", ["파도", "물방울", "폭우", "불꽃", "모닥불", "얼음", "연기"]],
  ["🎵", "음악", ["기타", "피아노 건반", "콘서트 무대", "LP 레코드", "첼로", "합창", "버스킹"]],
  ["📚", "책과 문구", ["도서관", "손글씨 노트", "만년필", "작은 서점", "펜과 잉크", "책상 위", "종이 공예"]],
  ["🧪", "교실과 과학", ["칠판 수식", "교실 풍경", "수학 도형", "지구본과 지도", "과학 실험", "현미경", "별자리 지도"]],
  ["🎒", "배움", ["책가방", "운동장", "도서관 열람실", "스케치북", "블록 장난감", "퍼즐"]],
  ["⚽", "스포츠", ["축구장", "농구 코트", "새벽 러닝", "서핑", "클라이밍", "자전거", "수영장"]],
  ["🚆", "탈것", ["기차", "비행기 창밖", "클래식 카", "범선", "버스 정류장", "열기구"]],
  ["🧩", "패턴", ["기하학 패턴", "타일", "모자이크", "줄무늬", "꽃무늬", "한국 전통 문양", "벽지"]],
  ["💻", "기술", ["코딩 화면", "회로기판", "서버실", "로봇", "드론", "스마트폰 목업", "미래 도시"]],
  ["🏡", "가족과 일상", ["놀이터", "가족 소풍", "생일 파티", "집밥", "산책길", "빨래 널린 마당"]],
  ["🍂", "계절", ["봄 새순", "여름 소나기", "가을 단풍길", "눈 내린 마을", "첫눈", "장마"]],
  ["🇰🇷", "한국", ["한옥마을", "전통시장", "서울 야경", "제주 바다", "사찰 풍경", "골목 벽화", "한강 노을"]],
  ["🧑", "사람", ["흑백 인물 사진", "거리 스냅", "손", "실루엣", "군중 속 한 사람", "뒷모습", "웃음"]],
  ["📷", "사진 스타일", ["미니멀 구도", "광각 풍경", "접사", "항공 사진", "장노출", "하이앵글", "대칭 구도"]],
  ["☕", "카페와 공간", ["북카페", "루프탑", "작업실", "동네 빵집", "창가 자리", "벽돌 골목 카페"]],
  ["⛺", "아웃도어", ["캠핑 텐트", "등산길", "별 보는 밤", "계곡", "낚시", "해변 산책"]],
];
const EXTRA_SRC = { wiki: "위키백과" }; // 검색 소스는 아니지만 트렌드에 나오는 이미지의 출처 이름
const KO_COLOR = { red: "빨강", orange: "주황", yellow: "노랑", green: "초록", teal: "청록", blue: "파랑", purple: "보라", pink: "분홍", brown: "갈색", black: "검정", white: "하양", gray: "회색" };
const COLOR_WORDS = /\b(red|orange|yellow|green|teal|turquoise|cyan|blue|purple|violet|pink|brown|black|white|gr[ae]y|gold|golden|silver|beige|colorful|pastel|monochrome)\b/i;
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
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
  img: "이 소스의 이미지가 열리지 않아서 쉬고 있어요. 소스 이름을 누르면 다시 시도해요",
};
// 이미지가 계속 열리지 않는 소스. 이 화면을 연 동안만 기억하고 어디에도 저장하지 않습니다.
// IMGH: 소스별 이미지 성공·실패 횟수, DEAD: 쉬게 한 소스와 그 이유
const IMGH = {}, DEAD = {};

// ---------- 상태 (검색어는 저장하지 않음) ----------
// 전역 설정만 S 에 두고, 검색 한 번의 상태(검색어·결과·페이지)는 Feed 객체가 따로 가집니다.
const S = {
  pass: LS.get("pass", ""), blur: LS.get("blur", true), ml: LS.get("ml", true), off: new Set(LS.get("off", [])), only: new Set(),
  color: "", orient: "", board: "__all", view: "feed", list: [], bmIds: new Set(),
  bmq: "", bmsort: LS.get("bmsort", "new"), offline: false, colorWide: LS.get("cw", false),
};
let cfg = null;
const srcName = (id) => cfg?.sources.find((s) => s.id === id)?.name || EXTRA_SRC[id] || id;
document.body.classList.toggle("noblur", !S.blur);

// ---------- 서버 호출 ----------
async function api(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { "x-pass": S.pass, ...(opt.headers || {}) }, cache: "no-store" });
  if (r.status === 401) { showLogin("암호가 맞지 않아요"); throw new Error("auth"); }
  if (!r.ok) {
    // 이미지 중계가 실패한 이유(예: upstream 403)를 오류에 붙여 둡니다. ⚠ 에서 원인을 보여주는 데 씁니다.
    let detail = ""; try { detail = String((await r.clone().json()).error || "").slice(0, 60); } catch { /* 본문 없음 */ }
    throw Object.assign(new Error("HTTP " + r.status), { detail });
  }
  return r;
}
const limiter = (n) => { let a = 0; const q = []; const next = () => { if (a < n && q.length) { a++; const { f, ok, no } = q.shift(); f().then(ok, no).finally(() => { a--; next(); }); } }; return (f) => new Promise((ok, no) => { q.push({ f, ok, no }); next(); }); };
const limit = limiter(8);
// hi=true: 지금 화면에 필요한 큰 이미지는 썸네일 대기열을 기다리지 않고 바로 받습니다.
const fetchBlob = (path, hi) => hi
  ? api(path, { signal: AbortSignal.timeout(25000) }).then((r) => r.blob())
  : limit(async () => (await api(path, { signal: AbortSignal.timeout(20000) })).blob());

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
  if (S.view === "bm" && $("#viewer").hidden) renderBm();
}
function refreshStars() {
  document.querySelectorAll(".card").forEach((c) => { const b = c.querySelector(".star"); if (b && c._it) b.textContent = S.bmIds.has(c._it.id) ? "★" : "☆"; });
  const it = curItem(); if (it) $("#vstar").textContent = S.bmIds.has(it.id) ? "★ 북마크됨" : "☆ 북마크";
}

// ---------- 메이슨리 ----------
class Masonry {
  constructor(el) { this.el = el; this.all = []; this.cards = []; this.cols = []; this.hs = []; this.n = 0; this.pred = null; this.onChange = null; }
  // 이미지를 불러온 뒤 비율·색을 알게 되어 필터 조건에서 벗어난 카드는 목록에서 뺍니다.
  recheck(c) {
    if (!this.pred || this.pred(c) || !this.cards.includes(c)) return;
    this.cards = this.cards.filter((x) => x !== c); c.remove(); this.onChange?.();
  }
  // 이미지가 열리지 않는 카드를 목록에서 완전히 뺍니다. (필터가 바뀌어도 되살아나지 않음)
  drop(c) {
    const had = this.cards.includes(c);
    this.all = this.all.filter((x) => x !== c); this.cards = this.cards.filter((x) => x !== c); c.remove();
    if (had) this.onChange?.();
  }
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
  // 카드 순서를 다시 매깁니다 (이미 불러온 이미지는 그대로 두고 칸만 옮김)
  reorder(cmp) { this.cards.sort(cmp); this.build(); }
}
const feedM = new Masonry($("#grid"));
const bmM = new Masonry($("#bmgrid"));
const trM = new Masonry($("#trGrid"));
let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { feedM.check(); bmM.check(); trM.check(); lv()?.m.check(); }, 200); });

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

// 이미지에서 대표 색(cols: 색상 점 이름 목록)과 색 분포(sh)를 뽑습니다.
// 서버를 거쳐 받은 이미지(blob)만 읽을 수 있고, 못 읽으면 null(걸러내지 않음).
function pixelInfo(img) {
  try {
    const N = 32, c = document.createElement("canvas"); c.width = c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data;
    return { cols: window.ColorTools.classify(d, N, N), sh: window.ColorTools.shares(d, N, N) };
  } catch { return null; }
}
// blob(작은 이미지)에서 색 정보만 뽑습니다. 화면에는 표시하지 않음.
function blobInfo(blob) {
  return new Promise((res) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { const r = pixelInfo(im); URL.revokeObjectURL(u); res(r); };
    im.onerror = () => { URL.revokeObjectURL(u); res(null); };
    im.src = u;
  });
}

// 이미지가 끝내 열리지 않은 카드: 화면에서 빼고, 한 장도 못 연 소스가 연달아 실패하면 그 소스를 잠시 쉬게 합니다.
// (쉬게 하지 않으면 빈 칸이 계속 생겼다 사라지면서 "다음 페이지"를 끝없이 불러와 화면이 깜빡입니다.)
function failCard(el) {
  const it = el._it; el.classList.add("broken");
  io.unobserve(el); el._m?.drop(el);
  if (!el._feed || !it?.src) return;
  const h = (IMGH[it.src] ||= { ok: 0, bad: 0 }); h.bad++;
  if (!h.ok && h.bad >= 4 && !DEAD[it.src]) markDead(it.src, it._why || "");
}
function markDead(src, why) {
  DEAD[src] = { why };
  const ms = [feedM, ...V.stack.map((l) => l.m)];
  ms.forEach((m) => m.all.filter((c) => c._it?.src === src && !c._ok).forEach((c) => { io.unobserve(c); m.drop(c); })); // 아직 못 연 카드는 모두 치움
  renderStat(); M.o.onAfter?.(); V.stack.forEach((l) => l.feed.o.onAfter?.());
}

async function loadCard(el) {
  const it = el._it, img = el.querySelector("img");
  const needML = S.blur && S.ml && !it.adult && !it.fromBm;
  const inMain = !!el.closest("#grid");
  const simLevel = el.closest(".simlevel") ? V.stack.find((l) => l.wrap.contains(el)) : null;
  const wantColor = !!S.color && inMain && !it.sc && !it.cols;
  const wantSh = !!simLevel && !it.sh;
  // 색만 알면 되는 경우(색 필터)에는 작은 이미지(alt)로 분석해서 느린 원본 내려받기를 피합니다.
  const colorFromAlt = wantColor && !!it.alt && !it.blob && !needML;
  el.dataset.st = it.adult ? "flag" : needML ? "pending" : "ok";
  // 큰 썸네일 주소가 안 열리는 소스(예: V&A)는 작은 주소(alt)로 한 번 더 시도
  img.onload = () => { if (!el._ok) { el._ok = true; (IMGH[it.src] ||= { ok: 0, bad: 0 }).ok++; } };
  img.onerror = () => { if (it.alt && img.dataset.alt !== "1") { img.dataset.alt = "1"; img.referrerPolicy = "no-referrer"; img.src = it.alt; } else failCard(el); };
  try {
    let altInfo = null;
    if (colorFromAlt) { try { altInfo = await blobInfo(await fetchBlob(`/api/img?u=${enc(it.alt)}`)); } catch (e) { if (e.message === "auth") throw e; } }
    if (it.blob) img.src = URL.createObjectURL(it.blob);
    else if (needML || (wantColor && !colorFromAlt)) { const b = await fetchBlob(`/api/img?u=${enc(it.thumb)}`); it.blob = b; img.src = URL.createObjectURL(b); }
    else { img.referrerPolicy = "no-referrer"; img.src = it.thumb; }
    await img.decode().catch(() => {});
    el.classList.add("loaded");
    // 비율을 모르는 소스(미술관 등)는 불러온 뒤 실제 비율로 맞춤
    if ((!it.w || !it.h) && img.naturalWidth && img.naturalHeight) {
      it.w = img.naturalWidth; it.h = img.naturalHeight;
      el._r = clamp(it.w / it.h, 0.5, 2.2); el.style.aspectRatio = String(el._r);
    }
    if (wantColor) { const inf = altInfo || (it.blob ? pixelInfo(img) : null); it.cols = inf?.cols || null; it.sh = inf?.sh || it.sh; }
    if (wantSh && it.blob) { const inf = pixelInfo(img); if (inf?.sh) { it.sh = inf.sh; simRerankSoon(simLevel); } }
    if (inMain) feedM.recheck(el); // 방향·색이 조건과 다르면 목록에서 뺌
    if (needML && it.blob) enqueueClassify(el, img, it);
  } catch (e) {
    if (e.message === "auth") return;
    if (e.detail) it._why = e.detail; // 서버 중계가 실패한 이유 (예: upstream 403)
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
    this.acs?.forEach((a) => a.abort()); // 진행 중이던 요청은 취소 (뷰어에서 빠르게 넘길 때 낭비 방지)
    Object.assign(this, { q: "", qe: "", sl: "", page: 0, loading: false, ended: false, blocked: false, acs: new Set(),
      srcEnded: new Set(), stat: {}, items: [], keys: new Map(), tags: new Map(), trP: Promise.resolve() });
  }
  sources() {
    const on = (cfg?.sources || []).filter((s) => !S.off.has(s.id));
    // 소스 패널에서 고른 소스만 검색 (메인 피드만 해당). 고른 소스가 꺼져 있으면 전체로 되돌립니다.
    let pickd = this.o.filters && S.only.size ? on.filter((s) => S.only.has(s.id)) : on;
    if (!pickd.length) pickd = on;
    // 색을 골랐을 때는 색을 직접 걸러 주는 소스(Pixabay·Unsplash)만 씁니다. 빠르고 정확하기 때문이에요.
    // (필터 패널에서 "넓게"를 고르면 다른 소스도 쓰되, 이미지를 불러온 뒤 브라우저가 대표 색으로 거릅니다.)
    if (this.o.filters && S.color && !S.colorWide) { const cs = pickd.filter((s) => s.colors); if (cs.length) pickd = cs; }
    return pickd.filter((s) => !DEAD[s.id]); // 이미지가 열리지 않아 쉬는 소스는 뺌
  }
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
      const ac = new AbortController(); this.acs.add(ac);
      let timedOut = false; const tm = setTimeout(() => { timedOut = true; ac.abort(); }, 16000);
      try {
        if (s.en) await this.trP;
        const r = await (await api(`/api/search?src=${s.id}&q=${enc(this.q)}&qe=${enc(this.qe)}&page=${page}&safe=${safe}&color=${color}&orient=${orient}`, { signal: ac.signal })).json();
        if (gen !== this.gen) return;
        if (r.blocked) { this.blocked = true; return; }
        if (r.err) { this.fail(s, r); return; }
        const st = (this.stat[s.id] ||= { n: 0 }); st.n += r.items.length;
        if (!r.items.length) this.srcEnded.add(s.id);
        batch.push({ src: s, items: r.items });
        if (!timer) timer = setTimeout(flush, page === 1 ? 600 : 300);
      } catch (e) {
        if (gen !== this.gen || e.message === "auth") return;
        this.fail(s, { err: timedOut || e.name === "TimeoutError" ? "timeout" : "network" });
      } finally { clearTimeout(tm); this.acs.delete(ac); }
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
      const c = makeCard(it, () => this.o.open(this, it));
      c._feed = this; c._m = this.m; // 이미지가 열리지 않을 때 어느 목록에서 뺄지 알기 위함
      return c;
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
// 비율을 아직 모르는 이미지는 일단 통과시키고, 불러온 뒤 loadCard 가 다시 판정합니다.
const predOrient = () => !S.orient ? null : (c) => {
  if (!c._it.w || !c._it.h) return true;
  const r = c._it.w / c._it.h; return S.orient === "v" ? r < 0.9 : S.orient === "h" ? r > 1.1 : r >= 0.9 && r <= 1.1;
};
// 서버가 색을 맞춰 준 이미지(sc)와 아직 색을 모르는 이미지는 통과, 대표 색을 알게 되면 고른 색이 포함될 때만 남깁니다.
const predColor = () => !S.color ? null : (c) => !c._it.cols || !!c._it.sc || c._it.cols.includes(S.color);
const feedPred = () => {
  const po = predOrient(), pc = predColor();
  return po || pc ? (c) => (!po || po(c)) && (!pc || pc(c)) : null;
};
// 필터로 카드가 빠지면 목록이 비거나 화면이 덜 찰 수 있으니 안내를 갱신하고 다음 페이지를 불러옵니다.
let kickT;
feedM.onChange = () => {
  clearTimeout(kickT);
  kickT = setTimeout(() => {
    if (!M.items.length) return;
    checkEmpty();
    if (!M.ended) { sio.unobserve($("#sentinel")); sio.observe($("#sentinel")); }
  }, 250);
};

async function startSearch(q, opts = {}) {
  q = (q || "").trim().slice(0, 100);
  if (!q || !cfg) return;
  if (S.offline) return toast("오프라인이라 북마크만 볼 수 있어요");
  if (V.stack.length) closeViewer();
  setView("feed");
  M.reset(); M.begin(q, opts.sl);
  $("#q").value = q; syncQ(); $("#q").blur(); $("#home").hidden = true; $("#filters").hidden = true; if (!opts.keep) $("#srcPanel").hidden = true;
  feedM.clear(); feedM.pred = feedPred(); markFilters(); $("#msg").hidden = true; $("#msg").textContent = ""; renderChips(); renderStat(); scrollTo(0, 0);
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
  const all = (cfg?.sources || []).filter((s) => !S.off.has(s.id));
  const used = new Set(M.sources().map((x) => x.id)); // 지금 검색에 쓰는 소스 (색을 고르면 일부만 씀)
  let bads = 0;
  all.forEach((s) => {
    const dead = DEAD[s.id];
    const st = dead ? { n: 0, err: "img", detail: dead.why } : M.q ? M.stat[s.id] : null, bad = !!st?.err; if (bad) bads++;
    const idle = !!M.q && !used.has(s.id) && !dead;
    const w = document.createElement("span"); w.className = "sc" + (S.only.has(s.id) ? " on" : "") + (bad ? " bad" : "") + (idle ? " idle" : "");
    const b = document.createElement("button"); b.className = "sel";
    b.textContent = !M.q || idle ? s.name : !st ? `${s.name} …` : bad ? s.name : `${s.name} ${st.n}`;
    b.onclick = () => { delete DEAD[s.id]; delete IMGH[s.id]; S.only.has(s.id) ? S.only.delete(s.id) : S.only.add(s.id); renderStat(); queueRerun(); }; // 눌러서 다시 시도할 수 있게 쉬는 상태도 풂
    w.appendChild(b);
    if (bad) {
      const x = document.createElement("button"); x.className = "warn"; x.textContent = "⚠"; x.setAttribute("aria-label", "이유 보기");
      x.onclick = () => toast(`${s.name}: ${WHY[st.err] || WHY.error}${st.detail ? ` (${st.detail})` : ""}`, 7000);
      w.appendChild(x);
    }
    box.appendChild(w);
  });
  if (aiState === "loading") { const el = document.createElement("span"); el.className = "st"; el.textContent = "AI 검사 준비 중…"; box.appendChild(el); }
  $("#srcBadge").textContent = S.only.size ? String(S.only.size) : bads ? "⚠" : "";
  $("#srcBadge").classList.toggle("warnb", !S.only.size && !!bads);
  $("#srcNote").textContent = S.only.size ? "선택한 소스에서만 검색해요. 다시 누르면 선택이 풀려요." : "지금은 켜져 있는 모든 소스에서 검색해요. 소스 이름을 누르면 그 소스에서만 찾아요.";
}
let rerunTimer = null;
function queueRerun() { clearTimeout(rerunTimer); rerunTimer = setTimeout(() => { if (M.q) startSearch(M.q, { sl: M.sl, keep: true }); }, 450); }
function showMsg(t) { const m = $("#msg"); m.textContent = t; m.hidden = false; }
function checkEmpty() {
  if (feedM.cards.length) { if (M.items.length) $("#msg").hidden = true; return; }
  if (M.items.length) { // 결과는 있었지만 화면에 남은 카드가 없음
    if (!M.sources().length && Object.keys(DEAD).length) showMsg("이미지가 열리지 않아 쉬고 있는 소스예요. 위의 [소스]에서 ⚠ 를 누르면 이유를, 소스 이름을 누르면 다시 시도해요.");
    else if (M.ended) showMsg("방향·색상 조건에 맞는 이미지를 찾지 못했어요. 필터를 바꾸거나 다른 말로 검색해 보세요.");
    return;
  }
  const act = M.sources();
  const allErr = act.length && act.every((s) => M.stat[s.id]?.err);
  if (M.ended || allErr) showMsg(!act.length ? "켜져 있는 검색 소스가 없어요. 설정에서 켜 주세요." : allErr ? "검색 소스에 연결하지 못했어요. 상단의 [소스] 버튼에서 ⚠ 를 눌러 이유를 확인해 보세요." : "결과가 없어요. 다른 말로 검색해 보세요.");
}
const sio = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && S.view === "feed") M.next(); }, { rootMargin: "1200px 0px" });
sio.observe($("#sentinel"));

// ---------- 홈 / 처음으로 ----------
// 홈을 열 때마다 카테고리를 새로 섞어서 보여 줍니다. 카테고리를 누르면 그 안의 세부 주제로 내려갑니다.
const HOME = { cat: null, picks: [], tok: 0 };
async function bmTopTags(n = 8) {
  const cnt = new Map();
  for (const x of await DB.all()) for (const t of new Set([...(x.tags || []).map((v) => String(v).toLowerCase()), ...tokens(x.title || "")])) cnt.set(t, (cnt.get(t) || 0) + 1);
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}
function renderHome(reshuffle) {
  const box = $("#homeChips"), tok = ++HOME.tok, cat = HOME.cat; box.textContent = "";
  const chip = (label, cls, fn) => { const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; box.appendChild(b); };
  $("#homeBack").hidden = !cat; $("#homeShuffle").hidden = !!cat;
  $("#homeTitle").textContent = cat ? `${cat[0]} ${cat[1]}` : "추천 주제";
  if (!cat) {
    if (reshuffle || !HOME.picks.length) HOME.picks = shuffle(CATS).slice(0, 10);
    HOME.picks.forEach((c) => chip(`${c[0]} ${c[1]}`, "cat", () => { HOME.cat = c; renderHome(); }));
    // 북마크가 있으면 내 취향 태그를 한두 개 섞어 줍니다
    bmTopTags(6).then((tags) => { if (tok === HOME.tok && !HOME.cat) shuffle(tags).slice(0, 2).forEach((t) => chip(`⭐ ${t}`, "mine", () => startSearch(t))); });
  } else {
    chip(`‘${cat[1]}’ 전체 보기`, "cat", () => startSearch(cat[1]));
    cat[2].forEach((s) => chip(s, "", () => startSearch(s)));
  }
  $("#home").hidden = !!M.q || S.view !== "feed";
}
$("#homeShuffle").onclick = () => renderHome(true);
$("#homeBack").onclick = () => { HOME.cat = null; renderHome(); };
function goHome() {
  if (S.offline) return;
  if (V.stack.length) closeViewer();
  M.reset(); feedM.clear(); feedM.pred = null;
  S.color = ""; S.orient = ""; S.only.clear(); markFilters();
  $("#q").value = ""; syncQ(); $("#q").blur(); $("#msg").hidden = true; $("#msg").textContent = ""; $("#filters").hidden = true; $("#srcPanel").hidden = true;
  HOME.cat = null;
  setView("feed"); renderChips(); renderStat(); renderHome(true); scrollTo(0, 0);
}
$("#homeBtn").onclick = goHome;
$("#sf").addEventListener("submit", (e) => { e.preventDefault(); startSearch($("#q").value); });

// 입력칸의 ✕: 한 번에 모두 지웁니다. (키보드는 그대로 둠)
function bindClear(input, btn, onClear) {
  const sync = () => { btn.hidden = !input.value; };
  input.addEventListener("input", sync);
  btn.addEventListener("pointerdown", (e) => e.preventDefault());
  btn.addEventListener("click", () => { input.value = ""; sync(); input.focus(); onClear?.(); });
  sync(); return sync;
}
const syncQ = bindClear($("#q"), $("#qClear"));

// 둘러보기 버튼 3종
$("#exRand").onclick = () => { const c = pick(CATS); startSearch(pick(c[2])); };
$("#exTrend").onclick = () => setView("tr");
$("#exBm").onclick = async () => {
  const top = await bmTopTags(8);
  if (!top.length) { toast("북마크한 이미지에 태그가 아직 없어서 아무 주제로 찾아요"); const c = pick(CATS); return startSearch(pick(c[2])); }
  startSearch(pick(top));
};

// ---------- 탭/북마크 보기 ----------
function setView(v) {
  S.view = v;
  $("#tabFeed").classList.toggle("on", v === "feed"); $("#tabBm").classList.toggle("on", v === "bm"); $("#tabTr").classList.toggle("on", v === "tr");
  $("#grid").hidden = v !== "feed"; $("#bmgrid").hidden = v !== "bm"; $("#trends").hidden = v !== "tr"; $("#bmtools").hidden = v !== "bm";
  $("#srcBtn").hidden = v !== "feed"; $("#filterBtn").hidden = v !== "feed"; if (v !== "feed") { $("#filters").hidden = true; $("#srcPanel").hidden = true; }
  $("#home").hidden = !(v === "feed" && !M.q);
  if (v === "feed") { feedM.check(); renderChips(); const m = $("#msg"); m.hidden = !(M.q && !M.items.length && m.textContent); }
  else if (v === "tr") { $("#msg").hidden = true; renderChips(); trM.check(); loadTrends(); scrollTo(0, 0); }
}
async function showBm() { setView("bm"); await renderBm(); }
// 북마크 목록 그리기: 보드 · 검색어 · 정렬을 적용합니다. (검색어는 저장하지 않고 이 화면에만 둡니다)
async function renderBm() {
  const all = (await DB.all()).map((x) => ({ ...x, fromBm: true, tags: x.tags || [] }));
  renderBoardChips(all);
  const q = (S.bmq || "").trim().toLowerCase();
  let shown = all.filter((x) => S.board === "__all" || (x.board || "") === S.board);
  if (q) shown = shown.filter((x) => [x.title, srcName(x.src), x.board, x.note, ...x.tags].join(" ").toLowerCase().includes(q));
  const by = S.bmsort;
  shown.sort(by === "old" ? (a, b) => a.ts - b.ts : by === "title" ? (a, b) => String(a.title || srcName(a.src)).localeCompare(String(b.title || srcName(b.src)), "ko") : (a, b) => b.ts - a.ts);
  S.list = shown; bmM.clear();
  if (!shown.length) { showMsg(!all.length ? "아직 북마크가 없어요. 이미지의 ☆ 를 눌러 담아 보세요." : q ? "찾는 북마크가 없어요. 다른 말로 검색해 보세요." : "이 보드는 비어 있어요."); return; }
  $("#msg").hidden = true;
  bmM.add(shown.map((it) => makeCard(it, () => openViewer(S.list, S.list.indexOf(it)))));
}
let bmT; $("#bmq").oninput = (e) => { S.bmq = e.target.value; clearTimeout(bmT); bmT = setTimeout(renderBm, 200); };
bindClear($("#bmq"), $("#bmClear"), () => { S.bmq = ""; renderBm(); });
$("#bmsort").value = S.bmsort; $("#bmsort").onchange = (e) => { S.bmsort = e.target.value; LS.set("bmsort", S.bmsort); renderBm(); };
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
  V.stack.forEach((l) => { l.feed.reset(); clearTimeout(l.rrT); vio.unobserve(l.sent); });
  V.stack = []; V.pushed = 0; $("#vsimlevels").textContent = ""; zReset();
  $("#viewer").hidden = true; document.body.classList.remove("lock"); vTok++;
  if (vUrl) { URL.revokeObjectURL(vUrl); vUrl = null; }
  if (S.view === "bm") renderBm();
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
  zReset();
  const hide = it.adult && S.blur && !it.revealed;
  img.classList.toggle("blur", hide); $("#vveil").hidden = !hide;
  $("#vtitle").textContent = it.title || srcName(it.src);
  $("#vsrc").textContent = srcName(it.src) + (it.w ? ` · ${it.w}×${it.h}` : "");
  refreshStars(); $("#vboard").textContent = it.board ? "보드: " + it.board : "보드·메모";
  $("#vnote").textContent = it.note || ""; $("#vnote").hidden = !it.note;
  img.referrerPolicy = "no-referrer";
  img.src = it.blob ? URL.createObjectURL(it.blob) : it.thumb;
  fetchBlob(`/api/img?u=${enc(it.full)}`, true).then((b) => {
    if (token !== vTok) return;
    it.fullBlob = b; if (vUrl) URL.revokeObjectURL(vUrl); vUrl = URL.createObjectURL(b); img.src = vUrl;
    // 큰 이미지에서 색 분포를 다시 뽑아, 비슷한 이미지를 색이 가까운 순으로 정리하는 기준으로 씁니다.
    img.decode().then(() => { if (token !== vTok || !V.stack.includes(level)) return; const inf = pixelInfo(img); if (inf?.sh) { level.sig = inf.sh; simRerankSoon(level); } }).catch(() => {});
  }).catch(() => {
    if (token !== vTok) return;
    const t = new Image(); t.referrerPolicy = "no-referrer"; t.onload = () => { if (token === vTok) img.src = it.full; }; t.src = it.full;
  });
  if (!keepSim) simSchedule(level);
}
// 이미지를 넘길 때마다 바로 검색하지 않고, 0.4초 멈췄을 때 시작합니다. (빠르게 넘길 때 요청이 쌓이는 것을 막음)
let simT = null;
function simSchedule(level) {
  clearTimeout(simT); clearTimeout(level.rrT);
  level.feed.reset(); level.m.clear(); level.msg.hidden = true; level.simQ = ""; level.sig = null; level.cw = ""; level.rrDone = 0; updateSimHead();
  if (S.offline) return;
  const it = level.list[level.cur];
  simT = setTimeout(() => { if (V.stack.includes(level) && level.list[level.cur] === it) simBegin(level, it); }, 400);
}
// 비슷한 이미지 검색어를 정하는 순서:
//  1) 이미 불러온 썸네일에서 대표 색 이름을 뽑아 둠 (검색어에 덧붙여 색감을 맞춤)
//  2) 태그가 3개 미만이면 AI 설명(소재·분위기·색)을 받아 검색어로 씀. 태그가 충분하면 AI 없이 태그로 바로 찾음.
async function simBegin(level, it, force) {
  const same = () => V.stack.includes(level) && level.list[level.cur] === it;
  if (!level.sig && it.blob) { try { level.sig = (await blobInfo(it.blob))?.sh || null; } catch { /* 색 정보 없이 진행 */ } if (!same()) return; }
  let cap = "";
  const strong = (it.tags || []).length >= 3;
  if (!it.adult && (force ? captionOn() : captionAuto() && !strong)) {
    level.msg.textContent = "AI가 이미지를 보는 중…"; level.msg.hidden = false;
    cap = (await captionOfItem(it)).q;
    if (!same()) return;
    level.msg.hidden = true;
  }
  level.cap = cap; level.cw = window.ColorTools.topColor(level.sig);
  simStart(level, 0);
}
// 비슷한 이미지 검색어 후보 (앞에서부터 시도하고, 결과가 없으면 다음 후보):
// AI 설명 → 태그(+색 이름) → 태그 → 제목 키워드(+색 이름) → 제목 키워드 → 현재 검색어
function simCandidates(it, cap, cw) {
  const tags = (it.tags || []).map((t) => String(t).toLowerCase().trim()).filter((t) => t.length > 1);
  const tt = [...new Set(tokens(it.title || ""))];
  // 색 이름은 검색어에 이미 색이 없을 때만 덧붙임 (한글 검색어면 한글 색 이름)
  const withC = (s) => (!cw || !s || COLOR_WORDS.test(s) || /(빨강|주황|노랑|초록|파랑|보라|분홍|갈색|검정|하양|회색)/.test(s)) ? s : `${s} ${hasHangul(s) ? KO_COLOR[cw] || "" : cw}`.trim();
  const c = [];
  if (cap) { c.push(cap); const w = cap.split(" "); if (w.length > 3) c.push(w.slice(0, 3).join(" ")); }
  if (tags.length) { c.push(withC(tags.slice(0, 2).join(" "))); c.push(tags.slice(0, 3).join(" ")); if (tags.length > 1) c.push(tags[0]); }
  if (tt.length) { c.push(withC(tt.slice(0, 2).join(" "))); c.push(tt.slice(0, 3).join(" ")); if (tt.length > 1) c.push(tt[0]); }
  if (M.q) c.push(M.q);
  return [...new Set(c.filter(Boolean))];
}
// 글자 검색만으로는 색감이 어긋나서, 불러온 비슷한 이미지를 현재 이미지와 색 분포가 가까운 순으로 살짝 끌어올립니다.
// (순위의 절반은 원래 검색 순서, 절반은 색 유사도. 최대 두 번, 사용자가 아직 이미지 근처에 있을 때만)
function simRerankSoon(level) {
  if (!level || (level.rrDone || 0) >= 2) return;
  clearTimeout(level.rrT); level.rrT = setTimeout(() => simRerank(level), 900);
}
function simRerank(level) {
  if (!V.stack.includes(level) || level !== lv() || !level.sig || (level.rrDone || 0) >= 2) return;
  if ($("#viewer").scrollTop > $("#vsimbox").offsetTop + 60) return; // 이미 아래로 내려가서 보는 중이면 순서를 바꾸지 않음
  const cards = level.m.cards, n = cards.length;
  if (cards.filter((c) => c._it.sh).length < 6) return;
  const CT = window.ColorTools;
  const sc = new Map(cards.map((c, i) => { const s = CT.similarity(level.sig, c._it.sh); return [c, 0.5 * (1 - i / n) + 0.5 * (s == null ? 0.3 : s)]; }));
  level.m.reorder((a, b) => sc.get(b) - sc.get(a));
  level.rrDone = (level.rrDone || 0) + 1;
}
function simStart(level, ci) {
  const it = level.list[level.cur]; if (!it) return;
  if (ci === 0) level.cands = simCandidates(it, level.cap, level.cw);
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
$("#vprev").onclick = () => step(-1); $("#vnext").onclick = () => step(1); $("#vclose").onclick = closeViewer; $("#vfab").onclick = closeViewer;
addEventListener("keydown", (e) => {
  if (!$("#bmSheet").hidden) { if (e.key === "Escape") closeSheet(); return; }
  if (!$("#settings").hidden) { if (e.key === "Escape") closeSettings(); return; }
  if ($("#viewer").hidden || e.target.closest?.("input,textarea,select")) return;
  if (e.key === "Escape") closeViewer(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1);
});
// ----- 이미지 확대·축소: 화면 전체는 확대되지 않고, 뷰어의 이미지에서만 핀치·더블탭·끌기로 확대합니다 -----
// 확대 전(1배)에는 좌우로 밀어서 이전·다음 이미지, 세로로 밀면 평소처럼 화면 스크롤(비슷한 이미지 보기).
const stage = $(".vstage"), wrap = $(".vwrap"), vimg = $("#vimg");
const Z = { s: 1, x: 0, y: 0, pts: new Map(), p0: null, drag: null, swipe: null, tap: null };
const ZMAX = 5;
function zApply() {
  vimg.style.transform = Z.s <= 1.001 && !Z.x && !Z.y ? "" : `translate(${Z.x}px,${Z.y}px) scale(${Z.s})`;
  const on = Z.s > 1.01; stage.classList.toggle("zoomed", on); $("#vzreset").hidden = !on;
}
function zReset() { Z.s = 1; Z.x = Z.y = 0; Z.pts.clear(); Z.p0 = Z.drag = Z.swipe = Z.tap = null; zApply(); }
function zSnap() { if (Z.s <= 1.01) { Z.s = 1; Z.x = Z.y = 0; zApply(); } } // 거의 1배면 1배로 붙이기 (넘기기·더블탭 기록은 건드리지 않음)
function zClamp() {
  if (Z.s <= 1) { Z.s = 1; Z.x = Z.y = 0; return; }
  const mx = Math.max(0, (vimg.clientWidth * Z.s - wrap.clientWidth) / 2), my = Math.max(0, (vimg.clientHeight * Z.s - wrap.clientHeight) / 2);
  Z.x = clamp(Z.x, -mx, mx); Z.y = clamp(Z.y, -my, my);
}
// 이미지 중심(= 틀의 중심)을 기준으로 한 좌표
const zRel = (cx, cy) => { const r = wrap.getBoundingClientRect(); return [cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)]; };
function zZoomAt(s2, cx, cy) {
  s2 = clamp(s2, 1, ZMAX); const [px, py] = zRel(cx, cy);
  Z.x = px - (px - Z.x) * s2 / Z.s; Z.y = py - (py - Z.y) * s2 / Z.s; Z.s = s2; zClamp(); zApply();
}
function zPinchStart() {
  const [a, b] = [...Z.pts.values()], [cx, cy] = zRel((a.x + b.x) / 2, (a.y + b.y) / 2);
  Z.p0 = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: Z.s, px: (cx - Z.x) / Z.s, py: (cy - Z.y) / Z.s };
  Z.swipe = Z.drag = Z.tap = null;
}
wrap.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  try { wrap.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저는 지원하지 않음 */ }
  Z.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (Z.pts.size === 2) zPinchStart();
  else if (Z.pts.size === 1) { Z.swipe = { x: e.clientX, y: e.clientY, t: Date.now() }; Z.drag = { x: Z.x, y: Z.y, px: e.clientX, py: e.clientY }; }
});
wrap.addEventListener("pointermove", (e) => {
  const p = Z.pts.get(e.pointerId); if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (Z.pts.size === 2 && Z.p0) {
    const [a, b] = [...Z.pts.values()], s2 = clamp(Z.p0.s * (Math.hypot(a.x - b.x, a.y - b.y) / Z.p0.d), 1, ZMAX);
    const [cx, cy] = zRel((a.x + b.x) / 2, (a.y + b.y) / 2);
    Z.s = s2; Z.x = cx - s2 * Z.p0.px; Z.y = cy - s2 * Z.p0.py; zClamp(); zApply();
  } else if (Z.pts.size === 1 && Z.drag && Z.s > 1.01) {
    Z.x = Z.drag.x + (e.clientX - Z.drag.px); Z.y = Z.drag.y + (e.clientY - Z.drag.py); zClamp(); zApply();
  }
});
function zUp(e) {
  const had = Z.pts.delete(e.pointerId); if (!had) return;
  if (Z.pts.size === 1) { // 두 손가락 중 하나를 뗌: 남은 손가락으로 이어서 끌 수 있게 기준을 다시 잡음 (이때는 넘기기·더블탭 아님)
    const q = [...Z.pts.values()][0]; Z.p0 = null; Z.swipe = Z.tap = null; Z.drag = { x: Z.x, y: Z.y, px: q.x, py: q.y };
    zSnap();
    return;
  }
  if (Z.pts.size > 0) return;
  Z.p0 = null; Z.drag = null;
  const sw = Z.swipe; Z.swipe = null;
  zSnap();
  if (!sw || e.type === "pointercancel") return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y, moved = Math.hypot(dx, dy);
  if (Z.s <= 1.01 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { Z.tap = null; step(dx < 0 ? 1 : -1); return; }
  if (moved < 12 && Date.now() - sw.t < 350) { // 가볍게 두 번 누르면 확대 ↔ 원래 크기
    const t = Z.tap, now = Date.now();
    if (t && now - t.t < 320 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 32) { Z.tap = null; Z.s > 1.01 ? zReset() : zZoomAt(2.5, e.clientX, e.clientY); }
    else Z.tap = { t: now, x: e.clientX, y: e.clientY };
  }
}
wrap.addEventListener("pointerup", zUp); wrap.addEventListener("pointercancel", zUp);
// 컴퓨터: Ctrl+휠(트랙패드 핀치)로 확대
wrap.addEventListener("wheel", (e) => { if (!e.ctrlKey) return; e.preventDefault(); zZoomAt(Z.s * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); }, { passive: false });
$("#vzreset").onclick = zReset;
// 아이폰 사파리의 기본 핀치 확대(제스처)도 막습니다. 뷰어의 이미지 확대는 위 코드가 처리해요.
["gesturestart", "gesturechange", "gestureend"].forEach((n) => document.addEventListener(n, (e) => e.preventDefault(), { passive: false }));
$("#vstar").onclick = () => { const it = curItem(); if (it) toggleBookmark(it); };
$("#vopen").onclick = () => { const it = curItem(); if (it) window.open(it.page || it.full, "_blank", "noopener"); };
$("#vsim").onclick = () => { const box = $("#vsimbox"), v = $("#viewer"); v.scrollTo({ top: box.offsetTop - 56, behavior: "smooth" }); };
$("#vsimgo").onclick = () => { const q = lv()?.simQ; if (q) startSearch(q); };
$("#vsimai").onclick = () => {
  const l = lv(), it = l?.list[l.cur]; if (!l || !it) return;
  if (!captionOn()) return toast("AI 설명을 쓸 수 없어요. 설정에서 켜져 있는지 확인해 주세요.");
  clearTimeout(simT); l.feed.reset(); l.m.clear(); simBegin(l, it, true);
};
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

// ---------- 트렌드: 단어 대신 이미지로 ----------
// 서버가 위키백과(한국어·영어)에서 많이 본 문서의 대표 사진(grp "news")과 Pixabay·Unsplash 인기 사진(grp "pop")을 섞어서 줍니다.
const TR = { g: "", at: 0, items: [], date: "", loading: false };
async function loadTrends(force) {
  if (TR.loading) return;
  if (!force && TR.items.length && Date.now() - TR.at < 30 * 60000) { renderTrends(); return; }
  TR.loading = true; trM.clear(); $("#trNote").textContent = "불러오는 중…";
  try {
    const j = await (await api("/api/trends")).json();
    TR.items = (j.items || []).map((it) => { const key = keyOf(it); return { ...it, id: hashId(key), key, tags: it.tags || [] }; });
    TR.date = j.date || ""; TR.at = Date.now();
    renderTrends();
  } catch (e) { if (e.message !== "auth") $("#trNote").textContent = "트렌드를 불러오지 못했어요. 잠시 후 [새로고침]을 눌러 주세요."; }
  finally { TR.loading = false; }
}
function renderTrends() {
  const list = TR.items.filter((it) => !TR.g || it.grp === TR.g);
  trM.clear();
  document.querySelectorAll("#trSeg button").forEach((b) => b.classList.toggle("on", b.dataset.g === TR.g));
  $("#trNote").textContent = !list.length ? "이 분류에 보여 줄 이미지가 없어요. (인기 사진은 Pixabay·Unsplash 키가 있어야 나와요)"
    : `${TR.date ? TR.date + " 기준 · " : ""}위키백과(한국어·영어)에서 많이 본 문서의 대표 사진과 인기 사진이에요. 탭하면 크게 보고 비슷한 이미지도 찾아요.`;
  trM.add(list.map((it) => makeCard(it, () => openViewer(list, list.indexOf(it)))));
}
document.querySelectorAll("#trSeg button").forEach((b) => { b.onclick = () => { TR.g = b.dataset.g; renderTrends(); }; });
$("#trRefresh").onclick = () => loadTrends(true);

// ---------- 필터 (방향·색상) ----------
const COLORS = { red: "#e53935", orange: "#fb8c00", yellow: "#fdd835", green: "#43a047", teal: "#00acc1", blue: "#1e88e5", purple: "#8e24aa", pink: "#ec407a", brown: "#6d4c41", black: "#111", white: "#fff", gray: "#9e9e9e" };
const colorSources = () => (cfg?.sources || []).filter((s) => s.colors && !S.off.has(s.id));
function markFilters() {
  document.querySelectorAll("#colors .dot").forEach((b) => b.classList.toggle("on", b.dataset.c === S.color));
  document.querySelectorAll("#orient button").forEach((b) => b.classList.toggle("on", b.dataset.o === S.orient));
  const n = (S.color ? 1 : 0) + (S.orient ? 1 : 0);
  $("#filterBadge").textContent = n ? String(n) : "";
  const cs = colorSources(), names = cs.map((s) => s.name).join("·");
  $("#colors").classList.remove("dis");
  $("#cwRow").hidden = !(S.color && cs.length);
  document.querySelectorAll("#cwSeg button").forEach((b) => b.classList.toggle("on", (b.dataset.w === "1") === S.colorWide));
  $("#colorNote").textContent = !cfg ? "" :
    !cs.length ? "색 필터가 되는 소스(Pixabay·Unsplash)가 없어서, 모든 이미지를 불러온 뒤 대표 색으로 걸러요. 결과가 천천히 채워질 수 있어요."
    : !S.color ? `${names}는 검색할 때 색을 직접 걸러 줘서 빠르고 정확해요.`
    : !S.colorWide ? `${names}가 색을 직접 걸러 줘서 빠르고 정확해요. 다른 소스까지 쓰려면 ‘넓게’를 고르세요. (이미지를 불러온 뒤 대표 색으로 걸러서 느려요)`
    : `모든 소스에서 찾아요. ${names}는 검색할 때 걸러 주고, 나머지는 이미지를 불러온 뒤 대표 색으로 걸러서 천천히 채워져요.`;
}
const rerun = () => { markFilters(); if (M.q) startSearch(M.q, { sl: M.sl }); else feedM.pred = feedPred(); };
Object.entries(COLORS).forEach(([k, c]) => {
  const b = document.createElement("button"); b.className = "dot"; b.style.background = c; b.dataset.c = k; b.setAttribute("aria-label", k);
  b.onclick = () => { S.color = S.color === k ? "" : k; rerun(); };
  $("#colors").appendChild(b);
});
document.querySelectorAll("#orient button").forEach((b) => { b.onclick = () => { S.orient = b.dataset.o; rerun(); }; });
document.querySelectorAll("#cwSeg button").forEach((b) => { b.onclick = () => { S.colorWide = b.dataset.w === "1"; LS.set("cw", S.colorWide); rerun(); }; });
$("#filterBtn").onclick = () => { markFilters(); $("#srcPanel").hidden = true; $("#filters").hidden = !$("#filters").hidden; };
$("#srcBtn").onclick = () => { renderStat(); $("#filters").hidden = true; $("#srcPanel").hidden = !$("#srcPanel").hidden; };
$("#srcAll").onclick = () => { S.only.clear(); renderStat(); queueRerun(); };
$("#srcClose").onclick = () => { $("#srcPanel").hidden = true; };
$("#filterClose").onclick = () => { $("#filters").hidden = true; };
$("#filterReset").onclick = () => { S.color = ""; S.orient = ""; rerun(); };

// ---------- 보드·메모 (입력창 대신 시트) ----------
const sheet = { it: null, rec: null, board: "", names: [] };
function renderSheetBoards() {
  const box = $("#bmBoards"); box.textContent = "";
  const mk = (label, val) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label;
    if (!$("#bmNewBoard").value.trim() && sheet.board === val) b.classList.add("on");
    b.onclick = () => { sheet.board = val; $("#bmNewBoard").value = ""; renderSheetBoards(); };
    box.appendChild(b);
  };
  mk("미분류", ""); sheet.names.forEach((n) => mk(n, n));
}
function closeSheet() { $("#bmSheet").hidden = true; }
function closeSettings() { $("#settings").hidden = true; }
// 아래에서 올라오는 시트(설정·보드 메모): 바깥을 누르거나, 위쪽 손잡이를 아래로 끌거나, Esc 로 닫고, 맨 아래 큰 버튼으로도 닫습니다.
function bindSheet(overlay, close) {
  const sh = overlay.querySelector(".bsheet");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  let y0 = null, dy = 0;
  const end = () => { if (y0 === null) return; y0 = null; sh.classList.remove("drag"); const far = dy > 90; dy = 0; sh.style.transform = ""; if (far) close(); };
  overlay.querySelectorAll(".grab,.shead").forEach((h) => {
    h.style.touchAction = "none";
    h.addEventListener("pointerdown", (e) => { y0 = e.clientY; dy = 0; sh.classList.add("drag"); try { h.setPointerCapture(e.pointerId); } catch { /* 무시 */ } });
    h.addEventListener("pointermove", (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
    h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
  });
}
bindSheet($("#bmSheet"), closeSheet);
bindSheet($("#settings"), closeSettings);
$("#vboard").onclick = async () => {
  const it = curItem(); if (!it) return;
  if (!S.bmIds.has(it.id)) await toggleBookmark(it);
  const all = await DB.all(), rec = all.find((x) => x.id === it.id); if (!rec) return;
  Object.assign(sheet, { it, rec, board: rec.board || "", names: [...new Set(all.map((x) => x.board).filter(Boolean))].sort() });
  $("#bmNewBoard").value = ""; $("#bmNote").value = rec.note || "";
  renderSheetBoards(); $("#bmSheet").hidden = false;
};
$("#bmNewBoard").oninput = renderSheetBoards;
$("#bmCancel").onclick = closeSheet;
$("#bmForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { it, rec } = sheet; if (!it || !rec) return closeSheet();
  rec.board = ($("#bmNewBoard").value.trim() || sheet.board).slice(0, 30);
  rec.note = $("#bmNote").value.trim().slice(0, 200);
  it.board = rec.board; it.note = rec.note;
  const ok = await DB.put(rec); closeSheet();
  if (!ok) return toast("저장하지 못했어요");
  $("#vboard").textContent = rec.board ? "보드: " + rec.board : "보드·메모";
  $("#vnote").textContent = rec.note; $("#vnote").hidden = !rec.note;
  toast(rec.board ? `'${rec.board}' 보드에 저장했어요` : "저장했어요");
});

// ---------- AI 이미지 설명 (비슷한 이미지 보강 / 사진으로 검색) ----------
// 작게 줄인 JPEG 한 장을 서버(Workers AI)로 보내 핵심 영어 단어를 받습니다. 못 쓰는 서버면 이번 접속 동안 다시 시도하지 않습니다.
let capOff = false, capFails = 0, capPause = 0;
const captionOn = () => !capOff && !!cfg?.caption && LS.get("cap", true) && !S.offline;
// 자동으로 쓸 때는 연달아 실패하면 10분 쉽니다 (한도 초과·모델 오류일 때 비슷한 이미지 검색이 계속 늦어지지 않게)
const captionAuto = () => captionOn() && Date.now() >= capPause;
function shrink(blob, max = 384) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight, 1));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.72);
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("img")); };
    im.src = u;
  });
}
// 반환: { q } 단어들, 또는 { q:"", why } (why: off | blocked | fail)
async function captionOfBlob(blob) {
  if (capOff || !cfg?.caption) return { q: "", why: "off" };
  try {
    const small = await shrink(blob);
    const r = await (await api("/api/caption", { method: "POST", body: small, headers: { "content-type": "image/jpeg" }, signal: AbortSignal.timeout(20000) })).json();
    if (r.error === "unavailable") { capOff = true; return { q: "", why: "off" }; }
    if (r.blocked) return { q: "", why: "blocked" };
    if (r.q) { capFails = 0; return { q: r.q }; }
    if (++capFails >= 3) capPause = Date.now() + 10 * 60000;
    return { q: "", why: "fail" };
  } catch (e) {
    if (e.message === "auth") return { q: "", why: "auth" };
    if (++capFails >= 3) capPause = Date.now() + 10 * 60000;
    return { q: "", why: "fail" };
  }
}
async function captionOfItem(it) {
  try { return await captionOfBlob(it.blob || (await fetchBlob(`/api/img?u=${enc(it.thumb)}`))); } catch { return { q: "", why: "fail" }; }
}
$("#upBtn").onclick = () => { if (S.offline) return toast("오프라인이라 사용할 수 없어요"); $("#upFile").click(); };
$("#upFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  toast("AI가 사진을 보는 중…", 6000);
  const r = await captionOfBlob(f);
  if (r.q) { toast(`AI가 본 것: ${r.q}`, 4500); startSearch(r.q); }
  else if (r.why !== "auth") toast(r.why === "off" ? "이 서버에서는 AI 설명을 쓸 수 없어요. (Workers AI 설정 확인)" : r.why === "blocked" ? "이 사진은 검색할 수 없는 주제로 보여요." : "사진을 설명하지 못했어요. 다른 사진으로 해 보세요.", 5000);
};

// ---------- 설정 ----------
function renderSettings() {
  $("#sBlur").checked = S.blur; $("#sMl").checked = S.ml;
  $("#capRow").hidden = !cfg?.caption; $("#sCap").checked = LS.get("cap", true);
  const box = $("#srcList"); box.textContent = "";
  (cfg?.sources || []).forEach((s) => {
    const l = document.createElement("label"); l.className = "row src";
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = !S.off.has(s.id);
    c.onchange = () => { c.checked ? S.off.delete(s.id) : S.off.add(s.id); LS.set("off", [...S.off]); markFilters(); renderStat(); };
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
$("#closeSet").onclick = closeSettings;
$("#sBlur").onchange = (e) => {
  if (!e.target.checked && !confirm("선정적일 수 있는 이미지가 그대로 보여요. 블러를 해제할까요?")) { e.target.checked = true; return; }
  S.blur = e.target.checked; LS.set("blur", S.blur); document.body.classList.toggle("noblur", !S.blur);
  toast("다음 검색부터 모두 적용돼요");
};
$("#sMl").onchange = (e) => { S.ml = e.target.checked; LS.set("ml", S.ml); toast("다음 검색부터 적용돼요"); };
$("#sCap").onchange = (e) => { LS.set("cap", e.target.checked); capOff = false; toast(e.target.checked ? "AI 설명을 켰어요" : "AI 설명을 껐어요"); };
$("#logout").onclick = () => { closeSettings(); LS.set("pass", ""); S.pass = ""; showLogin(); };

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
// 오프라인(또는 서버에 닿지 않을 때)에는 저장해 둔 북마크만 볼 수 있게 시작합니다.
function setOffline(on) {
  S.offline = on; document.body.classList.toggle("offline", on); $("#offline").hidden = !on;
}
async function boot() {
  if (!S.pass) return showLogin();
  let off = false;
  try { cfg = await (await api("/api/config", { signal: AbortSignal.timeout(9000) })).json(); }
  catch (e) {
    if (e.message === "auth") return;
    if (e.name === "TypeError" || e.name === "TimeoutError" || e.name === "AbortError" || !navigator.onLine) { off = true; cfg = { sources: [], locked: [], ai: false, caption: false }; }
    else { showLogin("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
  }
  $("#login").hidden = true;
  if (!DB.db) await DB.open();
  S.bmIds = new Set((await DB.all()).map((x) => x.id)); updateCount();
  setOffline(off); $("#upBtn").hidden = !cfg.caption;
  markFilters();
  if (off) { await showBm(); return; }
  setView("feed"); renderHome(); renderStat();
  // AI 검사 모델은 접속 직후에 내려받지 않고, 첫 이미지를 검사할 때 준비합니다 (첫 화면이 굳는 문제 완화)
}
$("#retry").onclick = () => { $("#retry").textContent = "연결 중…"; boot().finally(() => { $("#retry").textContent = "다시 연결"; }); };
addEventListener("online", () => { if (S.offline) boot(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
boot();
