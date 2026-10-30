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
// 출처 사이트 이름(daum카페·티스토리 등)은 이미지 내용이 아니므로 취향·추천 단어에서 뺍니다. (예전에 저장된 제목에 들어 있어도 걸러짐)
const SITE_RE = /^(daum|다음|naver|네이버|tistory|티스토리|kakao|카카오|google|구글|brunch|브런치)(카페|블로그|뉴스|지식in|지식인|포스트|cafe|blog|news|post)?$/i;
const isSiteName = (s) => SITE_RE.test(String(s || "").trim());
function tokens(s) { return (String(s).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter((w) => !STOP.has(w) && !isSiteName(w) && !/^\d+$/.test(w)); }
// 의미 벡터(임베딩)로 바꿀 글: 이미지 설명 문장(AI)이 있으면 맨 앞에, 그다음 제목·본문 일부·태그. 문장이 있으면 키워드 몇 개보다 훨씬 많은 단서가 됩니다.
function embTextOf(o) {
  const rest = [isSiteName(o.title) ? "" : o.title, o.desc, ...(o.tags || []).slice(0, 8)].filter(Boolean).join(", ");
  return [o.cap, rest].filter(Boolean).join(" | ").slice(0, 320);
}
// act: { label, fn } 을 주면 알림 옆에 버튼이 붙습니다 (예: 북마크 직후 [보드 선택])
function toast(t, ms = 2800, act = null) {
  const el = $("#toast"); el.textContent = t; el.hidden = false; el.classList.toggle("withbtn", !!act);
  if (act) { const b = document.createElement("button"); b.type = "button"; b.textContent = act.label; b.onclick = () => { el.hidden = true; clearTimeout(toast._t); act.fn(); }; el.appendChild(b); }
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), act ? Math.max(ms, 5000) : ms);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = (ms = 3000) => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: ms }) : setTimeout(r, 300)));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// 홈의 추천 주제: 넓은 카테고리 [이모지, 이름, 세부 주제들]. 홈을 열 때마다 무작위로 몇 개만 보여 주고, 누르면 세부 주제로 내려갑니다.
const CATS = [
  ["🏞️", "풍경", ["바다 수평선", "안개 낀 산", "숲길", "노을 하늘", "호수 반영", "폭포", "사막 모래언덕", "초원"]],
  ["🌆", "도시", ["도시 야경", "비 오는 거리", "골목길", "고층 빌딩", "지하철역", "다리 야경", "옥상 전망"]],
  ["🛋️", "인테리어", ["미니멀 거실", "아늑한 침실", "북유럽 주방", "작은 서재", "호텔 욕실", "카페 인테리어", "빈티지 소품"]],
  ["🏛️", "건축", ["한옥 처마", "고딕 성당", "현대 건축", "나선 계단", "아치 회랑", "스테인드글라스", "노출 콘크리트"]],
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
  ["🧪", "교실과 과학", ["칠판 수식", "교실 풍경", "수학 도형", "지구본과 지도", "과학 실험", "현미경", "천체 지도"]],
  ["🎒", "배움", ["책가방", "운동장", "도서관 열람실", "스케치북", "블록 장난감", "퍼즐"]],
  ["⚽", "스포츠", ["축구장", "농구 코트", "새벽 러닝", "서핑", "클라이밍", "자전거", "수영장"]],
  ["🚆", "탈것", ["기차", "비행기 창밖", "클래식 카", "범선", "버스 정류장", "열기구"]],
  ["🧩", "패턴", ["기하학 패턴", "타일", "모자이크", "줄무늬", "꽃무늬", "한국 전통 문양", "벽지"]],
  ["💻", "기술", ["코딩 화면", "회로기판", "서버실", "로봇", "드론", "스마트폰 목업", "미래 도시"]],
  ["🏡", "가족과 일상", ["놀이터", "가족 소풍", "생일 파티", "집밥", "산책길", "빨래 널린 마당"]],
  ["🍂", "계절", ["봄 새순", "여름 소나기", "가을 단풍길", "눈 내린 마을", "첫눈", "장마"]],
  ["🇰🇷", "한국", ["한옥마을", "전통시장", "서울 야경", "제주 바다", "고궁 풍경", "골목 벽화", "한강 노을"]],
  ["🧑", "사람", ["흑백 인물 사진", "거리 스냅", "손", "실루엣", "군중 속 한 사람", "뒷모습", "웃음"]],
  ["📷", "사진 스타일", ["미니멀 구도", "광각 풍경", "접사", "항공 사진", "장노출", "하이앵글", "대칭 구도"]],
  ["☕", "카페와 공간", ["북카페", "루프탑", "작업실", "동네 빵집", "창가 자리", "벽돌 골목 카페"]],
  ["⛺", "아웃도어", ["캠핑 텐트", "등산길", "별 보는 밤", "계곡", "낚시", "해변 산책"]],
];
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
  tone: "", bmTone: "", bmColor: "", priv: LS.get("priv", false), taste: LS.get("tasteOn", true),
};
// 취향 저장소(이 기기 안에서만): 비공개 모드이거나 설정에서 꺼져 있으면 쓰지도, 배우지도 않습니다.
const Taste = TasteStore.create(LS);
// "추천 안 함" 저장소(이 기기 안에서만): 숨긴 이미지의 주소 키와 태그 횟수만 기억합니다. 비공개 모드·취향 학습 설정과 상관없이 늘 동작합니다(안전 기능).
const Avoid = AvoidStore.create(LS);
const avoidKeys = (it) => [...new Set([...(it.tags || []).map((t) => String(t).toLowerCase()), ...(it.grp === "news" || it.grp === "hot" ? [] : tokens(it.title || ""))])];
// 이미지에 "추천 안 함" 판정을 적용합니다: 0 그대로, 1 순위 낮춤, 2 블러(탭하면 보기). 블러는 선정성 블러와 같은 방식으로 가립니다.
function applyAvoid(it) {
  const v = Avoid.isEmpty() ? 0 : Avoid.verdict(avoidKeys(it));
  if (v === 2 && !it.safe) { it.adult = true; it.ai = true; it.avoidBlur = true; }
  return v;
}
// 버튼 안의 글자(span)만 바꿉니다 (아이콘은 그대로)
const setLbl = (btn, t) => { const s = btn.querySelector("span"); if (s) s.textContent = t; else btn.textContent = t; };
const tasteOn = () => S.taste && !S.priv;
const toneMatch = (an, t) => !!an && (t === "warm" || t === "cool" ? an.temp === t : an.tone === t);
const TONE_LIST = [["", "전체"], ["pastel", "파스텔"], ["vivid", "비비드"], ["bright", "밝은"], ["muted", "차분한"], ["dark", "어두운"], ["mono", "흑백"], ["warm", "따뜻한"], ["cool", "차가운"]];
// 이미지 하나에서 취향을 배웁니다 (선정적인 이미지·비공개 모드·학습 꺼짐이면 아무것도 하지 않음)
function learnFrom(it, w) {
  if (!tasteOn() || !it || (it.adult && !it.safe)) return;
  const a = it.an && it.an.tone ? it.an : null;
  Taste.learn(TasteStore.keysOf(it), w, { colors: (a?.cols || it.cols || []).slice(0, 2), tone: a?.tone, temp: a?.temp });
  ACT.note(it, w); // 17차: 단어 점수뿐 아니라 "어떤 이미지에 반응했는지"도 이 기기에 기록해서 관심사 묶음에 씁니다
}
let cfg = null;
const srcName = (id) => cfg?.sources.find((s) => s.id === id)?.name || id;
// 카드 위에 겹쳐 뜨는 출처 이름은 이미지를 덜 가리도록 짧게 줄여 씁니다. (소스 목록·뷰어에는 원래 이름)
const SHORT = { naver: "네이버", kakao: "카카오", kakaoblog: "블로그", naverblog: "N블로그", cleveland: "클리블랜드", artic: "시카고", wpcom: "워드프레스", tumblr: "텀블러" };
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const shortName = (id) => SHORT[id] || clip(srcName(id), 8);
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
// 한꺼번에 많이 요청하면 막거나 느려지는 소스(시카고 이미지 서버)는 동시에 3개까지만 받습니다.
const SLOW_LIM = { artic: limiter(3) };
const fetchBlob = (path, hi, src) => hi
  ? api(path, { signal: AbortSignal.timeout(25000) }).then((r) => r.blob())
  : (SLOW_LIM[src] || limit)(async () => (await api(path, { signal: AbortSignal.timeout(20000) })).blob());
// 실패 이유를 사람이 읽을 말로 (⚠ 를 눌렀을 때 보여 줌)
const whyOf = (e) => "중계 " + (e?.detail || (e?.name === "TimeoutError" || e?.name === "AbortError" ? "시간 초과" : e?.message || "실패"));

// 블로그 글 주소 → 대표 이미지(og:image) 주소. 서버(/api/og)가 글 머리말만 읽어서 찾아 줍니다. 결과는 이 화면에서 다시 쓰고, 동시에 4개까지만 요청합니다.
const OGC = new Map(), ogLim = limiter(4);
function ogResolve(page) {
  if (!page) return Promise.resolve({ img: "", err: "no page" });
  if (!OGC.has(page)) OGC.set(page, ogLim(async () => {
    try { return await (await api(`/api/og?u=${enc(page)}`, { signal: AbortSignal.timeout(9000) })).json(); }
    catch (e) { if (e.message === "auth") throw e; return { img: "", err: whyOf(e) }; }
  }));
  return OGC.get(page);
}

// ---------- 로그인 ----------
function showLogin(msg) { $("#login").hidden = false; $("#lmsg").textContent = msg || ""; $("#lpass").focus(); }
$("#lf").addEventListener("submit", (e) => { e.preventDefault(); S.pass = $("#lpass").value.trim(); LS.set("pass", S.pass); $("#lpass").value = ""; boot(); });

// ---------- 북마크 DB ----------
const DB = {
  db: null,
  async open() { this.db = await new Promise((res) => { try { const r = indexedDB.open("imgfeed", 2); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("bm")) d.createObjectStore("bm", { keyPath: "id" }); if (!d.objectStoreNames.contains("act")) d.createObjectStore("act", { keyPath: "id" }); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => {}; } catch { res(null); } }); },
  store(m) { return this.db.transaction("bm", m).objectStore("bm"); },
  all() { return new Promise((res) => { if (!this.db) return res([]); const r = this.store("readonly").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); },
  put(o) { return new Promise((res) => { if (!this.db) return res(false); const r = this.store("readwrite").put(o); r.onsuccess = () => res(true); r.onerror = () => res(false); }); },
  del(id) { return new Promise((res) => { if (!this.db) return res(false); const r = this.store("readwrite").delete(id); r.onsuccess = () => res(true); r.onerror = () => res(false); }); },
};
const updateCount = () => { $("#bmc").textContent = S.bmIds.size ? `(${S.bmIds.size})` : ""; };

// ---------- 활동 기록 (17차) ----------
// 핀터레스트처럼 "어떤 이미지에 반응했는지"를 이미지 단위로 기록해 관심사 묶음(public/interests.js)을 만듭니다.
// 북마크(+3)·좋아요(+2)·7초 이상 본 것(+1)이 쌓이고, 점수는 하루 1%씩 줄어듭니다(PinnerSage 와 같은 값). 취향 학습이 켜져 있고 비공개 모드가 아닐 때만 기록해요.
// 모두 이 기기(IndexedDB)에만 저장하고 서버로 보내지 않습니다. 설정에서 모두 지울 수 있어요.
const ADB = { // DB(북마크)와 같은 연결을 쓰는 "act" 저장소
  st(m) { return DB.db.transaction("act", m).objectStore("act"); },
  all() { return new Promise((res) => { if (!DB.db) return res([]); try { const r = this.st("readonly").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); } catch { res([]); } }); },
  put(o) { return new Promise((res) => { if (!DB.db) return res(false); try { const r = this.st("readwrite").put(o); r.onsuccess = () => res(true); r.onerror = () => res(false); } catch { res(false); } }); },
  del(id) { return new Promise((res) => { if (!DB.db) return res(false); try { const r = this.st("readwrite").delete(id); r.onsuccess = () => res(true); r.onerror = () => res(false); } catch { res(false); } }); },
  clear() { return new Promise((res) => { if (!DB.db) return res(false); try { const r = this.st("readwrite").clear(); r.onsuccess = () => res(true); r.onerror = () => res(false); } catch { res(false); } }); },
};
const ACT_LAMBDA = 0.01, ACT_MAX = 450, ACT_KEEP = 360, DESC_DAY = 15;
const ACT = {
  m: null, rev: 0, embAt: 0,
  async load() {
    if (this.m) return this.m;
    this.m = new Map((await ADB.all()).map((r) => [r.id, r]));
    if (!LS.get("actMig1", false)) { await this.migrate(); LS.set("actMig1", true); }
    return this.m;
  },
  size() { return this.m ? [...this.m.values()].filter((r) => r.wt > 0.05).length : 0; },
  // 17차 이전에 담아 둔 북마크를 활동으로 옮겨 둡니다 (북마크 1개 = 3점, 담은 시각 그대로)
  async migrate() {
    for (const x of await DB.all()) { if (this.m.has(x.id)) continue; const r = this.rec(x, x.ts || Date.now(), 3); this.m.set(r.id, r); await ADB.put(r); }
    this.rev++;
  },
  rec(it, ts, wt) {
    const a = it.an?.tone ? { tone: it.an.tone, temp: it.an.temp, cols: (it.an.cols || it.cols || []).slice(0, 3) } : null;
    return { id: it.id, key: it.key || keyOf(it), title: String(it.title || "").slice(0, 120), thumb: it.thumb, alt: it.alt || "", full: it.full, page: it.page || "", src: it.src, grp: it.grp || "", w: it.w || 0, h: it.h || 0,
      tags: (it.tags || []).map((t) => String(t).slice(0, 40)).slice(0, 12), an: a, wt, first: ts, ts,
      desc: String(it.desc || "").slice(0, 160), cap: String(it.capText || "").slice(0, 240), cq: String(it.capQ || "").slice(0, 60) };
  },
  async note(it, d) {
    if (!it || !it.id || !d) return;
    try {
      const m = await this.load(), now = Date.now(); let r = m.get(it.id);
      if (!r) { if (d < 0) return; r = this.rec(it, now, 0); m.set(r.id, r); }
      r.wt = Math.max(-4, Math.min(9, r.wt * Math.exp(-ACT_LAMBDA * Math.max(0, now - r.ts) / 86400000) + d)); r.ts = now;
      if (!r.tags?.length && it.tags?.length) r.tags = it.tags.map((t) => String(t).slice(0, 40)).slice(0, 12);
      if (!r.an && it.an?.tone) r.an = { tone: it.an.tone, temp: it.an.temp, cols: (it.an.cols || []).slice(0, 3) };
      if (!r.cap && it.capText) { r.cap = String(it.capText).slice(0, 240); r.cq = String(it.capQ || "").slice(0, 60); delete r.vec; delete r.nv; } // 뷰어에서 이미 받은 설명 문장이 있으면 그대로 보관 (의미 벡터는 문장 포함으로 다시 만듦)
      if (!r.desc && it.desc) r.desc = String(it.desc).slice(0, 160);
      if (r.wt <= 0.05) { m.delete(r.id); await ADB.del(r.id); } else await ADB.put(r);
      this.rev++;
      if (m.size > ACT_MAX) await this.prune();
      this.embSoon(); if (d >= 2) this.describeSoon();
    } catch { /* 기록 실패는 조용히 넘어감 */ }
  },
  async bump(id, d) { const m = await this.load(), r = m.get(id); if (r) await this.note(r, d); }, // 이미 기록된 이미지의 점수만 바꿈 (북마크 삭제 등)
  async prune() { // 가장 약한 것부터 지워 ACT_KEEP 개로, 거의 사라진 것(0.15 미만)도 함께
    const now = Date.now(), arr = [...this.m.values()].map((r) => ({ r, e: r.wt * Math.exp(-ACT_LAMBDA * Math.max(0, now - r.ts) / 86400000) })).sort((a, b) => a.e - b.e);
    let drop = this.m.size - ACT_KEEP;
    for (const { r, e } of arr) { if (drop <= 0 && e >= 0.15) break; this.m.delete(r.id); await ADB.del(r.id); drop--; }
  },
  async clear() { await ADB.clear(); this.m = new Map(); this.rev++; FYI.sig = ""; },
  text(r) { return embTextOf(r); },
  embSoon() { clearTimeout(this.et); this.et = setTimeout(() => this.embedPending(), 8000); },
  // 19차: 북마크·좋아요처럼 강하게 반응한 이미지는 AI가 "문장"으로 설명해 이 기기에 보관합니다. (키워드 한두 개로는 놓치던 분위기·장소·소재를 의미 벡터로 비교하려는 것)
  // 하루 DESC_DAY 장까지, 한 번에 2장씩 천천히. 앱이 느려지거나 Workers AI 무료 사용량을 한꺼번에 쓰지 않게 하려는 제한입니다.
  describeSoon() { clearTimeout(this.dt); this.dt = setTimeout(() => this.describePending(), 15000); },
  async describePending() {
    if (this.descBusy || !captionAuto() || !tasteOn()) return;
    const day = new Date().toISOString().slice(0, 10), q = LS.get("capDay", null);
    let used = q && q.d === day ? q.n : 0; if (used >= DESC_DAY) return;
    const m = await this.load(), todo = [...m.values()].filter((r) => !r.cap && !r.nc && r.wt >= 2 && r.thumb).sort((a, b) => (b.wt - a.wt) || (b.ts - a.ts)).slice(0, Math.min(2, DESC_DAY - used));
    if (!todo.length) return;
    this.descBusy = true;
    let more = false;
    try {
      for (const r of todo) {
        const res = await captionOfItem(r);
        if (res.why === "off" || res.why === "auth") break;
        if (res.why === "blocked") { r.nc = 1; await ADB.put(r); continue; }
        if (res.text) { r.cap = res.text; r.cq = res.q || ""; delete r.vec; delete r.nv; used++; await ADB.put(r); more = true; }
        else { r.ncf = (r.ncf || 0) + 1; if (r.ncf >= 2) r.nc = 1; await ADB.put(r); }
      }
    } finally {
      this.descBusy = false; LS.set("capDay", { d: day, n: used });
      if (more) { this.rev++; this.embSoon(); this.describeSoon(); } // 설명이 생기면 의미 벡터를 다시 만들고, 남은 것도 이어서
    }
  },
  // 의미 유사도용 벡터가 아직 없는 활동(최대 40개)을 한 번에 서버(Workers AI)에 보내 벡터를 받아 둡니다. 2분에 한 번만.
  async embedPending() {
    if (!cfg?.embed || S.offline || !tasteOn() || Date.now() - this.embAt < 120000) return;
    const m = await this.load(), todo = [...m.values()].filter((r) => !r.vec && !r.nv && r.wt > 0).sort((a, b) => b.ts - a.ts).slice(0, 40);
    if (!todo.length) return;
    this.embAt = Date.now();
    const texts = todo.map((r) => this.text(r)), vs = await embedTexts(texts);
    if (!vs) return;
    for (let i = 0; i < todo.length; i++) { if (vs[i]) todo[i].vec = vs[i]; else if (!texts[i]) todo[i].nv = 1; await ADB.put(todo[i]); }
    this.rev++;
  },
};
// 짧은 글들을 서버에서 벡터로 바꿔 받습니다 (Int8). 실패가 3번 이어지면 30분 쉽니다. 서버에는 아무것도 저장되지 않아요.
const EMB = { fails: 0, off: 0 };
async function embedTexts(texts) {
  if (!cfg?.embed || S.offline || Date.now() < EMB.off || !texts.length) return null;
  try {
    const r = await (await api("/api/embed", { method: "POST", body: JSON.stringify({ texts }), headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8000) })).json();
    if (r.error || !Array.isArray(r.v)) throw new Error("embed");
    EMB.fails = 0;
    return r.v.map((b) => (b ? Int8Array.from(atob(b), (ch) => ch.charCodeAt(0)) : null));
  } catch (e) {
    if (e.message !== "auth" && ++EMB.fails >= 3) { EMB.off = Date.now() + 30 * 60000; EMB.fails = 0; }
    return null;
  }
}
const embText = embTextOf;
// 관심사 묶음: 활동 기록 → public/interests.js. 활동이 바뀌지 않았으면 이전 결과를 다시 씁니다.
const FYI = { sig: "", cl: [] };
async function buildInterests() {
  if (!tasteOn()) return [];
  const m = await ACT.load(), bmc = S.bmIds.size, sig = `${ACT.rev}:${m.size}:${bmc}:${Taste.muted().join("|")}`;
  if (FYI.sig === sig) return FYI.cl;
  const boards = new Map();
  if (bmc) for (const x of await DB.all()) { const b = bOf(x); if (b.length) boards.set(x.id, b); } // 같은 보드에 담은 이미지는 서로 가까운 것으로 봄
  // 내가 "이 말은 그만"이라고 뺀 단어(설정의 ✕, 홈 ⭐ 칩의 ✕)가 든 활동은 관심사를 만들 때 쓰지 않습니다
  const entries = [...m.values()].map((r) => ({ id: r.id, keys: TasteStore.keysOf(r), cq: r.cq || "", an: r.an, boards: boards.get(r.id) || [], wt: r.wt, ts: r.ts, vec: r.vec })).filter((e) => !e.keys.some((k) => Taste.isMuted(k)));
  FYI.cl = Interests.build(entries); FYI.sig = sig;
  return FYI.cl;
}

