import { hardBlocked, isAdult, isExplicit, isNude, hasArtContext } from "./filters.js";
import { seasonTopics } from "./season.js";
import { TOPIC_POOL, ANCHOR, offTopic } from "./topics.js";
import { HIST_DAYS, mergeHistory, mergeToday } from "./history.js";

const UA = "Mozilla/5.0 (compatible; ImageFeed/1.0; personal use)";
const enc = encodeURIComponent;
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const clean = (s = "") =>
  String(s).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#0?39;/g, "'").trim();
const num = (v) => Number(v) || 0;
// 카카오 검색 결과의 썸네일 주소(예: https://search1.kakaocdn.net/argon/130x130_85_c/XXXX)에서 크기 부분만 큰 값으로 바꿉니다.
// 형식이 다르면 그대로 돌려줍니다. (실제 서버에서 큰 크기가 열리는지는 배포 후 확인 필요. 안 열리면 화면이 alt 로 대신함)
const blogThumb = (u = "") => String(u).replace(/(\/argon\/)\d+x\d+(?:_[^/]*)?(\/)/, "$1600x0_65_wg$2");
// 검사용 글: 제목·태그·본문 일부·출처 이름
const textOf = (it) => `${it.title || ""} ${(it.tags || []).join(" ")} ${it.desc || ""}`;
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
    async run(q, page, safe, e, o = {}) {
      const base = e.NAVER_BASE || "https://naverapihub.apigw.ntruss.com/search/v1/image";
      const legacy = base.includes("openapi.naver.com");
      const headers = legacy
        ? { "X-Naver-Client-Id": e.NAVER_ID, "X-Naver-Client-Secret": e.NAVER_SECRET }
        : { "X-NCP-APIGW-API-KEY-ID": e.NAVER_ID, "X-NCP-APIGW-API-KEY": e.NAVER_SECRET };
      const n = o.n || 40; // 트렌드는 한 쪽에 필요한 만큼만 받습니다
      const start = (page - 1) * n + 1;
      if (start > 1000) return [];
      const d = await getJson(`${base}?query=${enc(q)}&display=${n}&start=${start}&sort=sim&filter=all`, headers);
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
    async run(q, page, safe, e, o = {}) {
      if (page > 50) return [];
      const d = await getJson(
        `https://dapi.kakao.com/v2/search/image?query=${enc(q)}&sort=accuracy&page=${page}&size=${o.n || 40}`,
        { Authorization: `KakaoAK ${e.KAKAO_KEY}` });
      // thumbnail_url 은 아주 작아서 흐리게 보입니다. 원본(image_url)이 너무 크지 않을 때는 원본을 쓰고,
      // 안 열리면 화면이 작은 썸네일(alt)로 한 번 더 시도합니다.
      return (d.documents || []).map((it) => {
        const w = num(it.width), h = num(it.height), small = !w || !h || w * h <= 6e6;
        // display_sitename("daum카페" 같은 출처 이름)은 이미지 설명이 아니므로 title 이 아니라 site 로 따로 둡니다.
        // (title 에 넣으면 취향·관심사·추천 칩이 "daum카페" 같은 출처 이름을 배우던 문제, 18차 신고 1번)
        return {
          title: "", site: clean(it.display_sitename || ""), thumb: small && it.image_url ? it.image_url : it.thumbnail_url, alt: it.thumbnail_url, full: it.image_url,
          page: it.doc_url || it.image_url, w, h, tags: [],
        };
      });
    },
  },
  {
    // 카카오(다음) 블로그 검색: 티스토리·다음 블로그 글의 대표 사진. 이미 등록한 KAKAO_KEY 를 그대로 씁니다.
    // 응답에는 글 제목(title)·본문 일부(contents)·블로그 이름(blogname)·대표 사진 주소(thumbnail)가 있고, 사진이 없는 글은 건너뜁니다.
    id: "kakaoblog", name: "블로그(다음·티스토리)", w: 0.9, en: false, desc: "블로그 사진 (티스토리·다음 블로그, 한글 검색에 강함)", need: ["KAKAO_KEY"],
    ok: (e) => e.KAKAO_KEY && e.BLOG !== "off",
    async run(q, page, safe, e, o = {}) {
      if (page > 50) return [];
      const d = await getJson(
        `https://dapi.kakao.com/v2/search/blog?query=${enc(q)}&sort=accuracy&page=${page}&size=${Math.min(50, o.n || 30)}`,
        { Authorization: `KakaoAK ${e.KAKAO_KEY}` });
      return (d.documents || []).filter((it) => it.thumbnail && it.url).map((it) => {
        const th = blogThumb(it.thumbnail);
        // 대표 사진은 아주 작게(130px 안팎) 오는 경우가 많아서 큰 크기 주소를 먼저 시도하고, 안 열리면 받은 원래 주소(alt)로 대신합니다.
        // og:"view" = 이미지를 크게 열 때 글 페이지의 대표 사진(og:image)을 찾아 더 선명한 사진으로 바꿉니다. (20차, /api/og)
        return {
          title: clean(it.title || ""), desc: clean(it.contents || "").slice(0, 160), site: clean(it.blogname || ""),
          thumb: th, alt: it.thumbnail, full: th, page: it.url, w: 0, h: 0, tags: [], og: "view",
        };
      });
    },
  },
  {
    // 네이버 블로그 검색 (20차): 이미 등록한 NAVER_ID/NAVER_SECRET 을 그대로 씁니다. 응답에는 사진이 없어서(제목·링크·요약·블로거 이름·날짜뿐)
    // 카드가 화면에 나올 때 글 페이지의 대표 사진(og:image)을 /api/og 로 찾아 채웁니다. (og:"card") 사진을 못 찾은 글은 목록에서 빠집니다.
    // 실제 응답과 네이버가 글 페이지를 열어 주는지는 배포 후 확인 필요. 소스 이름 옆 ⚠ 에 이유가 표시됩니다.
    id: "naverblog", name: "네이버 블로그", w: 0.9, en: false, desc: "블로그 글 대표 사진 (네이버 블로그, 한글 검색에 강함·사진은 글에서 가져와 조금 느려요)", need: ["NAVER_ID", "NAVER_SECRET"],
    ok: (e) => e.NAVER_ID && e.NAVER_SECRET && e.BLOG !== "off" && e.NAVERBLOG === "on", // 21차: 기본은 꺼 둠(네이버 이미지 검색이 블로그 사진을 이미 포함). 쓰려면 변수 NAVERBLOG=on
    async run(q, page, safe, e, o = {}) {
      const b0 = e.NAVER_BASE || "https://naverapihub.apigw.ntruss.com/search/v1/image";
      const legacy = b0.includes("openapi.naver.com");
      const base = /\/image(\.json)?$/.test(b0) ? b0.replace(/\/image(\.json)?$/, "/blog$1") : legacy ? "https://openapi.naver.com/v1/search/blog.json" : "https://naverapihub.apigw.ntruss.com/search/v1/blog";
      const headers = legacy
        ? { "X-Naver-Client-Id": e.NAVER_ID, "X-Naver-Client-Secret": e.NAVER_SECRET }
        : { "X-NCP-APIGW-API-KEY-ID": e.NAVER_ID, "X-NCP-APIGW-API-KEY": e.NAVER_SECRET };
      const n = Math.min(30, o.n || 20), start = (page - 1) * n + 1;
      if (start > 1000) return [];
      let d;
      try { d = await getJson(`${base}?query=${enc(q)}&display=${n}&start=${start}&sort=sim`, headers); }
      catch (err) { if (/40[13]/.test(String(err.message))) throw new Error("블로그 검색 이용 신청이 안 된 키일 수 있어요 (NAVER API HUB 앱에 ‘검색-블로그’ 추가 필요) " + err.message); throw err; }
      return (d.items || []).filter((it) => /^https?:\/\//i.test(it.link || "")).map((it) => ({
        title: clean(it.title || ""), desc: clean(it.description || "").slice(0, 160), site: clean(it.bloggername || ""),
        thumb: it.link, full: it.link, page: it.link, w: 0, h: 0, tags: [], og: "card", // 사진은 아직 없음: 주소를 자리표시로 두고 화면이 대표 사진으로 바꿈
      }));
    },
  },
  {
    id: "pixabay", name: "Pixabay", w: 1.1, en: false, colors: true, desc: "일반 사진·일러스트 (색상 필터)", need: ["PIXABAY_KEY"],
    ok: (e) => e.PIXABAY_KEY,
    async run(q, page, safe, e, o = {}) {
      const lang = HANGUL.test(q) ? "ko" : "en";
      const d = await getJson(
        `https://pixabay.com/api/?key=${e.PIXABAY_KEY}&q=${enc(q)}&lang=${lang}&image_type=all&safesearch=${safe}&per_page=${o.n || 40}&page=${page}&order=popular` + extra("pixabay", "colors", "orientation", o),
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
        `https://api.unsplash.com/search/photos?query=${enc(q)}&page=${page}&per_page=${o.n || 30}&content_filter=${safe ? "high" : "low"}` + extra("unsplash", "color", "orientation", o),
        { Authorization: `Client-ID ${e.UNSPLASH_KEY}`, "Accept-Version": "v1" }, 1800);
      return (d.results || []).map((it) => ({
        title: clean(it.alt_description || it.description || ""), thumb: it.urls?.small, full: it.urls?.regular,
        page: it.links?.html, w: num(it.width), h: num(it.height),
        tags: (it.tags || []).map((t) => t.title).filter(Boolean),
      }));
    },
  },
  {
    // 텀블러 (20차): 태그로 모인 공개 사진 게시물. 무료 키(OAuth consumer key)가 필요하고 하루 5,000회 안팎입니다. (TUMBLR_KEY)
    // 태그 검색은 쪽 번호가 없고 시각(before)으로만 이어 받아서, 쪽마다 6시간씩 거슬러 올라가며 받습니다. 인기 태그에는 충분하고 드문 태그는 금방 끝납니다.
    id: "tumblr", name: "텀블러", w: 0.7, en: true, desc: "감성 사진 (Tumblr 태그, 영어에 강함)", need: ["TUMBLR_KEY"],
    ok: (e) => e.TUMBLR_KEY,
    async run(q, page, safe, e) {
      if (page > 20) return [];
      const before = Math.floor(Date.now() / 1000) - (page - 1) * 6 * 3600;
      const d = await getJson(`https://api.tumblr.com/v2/tagged?tag=${enc(q.slice(0, 60))}&api_key=${enc(e.TUMBLR_KEY)}&limit=20&before=${before}`, {}, 600);
      // 예전 형식은 photos, 요즘 글(NPF)은 type "blocks" 에 content/trail 안의 image 블록으로 사진이 옵니다. 둘 다 읽습니다.
      // 사진이 오는 모양이 여러 가지입니다: photos(예전 사진 글), content 의 image 블록(요즘 글), 그리고 글 본문 HTML 안의 <img>(type "text" 로 오는 글).
      const htmlImgs = (h) => [...String(h || "").matchAll(/<img\b[^>]*>/gi)].map((m) => {
        const t = m[0], src = (t.match(/\bsrc=["']([^"']+)["']/i) || [])[1] || "";
        if (!/^https?:\/\/[^/]*media\.tumblr\.com\//i.test(src)) return null; // 아바타·이모티콘 등은 제외
        const w = num((t.match(/data-orig-width=["'](\d+)/i) || [])[1] || (t.match(/\bwidth=["'](\d+)/i) || [])[1]), h2 = num((t.match(/data-orig-height=["'](\d+)/i) || [])[1] || (t.match(/\bheight=["'](\d+)/i) || [])[1]);
        return { orig: { url: src, width: w, height: h2 }, alts: [] };
      }).filter(Boolean);
      const imgs = (p) => {
        if (p.photos?.length) return p.photos.map((ph) => ({ orig: ph.original_size, alts: ph.alt_sizes || [] }));
        const blocks = [...(p.content || []), ...(p.trail || []).flatMap((t) => t.content || [])];
        const nb = blocks.filter((b) => b?.type === "image" && b.media?.length).map((b) => { const m = b.media.slice().sort((x, y) => num(y.width) - num(x.width)); return { orig: m[0], alts: m.slice(1) }; });
        if (nb.length) return nb;
        return htmlImgs([p.body, p.caption, ...(p.trail || []).map((t) => t.content_raw || t.content)].filter((x) => typeof x === "string").join(" "));
      };
      const raw = Array.isArray(d.response) ? d.response : [];
      const out = raw.map((p) => {
        const ph = p && imgs(p)[0]; if (!ph?.orig?.url) return null;
        const orig = ph.orig, alts = ph.alts.slice().sort((a, b) => num(a.width) - num(b.width));
        const mid = alts.find((s) => num(s.width) >= 500) || alts[alts.length - 1] || orig;
        const text = (p.content || []).find((b) => b?.type === "text")?.text;
        return {
          title: clean(p.summary || text || "").slice(0, 100), site: clean(p.blog_name || ""), thumb: mid?.url || orig.url, alt: alts[alts.length - 1]?.url || "", full: orig.url,
          page: p.post_url || orig.url, w: num(orig.width), h: num(orig.height), tags: (p.tags || []).map(String).filter(Boolean).slice(0, 12),
        };
      }).filter(Boolean);
      // 사진을 하나도 못 읽었으면 이유를 ⚠ 에 보여 줍니다 (응답 개수와 글 유형)
      if (page === 1 && !out.length) {
        const ty = {}; raw.forEach((p) => { const k = String(p?.type || "?"); ty[k] = (ty[k] || 0) + 1; });
        throw new Error(`응답 ${raw.length}개, 사진 0 (유형 ${Object.entries(ty).map(([k, v]) => k + ":" + v).join(",") || "없음"}; 상태 ${d.meta?.status ?? "?"} ${d.meta?.msg || ""})`.slice(0, 120));
      }
      return out;
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
  {
    // 워드프레스닷컴 (20차): 키 없이 읽을 수 있는 공개 API 의 "태그별 글" 목록입니다. 글의 대표 사진(featured image)을 씁니다.
    // 검색어를 태그 형태(소문자·띄어쓰기는 -)로 바꿔 찾고, 두 단어 이상에서 결과가 없으면 첫 단어만으로 한 번 더 찾습니다.
    // 쪽 번호가 없어서 쪽마다 하루 반(36시간)씩 거슬러 올라가며 받습니다 (before). 응답 필드 이름은 공식 문서 기준이며 실제 호출은 배포 후 확인 필요.
    id: "wpcom", name: "워드프레스", w: 0.6, en: true, desc: "블로그 사진 (WordPress.com 태그, 영어에 강함, 키 없이)",
    ok: (e) => e.BLOG !== "off" && e.WPCOM === "on", // 21차: 기본은 꺼 둠(결과가 30개 안팎). 쓰려면 변수 WPCOM=on
    async run(q, page) {
      if (page > 5) return [];
      const words = String(q).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const get = async (tag) => (await getJson(`https://public-api.wordpress.com/rest/v1.1/read/tags/${enc(tag)}/posts?number=100`, {}, 900)).posts || [];
      let posts = await get(words.slice(0, 2).join("-"));
      if (!posts.length && words.length > 1) posts = await get(words[0]);
      const sized = (u, w) => { try { const x = new URL(u); if (/(^|\.)(wordpress\.com|wp\.com)$/i.test(x.hostname)) { x.searchParams.set("w", String(w)); return x.href; } } catch { /* 그대로 씀 */ } return u; };
      // 사진 없는 글이 많아서(20개 중 10개 안팎) 한 번에 100개를 받아 사진 있는 글만 추려 20개씩 쪽으로 나눕니다. (쪽 번호 없이도 같은 결과가 안정적으로 나뉘고, 같은 주소라 캐시도 잘 맞음)
      // 대표 사진이 지정되지 않은 글도 많아서, 첨부 파일이나 본문 안의 첫 사진도 찾아 씁니다. (추적용 픽셀·이모티콘·프로필 사진은 제외)
      const BADIMG = /gravatar\.com|s\.w\.org|pixel\.wp\.com|stats\.wp\.com|\/emoji\/|\.svg(\?|$)|\/avatar/i;
      const imgOf = (p) => {
        const c = [p.featured_media?.uri, p.post_thumbnail?.URL, p.featured_image,
          ...Object.values(p.attachments || {}).filter((a) => /^image\//.test(a?.mime_type || "")).map((a) => a.URL),
          ...[...String(p.content || "").matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)].map((m) => m[1])];
        return c.find((u) => typeof u === "string" && /^https?:\/\//i.test(u) && !BADIMG.test(u)) || "";
      };
      const withImg = posts.filter((p) => p.URL && imgOf(p));
      if (page === 1 && posts.length && !withImg.length) throw new Error(`응답 ${posts.length}개 중 대표 사진이 있는 글 0개`);
      return withImg.slice((page - 1) * 20, page * 20).map((p) => {
        const img = imgOf(p);
        if (!img || !p.URL) return null;
        const tw = num(p.featured_media?.width || p.post_thumbnail?.width), th = num(p.featured_media?.height || p.post_thumbnail?.height);
        return {
          title: clean(p.title || ""), desc: clean(p.excerpt || "").slice(0, 160), site: clean(p.site_name || ""),
          thumb: sized(img, 640), alt: img, full: sized(img, 1600), page: p.URL, w: tw, h: th,
          tags: Object.keys(p.tags || {}).filter((t) => t && !/^uncategorized$/i.test(t)).slice(0, 12),
        };
      }).filter(Boolean);
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
// nc(no cache)=true 이면 번역 결과를 서버 캐시에 읽지도 쓰지도 않습니다. (비공개 모드에서 검색어가 캐시 키로 남지 않게 함)
async function translate(q, env, sl = "", nc = false) {
  if (!sl) sl = HANGUL.test(q) ? "ko" : "";
  if (!env.AI || !TR_LANGS.includes(sl)) return q;
  const key = new Request(`https://cache.local/tr?sl=${sl}&q=` + enc(q));
  try {
    if (!nc) { const hit = await caches.default.match(key); if (hit) return await hit.text(); }
    const r = await env.AI.run("@cf/meta/m2m100-1.2b", { text: q, source_lang: sl, target_lang: "en" });
    const t = String(r?.translated_text || "").trim() || q;
    if (!nc) await caches.default.put(key, new Response(t, { headers: { "cache-control": "max-age=604800" } }));
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
async function translateFull(q, env, sl = "", nc = false) {
  if (!sl) sl = HANGUL.test(q) ? "ko" : "";
  if (sl !== "ko" || !env.AI || env.TR_SMART === "off") return { t: await translate(q, env, sl, nc) };
  const key = new Request("https://cache.local/trn?q=" + enc(q));
  const [t, info] = await Promise.all([translate(q, env, sl, nc), (async () => {
    if (!nc) { try { const hit = await caches.default.match(key); if (hit) return await hit.json(); } catch { /* 캐시가 없으면 새로 물어봄 */ } }
    // 화면이 3초까지만 기다리므로 고유명사 판별도 2.5초 안에 끝내지 못하면 포기하고 기존 번역을 씁니다.
    const r = await Promise.race([nameInfo(q, env), new Promise((res) => setTimeout(() => res(null), 2500))]);
    if (r && !nc) { try { await caches.default.put(key, new Response(JSON.stringify(r), { headers: { "cache-control": "max-age=604800" } })); } catch { /* 캐시 실패는 무시 */ } }
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
// 19차: 키워드 검색어만이 아니라 "문장" 설명(피사체·장소·분위기·스타일·색)을 함께 돌려줍니다. 화면이 이 문장을 취향 판별(의미 벡터)에 씁니다.
const CAP_PROMPT = "Describe this image in one or two short sentences. Mention the main subject, the setting, the mood or style, and the main colors.";
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
  const key = new Request(`https://cache.local/cap2?h=${hash}`); // cap2: 프롬프트가 바뀐 19차 이후의 결과(문장 포함)
  try { const hit = await caches.default.match(key); if (hit) return json(await hit.json()); } catch { /* 캐시가 없으면 새로 만듭니다 */ }
  let last = "";
  for (const model of [env.CAPTION_MODEL, "@cf/unum/uform-gen2-qwen-500m", "@cf/llava-hf/llava-1.5-7b-hf"].filter(Boolean)) {
    try {
      const out = await env.AI.run(model, { image: Array.from(buf), prompt: CAP_PROMPT, max_tokens: 80 });
      const text = String(out?.description ?? out?.response ?? out?.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const body = hardBlocked(text) ? { q: "", blocked: true } : { q: capKeywords(text), text: text.slice(0, 240) };
      try { await caches.default.put(key, new Response(JSON.stringify(body), { headers: { "cache-control": "max-age=604800" } })); } catch { /* 캐시 실패는 무시 */ }
      return json(body);
    } catch (e) { last = String(e?.message || e).slice(0, 100); }
  }
  return json({ error: "unavailable", detail: last });
}

// ---------- 임베딩 (의미 유사도, 선택 기능) ----------
// 이미지의 제목·태그 같은 짧은 글을 Workers AI 다국어 임베딩(bge-m3)으로 벡터로 바꿔 돌려줍니다. 화면이 관심사를 묶고 추천 순서를 다듬는 데 씁니다.
// 한 번에 최대 60개, 한 개는 320자까지(19차: 설명 문장 포함). 결과는 길이를 줄이려고 크기 1로 맞춘 뒤 Int8 로 바꿔 base64 로 보냅니다(벡터 하나 약 1.4KB).
// 서버에는 아무것도 저장하지 않습니다. 모델은 EMBED_MODEL 로 바꿀 수 있고, 끄려면 EMBED=off.
const EMBED_MODELS = ["@cf/baai/bge-m3"];
function packVec(v) {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  const b = new Int8Array(v.length); for (let i = 0; i < v.length; i++) b[i] = Math.max(-127, Math.min(127, Math.round((v[i] / n) * 127)));
  let s = ""; for (let i = 0; i < b.length; i += 0x2000) s += String.fromCharCode(...new Uint8Array(b.buffer, i, Math.min(0x2000, b.length - i)));
  return btoa(s);
}
async function embed(req, env) {
  if (!env.AI || env.EMBED === "off") return json({ error: "unavailable" });
  if (num(req.headers.get("content-length")) > 96 * 1024) return json({ error: "size" }, 413);
  let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  // 19차: 이미지 설명 문장까지 담을 수 있게 한 개당 320자로 늘림 (한글은 글자당 3바이트라 요청 크기 한도도 함께 늘림)
  const texts = (Array.isArray(body?.texts) ? body.texts : []).slice(0, 60).map((t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, 320));
  if (!texts.length || texts.every((t) => !t)) return json({ error: "empty" }, 400);
  let last = "";
  for (const model of [env.EMBED_MODEL, ...EMBED_MODELS].filter(Boolean)) {
    try {
      // 빈 글은 모델이 거절하므로 자리만 지키는 글자로 바꿔 보내고, 결과에서는 null 로 돌려줍니다.
      const out = await env.AI.run(model, { text: texts.map((t) => t || ".") });
      const data = out?.data ?? out?.result?.data;
      if (!Array.isArray(data) || data.length !== texts.length || !Array.isArray(data[0])) { last = "shape"; continue; }
      return json({ d: data[0].length, v: data.map((v, i) => (texts[i] ? packVec(v) : null)) });
    } catch (e) { last = String(e?.message || e).slice(0, 100); }
  }
  return json({ error: "unavailable", detail: last });
}

// ---------- 트렌드: 단어 대신 이미지 ----------
// 한 쪽(page)씩 끊어서 돌려주는 무한 피드입니다. 화면이 쪽 번호를 올려 가며 이어서 받습니다.
//  g = all(전체를 번갈아 섞음) | hot(지금 인기: 네이버에서 요즘 검색이 늘어난 주제) | best(베스트: Pixabay·Unsplash 인기 사진) | pick(에디터 픽: 커먼즈 우수 사진)
//  topic = 주제 칩을 눌렀을 때: 그 주제의 이미지를 여러 검색 소스에서 가져옵니다.
const rr = (...lists) => { // 여러 목록을 번갈아 한 줄로 섞기
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
};
// 키가 등록된 사진 소스의 "베스트" 사진. 두 소스 모두 "최근 N일" 같은 기간 지정이 없어서(정렬만 popular/latest),
// 인기순(오래 사랑받은 사진)과 최신순(요즘 올라온 사진)을 섞어 최근 감각을 냅니다. n = 소스마다 한 쪽에 받을 장수
//  - Pixabay: 에디터 추천 사진의 최신순·인기순을 같은 쪽 번호로 함께 받아 최신을 앞에 번갈아 둡니다. (요청 2번, 30분 캐시)
//  - Unsplash: 무료 호출 한도(시간당 50회)가 작아서 요청은 1번만: 홀수 쪽은 최신순, 짝수 쪽은 인기순(쪽 번호는 절반으로).
const pixabayHit = (it) => ({
  title: "", thumb: it.webformatURL, full: it.largeImageURL || it.webformatURL, page: it.pageURL, w: num(it.imageWidth), h: num(it.imageHeight),
  tags: String(it.tags || "").split(",").map((t) => t.trim()).filter(Boolean), src: "pixabay", grp: "best",
});
async function popularPhotos(env, page, n) {
  const out = [];
  if (env.PIXABAY_KEY) {
    const half = Math.max(3, Math.ceil(n / 2));
    const one = (order) => getJson(`https://pixabay.com/api/?key=${env.PIXABAY_KEY}&image_type=photo&editors_choice=true&safesearch=true&order=${order}&per_page=${half}&page=${page}`, {}, 1800)
      .then((d) => (d.hits || []).map(pixabayHit)).catch(() => []);
    const [latest, popular] = await Promise.all([one("latest"), one("popular")]);
    out.push(rr(latest, popular));
  }
  if (env.UNSPLASH_KEY) {
    try {
      const order = page % 2 ? "latest" : "popular", pg = Math.ceil(page / 2);
      const d = await getJson(`https://api.unsplash.com/photos?order_by=${order}&per_page=${n}&page=${pg}`,
        { Authorization: `Client-ID ${env.UNSPLASH_KEY}`, "Accept-Version": "v1" }, 1800);
      out.push((Array.isArray(d) ? d : []).map((it) => ({
        title: clean(it.alt_description || it.description || ""), thumb: it.urls?.small, full: it.urls?.regular, page: it.links?.html,
        w: num(it.width), h: num(it.height), tags: (it.tags || []).map((t) => t.title).filter(Boolean), src: "unsplash", grp: "best",
      })));
    } catch { /* 이 소스는 건너뜀 */ }
  }
  return rr(...out);
}

// ---- 잘 찍은 사진: 위키미디어 커먼즈 "우수 사진(Featured pictures)" ----
// 커뮤니티 투표로 뽑힌 사진이라 화제성이 아니라 "품질"을 기준으로 한 목록입니다. 가장 최근에 뽑힌 사진부터 보여 주되, 날짜에 따라 시작 시기를 최근 0~4주 사이로 바꿔 매일 조금씩 다르게 보이게 하고, 쪽이 넘어갈수록 더 오래된 사진을 이어서 봅니다.
// 큰 원본은 수십 MB 일 수 있어, 폭이 크면 1600px 짜리 축소본 주소를 씁니다.
const wikiBig = (ii) => (ii.width > 1800 && ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, "/1600px-") : ii.url);
const CAT_SKIP = /featured|quality|valued|taken with|uploaded|pictures? by|photographs? by|photos? by|cc-|license|self-published|media of the day|^pd-|commons|wikimedia|^files? |^images? |by country|by year|by date|\d{4}/i;
// cur = 이전 쪽이 알려 준 이어 받기 표(없으면 첫 쪽). 반환: { items, next } — next 가 없으면 더 없음.
async function featuredPicks(day, cur, n) {
  const base = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=" + enc("Category:Featured_pictures_on_Wikimedia_Commons") +
    `&gcmtype=file&gcmsort=timestamp&gcmdir=older&gcmlimit=${n}&prop=imageinfo&iiprop=` + enc("url|size|mime|extmetadata") + "&iiurlwidth=640&iiextmetadatafilter=" + enc("ObjectName|ImageDescription|Categories");
  const start = new Date(Date.now() - (day % 5) * 7 * 86400000).toISOString().replace(/\.\d+Z$/, "Z");
  const more = cur ? `&gcmcontinue=${enc(cur)}` : "";
  let d;
  try { d = await getJson(`${base}&gcmstart=${enc(start)}${more}`, {}, 21600, 9000); } catch { d = null; }
  if (!Object.keys(d?.query?.pages || {}).length) d = await getJson(base + more, {}, 21600, 9000); // 시기 지정이 안 되면 가장 최근 것으로
  const items = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii || !ii.thumburl || !/^image\/(jpeg|png|webp)$/.test(ii.mime)) return null;
    const md = ii.extmetadata || {};
    const name = clean(md.ObjectName?.value || p.title.replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " "));
    const cats = clean(md.Categories?.value || "").split("|").map((s) => s.trim()).filter((s) => s && s.length <= 40 && !CAT_SKIP.test(s));
    return {
      title: name.slice(0, 100), thumb: ii.thumburl, full: wikiBig(ii), page: ii.descriptionurl || ii.url,
      w: num(ii.thumbwidth) || num(ii.width), h: num(ii.thumbheight) || num(ii.height), tags: cats.slice(0, 6), src: "wikimedia", grp: "pick", adult: false,
      ctx: [clean(md.ImageDescription?.value || "").slice(0, 200), cats.join(" "), p.title].join(" "),
    };
  }).filter(Boolean);
  return { items, next: String(d.continue?.gcmcontinue || "").slice(0, 300) };
}

// ---- 요즘 뜨는 주제: 네이버 데이터랩 검색어트렌드 ----
// 후보 단어(topics.js)를 4개씩 묶어(+기준 단어) 요청하고, 최근 7일 평균이 그 앞 3주 평균보다 얼마나 늘었는지로 "뜨는 주제"를 가립니다.
// 데이터랩은 비율(상대값)만 주므로 기준 단어 대비 검색량이 너무 적은 말은 뺍니다. 결과는 12시간 캐시.
// 네이버 키(NAVER_TREND_ID/SECRET, 없으면 NAVER_ID/SECRET)가 있어야 하고, API HUB 에서 "검색어트렌드" 상품을 쓸 수 있어야 합니다. 안 되면 state 가 "err" 로 와서 화면에 이유를 알립니다.
const kstDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const avg = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);
function datalabEndpoint(env) {
  if (env.NAVER_TREND_BASE) return env.NAVER_TREND_BASE;
  return (env.NAVER_BASE || "").includes("openapi.naver.com") ? "https://openapi.naver.com/v1/datalab/search" : "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";
}
async function datalabTopics(env, now) {
  // 트렌드는 별도 애플리케이션 키(NAVER_TREND_ID/SECRET)를 먼저 쓰고, 없으면 이미지 검색 키(NAVER_ID/SECRET)를 씁니다.
  const tid = env.NAVER_TREND_ID || env.NAVER_ID, tsec = env.NAVER_TREND_SECRET || env.NAVER_SECRET;
  if (!(tid && tsec) || env.TREND_TOPICS === "off") return { state: "off", list: [] };
  const key = new Request(`https://cache.local/dl3?h=${Math.floor(now / 43200000)}`);
  try { const hit = await caches.default.match(key); if (hit) return await hit.json(); } catch { /* 캐시가 없으면 새로 물어봄 */ }
  const url = datalabEndpoint(env), legacy = url.includes("openapi.naver.com");
  const headers = { "content-type": "application/json", "user-agent": UA, ...(legacy ? { "X-Naver-Client-Id": tid, "X-Naver-Client-Secret": tsec } : { "X-NCP-APIGW-API-KEY-ID": tid, "X-NCP-APIGW-API-KEY": tsec }) };
  const startDate = kstDate(now - 28 * 86400000), endDate = kstDate(now - 86400000);
  const chunks = []; for (let i = 0; i < TOPIC_POOL.length; i += 4) chunks.push(TOPIC_POOL.slice(i, i + 4));
  const rs = await Promise.allSettled(chunks.map(async (c) => {
    let r;
    try {
      r = await fetch(url, { method: "POST", headers, signal: AbortSignal.timeout(7000),
        body: JSON.stringify({ startDate, endDate, timeUnit: "date", keywordGroups: [ANCHOR, ...c].map((g) => ({ groupName: g, keywords: [g] })) }) });
    } catch (e) { throw fail(e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network", String(e?.message || e)); }
    if (!r.ok) throw fail(reasonOfStatus(r.status), `HTTP ${r.status}`, r.status);
    let j; try { j = await r.json(); } catch { throw fail("badjson"); }
    return j.results || [];
  }));
  const rows = [];
  for (const r of rs) {
    if (r.status !== "fulfilled") continue;
    const res = r.value, a = res.find((x) => x.title === ANCHOR), aRecent = a ? avg((a.data || []).slice(-7).map((d) => +d.ratio || 0)) : 0;
    for (const x of res) {
      if (x.title === ANCHOR) continue;
      const arr = (x.data || []).map((d) => +d.ratio || 0); if (arr.length < 14) continue;
      const recent = avg(arr.slice(-7)), prev = avg(arr.slice(0, -7));
      rows.push({ label: x.title, q: x.title, vol: aRecent ? recent / aRecent : recent, growth: prev > 0.05 ? recent / prev - 1 : 0, prev });
    }
  }
  let out;
  if (!rows.length) {
    const e = rs.find((r) => r.status === "rejected")?.reason;
    out = { state: "err", why: e?.code || "error", status: e?.status || 0, list: [] };
    try { await caches.default.put(key, new Response(JSON.stringify(out), { headers: { "cache-control": "max-age=1800" } })); } catch { /* 캐시 실패는 무시 */ }
    return out;
  }
  const ok = rows.filter((x) => !hardBlocked(x.label) && !isAdult(x.label) && !offTopic(x.label, x.q));
  const rising = ok.filter((x) => x.vol >= 0.02 && x.growth >= 0.15).sort((a, b) => b.growth - a.growth).slice(0, 8)
    .map((x) => ({ label: x.label, q: x.q, kind: "rising" }));
  const hot = ok.filter((x) => !rising.some((r) => r.q === x.q)).sort((a, b) => b.vol - a.vol).slice(0, Math.max(0, 6 - rising.length))
    .map((x) => ({ label: x.label, q: x.q, kind: "hot" }));
  out = { state: "ok", list: [...rising, ...hot] };
  try { await caches.default.put(key, new Response(JSON.stringify(out), { headers: { "cache-control": "max-age=43200" } })); } catch { /* 캐시 실패는 무시 */ }
  return out;
}


// ---- 실제 인기 검색어: 구글 트렌드(한국) 일일 인기 검색어 RSS ----
// 40개 후보를 직접 정하는 대신, 지금 사람들이 실제로 많이 찾는 말을 가져옵니다. 다만 인기 검색어는 연예인·경기 결과·사건 소식이 많아서
//  1) 사건·사고·정치·경기 결과·연예인·가십 같은 뉴스 제목이 붙은 말은 걸러내고(NEWSY), 인물 이름 자체는 한국어 위키백과 분류로 한 번 더 걸러(personLabels),
//  3) Workers AI 가 있으면 "이미지로 볼 만한 말"(장소·음식·동물·자연·행사·물건·취미)만 한 번 더 고릅니다.
// 최근 7일 누적: 하루짜리 소음을 줄이려고 날짜별 목록을 쌓아 두고(아래 histRead/histWrite, 합치는 규칙은 history.js) 여러 날 등장한 말을 앞에 둡니다.
// 1시간 캐시. 못 가져오면(차단·형식 변경) 지난 며칠 기록으로 채우고, 그것도 없으면 빈 목록을 주어 화면이 기존 방식(데이터랩·계절 주제)으로 채웁니다.
const NEWSY = new RegExp([
  // 사건·사고·재난 ("사고력", "폭발적 인기" 같은 평범한 말은 걸리지 않게 뒤를 확인)
  "사망|숨져|숨진|사고(?!력|방식|팔)|체포|구속|실종|화재|폭행|살인|총격|테러|폭발(?!적)|붕괴|추락|침몰|산불|지진|확진|감염",
  // 수사·재판
  "검찰|경찰|재판|판결|기소|영장|피의자|용의자|피해자|혐의|압수수색|특검",
  // 정치 ("국회의사당 벚꽃", "단풍 장관" 같은 풍경은 남김)
  "정치|선거|대통령|국회(?!의사당)|정당(?!한|성|화|방위)|여당|야당|[가-힣]부\\s?장관|장관\\s?(?:후보|임명|지명|사퇴)|총리|탄핵|계엄|청문회|국정감사",
  // 전쟁
  "전쟁|미사일|파병",
  // 연예·가십·논란 (인물 소식이 붙은 말은 뺌. "가수원동"·"감독관"·"선수촌" 같은 말은 남김)
  "배우|가수(?!원)|아이돌|감독(?!관)|선수(?!촌)|논란|이혼|열애|결별|불륜|사과(?:했|문|하며|하는|하고)|공식\\s?사과|사과\\s?요구",
  // 경기 결과 ("경기도", "경기장"은 남김)
  "패배|우승|득점|홈런|연승|연패|결승|승리|경기(?![도장])",
  // 금융
  "주가|환율|코스피|금리|폭락|급등",
].join("|"));
function parseGoogleTrends(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1], t = clean((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    if (!t || t.length > 30) continue;
    const news = [...b.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)].map((x) => clean(x[1]).replace(/<!\[CDATA\[|\]\]>/g, "")).slice(0, 3);
    const tr = parseInt(((b.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1] || "0").replace(/[^0-9]/g, ""), 10) || 0;
    out.push({ label: t, q: t, news, traffic: tr });
  }
  return out;
}
async function aiPickVisual(env, rows) {
  if (!env.AI || env.TREND_AI === "off" || !rows.length) return null;
  const list = rows.map((r, i) => `${i}: ${r.label}${r.news[0] ? " (" + r.news[0].slice(0, 40) + ")" : ""}`).join("\n");
  const sys = "You pick trending Korean search keywords that people would enjoy browsing as PICTURES: places, travel, food, drinks, animals, plants, nature, weather, seasonal events and holidays, products, fashion items, interiors, hobbies, art and design. " +
    "Exclude: names of people (celebrities, actors, comedians, singers, idols, athletes, politicians), sports match results, crime, accidents, politics, finance, lawsuits, gossip, anything violent or sexual. " +
    "Treat any keyword that looks like a personal name (a surname plus given name, 2-4 Hangul syllables, not an ordinary word) as a person even if you do not recognize it, and exclude it. " +
    'Reply with ONLY a JSON array of the chosen numbers, e.g. [0,3,7]. If none fit, reply [].';
  for (const model of [env.TR_MODEL, "@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.2-3b-instruct"].filter(Boolean)) {
    try {
      const out = await env.AI.run(model, { messages: [{ role: "system", content: sys }, { role: "user", content: list }], max_tokens: 80, temperature: 0 });
      const m = String(out?.response ?? out?.result?.response ?? "").match(/\[[\d,\s]*\]/);
      if (!m) continue;
      const ids = JSON.parse(m[0]).filter((n) => Number.isInteger(n) && n >= 0 && n < rows.length);
      return ids.map((i) => rows[i]);
    } catch { /* 다음 모델을 시도 */ }
  }
  return null;
}
// 인물 이름 거르기: 키워드가 한국어 위키백과에서 사람 문서(살아 있는 사람·○○년 출생·배우·가수 등 분류)이면 뺍니다.
// 규칙(NEWSY)·AI 가 놓치는 이름(예: 원로 연예인)을 잡는 용도이고, 한 번에 최대 50개를 묶어 한 번만 묻습니다. 못 가져오면(차단·오류) 그대로 둡니다.
const PERSON_CAT = /살아\s?있는\s?사람|\d{4}년\s?(?:출생|사망)|배우|가수|코미디언|개그맨|방송인|연예인|탤런트|성우|아이돌|래퍼|정치인|선수|감독/;
async function personLabels(labels) {
  const out = new Set(); const list = [...new Set(labels)].slice(0, 50);
  if (!list.length) return out;
  try {
    const d = await getJson(`https://ko.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=categories&cllimit=500&titles=${enc(list.join("|"))}`, {}, 3600, 5000);
    const q = d?.query || {}, map = new Map(list.map((l) => [l, l]));
    for (const n of q.normalized || []) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
    for (const r of q.redirects || []) for (const [k, v] of map) if (v === r.from) map.set(k, r.to);
    const isPerson = new Set();
    for (const p of Object.values(q.pages || {})) if ((p.categories || []).some((c) => PERSON_CAT.test(String(c.title || "")))) isPerson.add(p.title);
    for (const [k, v] of map) if (isPerson.has(v)) out.add(k);
  } catch { /* 위키를 못 가져오면 건너뜀 */ }
  return out;
}
// ---- 최근 7일 누적 저장소: 날짜(KST)별로 그날 본 인기 검색어 목록을 보관합니다 ----
// env.TREND_KV (Cloudflare KV 바인딩)가 있으면 거기에, 없으면 Cloudflare 캐시(8~9일, 데이터센터별 best-effort)에 둡니다.
// 둘 다 실패해도 오늘 목록만으로 동작합니다. 사용자 기록이 아니라 구글 공개 인기 검색어 목록만 저장합니다.
const histReq = (d) => new Request(`https://cache.local/gth?d=${d}`);
async function histRead(env, d) {
  try {
    if (env.TREND_KV) { const v = await env.TREND_KV.get(`gt:${d}`, "json"); return Array.isArray(v) ? v : []; }
    const hit = await caches.default.match(histReq(d));
    const v = hit ? await hit.json() : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
async function histWrite(env, d, rows) {
  try {
    const body = JSON.stringify(rows);
    if (env.TREND_KV) await env.TREND_KV.put(`gt:${d}`, body, { expirationTtl: 9 * 86400 });
    else await caches.default.put(histReq(d), new Response(body, { headers: { "cache-control": "max-age=777600" } }));
  } catch { /* 저장 실패는 무시 */ }
}
async function realTrends(env, now) {
  if (env.REAL_TRENDS === "off") return [];
  const key = new Request(`https://cache.local/gt2?h=${Math.floor(now / 3600000)}`);
  try { const hit = await caches.default.match(key); if (hit) return await hit.json(); } catch { /* 캐시가 없으면 새로 가져옴 */ }
  let fresh = [];
  try {
    const r = await fetch(env.REAL_TRENDS_URL || "https://trends.google.com/trending/rss?geo=KR", { headers: { "user-agent": UA, accept: "application/rss+xml,text/xml,*/*" }, signal: AbortSignal.timeout(6000) });
    if (r.ok) fresh = parseGoogleTrends(await r.text());
  } catch { /* 네트워크 오류는 빈 목록 */ }
  // 오늘 목록은 저장분에 합쳐 두고, 지난 6일치를 불러와 "여러 날 등장한 말"을 앞에 둡니다. 오늘 못 받아도 지난 며칠 기록으로 채울 수 있습니다.
  const today = kstDate(now);
  let todayRows = await histRead(env, today);
  if (fresh.length) { todayRows = mergeToday(todayRows, fresh); await histWrite(env, today, todayRows); }
  const past = await Promise.all(Array.from({ length: HIST_DAYS - 1 }, (_, i) => histRead(env, kstDate(now - (i + 1) * 86400000))));
  let list = mergeHistory([todayRows, ...past]);
  list = list.filter((x) => !hardBlocked(x.label) && !isAdult(x.label) && !isExplicit(x.label) && !offTopic(x.label, ...x.news) && !NEWSY.test(x.news.join(" ")) && !NEWSY.test(x.label));
  const people = await personLabels(list.slice(0, 30).map((x) => x.label));
  list = list.filter((x) => !people.has(x.label));
  const picked = await aiPickVisual(env, list.slice(0, 30));
  const out = (picked || list).slice(0, 12).map((x) => ({ label: x.label, q: x.q, kind: "live" }));
  try { await caches.default.put(key, new Response(JSON.stringify(out), { headers: { "cache-control": `max-age=${out.length ? 3600 : 600}` } })); } catch { /* 캐시 실패는 무시 */ }
  return out;
}

// ---- 지금 인기: 데이터랩이 가려낸 주제(‘뜨는’ 것 우선) 몇 개로 네이버 이미지를 쪽 단위로 찾아 grp "hot" 으로 돌려줍니다 ----
// 네이버 이미지 검색은 이미 등록한 키를 그대로 쓰고, 주제는 앞의 4개만 씁니다. 주제마다 n 장씩, 쪽 번호만큼 뒤로 이어서 받습니다. (결과는 Cloudflare 가 캐시)
async function hotPhotos(env, topics, page, n) {
  const naver = SOURCES.find((s) => s.id === "naver");
  if (!naver?.ok(env) || !topics.length) return [];
  const picked = topics.slice(0, 4);
  const rs = await Promise.allSettled(picked.map((t) => naver.run(t.q, page, 1, env, { n })));
  return rr(...rs.map((r, i) => (r.status === "fulfilled" ? r.value.map((it) => ({ ...it, src: "naver", grp: "hot", topic: picked[i].label })) : [])));
}
// ---- 주제 칩을 눌렀을 때: 그 주제의 이미지를 한국·해외 소스에서 함께 가져옵니다 (grp "hot", 주제 이름표는 화면이 가림) ----
async function topicPhotos(env, q, page, n) {
  const ids = ["naver", "kakao", "pixabay", "unsplash"], need = Math.max(4, Math.ceil(n / 3));
  const en = SOURCES.some((s) => s.id === "unsplash" && s.ok(env)) && HANGUL.test(q) ? await translate(q, env) : q; // 영어 검색이 나은 소스(Unsplash)에는 번역한 말을 씁니다
  const rs = await Promise.allSettled(SOURCES.filter((s) => ids.includes(s.id) && s.ok(env)).map((s) => s.run(s.en ? en : q, page, 1, env, { n: need }).then((l) => l.map((it) => ({ ...it, src: s.id, grp: "hot", topic: q })))));
  return rr(...rs.map((r) => (r.status === "fulfilled" ? r.value : [])));
}

// ---- 내 취향: 화면이 알려 준 내 주제어 여러 개를 한꺼번에 찾아 번갈아 섞습니다 (한 주제어만 반복해서 보이지 않게) ----
// 주제어는 요청 주소로만 오고 서버에 저장하지 않습니다.
async function minePhotos(env, topics, page, n) {
  const per = Math.max(3, Math.ceil(n / Math.max(1, topics.length)));
  const rs = await Promise.allSettled(topics.map((t) => topicPhotos(env, t, page, per * 3).then((l) => l.slice(0, per + 2).map((it) => ({ ...it, topic: t })))));
  return rr(...rs.map((r) => (r.status === "fulfilled" ? r.value : [])));
}
const cleanTopics = (v) => [...new Set(String(v || "").split(",").map((x) => x.trim().slice(0, 40)).filter(Boolean))]
  .filter((t) => !(hardBlocked(t) || isAdult(t) || isExplicit(t) || offTopic(t))).slice(0, 6);

// 한 쪽에 몇 장씩 받을지: all 은 세 갈래를 번갈아 섞어 약 40장, 한 갈래만 보면 그 갈래를 넉넉히
const TR_N = { all: { hot: 4, best: 7, pick: 12, mine: 10 }, mine: { mine: 30 }, hot: { hot: 12, best: 0, pick: 0 }, best: { hot: 0, best: 20, pick: 0 }, pick: { hot: 0, best: 0, pick: 40 } };

async function trends(env, u) {
  const now = Date.now(), day = Math.floor(now / 86400000);
  const g = ["all", "mine", "hot", "best", "pick"].includes(u.searchParams.get("g")) ? u.searchParams.get("g") : "all";
  const page = clampInt(u.searchParams.get("page"), 1, 40, 1);
  const topic = (u.searchParams.get("topic") || "").trim().slice(0, 60);
  const pc = (u.searchParams.get("pc") || "").slice(0, 300); // 에디터 픽의 이어 받기 표
  const N = TR_N[g], mineT = cleanTopics(u.searchParams.get("mine"));
  // 주제 칩은 첫 쪽(과 지금 인기)에서만 필요합니다. 데이터랩 결과는 12시간 캐시되어 있어 부담이 작습니다.
  const needDl = !topic && g !== "mine" && (page === 1 || g === "all" || g === "hot");
  const dlP = needDl ? Promise.all([
    datalabTopics(env, now).catch((e) => ({ state: "err", why: e?.code || "error", list: [] })),
    realTrends(env, now).catch(() => []),
  ]).then(([d, live]) => ({ ...d, live, state: live.length ? "ok" : d.state, list: [...live, ...(d.list || []).filter((x) => !live.some((l) => l.q === x.q))] })) : Promise.resolve({ state: "skip", list: [], live: [] });
  let pickNext = "";
  const topicOk = !topic || !(hardBlocked(topic) || isAdult(topic) || isExplicit(topic) || offTopic(topic));
  const [dl, hot, best, pick, mine] = await Promise.all([
    dlP,
    !topicOk ? [] : topic ? topicPhotos(env, topic, page, 36).catch(() => []) : N.hot ? dlP.then((d) => hotPhotos(env, d.list || [], page, N.hot)).catch(() => []) : [],
    !topic && N.best ? popularPhotos(env, page, N.best).catch(() => []) : [],
    !topic && N.pick && (page === 1 || pc) ? featuredPicks(day, pc, N.pick).then((r) => { pickNext = r.next; return r.items; }).catch(() => []) : [],
    !topic && N.mine && mineT.length ? minePhotos(env, mineT, page, N.mine).catch(() => []) : [],
  ]);
  const seen = new Set();
  // 트렌드는 훑어 올리다 놀라지 않게 더 엄격하게 거릅니다.
  //  - 성행위·성기 표현이 제목·태그·짧은 설명·파일 이름에 있으면 미술·역사 자료라도 뺍니다.
  //  - 나체 표현은 미술·역사 맥락(조각·그림·유물 등)이 있으면 남기되 블러, 맥락이 없으면 뺍니다.
  //  - 할로윈·다른 종교의 행사·상징 같은 기독교 세계관에 맞지 않는 주제는 뺍니다. (topics.js 의 OFF_TOPIC)
  const verdict = (it) => {
    const t = `${it.title} ${it.tags.join(" ")} ${it.ctx || ""}`;
    if (hardBlocked(t) || isExplicit(t) || offTopic(it.title, it.tags.join(" "))) return "drop";
    if (isNude(t)) return hasArtContext(t) ? "blur" : "drop";
    return isAdult(t) ? "blur" : "ok";
  };
  const raw = rr(hot, best, pick, mine);
  const items = raw
    .filter((it) => it.thumb && it.full)
    .map((it) => ({ it, v: verdict(it) })).filter((x) => x.v !== "drop")
    .map(({ it, v }) => { const { ctx, ...rest } = it; return { ...rest, tags: it.tags || [], thumb: https(it.thumb), full: https(it.full), alt: it.alt ? https(it.alt) : "", page: https(it.page || it.full), adult: it.adult || v === "blur" }; })
    .filter((it) => (seen.has(it.thumb) ? false : seen.add(it.thumb)));
  // 주제 칩: 다가오는 행사·계절 주제와 요즘 뜨는 주제를 번갈아 섞어 이름만 돌려줍니다. (퍼센트·순위·날짜는 화면에 필요 없음)
  const topics = [];
  if (!topic && page === 1) {
    const tp = new Set();
    const src = g === "mine" ? [mineT.map((t) => ({ label: t, q: t, kind: "mine" }))]
      : [(dl.live || []).map((x) => ({ label: x.label, q: x.q, kind: "live" })), seasonTopics(now).map((s) => ({ label: s.label, q: s.q, kind: "season" })), (dl.list || []).filter((x) => x.kind !== "live").map((x) => ({ label: x.label || x.q, q: x.q, kind: "rising" }))];
    for (const x of rr(...src)) if (!tp.has(x.q)) { tp.add(x.q); topics.push(x); }
  }
  // 사진이 하나도 없어도 주제는 보여 줄 수 있으므로 502 가 아니라 빈 목록으로 응답합니다.
  // more: 다음 쪽을 더 받아 볼 만한지. 원본이 비었거나 쪽이 너무 깊으면 끝입니다. (걸러져서 비었을 뿐이면 계속 이어 받음)
  return json({ items, topics, more: raw.length > 0 && page < 40, pc: pickNext, dl: { state: dl.state, why: dl.why || "", status: dl.status || 0 } });
}
const clampInt = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

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

// ---------- 글 페이지의 대표 사진 (og:image) ----------
// 블로그 글은 검색 응답의 사진이 아주 작거나(카카오 130px) 아예 없어서(네이버), 글 페이지의 <meta property="og:image"> 를 찾아 씁니다.
// 서버가 남의 페이지를 열어 보는 기능이라 주소를 엄격히 검사합니다: https 만, 내부 주소(localhost·IP 등) 거부, 리다이렉트는 직접 따라가며 매번 다시 검사, 앞부분 160KB 까지만 읽음.
const OG_MAX = 160 * 1024;
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
// 네이버 블로그 PC 주소(blog.naver.com/아이디/글번호)는 틀(frame) 페이지라 대표 사진 정보가 있는 모바일 주소로 바꿔 요청합니다.
function ogTarget(t) {
  if (/^blog\.naver\.com$/i.test(t.hostname)) { const x = new URL(t.href); x.hostname = "m.blog.naver.com"; return x; }
  return t;
}
function findOg(html, base) {
  const metas = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const want of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    for (const m of metas) {
      const key = (/(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(m) || [])[1];
      if (!key || key.toLowerCase() !== want) continue;
      const c = (/content\s*=\s*["']([^"']+)["']/i.exec(m) || [])[1];
      if (!c) continue;
      try { const u = new URL(c.replace(/&amp;/g, "&"), base); if (/^https?:$/.test(u.protocol)) { u.protocol = "https:"; return u.href; } } catch { /* 다음 후보 */ }
    }
  }
  return "";
}
async function ogImage(u) {
  let t;
  try { t = new URL(u.searchParams.get("u") || ""); } catch { return json({ error: "bad url" }, 400); }
  if (!/^https?:$/.test(t.protocol)) return json({ error: "blocked" }, 400);
  t.protocol = "https:";
  let cur = ogTarget(t), r;
  try {
    for (let i = 0; i < 4; i++) {
      if (blockedHost(cur.hostname)) return json({ error: "blocked" }, 400);
      r = await fetch(cur.href, {
        headers: { "user-agent": /naver\.com$/i.test(cur.hostname) ? MOBILE_UA : UA, accept: "text/html,application/xhtml+xml" },
        redirect: "manual", signal: AbortSignal.timeout(6000),
        cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "300-599": 0 } },
      });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : "";
      if (!loc) break;
      cur = new URL(loc, cur); cur.protocol = "https:";
      r = null;
    }
  } catch { return json({ img: "", err: "fetch failed" }); }
  if (!r) return json({ img: "", err: "too many redirects" });
  if (!r.ok) return json({ img: "", err: "page " + r.status });
  if (!/html/i.test(r.headers.get("content-type") || "")) return json({ img: "", err: "not html" });
  let html = "", n = 0;
  try {
    const rd = r.body.getReader(), dec = new TextDecoder();
    while (n < OG_MAX) {
      const { done, value } = await rd.read(); if (done) break;
      n += value.length; html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    try { await rd.cancel(); } catch { /* 이미 닫힘 */ }
  } catch { /* 읽은 만큼만 씁니다 */ }
  const img = findOg(html, cur.href);
  return json(img && !blockedHost(new URL(img).hostname) ? { img } : { img: "", err: "no og:image" });
}

// ---------- 라우터 ----------
export default {
  // 선택: wrangler.toml 의 [triggers] 크론을 켜면 앱을 안 열어도 하루 한 번 인기 검색어를 쌓아 둡니다. (TREND_KV 가 있을 때 가장 확실)
  async scheduled(_event, env, ctx) { ctx.waitUntil(realTrends(env, Date.now()).catch(() => {})); },
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
        embed: !!env.AI && env.EMBED !== "off",
      });
    }

    if (u.pathname === "/api/caption" && req.method === "POST") return caption(req, env);
    if (u.pathname === "/api/embed" && req.method === "POST") return embed(req, env);

    if (u.pathname === "/api/tr") {
      const q = (u.searchParams.get("q") || "").trim().slice(0, 100);
      return json(await translateFull(q, env, u.searchParams.get("sl") || "", u.searchParams.get("nc") === "1"));
    }

    if (u.pathname === "/api/img") return proxyImage(u);
    if (u.pathname === "/api/og") return ogImage(u);

    if (u.pathname === "/api/trends") return trends(env, u);

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
        .filter((it) => it.thumb && it.full && !hardBlocked(textOf(it)))
        .map((it) => ({ ...it, thumb: https(it.thumb), full: https(it.full), alt: it.alt ? https(it.alt) : "", page: https(it.page || it.full), src: src.id, sc, adult: isAdult(textOf(it)) }));
      return json({ items });
    }

    return json({ error: "not found" }, 404);
  },
};
