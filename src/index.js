import { hardBlocked, isAdult } from "./filters.js";

const UA = "Mozilla/5.0 (compatible; ImageFeed/1.0; personal use)";
const enc = encodeURIComponent;
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const clean = (s = "") =>
  String(s).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#0?39;/g, "'").trim();
const num = (v) => Number(v) || 0;
// 색상/방향 쿼리 조각 만들기 (소스가 지원하는 값만)
function extra(id, colorKey, orientKey, o) {
  let r = "";
  const c = o.color && COLOR[id]?.[o.color];
  if (c) r += `&${colorKey}=${c}`;
  const v = o.orient && ORIENT[id]?.[o.orient];
  if (v) r += `&${orientKey}=${v}`;
  return r;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: JSON_HEADERS });

// 암호 확인 (PASS 가 설정되지 않았으면 모두 거부)
function authed(req, env) {
  const s = env.PASS || "";
  const p = req.headers.get("x-pass") || "";
  if (!s || p.length !== s.length) return false;
  let d = 0;
  for (let i = 0; i < s.length; i++) d |= p.charCodeAt(i) ^ s.charCodeAt(i);
  return d === 0;
}

// 실패 이유를 화면에 알려주기 위해 오류에 code/status 를 붙입니다.
const fail = (code, msg, status) => Object.assign(new Error(msg || code), { code, status });
async function getRaw(url, headers = {}, ttl = 600) {
  let r;
  try {
    r = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json", ...headers },
      signal: AbortSignal.timeout(6500),
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": ttl, "300-599": 0 } },
    });
  } catch (e) {
    throw fail(e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network", String(e?.message || e));
  }
  if (!r.ok) throw fail(reasonOfStatus(r.status), `HTTP ${r.status}`, r.status);
  return r;
}
async function getJson(url, headers = {}, ttl = 600) {
  const r = await getRaw(url, headers, ttl);
  try { return await r.json(); } catch { throw fail("badjson", "응답이 JSON이 아님"); }
}
function reasonOfStatus(s) {
  if (s === 429) return "limit";
  if (s === 410) return "gone";
  if (s === 401 || s === 403) return "denied";
  if (s >= 500) return "server";
  return "error";
}
const reasonOf = (e) => e?.code || "error";
const https = (u = "") => String(u).replace(/^http:\/\//i, "https://");

// 화면의 색상/방향 값을 소스별 값으로 바꿉니다. 지원 안 하는 값이면 null.
const COLOR = {
  pixabay: { red: "red", orange: "orange", yellow: "yellow", green: "green", teal: "turquoise", blue: "blue", purple: "lilac", pink: "pink", brown: "brown", black: "black", white: "white", gray: "gray" },
  unsplash: { red: "red", orange: "orange", yellow: "yellow", green: "green", teal: "teal", blue: "blue", purple: "purple", pink: "magenta", black: "black", white: "white", gray: "black_and_white" },
  pexels: { red: "red", orange: "orange", yellow: "yellow", green: "green", teal: "turquoise", blue: "blue", purple: "violet", pink: "pink", brown: "brown", black: "black", white: "white", gray: "gray" },
};
const ORIENT = {
  pixabay: { v: "vertical", h: "horizontal" },
  unsplash: { v: "portrait", h: "landscape", s: "squarish" },
  pexels: { v: "portrait", h: "landscape", s: "square" },
};

// ---------- 소스 정의 ----------
// run() 은 { title, thumb, full, page, w, h, tags[] } 배열을 돌려줍니다.
// en:true 인 소스는 영어 검색어(번역본)를 사용합니다. w 는 순위 합산 가중치(인기/한국 이미지 우선).
const SOURCES = [
  {
    id: "naver", name: "네이버", w: 1.25, en: false, desc: "한국 이미지", need: ["NAVER_ID", "NAVER_SECRET"],
    ok: (e) => e.NAVER_ID && e.NAVER_SECRET,
    async run(q, page, safe, e) {
      const base = e.NAVER_BASE || "https://naverapihub.apigw.ntruss.com/search/v1/image";
      const legacy = base.includes("openapi.naver.com");
      const headers = legacy
        ? { "X-Naver-Client-Id": e.NAVER_ID, "X-Naver-Client-Secret": e.NAVER_SECRET }
        : { "X-NCP-APIGW-API-KEY-ID": e.NAVER_ID, "X-NCP-APIGW-API-KEY": e.NAVER_SECRET };
      const start = (page - 1) * 40 + 1;
      if (start > 1000) return [];
      const d = await getJson(`${base}?query=${enc(q)}&display=40&start=${start}&sort=sim&filter=all`, headers);
      return (d.items || []).map((it) => ({
        title: clean(it.title), thumb: it.thumbnail, full: it.link, page: it.link,
        w: num(it.sizewidth), h: num(it.sizeheight), tags: [],
      }));
    },
  },
  {
    id: "kakao", name: "카카오(다음)", w: 1.1, en: false, desc: "한국 이미지", need: ["KAKAO_KEY"],
    ok: (e) => e.KAKAO_KEY,
    async run(q, page, safe, e) {
      if (page > 50) return [];
      const d = await getJson(
        `https://dapi.kakao.com/v2/search/image?query=${enc(q)}&sort=accuracy&page=${page}&size=40`,
        { Authorization: `KakaoAK ${e.KAKAO_KEY}` });
      return (d.documents || []).map((it) => ({
        title: clean(it.display_sitename || ""), thumb: it.thumbnail_url, full: it.image_url,
        page: it.doc_url || it.image_url, w: num(it.width), h: num(it.height), tags: [],
      }));
    },
  },
  {
    id: "pixabay", name: "Pixabay", w: 1.1, en: false, colors: true, desc: "일반 사진·일러스트 (색상 필터)", need: ["PIXABAY_KEY"],
    ok: (e) => e.PIXABAY_KEY,
    async run(q, page, safe, e, o = {}) {
      const lang = HANGUL.test(q) ? "ko" : "en";
      const d = await getJson(
        `https://pixabay.com/api/?key=${e.PIXABAY_KEY}&q=${enc(q)}&lang=${lang}&image_type=all&safesearch=${safe}&per_page=40&page=${page}&order=popular` + extra("pixabay", "colors", "orientation", o),
        {}, 900);
      return (d.hits || []).map((it) => ({
        title: "", thumb: it.webformatURL, full: it.largeImageURL || it.webformatURL, page: it.pageURL,
        w: num(it.imageWidth), h: num(it.imageHeight),
        tags: String(it.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      }));
    },
  },
  {
    id: "unsplash", name: "Unsplash", w: 1.0, en: true, colors: true, desc: "감성 사진 (색상 필터)", need: ["UNSPLASH_KEY"],
    ok: (e) => e.UNSPLASH_KEY,
    async run(q, page, safe, e, o = {}) {
      const d = await getJson(
        `https://api.unsplash.com/search/photos?query=${enc(q)}&page=${page}&per_page=30&content_filter=${safe ? "high" : "low"}` + extra("unsplash", "color", "orientation", o),
        { Authorization: `Client-ID ${e.UNSPLASH_KEY}`, "Accept-Version": "v1" }, 1800);
      return (d.results || []).map((it) => ({
        title: clean(it.alt_description || it.description || ""), thumb: it.urls?.small, full: it.urls?.regular,
        page: it.links?.html, w: num(it.width), h: num(it.height),
        tags: (it.tags || []).map((t) => t.title).filter(Boolean),
      }));
    },
  },
  {
    id: "pexels", name: "Pexels", w: 0.9, en: true, colors: true, desc: "일반 사진 (색상 필터)", need: ["PEXELS_KEY"],
    ok: (e) => e.PEXELS_KEY,
    async run(q, page, safe, e, o = {}) {
      const d = await getJson(
        `https://api.pexels.com/v1/search?query=${enc(q)}&per_page=40&page=${page}` + extra("pexels", "color", "orientation", o),
        { Authorization: e.PEXELS_KEY }, 900);
      return (d.photos || []).map((it) => ({
        title: clean(it.alt || ""), thumb: it.src?.medium, full: it.src?.large2x || it.src?.large,
        page: it.url, w: num(it.width), h: num(it.height), tags: [],
      }));
    },
  },
  {
    id: "openverse", name: "Openverse", w: 0.6, en: true, desc: "일반 사진 (키 없이, 익명 한도 있음)",
    ok: () => true,
    async run(q, page, safe) {
      // 익명 요청은 한 번에 20개까지만 허용되는 것으로 알려져 있어 20으로 맞춥니다 (2차 후기 7번 원인 후보).
      const d = await getJson(
        `https://api.openverse.org/v1/images/?q=${enc(q)}&page=${page}&page_size=20&mature=${safe ? "false" : "true"}`,
        {}, 1800);
      return (d.results || []).map((it) => ({
        title: clean(it.title || ""), thumb: it.thumbnail || it.url, full: it.url,
        page: it.foreign_landing_url || it.url, w: num(it.width), h: num(it.height),
        tags: (it.tags || []).map((t) => t.name).filter(Boolean),
      }));
    },
  },
  {
    id: "wikimedia", name: "Wikimedia", w: 0.5, en: true, desc: "위키백과 이미지 저장소 (장소·인물·역사)",
    ok: () => true,
    async run(q, page) {
      const off = (page - 1) * 30;
      const d = await getJson(
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=30&gsroffset=${off}` +
        `&gsrsearch=${enc(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=480`, {}, 3600);
      const pages = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      return pages.map((p) => {
        const ii = p.imageinfo?.[0];
        if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime)) return null;
        return {
          title: clean(p.title.replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " ")),
          thumb: ii.thumburl, full: ii.url, page: ii.descriptionurl, w: num(ii.width), h: num(ii.height), tags: [],
        };
      }).filter(Boolean);
    },
  },

  // ---------- 키 없이 쓰는 기관 소스 (미술관·박물관·우주·역사 사진) ----------
  // 응답 구조는 각 기관의 공개 문서를 기준으로 작성했고, 실제 호출은 배포 후 처음 확인하게 됩니다.
  {
    id: "met", name: "Met 미술관", w: 0.7, en: true, desc: "미국 · 미술·유물 (공개 이미지)",
    ok: () => true,
    async run(q, page) {
      const per = 12, base = "https://collectionapi.metmuseum.org/public/collection/v1";
      // 검색 결과 ID 목록이 수천~수만 개라 통째로 JSON 파싱하면 서버 CPU 한도(무료 10ms)를 넘길 수 있어,
      // 필요한 앞부분만 잘라서 숫자를 뽑습니다.
      let txt;
      try { txt = await (await getRaw(`${base}/search?hasImages=true&q=${enc(q)}`, {}, 3600)).text(); }
      catch (e) { e.message += " · 검색 단계"; throw e; } // 어느 단계에서 막혔는지 ⚠ 에 표시
      const a = txt.indexOf("[");
      if (a < 0) return [];
      const want = page * per, lim = a + 1 + want * 9 + 20;
      let ids = (txt.slice(a + 1, lim).match(/\d+/g) || []).map(Number);
      if (lim < txt.length) ids.pop(); // 잘린 마지막 숫자 버림
      ids = ids.slice((page - 1) * per, want);
      if (!ids.length) return [];
      const errs = [];
      const objs = await Promise.all(ids.map((id) => getJson(`${base}/objects/${id}`, {}, 86400).catch((e) => { errs.push(e); return null; })));
      const good = objs.filter((o) => o && o.primaryImageSmall);
      if (!good.length && errs.length === ids.length) { errs[0].message += " · 작품 조회 단계"; throw errs[0]; }
      return good.map((o) => ({
        title: clean(o.title || o.objectName || ""), thumb: o.primaryImageSmall, full: o.primaryImage || o.primaryImageSmall,
        page: o.objectURL, w: 0, h: 0, tags: (o.tags || []).map((t) => t.term).filter(Boolean),
      }));
    },
  },
  {
    id: "artic", name: "시카고 미술관", w: 0.7, en: true, desc: "미국 · 미술 (공개 이미지)",
    ok: () => true,
    async run(q, page) {
      const f = "id,title,image_id,thumbnail,term_titles,subject_titles,style_titles";
      const d = await getJson(
        `https://api.artic.edu/api/v1/artworks/search?q=${enc(q)}&query[term][is_public_domain]=true&limit=20&page=${page}&fields=${f}`,
        { "AIC-User-Agent": "ImageFeed (personal use)" }, 3600);
      const base = d.config?.iiif_url || "https://www.artic.edu/iiif/2";
      return (d.data || []).filter((it) => it.image_id).map((it) => ({
        title: clean(it.title || ""), thumb: `${base}/${it.image_id}/full/400,/0/default.jpg`, full: `${base}/${it.image_id}/full/843,/0/default.jpg`,
        page: `https://www.artic.edu/artworks/${it.id}`, w: num(it.thumbnail?.width), h: num(it.thumbnail?.height),
        tags: [...(it.subject_titles || []), ...(it.style_titles || []), ...(it.term_titles || [])].filter(Boolean).slice(0, 12),
      }));
    },
  },
  {
    id: "cleveland", name: "클리블랜드 미술관", w: 0.7, en: true, desc: "미국 · 미술 (CC0 고해상도)",
    ok: () => true,
    async run(q, page) {
      const per = 24;
      const d = await getJson(
        `https://openaccess-api.clevelandart.org/api/artworks/?q=${enc(q)}&has_image=1&cc0=1&limit=${per}&skip=${(page - 1) * per}`, {}, 3600);
      return (d.data || []).map((it) => {
        const im = it.images || {}, web = im.web || im.print || im.full, big = im.print || im.full || web;
        if (!web?.url) return null;
        return {
          title: clean(it.title || ""), thumb: web.url, full: big.url, page: it.url || web.url,
          w: num(web.width), h: num(web.height), tags: [it.type].filter(Boolean),
        };
      }).filter(Boolean);
    },
  },
  {
    id: "vam", name: "V&A 박물관", w: 0.7, en: true, desc: "영국 · 디자인·패션·공예·가구",
    ok: () => true,
    async run(q, page) {
      const d = await getJson(`https://api.vam.ac.uk/v2/objects/search?q=${enc(q)}&images_exist=1&page=${page}&page_size=24`, {}, 3600);
      return (d.records || []).map((r) => {
        const im = r._images || {}, b = im._iiif_image_base_url, th = im._primary_thumbnail;
        if ((!b && !th) || (r._warningTypes || []).length) return null; // 민감 이미지 경고가 붙은 것은 제외
        return {
          title: clean(r._primaryTitle || r.objectType || ""),
          thumb: b ? `${b}full/!500,500/0/default.jpg` : th, alt: th, full: b ? `${b}full/!1400,1400/0/default.jpg` : th,
          page: `https://collections.vam.ac.uk/item/${r.systemNumber}/`, w: 0, h: 0,
          tags: [r.objectType, r._primaryPlace].filter(Boolean),
        };
      }).filter(Boolean);
    },
  },
  {
    id: "nasa", name: "NASA", w: 0.7, en: true, desc: "우주·과학 사진",
    ok: () => true,
    async run(q, page) {
      let d;
      try { d = await getJson(`https://images-api.nasa.gov/search?q=${enc(q)}&media_type=image&page=${page}&page_size=30`, {}, 3600); }
      catch (e) { if (e.status === 400 || e.status === 404) return []; throw e; } // 끝 페이지 너머는 오류로 오므로 "끝"으로 처리
      return (d.collection?.items || []).map((it) => {
        const m = it.data?.[0] || {};
        const th = (it.links || []).find((l) => /\.(jpe?g|png)$/i.test(l.href || ""))?.href;
        if (!th) return null;
        return {
          title: clean(m.title || ""), thumb: th, full: th.replace(/~(thumb|small|medium)\.(\w+)$/i, "~large.$2"),
          page: `https://images.nasa.gov/details/${enc(m.nasa_id || "")}`, w: 0, h: 0,
          tags: (m.keywords || []).map(String).slice(0, 12),
        };
      }).filter(Boolean);
    },
  },
  {
    id: "loc", name: "미국 의회도서관", w: 0.5, en: true, desc: "미국 · 역사 사진·판화 (분당 20회 제한이 엄격해서 기본은 꺼짐)",
    ok: () => true,
    async run(q, page) {
      let d;
      try { d = await getJson(`https://www.loc.gov/photos/?q=${enc(q)}&fo=json&c=24&sp=${page}`, {}, 3600); }
      catch (e) { if (e.status === 404) return []; throw e; } // 결과 없음이 404로 옴
      const px = (u) => Number((String(u).match(/(\d{2,4})px/) || [])[1]) || 0;
      return (d.results || []).map((r) => {
        const iu = (Array.isArray(r.image_url) ? r.image_url : []).filter((u) => u && !/grp\.gif$/.test(u));
        const sorted = [...iu].sort((a, b) => px(a) - px(b));
        const thumb = sorted.find((u) => px(u) >= 300) || r.item?.service_medium || sorted[sorted.length - 1];
        if (!thumb) return null;
        return {
          title: clean(String(r.title || r.item?.title || "").replace(/^\[|\]$/g, "")), thumb, full: sorted[sorted.length - 1] || thumb,
          page: r.url || r.item?.link || r.id || thumb, w: 0, h: 0, tags: (r.subject || []).map(String).slice(0, 12),
        };
      }).filter(Boolean);
    },
  },
];

// ---------- 번역 (한글 → 영어, 선택 기능) ----------
const TR_LANGS = ["ko", "ja", "zh", "de", "fr", "es", "pt", "it", "ru", "id", "vi", "th", "tr"];
async function translate(q, env, sl = "") {
  if (!sl) sl = HANGUL.test(q) ? "ko" : "";
  if (!env.AI || !TR_LANGS.includes(sl)) return q;
  const key = new Request(`https://cache.local/tr?sl=${sl}&q=` + enc(q));
  try {
    const hit = await caches.default.match(key);
    if (hit) return await hit.text();
    const r = await env.AI.run("@cf/meta/m2m100-1.2b", { text: q, source_lang: sl, target_lang: "en" });
    const t = String(r?.translated_text || "").trim() || q;
    await caches.default.put(key, new Response(t, { headers: { "cache-control": "max-age=604800" } }));
    return t;
  } catch {
    return q;
  }
}

// ---------- 트렌드 (위키백과 많이 본 문서, 키 불필요) ----------
const TREND_LANGS = ["ko", "en", "ja", "zh", "de", "fr", "es", "pt", "it", "ru", "id", "vi", "th", "tr"];
const TREND_SKIP = /^(Main_Page|대문|メインページ|Wikipedia|위키백과|Hauptseite|Accueil|Portada|Pagina_principale|Заглавная_страница|Halaman_Utama|Trang_Chính|หน้าหลัก|Ana_Sayfa|Wikipédia|Página_principal|Pagina_principală|Special|特別|特殊|Spezial|Spécial|Especial|Speciale|Служебная|Khusus|Đặc_biệt|พิเศษ|Özel)/;
async function trends(u) {
  const lang = u.searchParams.get("lang") || "ko";
  if (!TREND_LANGS.includes(lang)) return json({ error: "lang" }, 400);
  for (let back = 2; back <= 4; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), day = String(d.getUTCDate()).padStart(2, "0");
    try {
      const j = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/${day}`, {}, 3600);
      const arts = j.items?.[0]?.articles || [];
      const list = arts
        .map((a) => String(a.article || "").replace(/_/g, " "))
        .filter((t, i) => t && !TREND_SKIP.test(arts[i].article) && !t.includes(":") && !hardBlocked(t) && !isAdult(t))
        .slice(0, 40);
      if (list.length) return json({ lang, date: `${y}-${m}-${day}`, items: list });
    } catch { /* 다음 날짜 시도 */ }
  }
  return json({ error: "no data", items: [] }, 502);
}

// ---------- 이미지 중계 ----------
function blockedHost(h) {
  h = h.toLowerCase();
  return h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[");
}

async function proxyImage(u) {
  let t;
  try { t = new URL(u.searchParams.get("u") || ""); } catch { return json({ error: "bad url" }, 400); }
  if (t.protocol !== "https:" || blockedHost(t.hostname)) return json({ error: "blocked" }, 400);
  let r;
  try {
    r = await fetch(t.href, {
      headers: { "user-agent": UA, accept: "image/*", referer: t.origin + "/" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "300-599": 0 } },
    });
  } catch { return json({ error: "fetch failed" }, 502); }
  if (!r.ok) return json({ error: "upstream " + r.status }, 502);
  const ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("image/") || ct.includes("svg")) return json({ error: "not an image" }, 415);
  if (num(r.headers.get("content-length")) > 30 * 1024 * 1024) return json({ error: "too large" }, 413);
  const h = new Headers({
    "content-type": ct,
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
  });
  if (u.searchParams.get("dl")) h.set("content-disposition", "attachment");
  return new Response(r.body, { headers: h });
}

// ---------- 라우터 ----------
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (!u.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (!authed(req, env)) return json({ error: "auth" }, 401);

    if (u.pathname === "/api/config") {
      return json({
        sources: SOURCES.filter((s) => s.ok(env)).map(({ id, name, w, en, colors, desc, need }) => ({ id, name, w, en, colors: !!colors, desc: desc || "", keyless: !need })),
        // 키를 등록하면 쓸 수 있게 되는 소스 (설정 화면 안내용)
        locked: SOURCES.filter((s) => !s.ok(env)).map(({ id, name, desc, need, colors }) => ({ id, name, desc: desc || "", need: need || [], colors: !!colors })),
        ai: !!env.AI,
      });
    }

    if (u.pathname === "/api/tr") {
      const q = (u.searchParams.get("q") || "").trim().slice(0, 100);
      return json({ t: await translate(q, env, u.searchParams.get("sl") || "") });
    }

    if (u.pathname === "/api/img") return proxyImage(u);

    if (u.pathname === "/api/trends") return trends(u);

    if (u.pathname === "/api/search") {
      const src = SOURCES.find((s) => s.id === u.searchParams.get("src"));
      if (!src || !src.ok(env)) return json({ error: "no such source" }, 404);
      const q = (u.searchParams.get("q") || "").trim().slice(0, 100);
      const qe = (u.searchParams.get("qe") || q).trim().slice(0, 100);
      if (!q) return json({ error: "empty" }, 400);
      if (hardBlocked(q) || hardBlocked(qe)) return json({ blocked: true, items: [] });
      const page = Math.min(50, Math.max(1, parseInt(u.searchParams.get("page")) || 1));
      const safe = u.searchParams.get("safe") !== "0";
      const color = u.searchParams.get("color") || "";
      const orient = u.searchParams.get("orient") || "";
      if (color && !COLOR[src.id]?.[color]) return json({ items: [] });
      let items;
      try {
        items = await src.run(src.en ? qe : q, page, safe ? 1 : 0, env, { color, orient });
      } catch (e) {
        // 502 대신 200 으로 사유를 함께 보내서 화면의 ⚠ 를 눌렀을 때 이유를 보여줄 수 있게 합니다.
        return json({ items: [], err: reasonOf(e), detail: String(e.message || e).slice(0, 120) });
      }
      items = items
        .filter((it) => it.thumb && it.full && !hardBlocked(`${it.title} ${it.tags.join(" ")}`))
        .map((it) => ({ ...it, thumb: https(it.thumb), full: https(it.full), alt: it.alt ? https(it.alt) : "", page: https(it.page || it.full), src: src.id, adult: isAdult(`${it.title} ${it.tags.join(" ")}`) }));
      return json({ items });
    }

    return json({ error: "not found" }, 404);
  },
};