// 최근 검색 (이 기기에만, 취향 학습이 켜져 있고 비공개 모드가 아닐 때만 기록)
const Recent = {
  list() { return LS.get("recent", []).filter((x) => x && x.q); },
  add(q) { const l = this.list().filter((x) => x.q !== q); l.unshift({ q, ts: Date.now() }); LS.set("recent", l.slice(0, 30)); },
  remove(q) { LS.set("recent", this.list().filter((x) => x.q !== q)); },
  clear() { LS.set("recent", []); },
};

// 보드: 북마크 하나가 여러 보드에 들어갈 수 있습니다 (boards 배열). 예전에 저장한 북마크는 board 한 칸만 있어서 같이 읽어 줍니다.
const bOf = (x) => (Array.isArray(x.boards) ? x.boards : x.board ? [x.board] : []);
// 보드 순서: [보드 관리]에서 정한 순서(boardOrder)가 먼저, 나머지는 이름순
const boardNames = (all) => {
  const ord = LS.get("boardOrder", []), idx = (n) => { const i = ord.indexOf(n); return i < 0 ? 1e6 : i; };
  return [...new Set(all.flatMap(bOf))].sort((a, b) => idx(a) - idx(b) || (a > b) - (a < b));
};
const inBoard = (x, b) => b === "__all" || (b === "" ? !bOf(x).length : bOf(x).includes(b));
const boardLabel = (x) => { const b = bOf(x); return b.length ? (b.length === 1 ? "보드: " + b[0] : `보드 ${b.length}개`) : "보드·메모"; };
// board 를 따로 정하지 않으면(☆ 짧게 누르기) 마지막에 쓴 보드에 담습니다. 그 보드가 아직 있을 때만. board === "" 이면 보드 없이 담습니다.
async function toggleBookmark(it, board) {
  if (S.priv) return toast("비공개 모드에서는 북마크를 쓸 수 없어요");
  if (S.bmIds.has(it.id)) { await DB.del(it.id); S.bmIds.delete(it.id); toast("북마크에서 뺐어요"); learnFrom(it, -2); }
  else {
    let blob = it.blob;
    if (!blob) { try { blob = await fetchBlob(`/api/img?u=${enc(it.thumb)}`); } catch {} }
    let an = it.an && it.an.tone ? it.an : null;
    if (!an && blob) { try { an = (await blobInfo(blob))?.an || null; if (an) it.an = an; } catch { /* 분석 없이 저장 */ } } // 톤·팔레트를 저장 때 한 번 분석해 둠
    let boards = [];
    if (board) boards = [board]; // 보드를 직접 고르지 않으면 보드 없이 담습니다 (나중에 [보드 선택]이나 선택 모드로 정리)
    const ok = await DB.put({ an, boards, board: boards[0] || "", id: it.id, title: it.title, thumb: it.thumb, alt: it.alt, full: it.full, page: it.page, src: it.src, w: it.w, h: it.h, tags: it.tags, adult: !!it.adult && !it.safe, adultSrc: it.safe ? "" : it.ai ? "ai" : it.adult ? "kw" : "", safe: !!it.safe, ts: Date.now(), blob });
    if (!ok) return toast("이 브라우저에서는 북마크를 저장할 수 없어요");
    it.boards = boards; it.board = boards[0] || "";
    S.bmIds.add(it.id); learnFrom(it, 3);
    if (boards.length) toast(`‘${boards[0]}’ 보드에 담았어요`);
    else if (board === undefined) toast("북마크에 담았어요", 4000, { label: "보드 선택", fn: () => openBoardSheet(it) });
    else toast("북마크에 담았어요");
  }
  refreshStars(); updateCount();
  if (S.view === "bm" && $("#viewer").hidden) renderBm();
}
function refreshStars() {
  document.querySelectorAll(".card").forEach((c) => { const b = c.querySelector(".star"); if (b && c._it) b.textContent = S.bmIds.has(c._it.id) ? "★" : "☆"; });
  const it = curItem(); if (it) { const on = S.bmIds.has(it.id); setLbl($("#vstar"), on ? "북마크됨" : "북마크"); $("#vstar").classList.toggle("on", on); }
}

// 스크롤 중인지 (마지막 스크롤 후 0.2초). 스크롤하는 동안에는 AI 검사·칸 높이 맞춤 같은 무거운 일을 미룹니다.
const SCROLL = { on: false, t: 0 };
addEventListener("scroll", () => { SCROLL.on = true; clearTimeout(SCROLL.t); SCROLL.t = setTimeout(() => { SCROLL.on = false; }, 200); }, { passive: true, capture: true });

// ---------- 메이슨리 ----------
class Masonry {
  constructor(el) { this.el = el; this.all = []; this.cards = []; this.cols = []; this.hs = []; this.n = 0; this.pred = null; this.onChange = null; }
  // 이미지를 불러온 뒤 비율·색을 알게 되어 필터 조건에서 벗어난 카드는 목록에서 뺍니다.
  recheck(c) {
    if (!this.pred || this.pred(c) || !this.cards.includes(c)) return;
    this.cards = this.cards.filter((x) => x !== c); c.remove(); this.onChange?.(); this.balLater();
  }
  // 이미지가 열리지 않는 카드를 목록에서 완전히 뺍니다. (필터가 바뀌어도 되살아나지 않음)
  drop(c) {
    const had = this.cards.includes(c);
    this.all = this.all.filter((x) => x !== c); this.cards = this.cards.filter((x) => x !== c); c.remove();
    if (had) this.onChange?.();
    this.balLater();
  }
  count() { const w = this.el.clientWidth || innerWidth; return w < 560 ? 2 : w < 860 ? 3 : w < 1180 ? 4 : 5; }
  build() {
    this.n = this.count(); this.el.textContent = ""; this.cols = []; this.hs = Array(this.n).fill(0);
    for (let i = 0; i < this.n; i++) { const c = document.createElement("div"); c.className = "col"; this.el.appendChild(c); this.cols.push(c); }
    for (const c of this.cards) this.place(c);
    this.balLater();
  }
  // 칸 높이를 실제로 재서, 가장 긴 칸의 맨 아래 카드를 가장 짧은 칸으로 옮겨 양쪽 길이를 맞춥니다.
  // (카드가 빠지거나 이미지 비율이 달라져 한쪽만 길어진 채 [더 보기]가 나오는 것을 막음. 맨 아래 몇 장의 순서만 바뀔 수 있어요.)
  balance() {
    if (this.n < 2 || !this.cols.length || !this.el.offsetParent) return;
    if (SCROLL.on) { clearTimeout(this._bt3); this._bt3 = setTimeout(() => this.balance(), 300); return; } // 스크롤 중에는 칸 높이를 재지 않음 (끊김 방지)
    const H = (c) => { const l = c.lastElementChild; return l ? l.getBoundingClientRect().bottom - c.getBoundingClientRect().top : 0; };
    for (let g = 0; g < 40; g++) {
      const hs = this.cols.map(H); let hi = 0, lo = 0;
      hs.forEach((h, i) => { if (h > hs[hi]) hi = i; if (h < hs[lo]) lo = i; });
      const card = this.cols[hi].lastElementChild; if (hi === lo || !card) return;
      const ch = card.getBoundingClientRect().height + 8, diff = hs[hi] - hs[lo];
      if (this.cols[hi].children.length < 2 || Math.abs(diff - 2 * ch) >= diff) return; // 옮겨서 더 좋아질 때만
      this.cols[lo].appendChild(card);
    }
  }
  balLater() { clearTimeout(this._bt); this._bt = setTimeout(() => this.balance(), 250); clearTimeout(this._bt2); this._bt2 = setTimeout(() => this.balance(), 1500); }
  place(c) { let k = 0; for (let i = 1; i < this.n; i++) if (this.hs[i] < this.hs[k]) k = i; c._m = this; this.cols[k].appendChild(c); this.hs[k] += 1 / c._r + 0.04; }
  add(cards) {
    this.all.push(...cards);
    const ok = this.pred ? cards.filter(this.pred) : cards;
    if (ok.length) this.onAdd?.();
    if (!this.cols.length || this.n !== this.count()) { this.cards.push(...ok); this.build(); return; }
    for (const c of ok) { this.cards.push(c); this.place(c); }
    this.balLater();
  }
  setFilter(p) { this.pred = p; this.cards = p ? this.all.filter(p) : this.all.slice(); this.build(); }
  clear() { this.all = []; this.cards = []; this.cols = []; this.hs = []; this.el.textContent = ""; }
  check() { if (this.cols.length && this.n !== this.count()) this.build(); else this.balLater(); }
  // 카드 순서를 다시 매깁니다 (이미 불러온 이미지는 그대로 두고 칸만 옮김)
  reorder(cmp) { this.cards.sort(cmp); this.build(); }
}
const feedM = new Masonry($("#grid"));
const bmM = new Masonry($("#bmgrid"));
const trM = new Masonry($("#trGrid"));
let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { feedM.check(); bmM.check(); trM.check(); lv()?.m.check(); if (typeof REC !== "undefined") REC.m?.check(); }, 200); });

// ---------- 카드 ----------
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); loadCard(e.target); } }), { rootMargin: "800px 0px" });

// open: 카드를 눌렀을 때 뷰어를 여는 방법 (메인 피드 / 북마크 / 비슷한 이미지 피드마다 다름)
function makeCard(it, open) {
  const el = document.createElement("div");
  el.className = "card"; el._it = it; el.dataset.g = it.grp || ""; el._r = clamp(it.w && it.h ? it.w / it.h : 1, 0.5, 2.2);
  el.style.aspectRatio = String(el._r);
  const img = document.createElement("img"); img.alt = it.title || ""; img.decoding = "async"; el.appendChild(img);
  const star = document.createElement("button"); star.className = "star"; star.setAttribute("aria-label", "북마크"); star.textContent = S.bmIds.has(it.id) ? "★" : "☆"; el.appendChild(star);
  const veil = document.createElement("div"); veil.className = "veil"; veil.innerHTML = "민감할 수 있는 이미지<br><small>탭하면 보기</small>"; el.appendChild(veil);
  const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = it.grp === "hot" && it.topic ? clip(it.topic, 8) : shortName(it.src); el.appendChild(tag);
  if (it.avoidBlur) el.classList.add("avoid");
  if (it.fromBm) { // 북마크 카드: 선택 모드의 체크 표시
    const chk = document.createElement("span"); chk.className = "chk"; chk.innerHTML = '<svg class="i"><use href="#i-check"/></svg>'; el.appendChild(chk);
    if (SEL.ids.has(it.id)) el.classList.add("sel");
  }
  el.addEventListener("click", (e) => {
    if (el._lp) { el._lp = false; return; } // 길게 눌렀다 뗄 때 따라오는 클릭은 무시
    if (SEL.on) { if (it.fromBm) toggleSel(it); return; } // 선택 모드: 탭하면 고르기/해제
    if (e.target === star) { e.stopPropagation(); toggleBookmark(it); return; }
    if (el.dataset.st === "flag" && !it.revealed && (S.blur || it.avoidBlur)) { it.revealed = true; el.classList.add("reveal"); return; }
    open();
  });
  bindLongPress(el, it, star);
  io.observe(el);
  return el;
}
// 카드를 길게 누르면: 일반 카드는 작은 메뉴, 북마크 카드는 선택 모드, ☆ 는 보드 고르기. (마우스는 오른쪽 버튼)
const LP_MS = 480, LP_MOVE = 10;
function bindLongPress(el, it, star) {
  let t = null, x0 = 0, y0 = 0;
  const cancel = () => { clearTimeout(t); t = null; };
  const fire = (onStar) => { cancel(); el._lp = true; el._lpAt = Date.now(); navigator.vibrate?.(12); longPress(el, it, onStar); };
  el.addEventListener("pointerdown", (e) => {
    el._lp = false;
    if (SEL.on || (e.pointerType === "mouse" && e.button !== 0)) return;
    x0 = e.clientX; y0 = e.clientY; const onStar = e.target === star;
    cancel(); t = setTimeout(() => fire(onStar), LP_MS);
  });
  el.addEventListener("pointermove", (e) => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > LP_MOVE) cancel(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((n) => el.addEventListener(n, cancel));
  // 일부 브라우저는 길게 누르면 contextmenu 도 보냅니다. 방금 위 타이머로 열었다면 한 번만 열리게 합니다.
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!SEL.on && Date.now() - (el._lpAt || 0) > 700) fire(e.target === star); });
}
function longPress(el, it, onStar) {
  if (onStar) return openBoardSheet(it);
  if (it.fromBm) return enterSel(it);
  showCardMenu(el, it);
}

