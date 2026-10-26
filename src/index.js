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

async function getJson(url, headers = {}, ttl = 600) {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json", ...headers },
    signal: AbortSignal.timeout(6500),
    cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": ttl, "300-599": 0 } },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

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
    id: "naver", name: "네이버", w: 1.25, en: false,
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
    id: "kakao", name: "카카오(다음)", w: 1.1, en: false,
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
    id: "pixabay", name: "Pixabay", w: 1.1, en: false, colors: true,
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
    id: "unsplash", name: "Unsplash", w: 1.0, en: true, colors: true,
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
    id: "pexels", name: "Pexels", w: 0.9, en: true, colors: true,
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
    id: "openverse", name: "Openverse", w: 0.6, en: true,
    ok: () => true,
    async run(q, page, safe) {
      const d = await getJson(
        `https://api.openverse.org/v1/images/?q=${enc(q)}&page=${page}&page_size=30&mature=${safe ? "false" : "true"}`,
        {}, 1800);
      return (d.results || []).map((it) => ({
        title: clean(it.title || ""), thumb: it.thumbnail || it.url, full: it.url,
        page: it.foreign_landing_url || it.url, w: num(it.width), h: num(it.height),
        tags: (it.tags || []).map((t) => t.name).filter(Boolean),
      }));
    },
  },
  {
    id: "wikimedia", name: "Wikimedia", w: 0.5, en: true,
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
        sources: SOURCES.filter((s) => s.ok(env)).map(({ id, name, w, en, colors }) => ({ id, name, w, en, colors: !!colors })),
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
        return json({ error: String(e.message || e), items: [] }, 502);
      }
      items = items
        .filter((it) => it.thumb && it.full && !hardBlocked(`${it.title} ${it.tags.join(" ")}`))
        .map((it) => ({ ...it, src: src.id, adult: isAdult(`${it.title} ${it.tags.join(" ")}`) }));
      return json({ items });
    }

    return json({ error: "not found" }, 404);
  },
};
