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
async function getRaw(url, headers = {}, ttl = 600, ms = 6500) {
  let r;
  try {
    r = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json", ...headers },
      signal: AbortSignal.timeout(ms),
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": ttl, "300-599": 0 } },
    });
  } catch (e) {
    throw fail(e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network", String(e?.message || e));
  }
  if (!r.ok) throw fail(reasonOfStatus(r.status), `HTTP ${r.status}`, r.status);
  return r;
}
async function getJson(url, headers = {}, ttl = 600, ms = 6500) {
  const r = await getRaw(url, headers, ttl, ms);
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
};
const ORIENT = {
  pixabay: { v: "vertical", h: "horizontal" },
  unsplash: { v: "portrait", h: "landscape", s: "squarish" },
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
      // 네이버 기본 썸네일은 아주 작습니다. 카카오와 같은 방식으로, 원본이 너무 크지 않으면 원본을 썸네일로 쓰고
      // 안 열리면(막힌 사이트·삭제된 이미지) 크기 코드를 키운 네이버 썸네일(type=w480)로, 그것도 안 되면 원래 썸네일로 대신합니다.
      return (d.items || []).map((it) => {
        const w = num(it.sizewidth), h = num(it.sizeheight), small = !w || !h || w * h <= 6e6;
        const th = String(it.thumbnail || "");
        const mid = /^https?:\/\/search\.pstatic\.net\/.*[?&]type=/i.test(th) ? th.replace(/([?&]type=)[^&]*/i, "$1w480") : th;
        return { title: clean(it.title), thumb: small && it.link ? it.link : mid, alt: mid, full: it.link, page: it.link, w, h, tags: [] };
      });
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
      // thumbnail_url 은 아주 작아서 흐리게 보입니다. 원본(image_url)이 너무 크지 않을 때는 원본을 쓰고,
      // 안 열리면 화면이 작은 썸네일(alt)로 한 번 더 시도합니다.
      return (d.documents || []).map((it) => {
        const w = num(it.width), h = num(it.height), small = !w || !h || w * h <= 6e6;
        return {
          title: clean(it.display_sitename || ""), thumb: small && it.image_url ? it.image_url : it.thumbnail_url, alt: it.thumbnail_url, full: it.image_url,
          page: it.doc_url || it.image_url, w, h, tags: [],
        };
      });
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
    id: "openverse", name: "Openverse", w: 0.6, en: true, desc: "일반 사진 (키 없이, 익명 한도 있음)",
    ok: () => true,
    async run(q, page, safe) {
      // 익명 요청은 한 번에 20개까지만 허용되는 것으로 알려져 있어 20으로 맞춥니다 (2차 후기 7번 원인 후보).
      const d = await getJson(
        `https://api.openverse.org/v1/images/?q=${enc(q)}&page=${page}&page_size=20&mature=${safe ? "false" : "true"}`,
        {}, 1800, 13000); // Openverse 는 가끔 느려서 대기 시간을 넉넉히 (화면 쪽 한도는 16초)
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
    async run(q, page, safe, e, o = {}) {
      const off = (page - 1) * 30;
      const one = async (term) => {
        const d = await getJson(
          `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=30&gsroffset=${off}` +
          `&gsrsearch=${enc(term + " filetype:bitmap")}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=480`, {}, 3600);
        const pages = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
        return pages.map((p) => {
          const ii = p.imageinfo?.[0];
          if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime)) return null;
          return {
            title: clean(p.title.replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " ")),
            thumb: ii.thumburl, full: ii.url, page: ii.descriptionurl, w: num(ii.width), h: num(ii.height), tags: [],
          };
        }).filter(Boolean);
      };
      // 고유명사를 한글로 입력했다면 영어(로마자) 이름과 한글 원문을 함께 찾습니다. (위키 저장소에는 한글 설명·분류가 많음)
      const terms = [q]; if (o.alt && o.alt !== q) terms.push(o.alt);
      const rs = await Promise.allSettled(terms.map(one));
      const good = rs.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (!good.length) throw rs[0].reason;
      return rr(...good);
    },
  },

  // ---------- 키 없이 쓰는 기관 소스 (미술관·박물관·우주) ----------
  // 응답 구조는 각 기관의 공개 문서를 기준으로 작성했고, 실제 호출은 배포 후 처음 확인하게 됩니다.
  {
    id: "artic", name: "시카고 미술관", w: 0.7, en: true, desc: "미국 · 미술 (공개 이미지)",
    ok: () => true,
    async run(q, page) {
      const f = "id,title,image_id,thumbnail,term_titles,subject_titles,style_titles";
      const d = await getJson(
        `https://api.artic.edu/api/v1/artworks/search?q=${enc(q)}&query[term][is_public_domain]=true&limit=20&page=${page}&fields=${f}`,
        { "AIC-User-Agent": "ImageFeed (personal use)" }, 3600);
      const base = d.config?.iiif_url || "https://www.artic.edu/iiif/2";
      // 이미지 크기는 시카고 미술관이 권장하는 843 한 가지만 씁니다. (임의 크기 400 은 이미지 서버가 거절하거나 아주 느린 것으로 의심됨)
      // 작은 크기(200)는 843 이 안 열릴 때를 위한 예비 주소(alt)입니다.
      const img = (id, w) => `${base}/${id}/full/${w},/0/default.jpg`;
      return (d.data || []).filter((it) => it.image_id).map((it) => ({
        title: clean(it.title || ""), thumb: img(it.image_id, 843), full: img(it.image_id, 843), alt: img(it.image_id, 200),
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

// ---------- 고유명사 판별 (한글 검색어 전용, 선택 기능) ----------
// "금강엑슬루타워" 같은 이름을 번역기에 넣으면 "금강(강)" + "타워"처럼 뜻풀이가 되어, 영어 소스에서 강·자연 사진이 올라옵니다.
// 그래서 텍스트 AI 에게 "고유명사인지, 그렇다면 영어(로마자) 이름과 종류가 무엇인지"를 물어봅니다.
// 같은 검색어는 7일 캐시되고, 실패·시간 초과면 기존 번역을 그대로 씁니다. 끄려면 TR_SMART=off, 모델은 TR_MODEL 로 지정.
const NAME_SYS = "You prepare search words for an image search engine. The user message is a Korean search query. " +
  'Reply with ONLY compact JSON: {"proper":true|false,"en":"...","type":"..."}. ' +
  '"proper": true if the query is a specific name (a place, building, apartment complex, brand, shop, person, event); false for ordinary descriptive words. ' +
  '"en": the English search words. If it is a proper name, give its romanized or official English name and do NOT translate its parts literally ' +
  '(for example a name made of "gold" and "river" is probably a place name in romanization). If it is ordinary words, give a natural English translation. ' +
  '"type": one or two English words for the kind of thing when it is a proper name (e.g. "apartment complex", "tower", "cafe", "temple"), otherwise "".';
async function nameInfo(q, env) {
  for (const model of [env.TR_MODEL, "@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.2-3b-instruct"].filter(Boolean)) {
    try {
      const out = await env.AI.run(model, { messages: [{ role: "system", content: NAME_SYS }, { role: "user", content: q }], max_tokens: 90, temperature: 0 });
      const m = String(out?.response ?? out?.result?.response ?? "").match(/\{[\s\S]*?\}/);
      if (!m) continue;
      const j = JSON.parse(m[0]);
      const latin = (s, n) => String(s || "").replace(/[^A-Za-z0-9 '&.-]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
      return { proper: j.proper === true, en: latin(j.en, 80), type: latin(j.type, 30) };
    } catch { /* 다음 모델을 시도 */ }
  }
  return null;
}
// 번역 + 고유명사 판별. 반환: { t, proper?, type? } — proper 가 없으면 판별하지 못한 것(화면이 자체 규칙으로 판단)
async function translateFull(q, env, sl = "") {
  if (!sl) sl = HANGUL.test(q) ? "ko" : "";
  if (sl !== "ko" || !env.AI || env.TR_SMART === "off") return { t: await translate(q, env, sl) };
  const key = new Request("https://cache.local/trn?q=" + enc(q));
  const [t, info] = await Promise.all([translate(q, env, sl), (async () => {
    try { const hit = await caches.default.match(key); if (hit) return await hit.json(); } catch { /* 캐시가 없으면 새로 물어봄 */ }
    const r = await Promise.race([nameInfo(q, env), new Promise((res) => setTimeout(() => res(null), 4000))]);
    if (r) { try { await caches.default.put(key, new Response(JSON.stringify(r), { headers: { "cache-control": "max-age=604800" } })); } catch { /* 캐시 실패는 무시 */ } }
    return r;
  })()]);
  if (!info) return { t };
  if (info.proper && info.en) return { t: info.en, proper: true, type: info.type || "" };
  return { t, proper: !!info.proper, type: info.type || "" };
}

// ---------- 이미지 설명 (비슷한 이미지 보강 / 사진으로 검색) ----------
// 화면이 작게 줄인 JPEG 를 보내면 Workers AI 가 한 줄 설명을 만들고, 그중 핵심 영어 단어만 돌려줍니다.
// 모델 이름은 환경 변수 CAPTION_MODEL 로 바꿀 수 있고, 끄려면 AI_CAPTION=off 로 설정합니다.
// 같은 이미지는 7일 동안 캐시되어 무료 한도를 아낍니다.
const CAP_PROMPT = "Describe this image in one short sentence. Mention the main subject, setting, style and colors.";
const CAP_STOP = new Set(["the", "and", "with", "from", "this", "that", "image", "picture", "photo", "photograph", "shows", "showing", "depicts",
  "depicting", "features", "featuring", "there", "its", "for", "his", "her", "their", "being", "some", "appears", "seems", "very", "view",
  "scene", "close", "closeup", "front", "side", "into", "has", "have", "while", "which", "who", "than", "then", "also", "one", "two", "three", "are", "was"]);
function capKeywords(t) {
  const w = String(t).toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((x) => x.length > 2 && !CAP_STOP.has(x));
  return [...new Set(w)].slice(0, 6).join(" ");
}
async function caption(req, env) {
  if (!env.AI || env.AI_CAPTION === "off") return json({ error: "unavailable", detail: "ai" });
  if (num(req.headers.get("content-length")) > 300 * 1024) return json({ error: "size" }, 413);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length || buf.length > 300 * 1024) return json({ error: "size" }, 413);
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8, png = buf[0] === 0x89 && buf[1] === 0x50;
  if (!jpeg && !png) return json({ error: "type" }, 415);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = new Request(`https://cache.local/cap?h=${hash}`);
  try { const hit = await caches.default.match(key); if (hit) return json(await hit.json()); } catch { /* 캐시가 없으면 새로 만듭니다 */ }
  let last = "";
  for (const model of [env.CAPTION_MODEL, "@cf/unum/uform-gen2-qwen-500m", "@cf/llava-hf/llava-1.5-7b-hf"].filter(Boolean)) {
    try {
      const out = await env.AI.run(model, { image: Array.from(buf), prompt: CAP_PROMPT, max_tokens: 48 });
      const text = String(out?.description ?? out?.response ?? out?.text ?? "").trim();
      if (!text) continue;
      const body = hardBlocked(text) ? { q: "", blocked: true } : { q: capKeywords(text), text: text.slice(0, 160) };
      try { await caches.default.put(key, new Response(JSON.stringify(body), { headers: { "cache-control": "max-age=604800" } })); } catch { /* 캐시 실패는 무시 */ }
      return json(body);
    } catch (e) { last = String(e?.message || e).slice(0, 100); }
  }
  return json({ error: "unavailable", detail: last });
}

// ---------- 트렌드: 단어 대신 이미지 ----------
// 위키백과(한국어·영어)에서 많이 본 문서의 대표 사진(grp "news")과, Pixabay·Unsplash 키가 있으면 인기 사진(grp "pop")을 섞어 돌려줍니다.
// 나라를 고르는 대신 한국어·영어 두 곳만 씁니다. (다른 언어는 제목을 읽기 어려워서)
const TREND_SKIP = /^(Main_Page|대문|Wikipedia|위키백과|Special|특수|Portal|포털|Help|도움말|Category|분류|File|파일)/;
const rr = (...lists) => { // 여러 목록을 번갈아 한 줄로 섞기
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
};
async function wikiTrend(lang) {
  for (let back = 2; back <= 4; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), day = String(d.getUTCDate()).padStart(2, "0");
    let titles;
    try {
      const j = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/${day}`, {}, 3600);
      const arts = j.items?.[0]?.articles || [];
      titles = arts
        .filter((a) => a.article && !TREND_SKIP.test(a.article))
        .map((a) => String(a.article).replace(/_/g, " "))
        .filter((t) => !t.includes(":") && !t.includes("|") && !hardBlocked(t) && !isAdult(t))
        .slice(0, 40);
    } catch { continue; } // 아직 없는 날짜면 하루 전 것을 시도
    if (!titles.length) continue;
    // 한 번의 호출로 문서 40개의 대표 사진을 받아 옵니다.
    let q;
    try {
      q = (await getJson(
        `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail|original&pithumbsize=640&pilimit=50&redirects=1&titles=${enc(titles.join("|"))}`,
        {}, 3600)).query || {};
    } catch { continue; }
    const norm = new Map((q.normalized || []).map((n) => [n.from, n.to]));
    const redir = new Map((q.redirects || []).map((r) => [r.from, r.to]));
    const rank = new Map();
    titles.forEach((t, i) => { const f = redir.get(norm.get(t) || t) || norm.get(t) || t; if (!rank.has(f)) rank.set(f, i); });
    const items = Object.values(q.pages || {})
      .filter((p) => p.thumbnail?.source && !/\.svg(\.png)?$/i.test(p.original?.source || p.thumbnail.source)) // 지도·깃발·로고(svg)는 제외
      .sort((a, b) => (rank.get(a.title) ?? 99) - (rank.get(b.title) ?? 99))
      .map((p) => {
        const big = p.original?.source;
        return {
          title: clean(p.title), thumb: p.thumbnail.source, full: big && /\.(jpe?g|png|webp)$/i.test(big) ? big : p.thumbnail.source,
          page: `https://${lang}.wikipedia.org/wiki/${enc(p.title.replace(/ /g, "_"))}`,
          w: num(p.thumbnail.width), h: num(p.thumbnail.height), tags: [], src: "wiki", grp: "news", adult: false,
        };
      });
    if (items.length) return { date: `${y}-${m}-${day}`, items };
  }
  return null;
}
// 키가 등록된 사진 소스의 인기·추천 사진 (날짜에 따라 페이지를 바꿔서 매일 조금씩 다르게)
async function popularPhotos(env, day) {
  const out = [];
  if (env.PIXABAY_KEY) {
    try {
      const d = await getJson(`https://pixabay.com/api/?key=${env.PIXABAY_KEY}&image_type=photo&editors_choice=true&safesearch=true&order=popular&per_page=30&page=${1 + (day % 4)}`, {}, 1800);
      out.push((d.hits || []).map((it) => ({
        title: "", thumb: it.webformatURL, full: it.largeImageURL || it.webformatURL, page: it.pageURL, w: num(it.imageWidth), h: num(it.imageHeight),
        tags: String(it.tags || "").split(",").map((t) => t.trim()).filter(Boolean), src: "pixabay", grp: "pop",
      })));
    } catch { /* 이 소스는 건너뜀 */ }
  }
  if (env.UNSPLASH_KEY) {
    try {
      const d = await getJson(`https://api.unsplash.com/photos?order_by=popular&per_page=20&page=${1 + (day % 3)}`,
        { Authorization: `Client-ID ${env.UNSPLASH_KEY}`, "Accept-Version": "v1" }, 1800);
      out.push((Array.isArray(d) ? d : []).map((it) => ({
        title: clean(it.alt_description || it.description || ""), thumb: it.urls?.small, full: it.urls?.regular, page: it.links?.html,
        w: num(it.width), h: num(it.height), tags: (it.tags || []).map((t) => t.title).filter(Boolean), src: "unsplash", grp: "pop",
      })));
    } catch { /* 이 소스는 건너뜀 */ }
  }
  return rr(...out);
}
async function trends(env) {
  const day = Math.floor(Date.now() / 86400000);
  const [ko, en, pop] = await Promise.all([wikiTrend("ko").catch(() => null), wikiTrend("en").catch(() => null), popularPhotos(env, day).catch(() => [])]);
  const seen = new Set();
  const items = rr(ko?.items || [], en?.items || [], pop)
    .filter((it) => it.thumb && it.full && !hardBlocked(`${it.title} ${it.tags.join(" ")}`))
    .map((it) => ({ ...it, thumb: https(it.thumb), full: https(it.full), page: https(it.page || it.full), adult: it.adult || isAdult(`${it.title} ${it.tags.join(" ")}`) }))
    .filter((it) => (seen.has(it.thumb) ? false : seen.add(it.thumb)))
    .slice(0, 100);
  if (!items.length) return json({ error: "no data", items: [] }, 502);
  return json({ date: ko?.date || en?.date || "", items });
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
  const hdr = { "user-agent": UA, accept: "image/*", referer: t.origin + "/" };
  // 시카고 미술관은 API 와 같은 방식으로 앱 이름을 밝히는 요청을 선호합니다.
  if (/(^|\.)artic\.edu$/i.test(t.hostname)) hdr["AIC-User-Agent"] = "ImageFeed (personal use)";
  try {
    r = await fetch(t.href, {
      headers: hdr,
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "300-599": 0 } },
    });
  } catch { return json({ error: "fetch failed" }, 502); }
  if (!r.ok) return json({ error: "upstream " + r.status }, 502);
  const ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("image/") || ct.includes("svg")) return json({ error: "not an image (" + (ct || "?").slice(0, 40) + ")" }, 415);
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
        caption: !!env.AI && env.AI_CAPTION !== "off",
      });
    }

    if (u.pathname === "/api/caption" && req.method === "POST") return caption(req, env);

    if (u.pathname === "/api/tr") {
      const q = (u.searchParams.get("q") || "").trim().slice(0, 100);
      return json(await translateFull(q, env, u.searchParams.get("sl") || ""));
    }

    if (u.pathname === "/api/img") return proxyImage(u);

    if (u.pathname === "/api/trends") return trends(env);

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
      // 색상: 이 소스가 해당 색을 서버에서 걸러 주면 sc=true. 아니면 색은 무시하고 화면이 불러온 뒤 대표 색으로 거릅니다.
      const sc = !!(color && COLOR[src.id]?.[color]);
      // 고유명사(pr=1)를 한글로 입력했을 때, 영어 소스가 원문도 함께 쓸 수 있게 alt 로 넘깁니다.
      const alt = u.searchParams.get("pr") === "1" && HANGUL.test(q) && qe !== q ? q : "";
      let items;
      try {
        items = await src.run(src.en ? qe : q, page, safe ? 1 : 0, env, { color: sc ? color : "", orient, alt });
      } catch (e) {
        // 502 대신 200 으로 사유를 함께 보내서 화면의 ⚠ 를 눌렀을 때 이유를 보여줄 수 있게 합니다.
        return json({ items: [], err: reasonOf(e), detail: String(e.message || e).slice(0, 120) });
      }
      items = items
        .filter((it) => it.thumb && it.full && !hardBlocked(`${it.title} ${it.tags.join(" ")}`))
        .map((it) => ({ ...it, thumb: https(it.thumb), full: https(it.full), alt: it.alt ? https(it.alt) : "", page: https(it.page || it.full), src: src.id, sc, adult: isAdult(`${it.title} ${it.tags.join(" ")}`) }));
      return json({ items });
    }

    return json({ error: "not found" }, 404);
  },
};