// 이미지에서 대표 색(cols: 색상 점 이름 목록)과 색 분포(sh)를 뽑습니다.
// 서버를 거쳐 받은 이미지(blob)만 읽을 수 있고, 못 읽으면 null(걸러내지 않음).
function pixelInfo(img) {
  try {
    const N = 32, c = document.createElement("canvas"); c.width = c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data, CT = window.ColorTools, cols = CT.classify(d, N, N);
    let an = null;
    try { const t = CT.tone(d); if (t) an = { tone: t.tone, temp: t.temp, cols, pal: CT.palette(d, N, N, 5) }; } catch { /* 톤 없이 진행 */ }
    return { cols, sh: CT.shares(d, N, N), an };
  } catch { return null; }
}
// 살색 비율 (선정성 판단 보조). 못 읽으면 null.
function skinOf(img) {
  try {
    const N = 48, c = document.createElement("canvas"); c.width = c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data;
    return { skin: window.ColorTools.skin(d), other: window.ColorTools.vivid(d) };
  } catch { return null; }
}
// blob(작은 이미지)에서 색 정보만 뽑습니다. 화면에는 표시하지 않음.
function blobInfo(blob) {
  return new Promise((res) => {
    const u = URL.createObjectURL(blob), im = new Image(), t = setTimeout(() => { URL.revokeObjectURL(u); res(null); }, 6000);
    im.onload = () => { clearTimeout(t); const r = pixelInfo(im); URL.revokeObjectURL(u); res(r); };
    im.onerror = () => { clearTimeout(t); URL.revokeObjectURL(u); res(null); };
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
  // 이유: 서버 중계가 실패했으면 그 사유 + 브라우저 직접 로딩도 실패, 중계로 받은 이미지를 못 열었으면 그 사실
  h.why = it._why ? it._why + " → 직접 로딩도 실패" : it.blob ? "중계로 받은 이미지를 표시하지 못함" : "브라우저 직접 로딩 실패";
  if (!h.ok && h.bad >= 4 && !DEAD[it.src]) markDead(it.src, h.why);
}
function markDead(src, why) {
  DEAD[src] = { why };
  const ms = [feedM, ...V.stack.map((l) => l.m)];
  ms.forEach((m) => m.all.filter((c) => c._it?.src === src && !c._ok).forEach((c) => { io.unobserve(c); m.drop(c); })); // 아직 못 연 카드는 모두 치움
  renderStat(); M.o.onAfter?.(); V.stack.forEach((l) => l.feed.o.onAfter?.());
}

async function loadCard(el) {
  const it = el._it, img = el.querySelector("img");
  if (SAFE_IDS.has(it.id)) { it.safe = true; it.adult = false; } // 사용자가 "블러 해제"한 이미지
  const inTr = !!el.closest("#trGrid");
  // 트렌드는 블러를 꺼 두었더라도 노골적인 이미지를 걸러야 하므로 항상 검사합니다. 북마크는 저장해 둔 이미지(blob)로 다시 검사합니다.
  const needML = S.ml && (S.blur || inTr) && !it.adult && !it.safe && it.src !== "nasa" && (!it.fromBm || !!it.blob); // NASA(우주·과학 사진)는 검사 생략
  const inMain = !!el.closest("#grid");
  const simLevel = el.closest(".simlevel") ? V.stack.find((l) => l.wrap.contains(el)) : null;
  const wantColor = inMain && ((!!S.color && !it.sc && !it.cols) || (!!S.tone && !it.an)); // 색·톤 필터가 켜져 있으면 이미지에서 직접 분석
  const wantSh = !!simLevel && (!it.sh || !it.an);
  // 색만 알면 되는 경우(색 필터)에는 작은 이미지(alt)로 분석해서 느린 원본 내려받기를 피합니다.
  const colorFromAlt = wantColor && !!it.alt && !it.blob && !needML;
  el.dataset.st = it.adult ? "flag" : needML && !it.fromBm ? "pending" : "ok"; // 북마크는 먼저 보여 주고 뒤에서 검사
  // 큰 썸네일 주소가 안 열리는 소스(예: V&A)는 작은 주소(alt)로 한 번 더 시도
  img.onload = () => {
    if (el._ok) return; el._ok = true;
    const h = (IMGH[it.src] ||= { ok: 0, bad: 0 });
    if (!h.ok++) el._feed?.o.reobserve?.(); // 이 소스의 첫 이미지가 열렸으니 멈춰 두었던 다음 페이지 불러오기를 이어감
  };
  img.onerror = () => { if (it.alt && img.dataset.alt !== "1") { img.dataset.alt = "1"; img.referrerPolicy = "no-referrer"; img.src = it.alt; } else failCard(el); };
  try {
    // 이미지 주소를 주지 않는 소스(네이버 블로그): 카드가 화면에 가까워졌을 때 글의 대표 이미지를 찾아 씁니다. 못 찾으면 그 글은 뺍니다.
    if (it.og === "card" && !it._ogDone) {
      const r = await ogResolve(it.page || it.thumb);
      if (!r.img) { it._why = "대표 이미지 없음" + (r.err ? " (" + r.err + ")" : ""); return failCard(el); }
      it._ogDone = true; it.thumb = r.img; it.full = r.img; it.alt = "";
    }
    let altInfo = null;
    if (colorFromAlt) { try { altInfo = await blobInfo(await fetchBlob(`/api/img?u=${enc(it.alt)}`, false, it.src)); } catch (e) { if (e.message === "auth") throw e; } }
    if (it.blob) img.src = URL.createObjectURL(it.blob);
    else if (needML || (wantColor && !colorFromAlt)) { const b = await fetchBlob(`/api/img?u=${enc(it.thumb)}`, false, it.src); it.blob = b; img.src = URL.createObjectURL(b); }
    else { img.referrerPolicy = "no-referrer"; img.src = it.thumb; }
    await img.decode().catch(() => {});
    el.classList.add("loaded");
    // 비율을 모르는 소스(미술관 등)는 불러온 뒤 실제 비율로 맞춤
    if ((!it.w || !it.h) && img.naturalWidth && img.naturalHeight) {
      it.w = img.naturalWidth; it.h = img.naturalHeight;
      el._r = clamp(it.w / it.h, 0.5, 2.2); el.style.aspectRatio = String(el._r); el._m?.balLater();
    }
    if (wantColor) { const inf = altInfo || (it.blob ? pixelInfo(img) : null); if (!it.cols || inf?.cols) it.cols = inf?.cols || null; it.sh = inf?.sh || it.sh; it.an = inf?.an || it.an; }
    if (wantSh && it.blob) {
      const inf = pixelInfo(img);
      if (inf?.sh) { it.sh = inf.sh; it.an = inf.an || it.an; simRerankSoon(simLevel); if (simLevel.toneOnly) simLevel.m.recheck(el); }
    }
    if (inMain) feedM.recheck(el); // 방향·색이 조건과 다르면 목록에서 뺌
    if (needML && it.blob) enqueueClassify(el, img, it);
  } catch (e) {
    if (e.message === "auth") return;
    it._why = whyOf(e); // 서버 중계가 실패한 이유 (예: 중계 upstream 403, 중계 시간 초과)
    el.dataset.st = it.adult ? "flag" : "ok";
    img.referrerPolicy = "no-referrer"; img.src = it.thumb; el.classList.add("loaded");
  }
}

// ---------- 브라우저 안 AI 검사 (선정성) ----------
// 처음 접속할 때 화면이 굳던 문제를 줄이려고, 접속하자마자 내려받지 않고
// 첫 이미지를 검사해야 할 때 + 브라우저가 한가할 때 준비합니다.
const SAFE_IDS = new Set(); // 사용자가 "블러 해제"한 이미지(이 화면을 열어 둔 동안만 기억. 북마크는 북마크에 저장)
let modelP = null, aiState = "idle"; // idle | loading | ready | failed
function getModel() {
  if (!modelP) {
    aiState = "loading"; renderStat();
    // 앱 안에 둔 번들(/vendor/nsfw4/)을 먼저 쓰고, 없을 때만 외부(esm.sh)로 대체합니다.
    modelP = idle(1200).then(() => import("/vendor/nsfw4/nsfw.js").catch(() => import("https://esm.sh/nsfwjs@4"))).then((m) => (m.load || m.default?.load).call(m))
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
      for (let w = 0; SCROLL.on && w < 40; w++) await sleep(100); // 스크롤 중에는 잠시 쉼 (최대 4초)
      // 지금 화면 가운데에 가까운 카드부터 검사해서, 보고 있는 이미지의 블러가 먼저 풀리게 합니다.
      if (cq.length > 1) { const mid = innerHeight / 2, d = (x) => (x.el.isConnected ? Math.abs(x.el.getBoundingClientRect().top - mid) : 1e9); cq.sort((a, b) => d(a) - d(b)); }
      const { el, img, it } = cq.shift();
      if (!el.isConnected) continue;
      try {
        const p = await m.classify(img);
        const s = Object.fromEntries(p.map((x) => [x.className, x.probability]));
        // 점수만 보지 않고 살색 비율·제목·태그 맥락도 함께 봅니다 (성경책 위의 손 같은 오탐 방지)
        const sk = skinOf(img), v = window.Safety.judge(s, sk ? sk.skin : null, `${it.title || ""} ${(it.tags || []).join(" ")}`, sk ? sk.other : 0);
        if (v.explicit && el.closest("#trGrid")) { it.dropped = true; trM.drop(el); } // 트렌드: 노골적인 이미지는 블러가 아니라 아예 뺌
        else if (v.adult) { it.adult = true; it.ai = true; el.dataset.st = "flag"; }
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
// 받아 온 이미지는 바로 화면에 올리지 않고 대기열(pend)에 모아 두었다가 "관련도 점수"(relevance.js) 순으로 chunk 장씩만 보여 주고,
// 더 보려면 [더 보기]를 누릅니다. 구체적인 검색어일 때 검색어와 안 맞는 이미지(weak)는 맨 아래의 [관련도 낮은 결과 보기] 뒤로 접어 둡니다.
class Feed {
  constructor(m, o = {}) { this.m = m; this.o = o; this.gen = 0; this.chunk = o.chunk || 60; this.reset(); }
  reset() {
    this.gen++;
    this.acs?.forEach((a) => a.abort()); // 진행 중이던 요청은 취소 (뷰어에서 빠르게 넘길 때 낭비 방지)
    Object.assign(this, { q: "", qe: "", sl: "", page: 0, loading: false, ended: false, blocked: false, acs: new Set(),
      srcEnded: new Set(), stat: {}, items: [], keys: new Map(), tags: new Map(), trP: Promise.resolve(),
      terms: null, pend: new Map(), weakOpen: false, limit: this.chunk, supply: 0, stall: 0, burst: 0, exhausted: false, stuck: false, holdOff: false });
  }
  sources() {
    const on = (cfg?.sources || []).filter((s) => !S.off.has(s.id));
    // 소스 패널에서 고른 소스만 검색 (메인 피드만 해당). 고른 소스가 꺼져 있으면 전체로 되돌립니다.
    let pickd = this.o.filters && S.only.size ? on.filter((s) => S.only.has(s.id)) : on;
    if (!pickd.length) pickd = on;
    // 홈 피드의 각 관심사는 호출 한도가 작은 소스(Unsplash)와 전문 소스(미술관·NASA)를 빼고, 빠르고 넉넉한 소스만 씁니다.
    if (this.o.srcAllow) { const a = pickd.filter((s) => this.o.srcAllow.includes(s.id)); if (a.length) pickd = a; }
    // 색을 골랐을 때는 색을 직접 걸러 주는 소스(Pixabay·Unsplash)만 씁니다. 빠르고 정확하기 때문이에요.
    // (필터 패널에서 "넓게"를 고르면 다른 소스도 쓰되, 이미지를 불러온 뒤 브라우저가 대표 색으로 거릅니다.)
    if (this.o.filters && S.color && !S.colorWide) { const cs = pickd.filter((s) => s.colors); if (cs.length) pickd = cs; }
    return pickd.filter((s) => !DEAD[s.id]); // 이미지가 열리지 않아 쉬는 소스는 뺌
  }
  begin(q, sl = "") {
    this.q = this.qe = q;
    this.sl = sl || (hasHangul(q) ? "ko" : "");
    this.terms = Relevance.makeTerms({ q });
    const gen = this.gen;
    // 한글 등은 영어 소스용으로 번역해 둡니다. 서버가 고유명사인지(proper)와 종류(type)도 알려 주면 관련도 판단에 씁니다.
    this.trP = this.sl && this.sl !== "en" && cfg.ai
      ? api(`/api/tr?q=${enc(q)}&sl=${this.sl}${S.priv ? "&nc=1" : ""}`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).then((j) => {
        if (gen !== this.gen) return;
        this.qe = j.t || q;
        this.terms = Relevance.makeTerms({ q, qe: this.qe, type: j.type, proper: j.proper });
      }).catch(() => { if (gen === this.gen) this.qe = q; })
      : Promise.resolve();
  }
  fail(s, r) {
    const st = (this.stat[s.id] ||= { n: 0 });
    if (!st.n) { st.err = r.err || "error"; st.detail = r.detail || ""; } // 이미 결과를 받은 소스가 중간에 막힌 경우는 조용히 끝냄
    this.srcEnded.add(s.id);
  }
  holding(s) {
    const st = this.stat[s.id];
    if (!st?.n || IMGH[s.id]?.ok || this.holdOff) return false;
    // 12초가 지나도 첫 이미지가 안 열리면 기다리지 않고 계속 진행합니다. (이미지가 느린 사이트만 모인 소스에서 피드 전체가 멈춰 보이던 문제 방지)
    if (Date.now() - (st.t || 0) > 12000) return false;
    return this.m.all.some((c) => c._it?.src === s.id && !c._ok && !c.classList.contains("broken"));
  }
  need() { return this.limit - this.m.cards.length; } // 지금 화면에 더 올려도 되는 장수 (필터·실패로 빠진 카드는 다시 채움)
  async next() {
    if (this.loading || !this.q) return;
    if (this.need() > 0) this.release(this.need());
    if (this.need() <= 0) { this.o.onMore?.(); return; } // 보여 줄 만큼 찼음 → [더 보기]를 기다림
    if (this.ended) { this.o.onAfter?.(); this.o.onMore?.(); return; }
    if (this.exhausted) { this.o.onMore?.(); return; }
    const open = this.sources().filter((s) => !this.srcEnded.has(s.id));
    if (!open.length) { this.ended = true; this.o.onAfter?.(); this.o.onMore?.(); return; }
    // 이미 받은 이미지가 한 장도 안 열린 소스는, 첫 이미지가 열릴 때까지 다음 페이지를 더 불러오지 않습니다.
    // (안 열리는 소스에서 페이지만 끝없이 쌓여 조회 수가 계속 늘던 문제 방지. 첫 이미지가 열리면 onload 가 이어서 불러옴)
    const srcs = open.filter((s) => !this.holding(s));
    if (!srcs.length) { this.stuck = true; this.o.onMore?.(); return; } // 모든 소스가 이미지를 기다리는 중 → [더 보기]로 직접 이어 볼 수 있게 함
    this.stuck = false;
    this.loading = true;
    const t0 = Date.now(), gen = this.gen, page = ++this.page, safe = S.blur ? 1 : 0, supply0 = this.supply;
    const color = this.o.filters ? S.color : "", orient = this.o.filters ? S.orient : "";
    const batch = []; let timer = null;
    const flush = (early) => {
      clearTimeout(timer); timer = null;
      const arr = batch.splice(0);
      if (gen !== this.gen) return;
      if (arr.length) this.merge(arr);
      // 첫 페이지는 빠른 소스만 도착했을 수 있으니, 화면을 채울 최소한(12장, 휴대폰 한 화면 정도)만 먼저 올리고
      // 나머지는 모든 소스가 도착한 뒤 점수순으로 올립니다. (늦게 온 관련도 높은 이미지가 아래로 밀리지 않게)
      // (소스 하나가 느려도 4초 넘게 기다리지 않습니다: 4초가 지나면 이미 받은 것으로 화면을 채웁니다)
      this.release(early && page === 1 && Date.now() - t0 < 3900 ? Math.min(12, this.need()) : this.need());
    };
    // 느린 소스가 있어도 4초가 되면 이미 받은 이미지로 화면을 채웁니다. (새로 도착하는 소스가 없으면 갱신할 계기가 없어서 처음 12장에서 멈춰 보이던 문제 방지)
    const capT = page === 1 ? setTimeout(() => { try { flush(true); } catch (e) { console.error(e); } }, 4000) : null;
    await Promise.all(srcs.map(async (s) => {
      const ac = new AbortController(); this.acs.add(ac);
      let timedOut = false; const tm = setTimeout(() => { timedOut = true; ac.abort(); }, 16000);
      try {
        if (s.en) await this.trP;
        const pr = this.terms?.proper ? "&pr=1" : ""; // 고유명사면 영어 소스(위키)도 한글 원문을 함께 씀
        const r = await (await api(`/api/search?src=${s.id}&q=${enc(this.q)}&qe=${enc(this.qe)}&page=${page}&safe=${safe}&color=${color}&orient=${orient}${pr}`, { signal: ac.signal })).json();
        if (gen !== this.gen) return;
        if (r.blocked) { this.blocked = true; return; }
        if (r.err) { this.fail(s, r); return; }
        const st = (this.stat[s.id] ||= { n: 0 }), base = st.n; if (!st.n && r.items.length) st.t = Date.now(); st.n += r.items.length;
        if (!r.items.length) this.srcEnded.add(s.id);
        batch.push({ src: s, items: r.items, base }); // base: 이 소스에서 앞선 페이지로 이미 받은 장수 (순위를 이어서 매김)
        if (!timer) timer = setTimeout(() => { try { flush(true); } catch (e) { console.error(e); } }, page === 1 ? 600 : 300);
      } catch (e) {
        if (gen !== this.gen || e.message === "auth") return;
        this.fail(s, { err: timedOut || e.name === "TimeoutError" ? "timeout" : "network" });
      } finally { clearTimeout(tm); this.acs.delete(ac); }
    }));
    clearTimeout(capT);
    try { flush(false); } catch (e) { console.error(e); } // 여기서 오류가 나도 loading 이 true 로 남아 피드가 멈추지 않게 함
    if (gen !== this.gen) return;
    this.loading = false;
    if (srcs.some((s) => this.stat[s.id]?.n && !IMGH[s.id]?.ok)) setTimeout(() => { if (gen === this.gen) { this.o.reobserve?.(); this.o.onMore?.(); } }, 12500); // 이미지 대기 시간이 끝난 뒤 다시 이어 불러옴
    // 이번 페이지에서 보여 줄 만한(약하지 않은) 이미지가 새로 생기지 않는 일이 연달아 2번이거나, [더 보기] 한 번에 6쪽 넘게 불러오면
    // 자동 불러오기를 멈추고 사용자가 [더 보기]를 누르게 합니다. (엉뚱한 결과만 나오는 검색어에서 요청이 끝없이 나가는 것 방지)
    this.stall = this.supply > supply0 ? 0 : this.stall + 1;
    if (this.stall >= 2 || ++this.burst >= 6) this.exhausted = true;
    if (this.blocked) { this.blocked = false; this.ended = true; this.o.onBlocked?.(); this.o.onProgress?.(); return; }
    this.o.onProgress?.();
    if (this.srcEnded.size >= this.sources().length) this.ended = true;
    this.o.onAfter?.();
    this.o.reobserve?.();
    this.o.onMore?.();
  }
  // 받은 이미지에 관련도 점수를 매겨 대기열(pend)에 넣습니다. 이미 화면에 올린 이미지는 건드리지 않아 카드가 갑자기 움직이지 않습니다.
  merge(arr) {
    const T = this.terms, fold = this.o.fold !== false && !!T?.specific, pinned = !!(this.o.filters && S.only.size);
    for (const { src, items, base = 0 } of arr) {
      const part = [];
      items.forEach((it, i) => { const k = keyOf(it); if (!this.keys.has(k) && !Avoid.isHidden(k)) part.push({ it, k, i, j: Relevance.judge(it, T, src.id) }); });
      { const st = this.stat[src.id]; if (st) st.u = (st.u || 0) + part.filter((x) => !this.pend.has(x.k)).length; } // 새로 본 이미지 수 (같은 이미지가 반복해서 오면 받은 수와 달라짐)
      // 이 소스의 이미지가 검색어와 대체로 안 맞으면(평균 관련도가 낮으면) 이 소스의 비중을 줄입니다.
      const known = part.filter((p) => p.j.known);
      const avg = known.length >= 8 ? known.reduce((t, p) => t + p.j.rel, 0) / known.length : 0.6;
      const scale = 0.6 + 0.4 * Math.min(1, avg / 0.6), bias = Relevance.bias(src.id, T, pinned);
      for (const { it, k, i, j } of part) {
        // 취향 학습을 켰을 때만: 이 기기의 취향 점수로 순서를 최대 ±50% 조정 (검색어·요청은 그대로, 받아 온 결과를 다시 줄 세울 뿐)
        const aff = this.o.taste && tasteOn() && it.grp !== "news" ? Taste.affinity(TasteStore.keysOf(it)) : 0;
        const av = applyAvoid(it); // "추천 안 함"으로 배운 태그와 겹치면 순위를 낮추거나(1) 블러로 가림(2)
        const sc = src.w * bias * scale * Relevance.mul(j.tier) / (60 + base + i) * (1 + 0.5 * aff) * (av ? 0.3 : 1); // 소스 순위 × 소스 가중치 × 관련도 등급. 여러 소스에 나오면 점수가 합쳐짐
        const ex = this.pend.get(k);
        if (ex) {
          ex.score += sc; if (j.rel > ex.rel) { ex.rel = j.rel; ex.tier = j.tier; }
          if (!ex.it.tags.length && it.tags.length) ex.it.tags = it.tags;
          if (!ex.it.title && it.title) ex.it.title = it.title;
          if (!ex.counted && !(fold && ex.tier === "weak")) { ex.counted = true; this.supply++; }
        } else {
          const counted = !(fold && j.tier === "weak");
          this.pend.set(k, { it: { ...it, id: hashId(k), key: k }, score: sc, rel: j.rel, tier: j.tier, counted });
          if (counted) this.supply++;
        }
      }
    }
  }
  // 대기열을 점수순으로 정렬해 보여 줄 것(strong)과 접어 둘 것(weak)으로 나눕니다.
  view() {
    const fold = this.o.fold !== false && !!this.terms?.specific && !this.weakOpen, strong = [], weak = [];
    for (const e of this.pend.values()) { if (Avoid.isHidden(e.it.key)) continue; (fold && e.tier === "weak" ? weak : strong).push(e); }
    strong.sort((a, b) => b.score - a.score);
    return { strong, weak };
  }
  // 점수 높은 순서로 n 장을 화면에 올립니다.
  // 점수 높은 순으로 고르되, 한 소스가 화면의 일정 비율(최소 12장)을 넘게 차지하지 못하게 합니다.
  // (한 소스의 순위·가중치가 높다는 이유로 다른 소스의 관련 이미지가 [더 보기] 뒤로 밀려 "한 소스만 나오는" 일을 막기 위함. 다른 소스가 모자라면 그대로 채움)
  pick(n) {
    const strong = this.view().strong;
    if (strong.length <= n) return strong;
    // 보여 줄 만한 이미지를 가진 소스가 많을수록 한 소스의 상한을 낮춥니다. (4개 이상 35%, 3개 45%, 2개 이하 55%)
    const k = new Set(strong.map((e) => e.it.src)).size, share = k >= 4 ? 0.35 : k === 3 ? 0.45 : 0.55;
    const cap = Math.max(12, Math.ceil((this.items.length + n) * share)), cnt = {}, out = [], rest = [];
    for (const it of this.items) cnt[it.src] = (cnt[it.src] || 0) + 1;
    for (const e of strong) {
      if (out.length >= n) break;
      const k = e.it.src;
      if ((cnt[k] || 0) < cap) { out.push(e); cnt[k] = (cnt[k] || 0) + 1; } else rest.push(e);
    }
    for (const e of rest) { if (out.length >= n) break; out.push(e); }
    return out;
  }
  release(n) {
    if (n <= 0 || !this.pend.size) return 0;
    const cards = this.pick(n).map((e) => {
      const it = e.it; it.rel = e.rel; it.tier = e.tier;
      this.pend.delete(it.key); this.keys.set(it.key, it); this.items.push(it);
      for (const t of new Set([...it.tags.map((x) => String(x).toLowerCase()), ...tokens(it.title)])) this.tags.set(t, (this.tags.get(t) || 0) + 1);
      const c = makeCard(it, () => this.o.open(this, it));
      c._feed = this; c._m = this.m; // 이미지가 열리지 않을 때 어느 목록에서 뺄지 알기 위함
      return c;
    });
    if (cards.length) this.m.add(cards);
    return cards.length;
  }
  more() { this.limit = this.m.cards.length + this.chunk; this.stall = 0; this.burst = 0; this.exhausted = false; this.holdOff = true; return this.next(); } // 직접 눌렀으면 이미지 열림을 기다리지 않고 바로 이어 불러옴
  openWeak() { this.weakOpen = true; this.limit = Math.max(this.limit, this.m.cards.length + this.chunk); this.stall = 0; this.burst = 0; this.exhausted = false; return this.next(); }
  hadResults() { return this.items.length > 0 || this.pend.size > 0; }
  // 피드 아래 버튼·안내의 상태: [더 보기], [관련도 낮은 결과 N개 보기], 안내 문구
  moreState() {
    const { strong, weak } = this.view();
    const full = this.need() <= 0, supplyDone = !strong.length && (this.ended || this.exhausted);
    // 막다른 상태가 없게: 불러오기가 멈춰 있거나(stuck) 보여 줄 것이 없는데 접힌 결과만 있으면 버튼을 보여 줍니다.
    const more = (full && (strong.length > 0 || !this.ended)) || (this.exhausted && !this.ended) || (this.stuck && !this.loading && !this.ended);
    const weakN = supplyDone || (!strong.length && !this.loading && weak.length) ? weak.length : 0;
    // 검색어와 실제로 맞는(strong·medium) 이미지가 적으면 알려 줍니다. (맞지 않는 건 아래 [관련도 낮은 결과 보기] 뒤에 있음)
    const good = this.items.filter((x) => x.tier === "strong" || x.tier === "medium").length;
    let note = "";
    if (this.stuck && !this.loading) note = "일부 소스의 이미지가 아직 열리는 중이에요. 잠시 뒤 [더 보기]를 눌러 보세요.";
    else if (weakN && good < 10) note = good ? `검색어와 정확히 맞는 이미지는 ${good}개뿐이에요.` : "검색어와 정확히 맞는 이미지를 찾지 못했어요.";
    return { more, weakN, note };
  }
}

// 피드 아래의 [더 보기] / [관련도 낮은 결과 보기] 버튼과 안내를 현재 상태에 맞게 보여 줍니다.
function renderMore(box, f) {
  if (!box) return;
  const st = f.q ? f.moreState() : { more: false, weakN: 0, note: "" };
  const mb = box.querySelector(".mbtn"), wb = box.querySelector(".wbtn"), nt = box.querySelector(".mnote");
  mb.hidden = !st.more; wb.hidden = !st.weakN; wb.textContent = st.weakN ? `관련도 낮은 결과 ${st.weakN}개 보기` : "";
  nt.textContent = st.note; nt.hidden = !st.note;
  box.hidden = mb.hidden && wb.hidden && nt.hidden;
}
function bindMore(box, f) { box.querySelector(".mbtn").onclick = () => f.more(); box.querySelector(".wbtn").onclick = () => f.openWeak(); }

// ---------- 메인 검색 ----------
const M = new Feed(feedM, {
  filters: true, taste: true, chunk: 60, // 한 번에 60장씩 보여 주고 [더 보기]로 이어 봅니다
  open: (f, it) => openViewer(f.items, f.items.indexOf(it)),
  onMore: () => renderMore($("#more"), M),
  onProgress: () => { renderStat(); renderChips(); },
  onAfter: () => checkEmpty(),
  onBlocked: () => showMsg("이 주제는 차단된 주제예요. (공포·잔혹 필터는 해제할 수 없어요)"),
  reobserve: () => { sio.unobserve($("#sentinel")); sio.observe($("#sentinel")); },
});
$("#more .wbtn").onclick = () => M.openWeak();
$("#more .mbtn").onclick = () => (M.q ? M : FY).more(); // 검색 중이면 검색 결과를, 홈이면 맞춤 피드를 이어 봄
// 비율을 아직 모르는 이미지는 일단 통과시키고, 불러온 뒤 loadCard 가 다시 판정합니다.
const predOrient = () => !S.orient ? null : (c) => {
  if (!c._it.w || !c._it.h) return true;
  const r = c._it.w / c._it.h; return S.orient === "v" ? r < 0.9 : S.orient === "h" ? r > 1.1 : r >= 0.9 && r <= 1.1;
};
// 서버가 색을 맞춰 준 이미지(sc)와 아직 색을 모르는 이미지는 통과, 대표 색을 알게 되면 고른 색이 포함될 때만 남깁니다.
const predColor = () => !S.color ? null : (c) => !c._it.cols || !!c._it.sc || c._it.cols.includes(S.color);
// 톤: 아직 분석하지 못한 이미지는 통과, 분석되면 고른 톤일 때만 남깁니다.
const predTone = () => !S.tone ? null : (c) => !c._it.an || !c._it.an.tone || toneMatch(c._it.an, S.tone);
const feedPred = () => {
  const ps = [predOrient(), predColor(), predTone()].filter(Boolean);
  return ps.length ? (c) => ps.every((f) => f(c)) : null;
};
// 필터로 카드가 빠지면 목록이 비거나 화면이 덜 찰 수 있으니 안내를 갱신하고 다음 페이지를 불러옵니다.
let kickT;
feedM.onChange = () => {
  clearTimeout(kickT);
  kickT = setTimeout(() => {
    if (!M.q) { if (FY.active) fyPump(); return; } // 홈 피드: 이미지가 안 열려 빠진 만큼 다시 채움
    if (!M.hadResults()) return;
    checkEmpty();
    if (!M.ended || M.pend.size) { sio.unobserve($("#sentinel")); sio.observe($("#sentinel")); }
  }, 250);
};

async function startSearch(q, opts = {}) {
  q = (q || "").trim().slice(0, 100);
  if (!q || !cfg) return;
  if (S.offline) return toast("오프라인이라 북마크만 볼 수 있어요");
  if (V.stack.length) closeViewer();
  M.reset(); M.begin(q, opts.sl); fyStop(); // 홈 맞춤 피드는 멈춤 (setView 가 홈 피드를 다시 시작하지 않게 M.q 를 먼저 정함)
  setView("feed");
  // 최근 검색·취향: 검색어를 직접 입력하거나 칩으로 고른 경우만 (재검색·"아무거나"는 제외). 이 기기에만 저장돼요.
  if (!opts.keep && !opts.auto && tasteOn()) { Recent.add(q); Taste.learn(tokens(q).slice(0, 3), 0.8); }
  $("#q").value = q; syncQ(); $("#q").blur(); $("#home").hidden = true; $("#filters").hidden = true; if (!opts.keep) $("#srcPanel").hidden = true;
  feedM.clear(); feedM.pred = feedPred(); markFilters(); $("#msg").hidden = true; $("#msg").textContent = ""; renderChips(); renderStat(); renderMore($("#more"), M); scrollTo(0, 0);
  skel(true);
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
    b.textContent = !M.q || idle ? s.name : !st ? `${s.name} …` : bad ? s.name : `${s.name} ${st.u ?? st.n}`;
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
function showMsg(t) { const m = $("#msg"); m.textContent = t; m.hidden = false; skel(false); }
// 결과를 기다리는 동안 보여 주는 자리 표시(회색 상자). 첫 카드가 올라오거나 메시지가 뜨면, 늦어도 20초 뒤엔 사라집니다.
function skel(on) { const b = $("#skel"); clearTimeout(skel.t); b.hidden = !on; if (on) skel.t = setTimeout(() => { b.hidden = true; }, 20000); }
feedM.onAdd = () => skel(false);
function checkEmpty() {
  if (feedM.cards.length) { if (M.items.length) $("#msg").hidden = true; return; }
  if (M.items.length) { // 결과는 있었지만 화면에 남은 카드가 없음
    if (!M.sources().length && Object.keys(DEAD).length) showMsg("이미지가 열리지 않아 쉬고 있는 소스예요. 위의 [소스]에서 ⚠ 를 누르면 이유를, 소스 이름을 누르면 다시 시도해요.");
    else if (M.ended) showMsg("방향·색상·톤 조건에 맞는 이미지를 찾지 못했어요. 필터를 바꾸거나 다른 말로 검색해 보세요.");
    return;
  }
  if (M.pend.size) { $("#msg").hidden = true; return; } // 접어 둔 결과가 있음 → 아래 [관련도 낮은 결과 보기] 안내로 대신함
  const act = M.sources();
  const allErr = act.length && act.every((s) => M.stat[s.id]?.err);
  if (M.ended || allErr) showMsg(!act.length ? "켜져 있는 검색 소스가 없어요. 설정에서 켜 주세요." : allErr ? "검색 소스에 연결하지 못했어요. 상단의 [소스] 버튼에서 ⚠ 를 눌러 이유를 확인해 보세요." : "결과가 없어요. 다른 말로 검색해 보세요.");
}
const sio = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && S.view === "feed") (M.q ? M.next() : FY.next()); }, { rootMargin: "1200px 0px" });
sio.observe($("#sentinel"));

// ---------- 홈 / 처음으로 ----------
// 홈을 열 때마다 카테고리를 새로 섞어서 보여 줍니다. 카테고리를 누르면 그 안의 세부 주제로 내려갑니다.
const HOME = { cat: null, picks: [], tok: 0 };
async function bmTopTags(n = 8) {
  const cnt = new Map();
  for (const x of await DB.all()) for (const t of new Set([...(x.tags || []).map((v) => String(v).toLowerCase()), ...tokens(x.title || "")])) if (!Taste.isMuted(t)) cnt.set(t, (cnt.get(t) || 0) + 1);
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}
// ⭐ 칩의 ✕: 그 말을 "뺀 단어"로 저장합니다. 관심사 칩(chip=null)이면 맞춤 피드도 새로 짜고, 북마크 단어 칩이면 그 칩만 치웁니다.
// 뺀 단어는 취향 점수·관심사·북마크 단어 칩·트렌드 내 취향 어디서도 다시 쓰지 않고, 설정의 [뺀 단어]에서 되돌릴 수 있어요.
function dropStar(words, label, chip) {
  words.forEach((w) => Taste.mute(w)); FYI.sig = "";
  const undo = () => { words.forEach((w) => Taste.unmute(w)); FYI.sig = ""; renderTasteView(); if (!M.q && S.view === "feed" && !HOME.cat) { chip === null ? fyStart() : renderHome(); } };
  toast(`‘${label}’은(는) 추천에서 뺐어요`, 6000, { label: "되돌리기", fn: undo });
  renderTasteView();
  if (chip) chip.remove(); else if (!M.q && S.view === "feed") fyStart();
}
// 홈 맨 위 한 줄: [아무거나] [내 관심사들(⭐)] [추천 카테고리…]. 카테고리를 누르면 세부 주제로 내려갑니다. 그 아래가 "당신을 위한 피드"예요.
function renderHome(reshuffle) {
  const box = $("#homeChips"), tok = ++HOME.tok, cat = HOME.cat; box.textContent = ""; box.scrollLeft = 0;
  const row = document.createElement("div"); row.className = "crow"; box.appendChild(row);
  const mk = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (cls) b.className = cls; b.onclick = fn; return b; };
  const chip = (label, cls, fn) => { row.appendChild(mk(label, cls, fn)); };
  $("#homeBack").hidden = !cat;
  if (!cat) {
    if (reshuffle || !HOME.picks.length) HOME.picks = shuffle(CATS).slice(0, 10);
    chip("🎲 아무거나", "rand", () => { const c = pick(CATS); startSearch(pick(c[2]), { auto: true }); });
    const mkStar = (t, onDrop) => {
      const b = mk(`⭐ ${t}`, "mine", () => startSearch(t)); b.classList.add("hasx");
      const x = document.createElement("i"); x.textContent = "✕"; x.className = "chx"; x.setAttribute("role", "button"); x.setAttribute("aria-label", `${t} 추천에서 빼기`);
      x.onclick = (e) => { e.stopPropagation(); onDrop(b); };
      b.appendChild(x); return b;
    };
    const ints = (FY.ints || []).filter((c) => c.label).slice(0, 3), labels = ints.map((c) => c.label);
    ints.forEach((c) => row.appendChild(mkStar(c.label, () => dropStar((c.terms || []).slice(0, 2), c.label, null))));
    HOME.picks.forEach((c) => chip(`${c[0]} ${c[1]}`, "cat", () => { HOME.cat = c; renderHome(); }));
    // 아직 관심사 묶음이 없으면(처음 며칠) 북마크·취향의 자주 나온 단어를 두세 개 섞어 줍니다
    if (!labels.length && !S.priv) bmTopTags(6).then((tags) => {
      if (tok !== HOME.tok || HOME.cat || S.priv) return;
      const pool = [...new Set([...(tasteOn() ? Taste.top(8) : []), ...tags])], at = row.children[1] || null;
      shuffle(pool).slice(0, tasteOn() ? 3 : 2).forEach((t) => row.insertBefore(mkStar(t, (b) => dropStar([t], t, b)), at));
    });
  } else {
    chip(`${cat[0]} ‘${cat[1]}’ 전체 보기`, "cat", () => startSearch(cat[1]));
    cat[2].forEach((s) => chip(s, "", () => startSearch(s)));
  }
  renderRecent(); renderFyHint();
  $("#home").hidden = !!M.q || S.view !== "feed";
}
$("#homeBack").onclick = () => { HOME.cat = null; renderHome(); };
// 최근 검색 칩: 누르면 다시 검색, ✕ 로 하나씩 지우기, [모두 지우기]
function renderRecent() {
  const box = $("#recentRow"); box.textContent = "";
  const list = !S.priv && tasteOn() && !HOME.cat ? Recent.list().slice(0, 8) : [];
  box.hidden = !list.length; if (!list.length) return;
  const lbl = document.createElement("span"); lbl.className = "rlbl"; lbl.textContent = "최근 검색"; box.appendChild(lbl);
  list.forEach((x) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tchip"; b.setAttribute("aria-label", `${x.q} 다시 검색`);
    const t = document.createElement("span"); t.textContent = x.q; b.appendChild(t); b.onclick = () => startSearch(x.q);
    const d = document.createElement("i"); d.textContent = "✕"; d.setAttribute("role", "button"); d.setAttribute("aria-label", `${x.q} 기록 지우기`);
    d.onclick = (e) => { e.stopPropagation(); Recent.remove(x.q); renderRecent(); };
    b.appendChild(d); box.appendChild(b);
  });
  const all = document.createElement("button"); all.type = "button"; all.className = "sm rclr"; all.textContent = "모두 지우기";
  all.onclick = () => { Recent.clear(); renderRecent(); toast("최근 검색을 모두 지웠어요"); };
  box.appendChild(all);
}
function renderFyHint() {
  const h = $("#fyHint"), l = (FY.ints || []).map((c) => c.label).filter(Boolean).slice(0, 3);
  h.textContent = S.priv ? "🕶 비공개 모드라서 맞춤 피드를 쓰지 않고, 기록도 남기지 않아요."
    : !S.taste ? "설정에서 ‘내 취향 학습’을 켜면 맞춤 피드가 만들어져요."
    : l.length ? `${l.map((x) => `‘${x}’`).join(" · ")} 취향으로 골랐어요. 일부는 새로운 발견이에요.`
    : "아직 취향을 배우는 중이에요. 마음에 드는 이미지를 북마크하거나 오래 보면 여기에 맞춰져요.";
  h.hidden = !FY.active;
}

// ---------- 당신을 위한 피드 (홈) ----------
// 앱을 열면 바로 보이는 첫 화면입니다. 핀터레스트(PinnerSage)의 구조를 따라:
//  1) 활동 기록을 비슷한 것끼리 묶어 관심사를 만들고(interests.js), 중요도에 비례해 최대 3개를 뽑고(가장 최근 활동의 묶음은 반드시 포함),
//  2) 관심사마다 그 묶음의 검색어로 기존 검색 파이프라인(Feed)을 돌려 이미지를 가져오고,
//  3) 임베딩이 있으면 묶음 중심과 의미가 가까운 순으로 다듬은 뒤, 관심사들을 돌아가며(비중대로) 섞고, 20~30%는 새로운 주제를 섞어 한쪽으로 쏠리지 않게 합니다.
// 각 관심사의 Feed 는 화면에 바로 붙지 않고 "대기 상자(Hold)"에 모아 두었다가, 이 코드가 한 줄로 섞어서 feedM(#grid)에 올립니다.
class Hold { // Feed 가 Masonry 인 줄 알고 쓰는 가짜 칸. 카드가 화면에 올라가기 전까지 여기에 있음
  constructor() { this.cards = []; this.all = []; }
  add(cs) { this.cards.push(...cs); this.onAdd?.(cs); }
  drop(c) { this.cards = this.cards.filter((x) => x !== c); }
  balLater() {} recheck() {}
}
const FY_SRC = ["naver", "kakao", "pixabay", "openverse", "wikimedia"];
const FY = { gen: 0, active: false, q: "", subs: [], items: [], seen: new Set(), limit: 60, ints: [], at: 0, pumping: false, pt: null,
  next() { fyPump(); },
  more() { this.limit = feedM.cards.length + 60; for (const s of this.subs) if (s.feed.exhausted || s.feed.stuck) s.feed.more(); fyPump(); },
  live(s) { const f = s.feed; return s.hold.cards.length > 0 || f.pend.size > 0 || !(f.ended || f.exhausted); },
  canMore() { return this.subs.some((s) => this.live(s)); },
  moreState() { const full = feedM.cards.length >= this.limit; return { more: full && this.canMore(), weakN: 0, note: "" }; },
};
const fyReobserve = () => { sio.unobserve($("#sentinel")); sio.observe($("#sentinel")); };
function fyPumpSoon() { clearTimeout(FY.pt); FY.pt = setTimeout(fyPump, 120); }
function fySub(kind, q, share, cl) {
  const cands = cl ? Interests.queries(cl) : [q];
  // 관심사는 앞쪽 후보 3개 중 하나에서 무작위로 시작합니다 → 같은 묶음도 새로 고칠 때마다 다른 검색어로 보여 줌
  const hold = new Hold(), sub = { kind, share, cl, hold, cands, ci: cl ? Math.floor(Math.random() * Math.min(3, cands.length)) : 0, ready: false, cw: 0, kick: 0, cvec: cl?.vec || null };
  hold.onAdd = () => fyHeld(sub);
  sub.feed = new Feed(hold, {
    filters: false, taste: !cl, chunk: 24, srcAllow: FY_SRC,
    open: (f, it) => openViewer(FY.items, FY.items.indexOf(it)),
    onMore: fyPumpSoon, onProgress: fyPumpSoon, onAfter: () => fyAfter(sub), reobserve: fyReobserve,
  });
  return sub;
}
function fyBegin(sub) {
  const q = sub.cands[sub.ci], f = sub.feed; if (!q) return;
  f.reset(); sub.hold.cards = [];
  // 이미 저장·반응한 이미지는 맞춤 피드에 다시 나오지 않게 합니다
  if (sub.cl && ACT.m) for (const r of ACT.m.values()) if (r.key) f.keys.set(r.key, r);
  f.begin(q); f.next();
}
// 후보 검색어로 아무것도 못 찾았으면 다음 후보(더 짧은 말)로 다시 시도
function fyAfter(sub) {
  const f = sub.feed;
  if (f.ended && !f.items.length && !f.pend.size && !sub.hold.cards.length && sub.ci + 1 < sub.cands.length) { sub.ci++; fyBegin(sub); return; }
  fyPumpSoon();
}
// 대기 상자에 새 카드가 들어왔을 때: 임베딩이 있으면 묶음 중심과 의미가 가까운 순으로 다듬고(최대 1.5초 기다림), 아니면 바로 사용 가능
function fyHeld(sub) {
  if (!cfg?.embed || !sub.cvec || EMB.off > Date.now()) { sub.ready = true; return fyPumpSoon(); }
  clearTimeout(sub.rt); sub.rt = setTimeout(() => fyRank(sub), 150);
  if (!sub.ready && !sub.rtmax) sub.rtmax = setTimeout(() => { sub.ready = true; fyPumpSoon(); }, 1500);
}
async function fyRank(sub) {
  const gen = FY.gen, need = sub.hold.cards.filter((c) => !c._it.vec && !c._it.nv).slice(0, 40);
  if (need.length) {
    const vs = await embedTexts(need.map((c) => embText(c._it)));
    if (gen !== FY.gen) return;
    need.forEach((c, i) => { if (vs?.[i]) c._it.vec = vs[i]; else c._it.nv = 1; });
  }
  const list = sub.hold.cards, n = list.length;
  const sc = new Map(list.map((c, i) => [c, Interests.blend(i, n, c._it.vec ? Interests.cosine(sub.cvec, c._it.vec) : null) ?? 0.55 * (1 - i / Math.max(1, n)) + 0.45 * 0.4]));
  list.sort((a, b) => sc.get(b) - sc.get(a));
  sub.ready = true; fyPumpSoon();
}
// 대기 상자들에서 비중(share)대로 돌아가며 한 장씩 꺼내 화면에 올립니다 (부드러운 가중 라운드 로빈). 이미 올라간 카드의 순서는 바뀌지 않아요.
function fyPump() {
  if (!FY.active || FY.pumping) return; FY.pumping = true;
  try {
    const batch = []; let guard = 0;
    while (feedM.cards.length + batch.length < FY.limit && guard++ < 600) {
      const l = FY.subs.filter((s) => s.ready && s.hold.cards.length); if (!l.length) break;
      let best = null, tot = 0; for (const s of l) { s.cw += s.share; tot += s.share; if (!best || s.cw > best.cw) best = s; }
      best.cw -= tot;
      const c = best.hold.cards.shift(), k = c._it.key;
      if (FY.seen.has(k)) continue;
      FY.seen.add(k); FY.items.push(c._it); batch.push(c);
    }
    if (batch.length) feedM.add(batch);
    // 대기 상자가 줄어든 관심사는 더 불러옵니다 (너무 자주 요청하지 않게 0.7초에 한 번만)
    const now = Date.now();
    for (const s of FY.subs) if (s.hold.cards.length < 10 && now - s.kick > 700 && (s.feed.pend.size || !(s.feed.ended || s.feed.exhausted))) { s.kick = now; s.feed.next(); }
    if (!M.q && S.view === "feed") renderMore($("#more"), FY);
    if (!feedM.cards.length && !FY.subs.some((s) => FY.live(s))) { skel(false); showMsg("맞춤 피드를 불러오지 못했어요. 오른쪽 위 새로 고침을 눌러 보세요."); }
  } finally { FY.pumping = false; }
}
function fyStop() {
  FY.gen++; FY.active = false; FY.q = ""; clearTimeout(FY.pt);
  FY.subs.forEach((s) => { clearTimeout(s.rt); clearTimeout(s.rtmax); s.feed.reset(); s.hold.cards = []; });
  FY.subs = [];
}
async function fyStart(reshuffle) {
  fyStop();
  if (!cfg || S.offline || M.q || S.view !== "feed") return;
  const gen = FY.gen; // fyStop 이 올린 세대 번호. 이후 다시 시작/중지되면 이 값과 달라져 이 시작은 중단됩니다
  Object.assign(FY, { active: true, q: "fy", at: Date.now(), limit: 60, items: [], seen: new Set(), ints: [] });
  feedM.clear(); feedM.pred = null; $("#msg").hidden = true; $("#msg").textContent = ""; skel(true); renderMore($("#more"), FY); renderFyHint();
  let cl = [];
  // 20차: 3개 → 4개로 늘리고, 작은 관심사도 자주 뽑히도록 가중치를 완만하게 합니다. (새로 고칠 때마다 다른 관심사가 보이게)
  if (tasteOn()) { try { cl = Interests.pick(await buildInterests(), 4); } catch { cl = []; } }
  if (gen !== FY.gen) return;
  FY.ints = cl;
  const subs = cl.map((c) => fySub("int", null, 4, c));
  // 새로운 주제를 20~30% 섞습니다 (관심사가 적으면 더 많이). 관심사가 하나도 없으면 전부 새로운 주제.
  const exN = cl.length ? (cl.length >= 2 ? 2 : 1) : 3, exShare = cl.length ? Math.ceil(Math.ceil((0.3 / 0.7) * 4 * cl.length) / exN) : 4;
  shuffle(CATS).slice(0, exN).forEach((c) => subs.push(fySub("ex", pick(c[2]), exShare, null)));
  FY.subs = subs;
  renderHome(); // ⭐ 관심사 칩과 안내 문구 갱신
  subs.forEach(fyBegin);
  ACT.embedPending(); ACT.describeSoon();
}
$("#fyRefresh").onclick = () => { if (S.offline || M.q) return; HOME.cat = null; renderHome(true); fyStart(true); scrollTo(0, 0); };
function goHome() {
  if (S.offline) return;
  if (V.stack.length) closeViewer();
  M.reset(); fyStop(); feedM.clear(); feedM.pred = null; renderMore($("#more"), M);
  S.color = ""; S.orient = ""; S.tone = ""; S.only.clear(); markFilters();
  $("#q").value = ""; syncQ(); $("#q").blur(); $("#msg").hidden = true; $("#msg").textContent = ""; $("#filters").hidden = true; $("#srcPanel").hidden = true;
  HOME.cat = null;
  setView("feed"); renderChips(); renderStat(); renderHome(true); scrollTo(0, 0); // setView 가 맞춤 피드를 새로 시작합니다
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

// ---------- 탭/북마크 보기 ----------
function setView(v) {
  if (v !== "bm" && SEL.on) exitSel();
  S.view = v;
  $("#tabFeed").classList.toggle("on", v === "feed"); $("#tabBm").classList.toggle("on", v === "bm"); $("#tabTr").classList.toggle("on", v === "tr");
  $("#grid").hidden = v !== "feed"; $("#bmgrid").hidden = v !== "bm"; $("#trends").hidden = v !== "tr"; $("#bmtools").hidden = v !== "bm";
  $("#srcBtn").hidden = v !== "feed"; $("#filterBtn").hidden = v !== "feed"; if (v !== "feed") { $("#filters").hidden = true; $("#srcPanel").hidden = true; }
  $("#home").hidden = !(v === "feed" && !M.q);
  if (v !== "feed") $("#more").hidden = true;
  if (v !== "bm") recClose();
  if (v === "feed") {
    // 홈(검색 전)이면 맞춤 피드를 보여 줍니다. 아직 시작 전이거나 30분이 지났으면 새로 시작.
    if (!M.q && cfg && !S.offline && (!FY.active || Date.now() - FY.at > 30 * 60000)) fyStart();
    feedM.check(); renderChips(); const m = $("#msg"); m.hidden = !(M.q && !M.items.length && m.textContent); renderMore($("#more"), M.q ? M : FY);
  }
  else if (v === "tr") { $("#msg").hidden = true; renderChips(); trEnter(); scrollTo(0, 0); }
  if (v === "bm") $("#chipsWrap").hidden = true; // 북마크의 보드는 위쪽 묶음 줄에서 고릅니다
}
async function showBm() {
  if (S.priv) return toast("비공개 모드에서는 북마크를 볼 수 없어요");
  setView("bm"); await renderBm();
}
// 북마크 목록 그리기: 보드 · 검색어 · 정렬을 적용합니다. (검색어는 저장하지 않고 이 화면에만 둡니다)
async function renderBm() {
  // 키워드로 걸린 선정성(adultSrc "kw")만 저장된 값을 따르고, AI가 걸었던 것은 지금 기준으로 다시 검사합니다. (예전 기준의 오탐이 북마크에 남지 않게)
  const all = (await DB.all()).map((x) => ({ ...x, fromBm: true, tags: x.tags || [], adult: !x.safe && x.adultSrc === "kw" }));
  renderBoardStrip(all);
  renderBmFil(all);
  const q = (S.bmq || "").trim().toLowerCase();
  let shown = all.filter((x) => inBoard(x, S.board));
  S.boardItems = S.board !== "__all" && S.board !== "" ? shown : [];
  $("#bmrecRow").hidden = S.boardItems.length < 2;
  if ($("#bmrecRow").hidden) recClose();
  if (S.bmTone) shown = shown.filter((x) => x.an?.tone && toneMatch(x.an, S.bmTone));
  if (S.bmColor) shown = shown.filter((x) => (x.an?.cols || []).includes(S.bmColor));
  if (q) shown = shown.filter((x) => [x.title, srcName(x.src), ...bOf(x), x.note, ...x.tags].join(" ").toLowerCase().includes(q));
  const by = S.bmsort;
  shown.sort(by === "old" ? (a, b) => a.ts - b.ts : by === "title" ? (a, b) => String(a.title || srcName(a.src)).localeCompare(String(b.title || srcName(b.src)), "ko") : (a, b) => b.ts - a.ts);
  S.list = shown; bmM.clear();
  backfillAn(all);
  if (!shown.length) { showMsg(!all.length ? "아직 북마크가 없어요. 이미지의 ☆ 를 눌러 담아 보세요." : S.bmTone || S.bmColor ? "이 톤·색의 북마크가 없어요. (아직 분석 중인 북마크는 잠시 뒤 나타나요)" : q ? "찾는 북마크가 없어요. 다른 말로 검색해 보세요." : S.board === "" ? "보드에 담지 않은 북마크가 없어요." : "이 보드는 비어 있어요."); return; }
  $("#msg").hidden = true;
  bmM.add(shown.map((it) => makeCard(it, () => openViewer(S.list, S.list.indexOf(it)))));
}
let bmT; $("#bmq").oninput = (e) => { S.bmq = e.target.value; clearTimeout(bmT); bmT = setTimeout(renderBm, 200); };
bindClear($("#bmq"), $("#bmClear"), () => { S.bmq = ""; renderBm(); });
$("#bmsort").value = S.bmsort; $("#bmsort").onchange = (e) => { S.bmsort = e.target.value; LS.set("bmsort", S.bmsort); renderBm(); };
// 북마크 톤·색 분석: 저장할 때 분석하지만, 예전에 저장한 북마크는 이 화면을 열 때 뒤에서 조금씩 분석해 둡니다 (결과는 북마크 안에만 저장)
let backfilling = false;
async function backfillAn(all) {
  if (backfilling || !all.some((x) => !x.an && x.blob)) return;
  backfilling = true;
  try {
    const raw = await DB.all(); let n = 0;
    for (const r of raw) {
      if (r.an || !r.blob) continue;
      if (n >= 30 || S.view !== "bm") break;
      const inf = await blobInfo(r.blob); n++;
      r.an = inf?.an || { none: true }; await DB.put(r);
    }
    if (n && S.view === "bm" && $("#viewer").hidden) { backfilling = false; renderBm(); }
  } finally { backfilling = false; }
}
// 북마크의 톤·색 필터 칩 (분석된 북마크에 있는 톤·색만 보여 줌)
function renderBmFil(all) {
  const box = $("#bmfil"); box.textContent = "";
  const pool = all.filter((x) => inBoard(x, S.board) && x.an?.tone);
  const tones = new Map(), cols = new Map();
  for (const x of pool) { tones.set(x.an.tone, (tones.get(x.an.tone) || 0) + 1); if (x.an.temp !== "neutral") tones.set(x.an.temp, (tones.get(x.an.temp) || 0) + 1); for (const c of (x.an.cols || []).slice(0, 3)) cols.set(c, (cols.get(c) || 0) + 1); }
  if (S.bmTone && !tones.has(S.bmTone)) S.bmTone = "";
  if (S.bmColor && !cols.has(S.bmColor)) S.bmColor = "";
  box.hidden = pool.length < 3;
  if (box.hidden) return;
  const mk = (label, on, fn, cls) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (cls) b.className = cls; if (on) b.classList.add("on"); b.onclick = fn; box.appendChild(b); return b; };
  TONE_LIST.slice(1).filter(([v]) => tones.has(v)).forEach(([v, l]) => mk(`${l} ${tones.get(v)}`, S.bmTone === v, () => { S.bmTone = S.bmTone === v ? "" : v; renderBm(); }));
  [...cols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([c]) => { const b = mk("", S.bmColor === c, () => { S.bmColor = S.bmColor === c ? "" : c; renderBm(); }, "dot"); b.style.background = COLORS[c] || "#888"; b.setAttribute("aria-label", KO_COLOR[c] || c); });
}

// ----- 보드에 어울리는 이미지: 이 보드 북마크의 태그로 새 이미지를 찾아 보여 줍니다 (검색어는 저장하지 않음) -----
const REC = { on: false, feed: null, m: null, cands: [], ci: 0 };
const rio = new IntersectionObserver((es) => { if (REC.on && es.some((e) => e.isIntersecting)) REC.feed?.next(); }, { rootMargin: "1200px 0px" });
function boardQueries(items) {
  const cnt = new Map();
  for (const x of items) for (const t of new Set([...(x.tags || []).map((v) => String(v).toLowerCase().trim()), ...tokens(x.title || "")])) if (t.length > 1) cnt.set(t, (cnt.get(t) || 0) + 1);
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 4);
  const c = []; if (top.length > 1) c.push(top.slice(0, 2).join(" ")); if (top.length) c.push(top[0]); if (top.length > 2) c.push(top.slice(1, 3).join(" "));
  return [...new Set(c)];
}
function recStart(ci) {
  const f = REC.feed, q = REC.cands[ci]; REC.ci = ci;
  REC.m.clear(); f.reset(); $("#bmrecMsg").hidden = true;
  if (!q) { $("#bmrecMsg").textContent = "이 보드에서 찾을 단서(태그·제목)가 없어요."; $("#bmrecMsg").hidden = false; return; }
  $("#bmrecq").textContent = `‘${q}’ 기준`;
  for (const x of S.boardItems) f.keys.set(keyOf(x), x); // 이미 담은 이미지는 제외
  f.begin(q); renderMore($("#bmrecMore"), f); f.next();
}
function openBoardRec() {
  if (!cfg || S.offline || S.priv || S.boardItems.length < 2) return;
  if (!REC.feed) {
    REC.m = new Masonry($("#bmrecGrid"));
    REC.feed = new Feed(REC.m, {
      filters: false, chunk: 30, fold: false,
      open: (f, it) => openViewer(f.items, f.items.indexOf(it)),
      onMore: () => renderMore($("#bmrecMore"), REC.feed),
      onAfter: () => { const f = REC.feed; if (!REC.on || f.items.length || !f.ended) return; if (REC.ci + 1 < REC.cands.length) return recStart(REC.ci + 1); $("#bmrecMsg").textContent = "어울리는 이미지를 찾지 못했어요."; $("#bmrecMsg").hidden = false; },
      reobserve: () => { rio.unobserve($("#bmrecSent")); rio.observe($("#bmrecSent")); },
    });
    bindMore($("#bmrecMore"), REC.feed);
  }
  REC.on = true; $("#bmrec").hidden = false; REC.cands = boardQueries(S.boardItems);
  recStart(0); rio.observe($("#bmrecSent"));
  $("#bmrec").scrollIntoView?.({ behavior: "smooth", block: "start" });
}
function recClose() { if (!REC.on && !REC.feed) return; REC.on = false; $("#bmrec").hidden = true; if (REC.feed) { REC.feed.reset(); REC.m.clear(); rio.unobserve($("#bmrecSent")); } }
$("#bmrecBtn").onclick = openBoardRec;
$("#bmrecClose").onclick = recClose;

// 북마크 맨 위의 보드 묶음 줄: 보드마다 대표 이미지 4장을 작게 모아 보여 주고, 누르면 그 보드만 봅니다. (보드가 하나도 없으면 줄 자체를 숨김)
let stripUrls = [];
function renderBoardStrip(all) {
  const box = $("#boardStrip"); box.textContent = "";
  stripUrls.forEach((u) => URL.revokeObjectURL(u)); stripUrls = [];
  $("#chipsWrap").hidden = true;
  const names = boardNames(all);
  if (!names.length) { if (S.board !== "__all") S.board = "__all"; box.hidden = true; return; }
  if (S.board !== "__all" && S.board !== "" && !names.includes(S.board)) S.board = "__all";
  box.hidden = SEL.on;
  const recent = (list) => list.slice().sort((a, b) => b.ts - a.ts).slice(0, 4);
  const tile = (label, val, list) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "bt" + (S.board === val ? " on" : ""); b.dataset.b = val; b.setAttribute("aria-label", `${label} ${list.length}장`);
    const th = document.createElement("span"); th.className = "th";
    recent(list).forEach((x) => {
      const im = document.createElement("img"); im.alt = ""; im.referrerPolicy = "no-referrer"; im.draggable = false;
      if (x.adultSrc && !x.safe) im.className = "bl"; // 민감할 수 있는 이미지는 여기서도 흐리게
      if (x.blob) { const u = URL.createObjectURL(x.blob); stripUrls.push(u); im.src = u; } else im.src = x.thumb;
      th.appendChild(im);
    });
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = `${label} ${list.length}`;
    b.append(th, nm);
    b.onclick = () => { S.board = val; S.bmTone = ""; S.bmColor = ""; recClose(); renderBm(); };
    box.appendChild(b);
  };
  tile("전체", "__all", all);
  names.forEach((n) => tile(n, n, all.filter((x) => bOf(x).includes(n))));
  const un = all.filter((x) => !bOf(x).length); if (un.length) tile("보드 없음", "", un);
  const mg = document.createElement("button"); mg.type = "button"; mg.className = "bt mgr"; mg.setAttribute("aria-label", "보드 관리");
  const th = document.createElement("span"); th.className = "th"; th.innerHTML = '<svg class="i"><use href="#i-sliders"/></svg>';
  const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = "보드 관리";
  mg.append(th, nm); mg.onclick = openBoardMgr; box.appendChild(mg);
}

// ---------- 보드 관리 (17차): 이름 바꾸기 · 순서 옮기기 · 지우기 ----------
// 보드는 북마크마다 붙은 이름표(boards)입니다. 보드를 지워도 북마크(이미지)는 그대로 남고 이름표만 떼어요.
const setBoards = (x, arr) => { x.boards = arr; delete x.board; };
async function bmgRename(oldN, newN) {
  newN = String(newN || "").trim().slice(0, 30);
  if (!newN || newN === oldN) return false;
  for (const x of await DB.all()) if (bOf(x).includes(oldN)) { setBoards(x, [...new Set(bOf(x).map((b) => (b === oldN ? newN : b)))]); await DB.put(x); }
  const ord = LS.get("boardOrder", []).map((b) => (b === oldN ? newN : b)); LS.set("boardOrder", [...new Set(ord)]);
  if (S.board === oldN) S.board = newN;
  if (LS.get("lastBoard", "") === oldN) LS.set("lastBoard", newN);
  return true;
}
async function bmgDelete(n) {
  for (const x of await DB.all()) if (bOf(x).includes(n)) { setBoards(x, bOf(x).filter((b) => b !== n)); await DB.put(x); }
  LS.set("boardOrder", LS.get("boardOrder", []).filter((b) => b !== n));
  if (S.board === n) S.board = "__all";
  if (LS.get("lastBoard", "") === n) LS.set("lastBoard", "");
}
function bmgMove(names, i, d) {
  const j = i + d; if (j < 0 || j >= names.length) return;
  const a = names.slice(); [a[i], a[j]] = [a[j], a[i]]; LS.set("boardOrder", a);
}
async function renderBmg() {
  const all = await DB.all(), names = boardNames(all), box = $("#bmgList"); box.textContent = "";
  if (!names.length) { const p = document.createElement("p"); p.className = "note"; p.textContent = "아직 보드가 없어요."; box.appendChild(p); return; }
  const refresh = async () => { await renderBmg(); await renderBm(); };
  names.forEach((n, i) => {
    const row = document.createElement("div"); row.className = "bmg"; row.dataset.n = n;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = n;
    const c = document.createElement("small"); c.textContent = all.filter((x) => bOf(x).includes(n)).length + "장"; nm.appendChild(c);
    const btn = (cls, label, txt, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "ico sm " + cls; b.setAttribute("aria-label", label); b.textContent = txt; b.onclick = fn; return b; };
    const up = btn("up", `${n} 위로`, "↑", () => { bmgMove(names, i, -1); refresh(); }), dn = btn("dn", `${n} 아래로`, "↓", () => { bmgMove(names, i, 1); refresh(); });
    up.disabled = i === 0; dn.disabled = i === names.length - 1;
    const ed = btn("ed", `${n} 이름 바꾸기`, "✎", () => {
      const inp = document.createElement("input"); inp.type = "text"; inp.value = n; inp.maxLength = 30; inp.setAttribute("aria-label", "새 이름");
      row.textContent = ""; row.appendChild(inp);
      const ok = btn("ok", "이름 저장", "✓", async () => {
        const v = inp.value.trim();
        if (v && v !== n && names.includes(v) && !confirm(`‘${v}’ 보드가 이미 있어요. 두 보드를 하나로 합칠까요?`)) return;
        if (await bmgRename(n, v)) toast(`‘${n}’ → ‘${v}’`);
        refresh();
      });
      inp.onkeydown = (e) => { if (e.key === "Enter") ok.click(); else if (e.key === "Escape") refresh(); };
      row.appendChild(ok); inp.focus(); inp.select();
    });
    const del = btn("del", `${n} 지우기`, "🗑", () => {
      if (del.classList.contains("armed")) { clearTimeout(del.t); bmgDelete(n).then(() => { toast(`‘${n}’ 보드를 지웠어요. 이미지는 북마크에 남아 있어요`); refresh(); }); return; }
      del.classList.add("armed"); del.textContent = "한 번 더"; del.classList.remove("ico"); del.t = setTimeout(() => { del.classList.remove("armed"); del.classList.add("ico"); del.textContent = "🗑"; }, 3000);
    });
    row.append(nm, up, dn, ed, del); box.appendChild(row);
  });
}
function openBoardMgr() { renderBmg(); $("#boardMgr").hidden = false; }
function closeBoardMgr() { $("#boardMgr").hidden = true; }
$("#bmgClose").onclick = closeBoardMgr;
$("#tabFeed").onclick = () => setView("feed");
$("#tabTr").onclick = () => setView("tr");
$("#tabBm").onclick = showBm;

// ---------- 뷰어: 이미지 아래로 "비슷한 이미지" 피드가 이어집니다 ----------
// V.stack 의 각 칸(level)이 "지금 보는 이미지 + 그 아래 비슷한 이미지 피드" 한 세트입니다.
// 비슷한 이미지를 누르면 새 칸이 쌓이고, 뒤로 가기(또는 스와이프 뒤로)로 이전 칸에 돌아갑니다.
const V = { stack: [], pushed: 0, unwinding: false, fs: false };
let vTok = 0, vUrl = null, dwellT = null;
const lv = () => V.stack[V.stack.length - 1];
const curItem = () => { const l = lv(); return l ? l.list[l.cur] : null; };
const vio = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  const l = V.stack.find((x) => x.sent === e.target);
  if (l && l === lv()) l.feed.next();
}), { root: $("#viewer"), rootMargin: "1200px 0px" });

function newLevel(list, i) {
  const wrap = document.createElement("div"); wrap.className = "simlevel";
  wrap.innerHTML = '<div class="grid"></div><div class="simmsg" hidden></div>' +
    '<div class="more simmore" hidden><p class="mnote" hidden></p><button type="button" class="mbtn pri" hidden>더 보기</button><button type="button" class="wbtn sm" hidden></button></div><div class="simsent"></div>';
  $("#vsimlevels").appendChild(wrap);
  const level = { list, cur: i, wrap, scrollTop: 0, simQ: "", cands: [], ci: 0 };
  level.m = new Masonry(wrap.querySelector(".grid"));
  level.sent = wrap.querySelector(".simsent"); level.msg = wrap.querySelector(".simmsg"); level.more = wrap.querySelector(".more");
  level.feed = new Feed(level.m, {
    filters: false, chunk: 30, // 비슷한 이미지도 검색어와 거의 안 맞는 것(weak)은 [관련도 낮은 결과 보기] 뒤로 접어, 엉뚱한 이미지가 섞이지 않게 합니다
    onMore: () => renderMore(level.more, level.feed),
    open: (f, it) => pushLevel(f.items, f.items.indexOf(it)),
    onAfter: () => simAfter(level),
    reobserve: () => { vio.unobserve(level.sent); vio.observe(level.sent); },
  });
  bindMore(level.more, level.feed);
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
  clearTimeout(dwellT); cropClose();
  V.stack.forEach((l) => { l.feed.reset(); clearTimeout(l.rrT); vio.unobserve(l.sent); });
  V.stack = []; V.pushed = 0; $("#vsimlevels").textContent = ""; zReset(); fsReset();
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
  if (V.fs) { exitFs(true); return; } // 뒤로 가기(스와이프)는 전체화면부터 닫고, 한 번 더 누르면 평소처럼 동작
  if (V.stack.length > 1) { V.pushed = Math.max(0, V.pushed - 1); popLevel(); }
  else { V.pushed = 0; finishClose(); }
});

function showItem(keepSim) {
  const level = lv(), it = level?.list[level.cur]; if (!it) return;
  const img = $("#vimg"), token = ++vTok;
  zReset(); cropClose(); clearTimeout(dwellT);
  dwellT = setTimeout(() => { if (lv() && curItem() === it) learnFrom(it, 1); }, 7000); // 7초 넘게 보면 관심이 있는 것으로 보고 약하게 배움
  $("#vlike").hidden = !tasteOn(); $("#vcrop").hidden = !captionOn() || (it.adult && !it.safe);
  renderVInfo(it);
  const hide = it.adult && (S.blur || it.avoidBlur) && !it.revealed;
  img.classList.toggle("blur", hide); $("#vveil").hidden = !hide;
  $("#vsafe").hidden = !(it.adult && (S.blur || it.avoidBlur)); // 블러가 걸린 이미지에서만 "블러 해제" 버튼
  $("#vhide").hidden = !!it.fromBm; // 북마크는 내가 직접 담은 것이라 "추천 안 함" 대상이 아님
  // 제목은 소스마다 다릅니다: Pixabay·카카오 이미지는 제목 없이 태그나 출처 사이트 이름만 주기 때문에, 제목 → 태그 → 출처 사이트 → 소스 이름 순으로 보여 줍니다.
  const tagTitle = (it.tags || []).slice(0, 3).join(" · "), main = it.title || tagTitle;
  $("#vtitle").textContent = main || it.site || srcName(it.src);
  $("#vsrc").textContent = [srcName(it.src), main ? it.site : "", it.w ? `${it.w}×${it.h}` : ""].filter(Boolean).join(" · ");
  refreshStars(); setLbl($("#vboard"), boardLabel(it));
  $("#vnote").textContent = it.note || ""; $("#vnote").hidden = !it.note;
  img.referrerPolicy = "no-referrer";
  img.src = it.blob ? URL.createObjectURL(it.blob) : it.thumb;
  // 블로그 검색이 주는 썸네일은 흐릿하므로, 뷰어에서는 글의 대표 이미지(og:image)를 찾아 원본으로 씁니다. (4초 안에 못 찾으면 기존 이미지)
  const og = it.og === "view" && !it._ogDone
    ? Promise.race([ogResolve(it.page).then((r) => { it._ogDone = true; if (r.img) it.full = r.img; }), sleep(4000)]).catch(() => {})
    : Promise.resolve();
  og.then(() => (token === vTok ? fetchBlob(`/api/img?u=${enc(it.full)}`, true) : Promise.reject(new Error("stale")))).then((b) => {
    if (token !== vTok) return;
    it.fullBlob = b; if (vUrl) URL.revokeObjectURL(vUrl); vUrl = URL.createObjectURL(b); img.src = vUrl;
    // 큰 이미지에서 색 분포를 다시 뽑아, 비슷한 이미지를 색이 가까운 순으로 정리하는 기준으로 씁니다.
    img.decode().then(() => { if (token !== vTok || !V.stack.includes(level)) return; const inf = pixelInfo(img); if (inf?.sh) { level.sig = inf.sh; simRerankSoon(level); } if (inf?.an) { it.an = inf.an; if (curItem() === it) renderVInfo(it); } }).catch(() => {});
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
  level.feed.reset(); level.m.clear(); level.msg.hidden = true; renderMore(level.more, level.feed); level.simQ = ""; level.sig = null; level.cw = ""; level.rrDone = 0; level.toneOnly = false; level.m.pred = null; level.crop = false; level.fixed = false; level.cap = ""; level.capWords = []; level.cwOn = null; level.capText = ""; level.semText = ""; level.srcVec = null; level.semDone = 0; clearTimeout(level.semT); updateSimHead();
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
    const r = await captionOfItem(it); cap = r.q;
    if (!same()) return;
    level.msg.hidden = true;
    if (r.text) { level.capText = r.text; it.capText = r.text; it.capQ = r.q; } // 설명 문장은 의미 비교(아래)와 취향 기록에 씁니다
  }
  level.cap = cap; level.capWords = capWordsOf(cap); level.cwOn = null; level.cw = window.ColorTools.topColor(level.sig);
  simStart(level, 0);
}
// 비슷한 이미지 검색어 후보 (앞에서부터 시도하고, 결과가 없으면 다음 후보):
// AI 설명 → 태그(+색 이름) → 태그 → 제목 키워드(+색 이름) → 제목 키워드 → 현재 검색어
// crop=true(부분 검색)이면 이미지 전체의 태그·제목·현재 검색어로 돌아가지 않고, 선택한 부분의 AI 설명 조각만 씁니다. (스피커를 골랐는데 전체 이미지의 가방이 나오던 문제 방지)
function simCandidates(it, cap, cw, crop) {
  if (crop) {
    const w = capWordsOf(cap), c = [];
    if (w.length) { c.push(w.join(" ")); if (w.length > 3) c.push(w.slice(0, 3).join(" ")); if (w.length > 2) c.push(w.slice(0, 2).join(" ")); c.push(w[0]); }
    return [...new Set(c)];
  }
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
  // 순서 50% + 색 유사도 50%. 의미 벡터(아래 simSemantic)가 이미 있으면 순서 40% + 의미 35% + 색 25%
  const sc = new Map(cards.map((c, i) => {
    const s = CT.similarity(level.sig, c._it.sh), sem = semScore(level, c._it);
    return [c, sem == null ? 0.5 * (1 - i / n) + 0.5 * (s == null ? 0.3 : s) : 0.4 * (1 - i / n) + 0.35 * sem + 0.25 * (s == null ? 0.3 : s)];
  }));
  level.m.reorder((a, b) => sc.get(b) - sc.get(a));
  level.rrDone = (level.rrDone || 0) + 1;
}
// ----- 의미(문장) 기준 재정렬 (19차) -----
// 지금 보는 이미지(AI 설명 문장·제목·태그)와 불러온 비슷한 이미지(제목·본문 일부·태그)를 의미 벡터로 바꿔 코사인 유사도를 구합니다.
// 단어가 달라도 뜻이 가까우면 위로 오고, 단어만 우연히 같은 엉뚱한 이미지는 아래로 내려갑니다. 임베딩을 못 쓰면 아무것도 하지 않아요.
const semScore = (level, it) => (level.srcVec && it.vec ? (() => { const c = Interests.cosine(level.srcVec, it.vec); return c == null ? null : clamp((c - 0.3) / 0.4, 0, 1); })() : null);
function simSemSoon(level) {
  if (!cfg?.embed || (level.semDone || 0) >= 2 || level.semBusy) return;
  clearTimeout(level.semT); level.semT = setTimeout(() => simSemantic(level), 700);
}
async function simSemantic(level) {
  const it = level.list[level.cur], same = () => V.stack.includes(level) && level.list[level.cur] === it && level.feed.q === level.simQ;
  if (!cfg?.embed || S.offline || EMB.off > Date.now() || !it || !same() || (level.semDone || 0) >= 2 || level.semBusy) return;
  const cards = level.m.cards.slice(0, 40); if (cards.length < 8) return;
  const base = level.semText || embTextOf(level.crop ? { cap: level.capText } : { cap: level.capText || it.capText, title: it.title, desc: it.desc, tags: it.tags });
  if (!base) return;
  level.semBusy = true;
  try {
    const need = cards.filter((c) => !c._it.vec && !c._it.nv);
    const vs = await embedTexts([base, ...need.map((c) => embTextOf(c._it))]);
    if (!vs || !same()) return;
    if (!vs[0]) return;
    level.srcVec = vs[0];
    need.forEach((c, i) => { if (vs[i + 1]) c._it.vec = vs[i + 1]; else c._it.nv = 1; });
    level.semDone = (level.semDone || 0) + 1;
    if ($("#viewer").scrollTop > $("#vsimbox").offsetTop + 60) return; // 이미 아래로 내려가서 보는 중이면 순서를 바꾸지 않음
    const all = level.m.cards, n = all.length, CT = window.ColorTools, haveColor = !!level.sig && all.filter((c) => c._it.sh).length >= 6;
    const sc = new Map(all.map((c, i) => {
      const sem = semScore(level, c._it), col = haveColor ? CT.similarity(level.sig, c._it.sh) : null, pos = 1 - i / n;
      if (sem == null) return [c, pos * 0.8 + 0.2 * 0.4]; // 벡터가 없는 카드는 중간 점수
      return [c, haveColor ? 0.4 * pos + 0.35 * sem + 0.25 * (col == null ? 0.3 : col) : 0.5 * pos + 0.5 * sem];
    }));
    level.m.reorder((a, b) => sc.get(b) - sc.get(a));
  } finally { level.semBusy = false; }
}
function simStart(level, ci) {
  const it = level.list[level.cur]; if (!it) return;
  if (ci === 0 && !level.fixed) level.cands = simCandidates(it, level.cap, level.cw, level.crop);
  const q = level.cands[ci]; level.ci = ci; level.semDone = 0; clearTimeout(level.semT);
  level.m.clear(); level.msg.hidden = true;
  const f = level.feed; f.reset();
  level.simQ = q || ""; updateSimHead();
  if (!q) { level.msg.textContent = "비슷한 이미지를 찾을 단서(태그·제목)가 없어요."; level.msg.hidden = false; return; }
  f.keys.set(keyOf(it), it); // 지금 보는 이미지는 목록에서 제외
  f.begin(q); renderMore(level.more, f); f.next();
}
function simAfter(level) {
  const f = level.feed;
  if (f.items.length) { level.msg.hidden = true; simSemSoon(level); return; }
  if (!f.ended) return;
  const act = f.sources(), allErr = act.length && act.every((s) => f.stat[s.id]?.err);
  if (!allErr && level.ci + 1 < level.cands.length) return simStart(level, level.ci + 1);
  level.msg.textContent = allErr ? "비슷한 이미지를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." : level.cap ? "비슷한 이미지를 찾지 못했어요. 위의 단어를 빼거나 직접 입력해 보세요." : "비슷한 이미지를 찾지 못했어요.";
  level.msg.hidden = false;
}
function updateSimHead() {
  const l = lv(); $("#vsimq").textContent = l?.simQ ? `${l.crop ? "✂ " : ""}‘${l.simQ}’` : "";
  const it = l?.list[l.cur], b = $("#vsimtone");
  b.hidden = !it?.an?.tone || !!l?.crop; b.classList.toggle("on", !!l?.toneOnly);
  renderCw(l);
  if (!b.hidden) b.textContent = `${l.toneOnly ? "✓ " : ""}같은 톤만 (${window.ColorTools.TONE_KO[it.an.tone]})`;
}
// ----- AI가 본 것 보정: 단어 칩을 눌러 빼거나 넣고, 직접 입력해서 다시 찾습니다 -----
const capWordsOf = (cap) => [...new Set(String(cap || "").toLowerCase().split(/[\s,]+/).filter((w) => w.length > 1))].slice(0, 8);
function renderCw(l) {
  const box = $("#vcw"), show = !!l && (l.crop || !!l.cap) && (l.capWords || []).length > 0;
  box.hidden = !show;
  if (!show) return;
  const on = l.cwOn || (l.cwOn = new Set(l.capWords));
  const chips = $("#vcwChips"); chips.textContent = "";
  l.capWords.forEach((w) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = w; b.className = on.has(w) ? "on" : "off"; b.setAttribute("aria-pressed", String(on.has(w)));
    b.onclick = () => {
      if (on.has(w) && on.size === 1) return toast("단어가 하나는 남아 있어야 해요");
      on.has(w) ? on.delete(w) : on.add(w);
      simRetry(l, l.capWords.filter((x) => on.has(x)).join(" "));
    };
    chips.appendChild(b);
  });
}
// 검색어를 지정해서 다시 찾습니다 (AI 설명 후보 목록 대신 이 검색어 하나만 씀)
function simRetry(level, q) {
  q = String(q || "").trim().slice(0, 60);
  if (!q || !V.stack.includes(level)) return;
  clearTimeout(simT); clearTimeout(level.rrT);
  level.fixed = true; level.cands = [q]; level.rrDone = 0; level.toneOnly = false; level.m.pred = null; level.msg.hidden = true;
  level.semText = q; level.srcVec = null; // 내가 고른 단어가 곧 찾는 뜻이므로 의미 비교의 기준도 이 단어들로
  simStart(level, 0);
}
$("#vcwForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const l = lv(), v = $("#vcwIn").value.trim(); if (!l || !v) return;
  l.capWords = [...new Set(v.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 1))].slice(0, 8); l.cwOn = new Set(l.capWords); l.cap = v;
  $("#vcwIn").value = ""; $("#vcwIn").blur();
  simRetry(l, v);
});
// 현재 이미지의 팔레트(대표 색)와 톤을 보여 줍니다. 색 점을 누르면 그 색 필터로 같은 주제를 다시 찾아요.
function renderVInfo(it) {
  const box = $("#vinfo"), pal = $("#vpal"), a = it?.an; pal.textContent = ""; $("#vtone").textContent = "";
  box.hidden = !a?.tone; updateSimHead();
  if (!a?.tone) return;
  const KO = window.ColorTools.TONE_KO;
  (a.pal || []).forEach((p) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.style.background = p.hex;
    b.title = `${KO_COLOR[p.name] || p.name} ${Math.round(p.share * 100)}% — 눌러서 이 색감으로 찾기`; b.setAttribute("aria-label", b.title);
    b.onclick = () => {
      const q = M.q || (it.tags || [])[0] || tokens(it.title || "")[0];
      if (!q) return toast("이 색감으로 찾을 주제가 없어요. 먼저 검색어로 찾아 주세요.");
      S.color = COLORS[p.name] ? p.name : ""; S.tone = ""; markFilters(); startSearch(q);
    };
    pal.appendChild(b);
  });
  $("#vtone").textContent = `${KO[a.tone]}${a.temp && a.temp !== "neutral" ? " · " + KO[a.temp] : ""}`;
}
$("#vsimtone").onclick = () => {
  const l = lv(), it = l?.list[l.cur]; if (!l || !it?.an?.tone) return;
  l.toneOnly = !l.toneOnly; l.tone = it.an.tone;
  l.m.setFilter(l.toneOnly ? (c) => !c._it.an?.tone || c._it.an.tone === l.tone : null); updateSimHead();
};
$("#vlike").onclick = () => { const it = curItem(); if (it) { learnFrom(it, 2); toast("이런 이미지를 더 보여 드릴게요"); } };

// ----- 부분 검색: 이미지에서 찾고 싶은 영역을 상자로 고르고, 그 부분만 AI로 설명해 비슷한 이미지를 찾습니다 -----
// 상자는 처음부터 이미지 가운데에 떠 있고, 안쪽을 끌면 옮기고, 네 모서리를 끌면 크기가 바뀝니다. (이미지 밖으로는 나가지 않음)
// 상자 밖의 빈 곳을 끌어 새로 그릴 수도 있어요.
// 좌표는 모두 #vcropui(이미지가 놓인 틀)에 대한 0~1 비율입니다.
const CR = { r: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, drag: null, b: { x: 0, y: 0, w: 1, h: 1 } };
const CR_MIN = 0.07, CR_HIT = 32;
function setCr(r) { CR.r = r; const e = $("#vcr").style; e.left = r.x * 100 + "%"; e.top = r.y * 100 + "%"; e.width = r.w * 100 + "%"; e.height = r.h * 100 + "%"; }
// 이미지가 화면에서 차지하는 영역 (상자가 이 안에서만 움직이도록)
function crBounds() {
  const ib = $("#vimg").getBoundingClientRect(), ub = $("#vcropui").getBoundingClientRect();
  if (!ub.width || !ub.height || !ib.width || !ib.height) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = clamp((ib.left - ub.left) / ub.width, 0, 1), y0 = clamp((ib.top - ub.top) / ub.height, 0, 1), x1 = clamp((ib.right - ub.left) / ub.width, 0, 1), y1 = clamp((ib.bottom - ub.top) / ub.height, 0, 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function cropOpen() {
  const it = curItem(); if (!it) return;
  if (!captionOn()) return toast("AI 설명을 쓸 수 없어요. 설정에서 켜져 있는지 확인해 주세요.");
  if (it.adult && !it.safe) return toast("민감할 수 있는 이미지는 부분 검색을 쓸 수 없어요");
  zReset(); $("#vcropui").hidden = false;
  const b = CR.b = crBounds();
  setCr({ x: b.x + b.w * 0.2, y: b.y + b.h * 0.2, w: b.w * 0.6, h: b.h * 0.6 });
}
function cropClose() { $("#vcropui").hidden = true; CR.drag = null; }
// 한 축(가로 또는 세로)에서 고정점 a 와 움직이는 점 c 로 [시작, 길이]를 만듭니다. 너무 작아지지 않게 최소 길이를 지킴.
function crSeg(a, c, lo, hi) {
  let p = Math.min(a, c), q = Math.max(a, c);
  if (q - p < CR_MIN) { if (c >= a) { q = Math.min(hi, p + CR_MIN); p = q - CR_MIN; } else { p = Math.max(lo, q - CR_MIN); q = p + CR_MIN; } }
  return [p, q - p];
}
(() => {
  const ui = $("#vcropui");
  ui.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".vcbar")) { e.stopPropagation(); return; } // 아래 버튼을 누를 때 확대·넘기기 처리(wrap)가 포인터를 가로채 버튼이 안 눌리는 일 방지
    e.stopPropagation(); try { ui.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    const bb = ui.getBoundingClientRect(), px = e.clientX - bb.left, py = e.clientY - bb.top, fx = px / bb.width, fy = py / bb.height, r = CR.r;
    // 모서리 근처(손가락 크기만큼)를 눌렀는지: 가장 가까운 모서리를 잡음
    let best = null;
    for (const [nx, ny] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const d = Math.hypot(px - (r.x + nx * r.w) * bb.width, py - (r.y + ny * r.h) * bb.height);
      if (d < CR_HIT && (!best || d < best.d)) best = { d, nx, ny };
    }
    const inside = fx > r.x && fx < r.x + r.w && fy > r.y && fy < r.y + r.h;
    if (best) CR.drag = { mode: "size", ax: r.x + (1 - best.nx) * r.w, ay: r.y + (1 - best.ny) * r.h }; // 반대쪽 모서리는 고정
    else if (inside) CR.drag = { mode: "move", fx, fy, r: { ...r } };
    else { const b = CR.b; CR.drag = { mode: "new", ax: clamp(fx, b.x, b.x + b.w), ay: clamp(fy, b.y, b.y + b.h) }; }
  });
  ui.addEventListener("pointermove", (e) => {
    const d = CR.drag; if (!d) return; e.stopPropagation();
    const bb = ui.getBoundingClientRect(), b = CR.b, fx = clamp((e.clientX - bb.left) / bb.width, b.x, b.x + b.w), fy = clamp((e.clientY - bb.top) / bb.height, b.y, b.y + b.h);
    if (d.mode === "move") setCr({ ...d.r, x: clamp(d.r.x + fx - d.fx, b.x, b.x + b.w - d.r.w), y: clamp(d.r.y + fy - d.fy, b.y, b.y + b.h - d.r.h) });
    else { const [x, w] = crSeg(d.ax, fx, b.x, b.x + b.w), [y, h] = crSeg(d.ay, fy, b.y, b.y + b.h); setCr({ x, y, w, h }); }
  });
  const end = (e) => { if (CR.drag) { e.stopPropagation(); CR.drag = null; } };
  ui.addEventListener("pointerup", end); ui.addEventListener("pointercancel", end);
})();
// 선택한 영역(이미지 안의 비율 좌표)만 잘라 JPEG 로 만듭니다.
function cropBlob(blob, [x0, y0, x1, y1]) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => {
      const W = im.naturalWidth, H = im.naturalHeight, sx = Math.round(x0 * W), sy = Math.round(y0 * H), sw = Math.max(1, Math.round((x1 - x0) * W)), sh = Math.max(1, Math.round((y1 - y0) * H));
      const k = Math.min(1, 512 / Math.max(sw, sh)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
      c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.8);
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("img")); };
    im.src = u;
  });
}
async function cropGo() {
  const l = lv(), it = curItem(); if (!l || !it) return;
  const ib = $("#vimg").getBoundingClientRect(), ub = $("#vcropui").getBoundingClientRect(), r = CR.r;
  const L = ub.left + r.x * ub.width, T = ub.top + r.y * ub.height, R = L + r.w * ub.width, B = T + r.h * ub.height;
  const box = [clamp((L - ib.left) / (ib.width || 1), 0, 1), clamp((T - ib.top) / (ib.height || 1), 0, 1), clamp((R - ib.left) / (ib.width || 1), 0, 1), clamp((B - ib.top) / (ib.height || 1), 0, 1)];
  if (box[2] - box[0] < 0.06 || box[3] - box[1] < 0.06) return toast("조금 더 넓게 골라 주세요");
  cropClose(); toast("선택한 부분을 AI가 보는 중…", 6000);
  try {
    const src = it.fullBlob || it.blob || (await fetchBlob(`/api/img?u=${enc(it.thumb)}`, true));
    const crop = await cropBlob(src, box);
    const [inf, cap] = [await blobInfo(crop), await captionOfBlob(crop)];
    if (!cap.q) return cap.why === "auth" ? 0 : toast(cap.why === "blocked" ? "이 부분은 검색할 수 없는 주제로 보여요." : "이 부분을 설명하지 못했어요. 다른 부분을 골라 보세요.", 5000);
    if (!V.stack.includes(l) || curItem() !== it) return;
    clearTimeout(simT); clearTimeout(l.rrT); l.feed.reset(); l.m.clear(); l.m.pred = null; l.toneOnly = false; l.crop = true;
    l.cap = cap.q; l.capWords = capWordsOf(cap.q); l.cwOn = null; l.fixed = false; l.sig = inf?.sh || null; l.cw = window.ColorTools.topColor(l.sig); l.rrDone = 0;
    l.capText = cap.text || ""; l.semText = cap.text || cap.q; l.srcVec = null; l.semDone = 0;
    simStart(l, 0);
    $("#viewer").scrollTo({ top: $("#vsimbox").offsetTop - 56, behavior: "smooth" });
  } catch (e) { if (e.message !== "auth") toast("부분 검색에 실패했어요. 잠시 뒤 다시 시도해 주세요."); }
}
$("#vcrop").onclick = cropOpen; $("#vcno").onclick = cropClose; $("#vcgo").onclick = cropGo;

// ----- 추천 안 함: "다음부터 이 이미지를 추천하지 마" -----
// 관심 없어요(pref): 이 이미지를 숨기고, 취향 학습을 켜 두었다면 비슷한 태그를 덜 보여 줍니다.
// 보기 불편해요(bad): 이 이미지를 숨기고, 같은 태그가 여러 번 겹치는 이미지는 블러로 가립니다. 안전을 위한 기능이라 취향 학습 설정과 상관없이 동작해요.
// 저장하는 것은 이미지 주소 키와 태그 횟수뿐이고, 이 기기에만 남습니다.
function closeHide() { $("#hideSheet").hidden = true; }
// 화면에 떠 있는 카드에서 숨긴 이미지를 치우고, 새로 배운 내용으로 블러가 필요한 카드를 다시 가립니다. (북마크 목록은 건드리지 않음)
function refreshAvoidCards(hiddenKey) {
  document.querySelectorAll(".card").forEach((c) => {
    const it = c._it; if (!it || c.closest("#bmgrid")) return;
    if (hiddenKey && keyOf(it) === hiddenKey) { io.unobserve(c); const m = c._m || (c.closest("#trGrid") ? trM : null); m ? m.drop(c) : c.remove(); return; }
    if (it.safe || it.avoidBlur || it.fromBm) return;
    if (applyAvoid(it) === 2) { c.classList.add("avoid", "loaded"); c.classList.remove("reveal"); c.dataset.st = "flag"; }
  });
}
const HIDE = { it: null, l: null }; // 숨길 이미지와, 뷰어에서 눌렀다면 그 뷰어 칸
function openHide(it, l) { HIDE.it = it; HIDE.l = l || null; $("#hideSheet").hidden = false; }
function hideItem(kind) {
  const it = HIDE.it, l = HIDE.l; if (!it) return closeHide();
  Avoid.hide(keyOf(it), avoidKeys(it), kind);
  if (kind === "pref" && tasteOn()) learnFrom(it, -3);
  closeHide();
  toast(kind === "bad" ? "숨겼어요. 비슷한 이미지는 블러로 가릴게요" : "이 이미지는 다시 추천하지 않을게요");
  if (!l) { // 카드에서 바로 숨김: 트렌드 목록에서도 빼고 화면의 카드를 치움
    const v = TR.v; const k = v ? v.items.indexOf(it) : -1; if (k >= 0) v.items.splice(k, 1);
    return refreshAvoidCards(keyOf(it));
  }
  const idx = l.list.indexOf(it); if (idx >= 0) l.list.splice(idx, 1);
  refreshAvoidCards(keyOf(it));
  if (!l.list.length) return closeViewer();
  l.cur = clamp(idx, 0, l.list.length - 1); showItem(false); $("#viewer").scrollTop = 0;
}
bindSheet($("#hideSheet"), closeHide);
$("#vhide").onclick = () => { const it = curItem(); if (it) openHide(it, lv()); };
$("#hidePref").onclick = () => hideItem("pref");
$("#hideBad").onclick = () => hideItem("bad");
$("#hideCancel").onclick = closeHide;

// 이 이미지는 선정적이지 않다고 알려 주면 블러를 풉니다. (북마크한 이미지는 북마크에 기억)
function markSafe(it) {
  it.adult = false; it.ai = false; it.safe = true; it.revealed = true; SAFE_IDS.add(it.id);
  document.querySelectorAll(".card").forEach((c) => { if (c._it && c._it.id === it.id) { c._it.adult = false; c._it.safe = true; c.dataset.st = "ok"; c.classList.add("reveal"); } });
  if (S.bmIds.has(it.id)) DB.all().then((a) => { const r = a.find((x) => x.id === it.id); if (r) { r.safe = true; r.adult = false; r.adultSrc = ""; DB.put(r); } });
}
$("#vsafe").onclick = () => { const it = curItem(); if (!it) return; markSafe(it); showItem(true); toast("이 이미지는 이제 블러하지 않아요"); };
$("#vveil").parentElement.addEventListener("click", () => { const it = curItem(); if (it && !$("#vveil").hidden) { it.revealed = true; showItem(true); } });
const step = (d) => { const l = lv(); if (!l) return; const n = l.cur + d; if (n >= 0 && n < l.list.length) { l.cur = n; showItem(false); $("#viewer").scrollTop = 0; } };
$("#vprev").onclick = () => step(-1); $("#vnext").onclick = () => step(1); $("#vclose").onclick = closeViewer; $("#vfab").onclick = closeViewer;
addEventListener("keydown", (e) => {
  if (!$("#cardMenu").hidden) { if (e.key === "Escape") closeCardMenu(); return; }
  if (SEL.on && e.key === "Escape" && $("#bmSheet").hidden && $("#viewer").hidden) { exitSel(); return; }
  if (!$("#hideSheet").hidden) { if (e.key === "Escape") closeHide(); return; }
  if (!$("#bmSheet").hidden) { if (e.key === "Escape") closeSheet(); return; }
  if (!$("#settings").hidden) { if (e.key === "Escape") closeSettings(); return; }
  if ($("#viewer").hidden || e.target.closest?.("input,textarea,select")) return;
  if (e.key === "Escape") { if (V.fs) exitFs(); else if (!$("#vcropui").hidden) cropClose(); else closeViewer(); } if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1);
});
// ----- 전체화면 보기 -----
// [전체화면]을 누르면 제목·버튼·비슷한 이미지를 모두 숨기고 이미지만 화면 가득 보여 줍니다. 핀치·더블탭 확대와 좌우 넘기기는 그대로 쓸 수 있어요.
// 닫기: 오른쪽 위 ✕ · Esc · 뒤로 가기(스와이프). 뷰어를 닫으면 전체화면도 함께 풀려요.
// 컴퓨터·아이패드처럼 브라우저가 전체화면 기능을 지원하면 주소창 등 브라우저 화면까지 숨깁니다. (아이폰 사파리는 지원하지 않아 앱 화면 안에서 가득 채워요.)
function enterFs() {
  if (!lv() || V.fs) return;
  V.fs = true; $("#viewer").classList.add("fs"); zReset(); $("#viewer").scrollTop = 0;
  history.pushState({ fs: 1 }, ""); V.pushed++;
  try { const r = document.documentElement.requestFullscreen?.({ navigationUI: "hide" }); r?.catch?.(() => {}); } catch { /* 지원하지 않음 */ }
}
function fsReset() { // 기록은 건드리지 않고 화면 상태만 되돌림 (뷰어를 닫을 때)
  V.fs = false; $("#viewer").classList.remove("fs");
  if (document.fullscreenElement) { try { document.exitFullscreen?.().catch?.(() => {}); } catch { /* 무시 */ } }
}
function exitFs(fromPop) {
  if (!V.fs) return;
  fsReset(); zReset(); V.pushed = Math.max(0, V.pushed - 1);
  if (!fromPop) { V.unwinding = true; history.go(-1); setTimeout(() => { V.unwinding = false; }, 1000); } // 전체화면을 열 때 쌓은 브라우저 기록 한 칸을 되돌림
}
$("#vfs").onclick = enterFs; $("#vfsx").onclick = () => exitFs();
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && V.fs) exitFs(); }); // 브라우저 전체화면을 Esc 등으로 끝냈을 때
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

// ---------- 트렌드 ----------
// 위쪽 알약 [모두 | 지금 인기 | 베스트 | 에디터 픽]은 어떤 피드를 볼지, 그 아래 한 줄 칩은 요즘 찾는 주제(이름만)입니다.
// 서버가 쪽(page) 단위로 돌려주는 이미지를 스크롤하면 이어서 받고, 3쪽쯤 받으면 멈추고 [더 보기]를 보여 줍니다. (메인 피드와 같은 방식)
// 이미지 grp: hot = 네이버(뜨는 주제·주제 칩), best = Pixabay·Unsplash 인기, pick = 위키미디어 커먼즈 우수 사진
const TR = { g: "all", topic: "", views: new Map(), v: null, topics: [], dl: { state: "off" } };
const TR_AUTO = 3; // [더 보기] 없이 자동으로 이어 받는 쪽 수
const DL_WHY = { denied: "네이버 API HUB에서 ‘검색어트렌드’ 이용 신청이 필요해요", limit: "요청 한도를 넘었어요", timeout: "응답이 늦어요", gone: "주소를 찾을 수 없어요 (NAVER_TREND_BASE 확인)", network: "연결하지 못했어요" };
const trKey = () => (TR.topic ? "t:" + TR.topic : "g:" + TR.g);
const newView = () => ({ g: TR.g, topic: TR.topic, mine: undefined, topics: null, items: [], keys: new Set(), page: 0, pc: "", more: true, burst: 0, stall: 0, at: 0, loading: false, err: false });
// 보는 피드(알약·주제)가 바뀌었을 때: 이미 받아 둔 것(30분 안)이 있으면 그대로, 없으면 첫 쪽부터
function trSwitch() {
  if (S.priv && TR.g === "mine") TR.g = "all";
  const k = trKey(); let v = TR.views.get(k);
  if (!v || Date.now() - v.at > 30 * 60000) { v = newView(); TR.views.set(k, v); }
  TR.v = v; if (!TR.topic && v.topics) TR.topics = v.topics; trM.clear(); renderTrControls(); renderTrends();
  if (!v.items.length && !v.loading) trLoad(); else trReobserve();
  scrollTo(0, 0);
}
// 내 취향 주제어: 학습한 취향과 북마크에서 자주 나온 말을 모아, 비슷한 말은 하나로 합치고 위쪽 4개 + 나머지 중 무작위 2개를 섞습니다 (매번 같은 말만 나오지 않게).
async function mineTopics() {
  const pool = [];
  for (const k of [...(tasteOn() ? Taste.top(12) : []), ...(await bmTopTags(10))]) { const t = String(k).trim(); if (t.length >= 2 && !pool.some((p) => p === t || p.includes(t) || t.includes(p))) pool.push(t); }
  return [...pool.slice(0, 4), ...shuffle(pool.slice(4)).slice(0, 2)];
}
function trEnter() { if (!TR.v || Date.now() - TR.v.at > 30 * 60000) trSwitch(); else { trM.check(); renderTrControls(); renderTrFoot(); trReobserve(); } }
async function trLoad() {
  const v = TR.v; if (!v || v.loading || !v.more) return;
  v.loading = true; v.err = false; renderTrNote();
  try {
    const qs = new URLSearchParams({ g: v.g, page: String(v.page + 1) }); if (v.topic) qs.set("topic", v.topic); if (v.pc) qs.set("pc", v.pc);
    // 내 취향 주제어(여러 개)는 이 피드를 처음 열 때 한 번 정해 두고 쪽마다 같은 것을 씁니다. 서버에는 저장되지 않습니다.
    if (!v.topic && !S.priv && (v.g === "mine" || v.g === "all")) {
      if (v.mine === undefined) v.mine = (await mineTopics()).join(",");
      if (v.mine) qs.set("mine", v.mine);
      else if (v.g === "mine") { v.more = false; v.empty = true; v.at = Date.now(); return; }
    }
    const j = await (await api("/api/trends?" + qs)).json();
    if (!v.page) v.at = Date.now();
    v.page++; v.pc = j.pc || ""; v.more = !!j.more; v.burst++;
    if (j.topics?.length) { if (!v.topic) v.topics = j.topics; TR.topics = j.topics; }
    if (j.dl) TR.dl = j.dl;
    const fresh = [];
    for (const raw of j.items || []) {
      const key = keyOf(raw); if (v.keys.has(key) || Avoid.isHidden(key)) continue;
      v.keys.add(key); fresh.push({ ...raw, id: hashId(key), key, tags: raw.tags || [] });
    }
    v.stall = fresh.length ? 0 : v.stall + 1; if (v.stall >= 3) v.more = false; // 걸러져서 3쪽 연속 빈 쪽이면 끝낸 것으로 봄
    const added = trOrder(fresh); v.items.push(...added);
    if (TR.v === v) { trAppend(v, added); renderTrTopics(); }
  } catch (e) { if (e.message !== "auth") v.err = true; }
  finally { v.loading = false; if (TR.v === v) { renderTrNote(); renderTrFoot(); trReobserve(); } }
}
// 한 쪽 안에서의 순서: 취향 학습을 켰으면 내 취향에 맞는 사진을 위로, "추천 안 함"으로 배운 태그와 겹치는 사진은 뒤로(또는 블러)
function trOrder(list) {
  if (tasteOn() && !Taste.isEmpty()) list = list.map((it, i) => ({ it, i, a: Taste.affinity(TasteStore.keysOf(it)) })).sort((x, y) => (y.a - x.a) || (x.i - y.i)).map((x) => x.it);
  const avd = new Map(list.map((it) => [it, applyAvoid(it)]));
  return [...list.filter((it) => !avd.get(it)), ...list.filter((it) => avd.get(it))];
}
function trCard(v, it) { return makeCard(it, () => openViewer(v.items, v.items.indexOf(it))); }
function trAppend(v, items) { trM.add(items.map((it) => trCard(v, it))); }
function renderTrends() { // 지금 보는 피드를 처음부터 다시 그림 (비공개 모드·추천 안 함 변경 등)
  const v = TR.v; trM.clear();
  if (v) { v.items = v.items.filter((it) => !it.dropped && !Avoid.isHidden(it.key)); trAppend(v, v.items); }
  $("#trGrid").classList.toggle("tags", !TR.topic);
  renderTrTopics(); renderTrNote(); renderTrFoot();
}
function renderTrControls() {
  const mb = document.querySelector('#trSeg button[data-g="mine"]'); if (mb) mb.hidden = S.priv;
  document.querySelectorAll("#trSeg button").forEach((b) => b.classList.toggle("on", !TR.topic && b.dataset.g === TR.g));
  $("#trGrid").classList.toggle("tags", !TR.topic);
  renderTrTopics();
}
function renderTrTopics() { // 주제 이름만 한 줄 (누르면 그 주제의 피드, 다시 누르면 전체로)
  const box = $("#trTopics"); box.textContent = "";
  TR.topics.forEach((x) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = x.label; b.classList.toggle("on", TR.topic === x.q);
    b.onclick = () => { TR.topic = TR.topic === x.q ? "" : x.q; trSwitch(); };
    box.appendChild(b);
  });
  box.hidden = !TR.topics.length;
}
function renderTrNote() { // 비어 있거나 실패했을 때만 짧게 알림
  const v = TR.v; let t = "";
  if (v && !v.items.length) {
    if (v.loading) t = "불러오는 중…";
    else if (v.empty) t = "아직 취향을 알 수 없어요. 마음에 드는 이미지를 북마크하거나 오래 살펴보면, 그것을 종합해서 보여 드려요.";
    else if (v.err) t = "불러오지 못했어요. 새로고침을 눌러 주세요.";
    else if (v.g === "hot" && !v.topic) t = TR.dl.state === "off" ? "네이버 키를 등록하면 나와요." : TR.dl.state === "err" ? `가져오지 못했어요 (${DL_WHY[TR.dl.why] || "오류"}).` : "아직 보여 줄 이미지가 없어요.";
    else t = "보여 줄 이미지가 없어요.";
  }
  $("#trNote").textContent = t; $("#trNote").hidden = !t;
}
function renderTrFoot() { const v = TR.v; $("#trMore").hidden = !(v && v.more && !v.loading && v.burst >= TR_AUTO && v.items.length); }
const trio = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && S.view === "tr") trAuto(); }, { rootMargin: "1200px 0px" });
trio.observe($("#trSent"));
function trReobserve() { trio.unobserve($("#trSent")); trio.observe($("#trSent")); }
function trAuto() { const v = TR.v; if (v && v.more && !v.loading && v.burst < TR_AUTO) trLoad(); }
$("#trMore .mbtn").onclick = () => { const v = TR.v; if (!v) return; v.burst = 0; renderTrFoot(); trLoad(); };
document.querySelectorAll("#trSeg button").forEach((b) => { b.onclick = () => { TR.g = b.dataset.g; TR.topic = ""; trSwitch(); }; });
$("#trRefresh").onclick = () => { TR.views.delete(trKey()); trSwitch(); };

// ---------- 필터 (방향·색상) ----------
const COLORS = { red: "#e53935", orange: "#fb8c00", yellow: "#fdd835", green: "#43a047", teal: "#00acc1", blue: "#1e88e5", purple: "#8e24aa", pink: "#ec407a", brown: "#6d4c41", black: "#111", white: "#fff", gray: "#9e9e9e" };
const colorSources = () => (cfg?.sources || []).filter((s) => s.colors && !S.off.has(s.id));
function markFilters() {
  document.querySelectorAll("#colors .dot").forEach((b) => b.classList.toggle("on", b.dataset.c === S.color));
  document.querySelectorAll("#orient button").forEach((b) => b.classList.toggle("on", b.dataset.o === S.orient));
  document.querySelectorAll("#tones button").forEach((b) => b.classList.toggle("on", b.dataset.t === S.tone));
  const n = (S.color ? 1 : 0) + (S.orient ? 1 : 0) + (S.tone ? 1 : 0);
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
  if (cfg && S.tone) $("#colorNote").textContent += " 톤은 이미지를 불러온 뒤 브라우저가 판별해서 걸러요 (천천히 채워져요).";
}
const rerun = () => { markFilters(); if (M.q) startSearch(M.q, { sl: M.sl }); else feedM.pred = feedPred(); };
Object.entries(COLORS).forEach(([k, c]) => {
  const b = document.createElement("button"); b.className = "dot"; b.style.background = c; b.dataset.c = k; b.setAttribute("aria-label", k);
  b.onclick = () => { S.color = S.color === k ? "" : k; rerun(); };
  $("#colors").appendChild(b);
});
document.querySelectorAll("#orient button").forEach((b) => { b.onclick = () => { S.orient = b.dataset.o; rerun(); }; });
TONE_LIST.forEach(([v, label]) => { const b = document.createElement("button"); b.textContent = label; b.dataset.t = v; b.onclick = () => { S.tone = S.tone === v ? "" : v; rerun(); }; $("#tones").appendChild(b); });
document.querySelectorAll("#cwSeg button").forEach((b) => { b.onclick = () => { S.colorWide = b.dataset.w === "1"; LS.set("cw", S.colorWide); rerun(); }; });
$("#filterBtn").onclick = () => { markFilters(); $("#srcPanel").hidden = true; $("#filters").hidden = !$("#filters").hidden; };
$("#srcBtn").onclick = () => { renderStat(); $("#filters").hidden = true; $("#srcPanel").hidden = !$("#srcPanel").hidden; };
$("#srcAll").onclick = () => { S.only.clear(); renderStat(); queueRerun(); };
$("#srcClose").onclick = () => { $("#srcPanel").hidden = true; };
$("#filterClose").onclick = () => { $("#filters").hidden = true; };
$("#filterReset").onclick = () => { S.color = ""; S.orient = ""; S.tone = ""; rerun(); };

// ---------- 보드·메모 (입력창 대신 시트) ----------
// 한 장(뷰어의 [보드·메모], ☆ 길게 누르기, 카드 메뉴)과 여러 장(북마크 선택 모드의 [보드에 추가])이 같은 시트를 씁니다.
const sheet = { it: null, rec: null, ids: null, chosen: new Set(), names: [] };
function renderSheetBoards() {
  const box = $("#bmBoards"); box.textContent = "";
  if (!sheet.names.length) { const p = document.createElement("span"); p.className = "note"; p.textContent = "아직 보드가 없어요. 아래에 이름을 적으면 새로 만들어요."; box.appendChild(p); }
  sheet.names.forEach((n) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = n; b.classList.toggle("on", sheet.chosen.has(n));
    b.onclick = () => { sheet.chosen.has(n) ? sheet.chosen.delete(n) : sheet.chosen.add(n); renderSheetBoards(); };
    box.appendChild(b);
  });
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
bindSheet($("#boardMgr"), closeBoardMgr);
async function openBoardSheet(it) { // 한 장: 북마크가 아니면 먼저 (보드 없이) 담고 보드·메모를 고릅니다
  if (!it) return;
  if (S.priv) return toast("비공개 모드에서는 북마크를 쓸 수 없어요");
  if (!S.bmIds.has(it.id)) await toggleBookmark(it, "");
  const all = await DB.all(), rec = all.find((x) => x.id === it.id); if (!rec) return;
  Object.assign(sheet, { it, rec, ids: null, chosen: new Set(bOf(rec)), names: boardNames(all) });
  $("#bmNewBoard").value = ""; $("#bmNote").value = rec.note || ""; $("#bmNoteBox").hidden = false; $("#bmSheetTitle").textContent = "보드·메모";
  renderSheetBoards(); $("#bmSheet").hidden = false;
}
async function openBulkSheet() { // 여러 장: 고른 보드에 한꺼번에 더합니다 (이미 들어 있던 보드는 그대로)
  if (!SEL.ids.size) return;
  const all = await DB.all();
  Object.assign(sheet, { it: null, rec: null, ids: [...SEL.ids], chosen: new Set(), names: boardNames(all) });
  $("#bmNewBoard").value = ""; $("#bmNoteBox").hidden = true; $("#bmSheetTitle").textContent = `${SEL.ids.size}장을 보드에 추가`;
  renderSheetBoards(); $("#bmSheet").hidden = false;
}
$("#vboard").onclick = () => openBoardSheet(curItem());
$("#bmNewBoard").oninput = renderSheetBoards;
$("#bmCancel").onclick = closeSheet;
$("#bmForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const extra = $("#bmNewBoard").value.trim().slice(0, 30), chosen = [...sheet.chosen];
  if (extra && !chosen.includes(extra)) chosen.push(extra);
  if (sheet.ids) { // 여러 장
    if (!chosen.length) return toast("보드를 고르거나 새 이름을 적어 주세요");
    let n = 0;
    for (const rec of await DB.all()) if (sheet.ids.includes(rec.id)) { rec.boards = [...new Set([...bOf(rec), ...chosen])]; rec.board = rec.boards[0]; if (await DB.put(rec)) n++; }
    LS.set("lastBoard", extra || chosen[0]); closeSheet(); exitSel();
    toast(`${n}장을 ${chosen.map((c) => `‘${c}’`).join("·")} 보드에 담았어요`); return renderBm();
  }
  const { it, rec } = sheet; if (!it || !rec) return closeSheet();
  rec.boards = chosen; rec.board = chosen[0] || "";
  rec.note = $("#bmNote").value.trim().slice(0, 200);
  it.boards = rec.boards; it.board = rec.board; it.note = rec.note;
  const ok = await DB.put(rec); closeSheet();
  if (!ok) return toast("저장하지 못했어요");
  if (chosen.length) LS.set("lastBoard", extra || chosen[0]);
  if (curItem() === it) { setLbl($("#vboard"), boardLabel(it)); $("#vnote").textContent = rec.note; $("#vnote").hidden = !rec.note; }
  toast(chosen.length ? `${chosen.map((c) => `‘${c}’`).join("·")} 보드에 저장했어요` : "저장했어요");
  if (S.view === "bm" && $("#viewer").hidden) renderBm();
});

// ---------- 북마크 선택 모드: 길게 눌러 시작 → 여러 장을 골라 보드에 추가·빼기·삭제 ----------
const SEL = { on: false, ids: new Set(), armT: null };
function enterSel(it) { if (SEL.on) return; SEL.on = true; SEL.ids = new Set([it.id]); applySel(); }
function toggleSel(it) { SEL.ids.has(it.id) ? SEL.ids.delete(it.id) : SEL.ids.add(it.id); refreshSel(); }
function exitSel() { SEL.on = false; SEL.ids.clear(); disarmDel(); applySel(); }
function applySel() {
  document.body.classList.toggle("selmode", SEL.on);
  $("#selBar").hidden = !SEL.on; $("#selAct").hidden = !SEL.on; $("#bmSearchRow").hidden = SEL.on;
  $("#boardStrip").hidden = SEL.on || !$("#boardStrip").children.length;
  refreshSel();
}
function refreshSel() {
  const n = SEL.ids.size, real = S.board !== "__all" && S.board !== "";
  document.querySelectorAll("#bmgrid .card").forEach((c) => c.classList.toggle("sel", !!c._it && SEL.ids.has(c._it.id)));
  $("#selCount").textContent = `${n}장 선택`;
  $("#selAll").textContent = S.list.length && n >= S.list.length ? "선택 해제" : "모두 선택";
  setLbl($("#selOut"), real ? "이 보드에서 빼기" : "보드 해제");
  ["selAdd", "selOut", "selDel"].forEach((id) => { $("#" + id).disabled = !n; });
}
function disarmDel() { clearTimeout(SEL.armT); SEL.armT = null; setLbl($("#selDel"), "삭제"); }
$("#selCancel").onclick = exitSel;
$("#selAll").onclick = () => { if (S.list.length && SEL.ids.size >= S.list.length) SEL.ids.clear(); else S.list.forEach((it) => SEL.ids.add(it.id)); refreshSel(); };
$("#selAdd").onclick = openBulkSheet;
$("#selOut").onclick = async () => {
  if (!SEL.ids.size) return;
  const real = S.board !== "__all" && S.board !== "", ids = [...SEL.ids]; let n = 0;
  for (const rec of await DB.all()) if (ids.includes(rec.id)) { rec.boards = real ? bOf(rec).filter((b) => b !== S.board) : []; rec.board = rec.boards[0] || ""; if (await DB.put(rec)) n++; }
  exitSel(); toast(real ? `${n}장을 ‘${S.board}’ 보드에서 뺐어요` : `${n}장의 보드를 해제했어요`); renderBm();
};
$("#selDel").onclick = async () => { // 실수 방지: 한 번 누르면 확인 문구, 3초 안에 한 번 더 누르면 삭제
  if (!SEL.ids.size) return;
  if (!SEL.armT) { setLbl($("#selDel"), "한 번 더"); SEL.armT = setTimeout(disarmDel, 3000); return; }
  const ids = [...SEL.ids]; let n = 0;
  for (const id of ids) if (await DB.del(id)) { S.bmIds.delete(id); n++; ACT.bump(id, -2); }
  updateCount(); exitSel(); toast(`${n}장을 북마크에서 삭제했어요`); renderBm();
};

// 길게 누를 때 글자가 파랗게 선택되는 것을 막습니다 (입력칸은 제외). 이미지를 끌어 가는 동작도 막습니다.
document.addEventListener("selectstart", (e) => { const t = e.target, el = t && (t.nodeType === 1 ? t : t.parentElement); if (!el?.closest?.("input,textarea,select,[contenteditable],.selectable")) e.preventDefault(); });
document.addEventListener("dragstart", (e) => { if (e.target?.tagName === "IMG") e.preventDefault(); });

// ---------- 카드 길게 누르기 메뉴 ----------
const CM = { it: null, at: 0 };
function closeCardMenu() { $("#cardMenu").hidden = true; $("#cardMenuBg").hidden = true; CM.it = null; }
function showCardMenu(el, it) {
  CM.it = it; CM.at = Date.now();
  $("#cmLike").hidden = !tasteOn();
  $("#cmBoard").hidden = S.priv; setLbl($("#cmBoard"), S.bmIds.has(it.id) ? "보드·메모" : "북마크·보드");
  const m = $("#cardMenu"); $("#cardMenuBg").hidden = false; m.hidden = false;
  const r = el.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight); // 카드에서 화면에 보이는 부분의 가운데
  m.style.left = clamp(r.left + r.width / 2 - mw / 2, 8, Math.max(8, innerWidth - mw - 8)) + "px";
  m.style.top = clamp((top + bottom) / 2 - mh / 2, 8, Math.max(8, innerHeight - mh - 8)) + "px";
}
// 길게 누른 손가락을 뗄 때 따라오는 클릭이 메뉴를 바로 닫거나 누르지 않게, 열린 직후 잠깐은 무시합니다.
const cmGuard = (fn) => () => { if (Date.now() - CM.at < 450) return; fn(CM.it); };
$("#cardMenuBg").addEventListener("click", cmGuard(closeCardMenu));
addEventListener("scroll", () => { if (!$("#cardMenu").hidden) closeCardMenu(); }, { passive: true, capture: true });
$("#cmLike").onclick = cmGuard((it) => { closeCardMenu(); if (it) { learnFrom(it, 2); toast("이런 이미지를 더 보여 드릴게요"); } });
$("#cmHide").onclick = cmGuard((it) => { closeCardMenu(); if (it) openHide(it, null); });
$("#cmBoard").onclick = cmGuard((it) => { closeCardMenu(); if (it) openBoardSheet(it); });

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
// 반환: { q, text } 단어들과 설명 문장(영어), 또는 { q:"", why } (why: off | blocked | fail)
async function captionOfBlob(blob) {
  if (capOff || !cfg?.caption) return { q: "", why: "off" };
  try {
    const small = await shrink(blob);
    const r = await (await api("/api/caption", { method: "POST", body: small, headers: { "content-type": "image/jpeg" }, signal: AbortSignal.timeout(20000) })).json();
    if (r.error === "unavailable") { capOff = true; return { q: "", why: "off" }; }
    if (r.blocked) return { q: "", why: "blocked" };
    if (r.q) { capFails = 0; return { q: r.q, text: String(r.text || "").slice(0, 240) }; }
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
  $("#sTaste").checked = S.taste; renderTasteView(); renderAvoidView();
  ACT.load().then(() => { if (!$("#settings").hidden) renderTasteView(); });
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
function renderTasteView() {
  const box = $("#tasteView"), v = Taste.view(), KO = window.ColorTools.TONE_KO; box.textContent = "";
  // 칩을 누르면 그 항목만 지워집니다 (kind: tags | tones | colors)
  const add = (label, kind, k, cls, mute) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tchip" + (cls ? " " + cls : ""); b.setAttribute("aria-label", `${label} 지우기`);
    const t = document.createElement("span"); t.textContent = label; const x = document.createElement("i"); x.textContent = "✕"; x.setAttribute("aria-hidden", "true"); b.append(t, x);
    b.onclick = () => { Taste.forget(kind, k, mute); FYI.sig = ""; renderTasteView(); toast(mute ? `‘${label}’을(를) 취향에서 지우고 추천에서도 뺐어요` : `‘${label}’을(를) 취향에서 지웠어요`); };
    box.appendChild(b);
  };
  v.tags.slice(0, 10).forEach((x) => add(x.k, "tags", x.k, "", true));
  v.tones.forEach((x) => add(KO[x.k] || x.k, "tones", x.k, "t"));
  v.colors.forEach((x) => add(KO_COLOR[x.k] || x.k, "colors", x.k, "t"));
  v.less.slice(0, 4).forEach((x) => add(`덜 · ${x.k}`, "tags", x.k, "less", false));
  const empty = Taste.isEmpty(); box.hidden = !S.taste || empty; $("#tasteNote").hidden = box.hidden;
  // 뺀 단어: 누르면 다시 추천에 쓸 수 있게 되돌립니다
  const mv = $("#muteView"), mw = Taste.muted(); mv.textContent = "";
  mw.forEach((w) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tchip less"; b.setAttribute("aria-label", `${w} 다시 추천에 쓰기`);
    const t = document.createElement("span"); t.textContent = w; const x = document.createElement("i"); x.textContent = "↺"; x.setAttribute("aria-hidden", "true"); b.append(t, x);
    b.onclick = () => { Taste.unmute(w); FYI.sig = ""; renderTasteView(); toast(`‘${w}’은(는) 다시 추천에 쓸 수 있어요`); };
    mv.appendChild(b);
  });
  mv.hidden = !mw.length; $("#muteNote").hidden = !mw.length;
  const acts = ACT.size(), rec = Recent.list().length;
  $("#actNote").hidden = !acts && !rec; $("#actNote").textContent = `이 기기에 기억 중: 반응한 이미지 ${acts}장 · 최근 검색 ${rec}개`;
  $("#tasteClear").hidden = empty && !acts && !rec;
}
// 설정의 "추천 안 함": 숨긴 이미지 수와, 비슷한 이미지에 영향을 주는 태그. 태그를 누르면 그 태그만 되돌립니다.
function renderAvoidView() {
  const v = Avoid.view(), box = $("#avoidView"); box.textContent = "";
  $("#avoidCount").textContent = v.n ? `· 숨긴 이미지 ${v.n}장` : "";
  v.tags.forEach((x) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tchip" + (x.bad ? " bad" : ""); b.setAttribute("aria-label", `${x.k} 되돌리기`);
    const t = document.createElement("span"); t.textContent = x.k; const i = document.createElement("i"); i.textContent = "✕"; i.setAttribute("aria-hidden", "true"); b.append(t, i);
    b.onclick = () => { Avoid.forget(x.k); renderAvoidView(); toast(`‘${x.k}’은(는) 이제 영향을 주지 않아요`); };
    box.appendChild(b);
  });
  box.hidden = !v.tags.length; $("#avoidClear").hidden = Avoid.isEmpty();
}
$("#avoidClear").onclick = () => { Avoid.clear(); renderAvoidView(); toast("추천 안 함 목록을 모두 지웠어요. 숨겼던 이미지가 다시 나올 수 있어요", 4500); };
$("#sTaste").onchange = (e) => {
  S.taste = e.target.checked; LS.set("tasteOn", S.taste); renderTasteView();
  toast(S.taste ? "이 기기에서만 취향·활동을 기억해요 (홈 피드에 곧 반영)" : "취향 학습을 껐어요. 저장된 점수는 [취향 지우기]로 지울 수 있어요", 4500);
};
$("#tasteClear").onclick = async () => { Taste.clear(); Recent.clear(); await ACT.clear(); FYI.sig = ""; renderTasteView(); renderRecent?.(); toast("취향·활동 기록·최근 검색을 모두 지웠어요"); };
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

// ---------- 비공개 모드 (아이콘 하나로) ----------
// 켜면 북마크·취향이 화면에서 사라지고(저장된 것은 그대로), 취향 학습과 추천 반영이 멈춥니다. 수업 화면 공유 때 쓰세요.
function applyPriv() {
  document.body.classList.toggle("priv", S.priv);
  $("#privBtn").classList.toggle("on", S.priv); $("#privBtn").setAttribute("aria-pressed", String(S.priv));
  if (S.priv) { if (S.view === "bm") setView("feed"); recClose(); }
  if (S.priv && !$("#viewer").hidden) { $("#vlike").hidden = true; }
}
$("#privBtn").onclick = () => {
  S.priv = !S.priv; LS.set("priv", S.priv); applyPriv();
  if (S.view === "feed" && !M.q) { renderHome(); fyStart(true); } if (S.view === "tr") renderTrends(); // 비공개 모드를 바꾸면 맞춤 피드도 새로 만듭니다
  toast(S.priv ? "🕶 비공개 모드: 북마크와 취향이 보이지 않고, 학습도 멈췄어요" : "비공개 모드를 껐어요");
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
  applyPriv(); markFilters();
  if (off) { if (S.priv) setView("feed"); else await showBm(); return; }
  setView("feed"); renderHome(); renderStat();
  // AI 검사 모델: 접속 직후가 아니라 첫 화면이 자리 잡은 뒤(약 3.5초) 브라우저가 한가할 때 미리 준비합니다.
  // (첫 이미지를 검사할 때 기다리지 않게 하되, 접속 직후 화면이 굳던 문제는 피함. 번들은 앱 안에 있어서 외부 내려받기는 없음)
  clearTimeout(boot.warm); boot.warm = setTimeout(() => { if (S.ml && S.blur && !S.offline && !modelP) idle(2500).then(() => getModel().catch(() => {})); }, 3500);
}
$("#retry").onclick = () => { $("#retry").textContent = "연결 중…"; boot().finally(() => { $("#retry").textContent = "다시 연결"; }); };
addEventListener("online", () => { if (S.offline) boot(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
boot();
