import worker from "../src/index.js";
const ROOT = new URL("../", import.meta.url).pathname; 
import { hardBlocked, isAdult } from "../src/filters.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const calls = [];
const jres = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
// 에디터 픽(커먼즈 우수 사진) 한 장 만들기
const fp = (id, name, cats, desc, w = 3000) => ({ index: id, title: `File:${name}.jpg`, imageinfo: [{ thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/640px-${name}.jpg`, thumbwidth: 640, thumbheight: 427, url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}.jpg`, width: w, height: Math.round(w * 0.67), mime: "image/jpeg", descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
  extmetadata: { ObjectName: { value: name.replace(/_/g, " ") }, ImageDescription: { value: desc }, Categories: { value: cats } } }] });
let pickPages = null; // 커먼즈가 돌려줄 목록 (테스트마다 바꿈)
const defaultPicks = () => ({
  11: fp(2, "Sunset_over_Jeju", "Featured pictures of South Korea|Sunsets in Jeju|Taken with Canon EOS|Quality images|Jeju Island", "A calm sunset over the sea", 4000),
  12: fp(1, "Old_town_street", "Featured pictures of Spain|Streets in Spain|2019 in Spain", "Narrow street", 1500),
  13: fp(3, "Venus_de_Milo_front", "Featured pictures of sculptures|Nude statues", "Ancient marble statue", 3000),
  14: fp(4, "Explicit_shunga_print", "Featured pictures|Shunga", "Edo period erotic woodblock print"),
  15: { index: 5, title: "File:Doc.pdf", imageinfo: [{ thumburl: "https://upload.wikimedia.org/x.png", mime: "application/pdf" }] },
});
pickPages = defaultPicks();
let fpStart = true;
globalThis.fetch = async (url) => {
  const u = String(url); calls.push(u);
  if (u.includes("commons.wikimedia.org") && u.includes("Featured_pictures")) {
    if (u.includes("gcmstart") && !fpStart) return new Response("bad", { status: 400 });
    return jres({ query: { pages: pickPages }, continue: { gcmcontinue: "file|ABC|123", continue: "gcmcontinue||" } });
  }
  if (u.startsWith("https://pixabay.com/api/")) return jres({ hits: [
    { webformatURL: "https://pixabay.com/p1.jpg", largeImageURL: "https://pixabay.com/p1L.jpg", pageURL: "https://pixabay.com/1", imageWidth: 800, imageHeight: 600, tags: "sea, sky" },
    { webformatURL: "https://pixabay.com/p2.jpg", largeImageURL: "https://pixabay.com/p2L.jpg", pageURL: "https://pixabay.com/2", imageWidth: 600, imageHeight: 800, tags: "gore, blood" } ] });
  if (u.startsWith("https://api.unsplash.com/photos?")) return jres([{ urls: { small: "https://images.unsplash.com/u1s", regular: "https://images.unsplash.com/u1r" }, links: { html: "https://unsplash.com/u1" }, width: 400, height: 500, alt_description: "a calm lake", tags: [{ title: "lake" }] }]);
  if (u.startsWith("https://api.unsplash.com/search/photos")) return jres({ results: [{ urls: { small: "https://images.unsplash.com/s1s", regular: "https://images.unsplash.com/s1r" }, links: { html: "https://unsplash.com/s1" }, width: 400, height: 500, alt_description: "cherry blossom", tags: [] }] });
  if (u.startsWith("https://dapi.kakao.com/v2/search/image")) return jres({ documents: [{ image_url: "https://blog.test/k1.jpg", thumbnail_url: "https://t.kakao.test/k1.jpg", display_sitename: "카카오 블로그", width: 800, height: 600, doc_url: "https://blog.test/k1" }] });
  return new Response("nf", { status: 404 });
};
const req = (path, pass = "pw") => new Request("https://x.test" + path, { headers: { "x-pass": pass } });
const env = { PASS: "pw", ASSETS: { fetch: () => new Response("a") } };
const urlsOf = (re) => calls.filter((c) => re.test(c));

// ---- 트렌드(1): 키 없이도 동작, 쪽 단위 응답 ----
let r = await worker.fetch(req("/api/trends", "bad"), env); ok(r.status === 401, "trends requires password");
r = await worker.fetch(req("/api/trends"), env); let j = await r.json();
ok(r.status === 200 && j.items.length >= 2 && j.items.every((i) => i.grp === "pick" && i.src === "wikimedia"), `no keys: only editor picks (${j.items.length})`);
ok(j.more === true && j.pc === "file|ABC|123", "response tells there is a next page and the editor-pick cursor: " + j.pc);
ok(!j.items.some((i) => /Explicit shunga/.test(i.title)) && !j.items.some((i) => /Doc/.test(i.title)), "explicit print and non-image mime dropped");
ok(j.items.every((i) => i.thumb.startsWith("https://") && !("ctx" in i)), "https thumbs, no internal ctx sent to the browser");
ok(Array.isArray(j.topics) && j.topics.length > 0 && j.topics.every((t) => t.label && t.q && ["season", "rising"].includes(t.kind) && !("note" in t) && !("days" in t)), "topic chips are names only (no %, no D-day): " + j.topics.map((t) => t.label).join(","));
ok(j.dl.state === "off", "datalab off without naver key");
ok(!("rising" in j) && !("season" in j) && !("date" in j), "old fields (rising / season / date / wiki news) are gone");

// 키가 있으면 베스트(Pixabay·Unsplash): 쪽 번호와 장수가 요청에 실림
calls.length = 0;
r = await worker.fetch(req("/api/trends?g=best&page=2"), { ...env, PIXABAY_KEY: "k1", UNSPLASH_KEY: "k2" }); j = await r.json();
const pops = j.items.filter((i) => i.grp === "best");
ok(pops.length === 2 && pops.some((i) => i.src === "pixabay") && pops.some((i) => i.src === "unsplash") && j.items.length === 2, "best: photos from pixabay + unsplash only: " + pops.map((p) => p.src));
ok(!pops.some((i) => i.tags.includes("gore")), "hard-blocked tags dropped from best");
const pxc = urlsOf(/pixabay\.com\/api\/.*editors_choice/);
ok(pxc.length === 2 && pxc.some((c) => /order=latest/.test(c)) && pxc.some((c) => /order=popular/.test(c)) && pxc.every((c) => /per_page=10&page=2/.test(c)), "best page 2: pixabay asks latest + popular (10 each) from page 2: " + pxc.length);
ok(urlsOf(/api\.unsplash\.com\/photos\?/).length === 1 && urlsOf(/api\.unsplash\.com\/photos\?/).every((c) => /order_by=popular&per_page=20&page=1/.test(c)), "best page 2: unsplash makes ONE request (even page = popular, its page 1)");
ok(!calls.some((c) => c.includes("commons.wikimedia.org")), "best-only view does not touch commons");
calls.length = 0;
r = await worker.fetch(req("/api/trends?page=1"), { ...env, PIXABAY_KEY: "k1", UNSPLASH_KEY: "k2" }); j = await r.json();
ok(urlsOf(/pixabay\.com\/api\//).length === 2 && urlsOf(/pixabay\.com\/api\//).every((c) => /per_page=4&page=1/.test(c)), "all view asks only a few (4+4 latest/popular) from pixabay");
ok(urlsOf(/api\.unsplash\.com\/photos\?/).length === 1 && urlsOf(/api\.unsplash\.com\/photos\?/).every((c) => /order_by=latest&per_page=7&page=1/.test(c)), "all view: unsplash odd page asks latest, one request");
ok(j.items.slice(0, 3).map((i) => i.grp).join() === "best,pick,best", "all view mixes best and pick: " + j.items.slice(0, 6).map((i) => i.grp));
// 에디터 픽 이어 받기: 표를 되돌려 주면 같은 목록의 다음 쪽을 요청
calls.length = 0;
r = await worker.fetch(req("/api/trends?g=pick&page=2&pc=" + encodeURIComponent("file|ABC|123")), env); j = await r.json();
ok(urlsOf(/Featured_pictures/).some((c) => c.includes("gcmcontinue=" + encodeURIComponent("file|ABC|123"))), "editor pick page 2 continues from the cursor");
r = await worker.fetch(req("/api/trends?g=pick&page=2"), env); j = await r.json();
ok(j.items.length === 0 && j.more === false, "editor pick page 2 without a cursor = nothing more");

// 선정성: 성행위·성기는 아예 제외, 나체는 미술·역사 맥락이면 블러로 남기고 아니면 제외
{
  pickPages = { 1: fp(1, "David_statue", "Sculptures|Nude statues", "Renaissance nude marble sculpture"),
    2: fp(2, "Khajuraho_erotic_sculpture_couple", "Temples in India", "Hindu temple ruins"),
    3: fp(3, "photo_naked_model", "Photography", "A studio photo"),
    4: fp(4, "Oral-B_toothbrush", "Brands", "Toothbrush brand"),
    5: fp(5, "Seoul_night", "Seoul", "City view at night") };
  r = await worker.fetch(req("/api/trends?g=pick"), env); j = await r.json();
  const byT = Object.fromEntries(j.items.map((i) => [i.title, i]));
  ok(!byT["Khajuraho erotic sculpture couple"], "explicit word in the file name -> dropped even for heritage sculpture");
  ok(!byT["photo naked model"], "nudity without art context -> dropped");
  ok(byT["David statue"] && byT["David statue"].adult === true, "nude marble sculpture (art context) stays, but blurred");
  ok(byT["Oral-B toothbrush"] && byT["Seoul night"] && !byT["Oral-B toothbrush"].adult && !byT["Seoul night"].adult, "ordinary pictures are not caught or blurred");
  pickPages = {
    1: fp(1, "Halloween_pumpkins", "Autumn", "Jack-o-lantern"), 2: fp(2, "Ramadan_lanterns", "Islam", "Ramadan night"), 3: fp(3, "Mount_Fuji", "Japan", "Mountain"), 4: fp(4, "Buddhism_temple", "Temples", "Buddhism") };
  r = await worker.fetch(req("/api/trends?g=pick"), env); j = await r.json();
  ok(j.items.map((i) => i.title).join() === "Mount Fuji", "Halloween / Ramadan / Buddhism pictures dropped: " + j.items.map((i) => i.title));
  pickPages = defaultPicks();
}

// 모든 소스 실패 → 사진은 비어 있지만 기념일·계절 주제는 외부 호출 없이 계속 보여 줌
const saved = globalThis.fetch; globalThis.fetch = async () => new Response("x", { status: 500 });
r = await worker.fetch(req("/api/trends"), env); j = await r.json();
ok(r.status === 200 && j.items.length === 0 && j.more === false && j.topics.length > 0 && j.dl.state === "off", "nothing available: empty photos, no next page, but season topics still shown");
globalThis.fetch = saved;


// ---- 트렌드(2): 지금 인기(데이터랩 + 네이버 이미지) · 주제 칩 · 캐시 ----
{
  globalThis.caches = { default: { store: new Map(), match: async function (k) { const v = this.store.get(k.url); return v ? new Response(v) : undefined; }, put: async function (k, r) { this.store.set(k.url, await r.text()); } } };
  const keep = globalThis.fetch; const seen = []; let dlMode = "ok";
  const dlBody = (groups, grow) => ({ results: groups.map((g) => ({ title: g, keywords: [g], data: Array.from({ length: 27 }, (_, i) => ({ period: "d" + i, ratio: g === "사진" ? 50 : i >= 20 ? (grow[g] ?? 5) : 5 })) })) });
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url); seen.push({ u, opt });
    if (u.startsWith("https://naverapihub.apigw.ntruss.com/search-trend/v1/search")) {
      if (dlMode === "denied") return new Response("no", { status: 403 });
      const b = JSON.parse(opt.body); const grow = { 벚꽃: 40, 한옥: 20, 캠핑: 2 };
      return jres(dlBody(b.keywordGroups.map((g) => g.groupName), grow));
    }
    if (u.startsWith("https://naverapihub.apigw.ntruss.com/search/v1/image")) { // 네이버 이미지: display / start 를 그대로 존중
      const q = decodeURIComponent(u.match(/query=([^&]+)/)[1]), n = +u.match(/display=(\d+)/)[1], st = +u.match(/start=(\d+)/)[1];
      return jres({ items: Array.from({ length: n }, (_, i) => ({ title: `<b>${q}</b> 사진 ${st + i}`, link: `https://blog.test/${encodeURIComponent(q)}${st + i}.jpg`, thumbnail: `http://search.pstatic.net/common/?src=${st + i}&type=b150`, sizewidth: "800", sizeheight: "600" })) });
    }
    return keep(url, opt);
  };
  const E = { ...env, NAVER_ID: "id", NAVER_SECRET: "sec" };
  let rt = await worker.fetch(req("/api/trends?g=pick"), E), jt = await rt.json();
  const picks = jt.items, byTitle = Object.fromEntries(picks.map((i) => [i.title, i]));
  ok(picks.length >= 2 && picks[0].title === "Old town street" && picks[1].title === "Sunset over Jeju", "editor picks keep the generator order (index): " + picks.map((p) => p.title));
  const jeju = byTitle["Sunset over Jeju"];
  ok(/\/1600px-/.test(jeju.full) && !/\/a\/ab\/Sunset_over_Jeju\.jpg$/.test(jeju.full), "huge original replaced by a 1600px version: " + jeju.full);
  ok(byTitle["Old town street"].full.endsWith("Old_town_street.jpg") && !/px-/.test(byTitle["Old town street"].full), "medium original (<=1800px) used as is");
  ok(byTitle["Venus de Milo front"]?.adult === true, "nude statue with art context stays but blurred");
  ok(jeju.tags.join() === "Sunsets in Jeju,Jeju Island", "useful category names become tags, noise dropped: " + jeju.tags);
  ok(seen.some((c) => c.u.includes("gcmstart")), "first request rotates the browsing window with gcmstart");
  // 시기 지정이 거절되면 가장 최근 것으로 다시 요청
  fpStart = false; caches.default.store.clear(); seen.length = 0;
  rt = await worker.fetch(req("/api/trends?g=pick"), E); jt = await rt.json();
  ok(jt.items.length >= 2 && seen.filter((c) => c.u.includes("Featured_pictures")).length === 2, "if gcmstart is rejected, retries without it");

  // 데이터랩
  fpStart = true; caches.default.store.clear(); seen.length = 0;
  rt = await worker.fetch(req("/api/trends"), E); jt = await rt.json();
  const dlCalls = seen.filter((c) => c.u.includes("search-trend/v1/search"));
  ok(jt.dl.state === "ok" && dlCalls.length === 10, "datalab asked in 10 chunks (40 topics, 4 + anchor each): " + dlCalls.length);
  ok(dlCalls.every((c) => c.opt.method === "POST" && c.opt.headers["X-NCP-APIGW-API-KEY-ID"] === "id" && c.opt.headers["X-NCP-APIGW-API-KEY"] === "sec"), "uses NAVER API HUB headers");
  { // 트렌드 전용 키(NAVER_TREND_ID/SECRET)가 있으면 그 키로 트렌드를 부르고, 이미지 검색은 원래 키를 씁니다
    caches.default.store.clear(); seen.length = 0;
    const r2 = await worker.fetch(req("/api/trends"), { ...E, NAVER_TREND_ID: "tid", NAVER_TREND_SECRET: "tsec" }); const j2 = await r2.json();
    const d2 = seen.filter((c) => c.u.includes("search-trend/v1/search")), im2 = seen.filter((c) => c.u.includes("/search/v1/image"));
    ok(j2.dl.state === "ok" && d2.length === 10 && d2.every((c) => c.opt.headers["X-NCP-APIGW-API-KEY-ID"] === "tid" && c.opt.headers["X-NCP-APIGW-API-KEY"] === "tsec"), "separate trend key is used for datalab");
    ok(im2.length >= 1 && im2.every((c) => c.opt.headers["X-NCP-APIGW-API-KEY-ID"] === "id"), "image search keeps using the image-search key");
    caches.default.store.clear(); seen.length = 0;
    const r3 = await worker.fetch(req("/api/trends"), { ...env, NAVER_TREND_ID: "tid", NAVER_TREND_SECRET: "tsec" }); const j3 = await r3.json();
    ok(j3.dl.state === "ok", "trend key alone is enough for the topics (image search key not required)");
    caches.default.store.clear(); seen.length = 0; await worker.fetch(req("/api/trends"), E);
  }
  const b0 = JSON.parse(dlCalls[0].opt.body);
  ok(b0.timeUnit === "date" && b0.keywordGroups.length === 5 && b0.keywordGroups[0].groupName === "사진" && /^\d{4}-\d\d-\d\d$/.test(b0.startDate), "request body: anchor + 4 topics, daily");
  const rising = jt.topics.filter((x) => x.kind === "rising");
  ok(rising[0].q === "벚꽃" && rising[1].q === "한옥", "fastest riser first among data-based topics: " + rising.map((x) => x.q));
  ok(!jt.topics.some((x) => /[%▲]|\d/.test(x.label)), "no percent / number text in chips");
  ok(rising.length === 6, "up to 6 data-based topics (rising first, then high-volume): " + rising.map((x) => x.q));
  ok(jt.topics.some((x) => x.kind === "season") && jt.topics[0].kind === "season" && jt.topics[1].kind === "rising", "season and data-based topics alternate");
  // 지금 인기 (all 쪽): 앞 4개 주제로 네이버 이미지 검색, 주제당 4장
  {
    const hot = jt.items.filter((i) => i.grp === "hot"), imgCalls = seen.filter((c) => c.u.includes("search/v1/image"));
    const top4 = rising.slice(0, 4).map((x) => x.label);
    ok(imgCalls.length === 4 && imgCalls.every((c) => /display=4&start=1&/.test(c.u) && c.opt.headers["X-NCP-APIGW-API-KEY-ID"] === "id"), "all view page 1: 4 naver searches of 4 images each: " + imgCalls.length);
    ok(hot.length === 16 && hot.every((i) => i.src === "naver" && i.thumb.startsWith("https://")), "16 hot photos, https: " + hot.length);
    ok(new Set(hot.map((i) => i.topic)).size === 4 && hot.every((i) => top4.includes(i.topic)), "hot photos come from the top-4 topics: " + [...new Set(hot.map((i) => i.topic))]);
    ok(hot.every((i) => !/<b>/.test(i.title)) && hot.every((i) => !i.alt || i.alt.startsWith("https://")), "naver html stripped from titles, alt upgraded to https");
    ok(jt.items.slice(0, 3).some((i) => i.grp === "hot") && jt.items.slice(0, 8).some((i) => i.grp === "pick"), "hot photos and picks are interleaved: " + jt.items.slice(0, 8).map((i) => i.grp));
  }
  // 지금 인기만 보는 무한 피드: 2쪽은 12장씩 이어서(start=13), 중복 없음
  seen.length = 0;
  const h1 = await (await worker.fetch(req("/api/trends?g=hot&page=1"), E)).json(), h2 = await (await worker.fetch(req("/api/trends?g=hot&page=2"), E)).json();
  const ic = seen.filter((c) => c.u.includes("search/v1/image"));
  ok(ic.filter((c) => /display=12&start=1&/.test(c.u)).length === 4 && ic.filter((c) => /display=12&start=13&/.test(c.u)).length === 4, "hot-only pages continue where the last page ended (start=1, start=13)");
  ok(h1.items.length === 48 && h2.items.length === 48 && h1.items.every((i) => i.grp === "hot") && h2.more === true, "hot-only pages: 48 photos each, more=true");
  ok(new Set([...h1.items, ...h2.items].map((i) => i.thumb)).size === 96, "no duplicate photos across pages");
  ok(h2.topics.length === 0, "topic chips are only sent with page 1");
  // 12시간 캐시
  seen.length = 0; await worker.fetch(req("/api/trends"), E);
  ok(seen.filter((c) => c.u.includes("search-trend")).length === 0, "datalab result cached (no second round of requests)");

  // 주제 칩을 누르면: 네이버·카카오·Pixabay·Unsplash 에서 그 주제로 (한 쪽씩)
  seen.length = 0;
  const TE = { ...E, KAKAO_KEY: "kk", PIXABAY_KEY: "pk", UNSPLASH_KEY: "uk" };
  const t1 = await (await worker.fetch(req("/api/trends?topic=" + encodeURIComponent("벚꽃") + "&page=2"), TE)).json();
  const q = encodeURIComponent("벚꽃");
  ok(seen.some((c) => c.u.includes("search/v1/image") && c.u.includes("query=" + q) && /display=12&start=13&/.test(c.u)) && seen.some((c) => c.u.includes("dapi.kakao.com") && c.u.includes("page=2&size=12")), "topic mode asks naver and kakao for page 2 with the same size");
  ok(seen.some((c) => c.u.includes("pixabay.com") && c.u.includes("q=" + q) && c.u.includes("per_page=12&page=2")) && seen.some((c) => c.u.includes("api.unsplash.com/search/photos")), "topic mode also asks pixabay and unsplash");
  ok(!seen.some((c) => c.u.includes("search-trend")) && !seen.some((c) => c.u.includes("Featured_pictures")), "topic mode does not call datalab or commons");
  ok(t1.items.length >= 12 && t1.items.every((i) => i.grp === "hot") && ["naver", "kakao", "pixabay", "unsplash"].every((s) => t1.items.some((i) => i.src === s)), "topic photos come from all four sources, mixed: " + [...new Set(t1.items.map((i) => i.src))]);
  ok(t1.topics.length === 0 && t1.more === true, "topic mode: no chip list, keeps going");
  seen.length = 0;
  const t2 = await (await worker.fetch(req("/api/trends?topic=" + encodeURIComponent("할로윈 호박")), TE)).json();
  ok(t2.items.length === 0 && t2.more === false && !seen.some((c) => c.u.includes("naverapihub") || c.u.includes("kakao") || c.u.includes("pixabay")), "an off-topic topic is refused without calling any source");
  const t3 = await (await worker.fetch(req("/api/trends?topic=" + encodeURIComponent("누드 사진")), TE)).json();
  ok(t3.items.length === 0 && t3.more === false, "adult topic is refused");

  // 권한 없음 → 이유를 알림, 다른 구성은 그대로
  caches.default.store.clear(); dlMode = "denied"; seen.length = 0;
  rt = await worker.fetch(req("/api/trends"), E); jt = await rt.json();
  ok(!jt.items.some((i) => i.grp === "hot") && !seen.some((c) => c.u.includes("search/v1/image")), "no topics (datalab denied) -> no hot photos and no image searches");
  ok(rt.status === 200 && jt.dl.state === "err" && jt.dl.why === "denied" && jt.dl.status === 403 && !jt.topics.some((x) => x.kind === "rising"), "datalab denied: reason reported, rest still works: " + JSON.stringify(jt.dl));
  ok(jt.topics.some((x) => x.kind === "season") && jt.items.some((i) => i.grp === "pick"), "season topics and photos unaffected by datalab failure");
  // 키가 없으면 호출 안 함
  seen.length = 0; rt = await worker.fetch(req("/api/trends"), env); jt = await rt.json();
  ok(jt.dl.state === "off" && !seen.some((c) => c.u.includes("search-trend")) && !seen.some((c) => c.u.includes("search/v1/image")), "no naver key -> datalab off, never called, no hot photos");
  // 끄기
  seen.length = 0; rt = await worker.fetch(req("/api/trends"), { ...E, TREND_TOPICS: "off" }); jt = await rt.json();
  ok(jt.dl.state === "off" && !seen.some((c) => c.u.includes("search-trend")), "TREND_TOPICS=off skips datalab");
  globalThis.fetch = keep; delete globalThis.caches;
}


// 필터 점검: 홈 카테고리 세부 주제가 필터에 걸리지 않는지 (app.js 의 CATS 를 그대로 읽어 검사)
import fs from "node:fs";
const app = fs.readFileSync(ROOT + "public/app.js", "utf8");
const m = app.match(/const CATS = (\[[\s\S]*?\n\]);/); const CATS = eval(m[1]);
ok(CATS.length >= 30, `categories: ${CATS.length}`);
const bad = CATS.flatMap((c) => [c[1], ...c[2]]).filter((t) => hardBlocked(t) || isAdult(t));
ok(bad.length === 0, "no home topic trips the filters" + (bad.length ? ": " + bad : ""));
ok(CATS.every((c) => c[2].length >= 5), "each category has >= 5 sub topics");

// ---- 시카고 미술관: 이미지 주소와 중계 ----
{
  const seen = [];
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url); seen.push({ u, h: opt.headers || {} });
    if (u.startsWith("https://api.artic.edu/api/v1/artworks/search")) return jres({
      config: { iiif_url: "https://www.artic.edu/iiif/2" },
      data: [{ id: 1, title: "Cat", image_id: "abc-123", thumbnail: { width: 800, height: 600 }, subject_titles: ["cats"] }, { id: 2, title: "No image", image_id: null }] });
    if (u.startsWith("https://www.artic.edu/iiif/")) return new Response("img", { status: 200, headers: { "content-type": "image/jpeg" } });
    return new Response("nf", { status: 404 });
  };
  r = await worker.fetch(req("/api/search?src=artic&q=cat&qe=cat&page=1"), env); j = await r.json();
  const it = j.items?.[0];
  ok(j.items?.length === 1 && !j.err, "artic search returns the one item that has an image");
  ok(it?.thumb === "https://www.artic.edu/iiif/2/abc-123/full/843,/0/default.jpg" && it?.full === it?.thumb, "artic thumb/full use the recommended 843 width: " + it?.thumb);
  ok(/\/full\/200,\//.test(it?.alt || ""), "artic keeps a small fallback (alt): " + it?.alt);
  ok(!/\/full\/400,\//.test(JSON.stringify(j)), "no non-standard 400 width anywhere");
  seen.length = 0;
  r = await worker.fetch(req("/api/img?u=" + encodeURIComponent("https://www.artic.edu/iiif/2/abc-123/full/843,/0/default.jpg")), env);
  ok(r.status === 200 && r.headers.get("content-type") === "image/jpeg", "image proxy serves artic image");
  ok(seen[0]?.h["AIC-User-Agent"] && seen[0]?.h.referer === "https://www.artic.edu/", "proxy sends AIC-User-Agent + referer to artic.edu");
  seen.length = 0;
  await worker.fetch(req("/api/img?u=" + encodeURIComponent("https://upload.wikimedia.org/a.jpg")), env);
  ok(seen[0] && !seen[0].h["AIC-User-Agent"], "AIC header is not sent to other hosts");
  // 중계가 실패하면 이유를 화면에 알려 주는지
  globalThis.fetch = async () => new Response("denied", { status: 403 });
  r = await worker.fetch(req("/api/img?u=" + encodeURIComponent("https://www.artic.edu/x.jpg")), env); j = await r.json();
  ok(r.status === 502 && j.error === "upstream 403", "failed proxy reports reason: " + j.error);
  globalThis.fetch = async () => new Response("<html>challenge</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  r = await worker.fetch(req("/api/img?u=" + encodeURIComponent("https://www.artic.edu/x.jpg")), env); j = await r.json();
  ok(r.status === 415 && /text\/html/.test(j.error), "html (block page) reported with its type: " + j.error);
}


// ---- 번역 + 고유명사 판별 (/api/tr) ----
{
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } }; // Workers 의 캐시 흉내 (여기서는 항상 비어 있음)
  const ai = (llm) => ({ calls: [], run(model, input) { this.calls.push(model); if (model === "@cf/meta/m2m100-1.2b") return Promise.resolve({ translated_text: "Gold River Exclusive Tower" }); return llm(model, input); } });
  const trq = async (q, e, sl = "") => (await worker.fetch(req("/api/tr?q=" + encodeURIComponent(q) + (sl ? "&sl=" + sl : "")), e)).json();
  let A = ai(async () => ({ response: '네 {"proper": true, "en": "Geumgang Exelu Tower", "type": "apartment tower"} ' }));
  let j2 = await trq("금강엑슬루타워", { ...env, AI: A });
  ok(j2.t === "Geumgang Exelu Tower" && j2.proper === true && j2.type === "apartment tower", "proper noun: romanized name replaces the literal translation: " + JSON.stringify(j2));
  A = ai(async () => ({ response: '{"proper": false, "en": "rainy street", "type": ""}' }));
  j2 = await trq("비 오는 거리", { ...env, AI: A });
  ok(j2.t === "Gold River Exclusive Tower" && j2.proper === false, "ordinary words keep the normal translation, proper=false: " + JSON.stringify(j2));
  A = ai(async () => { throw new Error("model gone"); });
  j2 = await trq("금강엑슬루타워", { ...env, AI: A });
  ok(j2.t === "Gold River Exclusive Tower" && !("proper" in j2), "AI failure falls back to the normal translation without a proper flag: " + JSON.stringify(j2));
  ok(A.calls.length === 3, "tries the next model when one fails: " + A.calls.join(","));
  A = ai(async () => ({ response: '{"proper": true, "en": "금강", "type": "타워"}' }));
  j2 = await trq("금강엑슬루타워", { ...env, AI: A });
  ok(j2.t === "Gold River Exclusive Tower", "non-Latin answer is discarded (no Hangul sent to English sources): " + JSON.stringify(j2));
  A = ai(async () => ({ response: '{"proper": true, "en": "X", "type": ""}' }));
  j2 = await trq("cat", { ...env, AI: A });
  ok(j2.t === "cat" && A.calls.length === 0, "English query: AI is not called");
  j2 = await trq("금강엑슬루타워", { ...env, AI: A, TR_SMART: "off" });
  ok(j2.t === "Gold River Exclusive Tower" && !("proper" in j2) && !A.calls.includes("@cf/meta/llama-3.1-8b-instruct"), "TR_SMART=off skips the name check");
  A = ai(() => new Promise(() => {})); // 응답이 영영 안 오는 모델
  const t0 = Date.now(); j2 = await trq("금강엑슬루타워", { ...env, AI: A });
  ok(j2.t === "Gold River Exclusive Tower" && Date.now() - t0 < 4000 && Date.now() - t0 >= 2400, "a hanging model is abandoned after ~2.5 s (the screen waits 3 s): " + (Date.now() - t0) + "ms");

  // 17차: nc=1(비공개 모드)이면 번역을 서버 캐시에 읽지도 쓰지도 않음
  const store = new Map(); const gets = [], puts = [];
  globalThis.caches = { default: { match: async (k) => { gets.push(k.url); const v = store.get(k.url); return v ? new Response(v) : undefined; }, put: async (k, r) => { puts.push(k.url); store.set(k.url, await r.text()); } } };
  A = ai(async () => ({ response: '{"proper": false, "en": "rainy street", "type": ""}' }));
  const tr2 = async (q, nc) => (await worker.fetch(req("/api/tr?q=" + encodeURIComponent(q) + "&sl=ko" + (nc ? "&nc=1" : "")), { ...env, AI: A })).json();
  await tr2("비 오는 거리", true);
  ok(gets.length === 0 && puts.length === 0, "nc=1: nothing read from or written to the cache (private mode)");
  await tr2("비 오는 거리", false);
  ok(puts.some((u) => u.includes("cache.local/tr?")) && puts.some((u) => u.includes("cache.local/trn?")), "normal: translation and name check are cached for 7 days");
  const n0 = A.calls.length; await tr2("비 오는 거리", false);
  ok(A.calls.length === n0, "normal: the second identical query is served from the cache (no AI call)");
}

// ---- 임베딩 (/api/embed): 짧은 글 → Int8 벡터(base64) ----
{
  const post = (body, e, pass = "pw") => worker.fetch(new Request("https://x.test/api/embed", { method: "POST", headers: { "x-pass": pass, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), e);
  const vec = (i) => Array.from({ length: 8 }, (_, k) => (k === i ? 2 : 0.1) * (i % 2 ? -1 : 1));
  const seen = []; const AIe = { run: async (model, input) => { seen.push({ model, input }); return { shape: [input.text.length, 8], data: input.text.map((_, i) => vec(i)), pooling: "cls" }; } };
  let r2 = await post({ texts: ["a"] }, { ...env, AI: AIe }, "bad"); ok(r2.status === 401, "embed requires the password");
  r2 = await post({ texts: ["한옥 처마", "nordic kitchen", ""] }, { ...env, AI: AIe }); let j3 = await r2.json();
  ok(r2.status === 200 && j3.d === 8 && j3.v.length === 3 && j3.v[2] === null && typeof j3.v[0] === "string", "returns one base64 vector per text, null for empty text");
  ok(seen[0].model === "@cf/baai/bge-m3" && seen[0].input.text.length === 3 && seen[0].input.text[2] !== "", "uses bge-m3, empty text replaced so the model does not reject it");
  const dec = (b64) => Int8Array.from(Buffer.from(b64, "base64"));
  const d0 = dec(j3.v[0]), d1 = dec(j3.v[1]);
  ok(d0.length === 8 && d0[0] > 100 && d1[1] < -100, "decoded vector is Int8 with the unit length scaled to 127: " + Array.from(d0).join(","));
  ok(Math.abs(Math.hypot(...Array.from(d0)) - 127) < 4, "vector length ≈ 127 after normalising: " + Math.hypot(...Array.from(d0)).toFixed(1));
  seen.length = 0; await post({ texts: Array.from({ length: 90 }, (_, i) => "t" + i) }, { ...env, AI: AIe });
  ok(seen[0].input.text.length === 60, "at most 60 texts per call");
  seen.length = 0; await post({ texts: ["x".repeat(500)] }, { ...env, AI: AIe });
  ok(seen[0].input.text[0].length === 160, "each text is cut to 160 characters");
  seen.length = 0; await post({ texts: ["a"] }, { ...env, AI: AIe, EMBED_MODEL: "@cf/custom/model" });
  ok(seen[0].model === "@cf/custom/model", "EMBED_MODEL overrides the model");
  r2 = await post({ texts: ["a"] }, { ...env, AI: AIe, EMBED: "off" }); j3 = await r2.json(); ok(j3.error === "unavailable", "EMBED=off disables it");
  r2 = await post({ texts: ["a"] }, env); j3 = await r2.json(); ok(j3.error === "unavailable", "no AI binding → unavailable (not a crash)");
  r2 = await post("not json", { ...env, AI: AIe }); ok(r2.status === 400, "bad JSON → 400");
  r2 = await post({ texts: [] }, { ...env, AI: AIe }); ok(r2.status === 400, "no texts → 400");
  r2 = await post({ texts: ["a", "b"] }, { ...env, AI: { run: async () => ({ data: [[1, 2]] }) } }); j3 = await r2.json();
  ok(j3.error === "unavailable" && j3.detail === "shape", "wrong number of vectors is rejected: " + JSON.stringify(j3));
  r2 = await post({ texts: ["a"] }, { ...env, AI: { run: async () => { throw new Error("model gone"); } } }); j3 = await r2.json();
  ok(j3.error === "unavailable" && /model gone/.test(j3.detail), "model failure is reported without a crash");
  const big = await worker.fetch(new Request("https://x.test/api/embed", { method: "POST", headers: { "x-pass": "pw", "content-length": "30000" }, body: "{}" }), { ...env, AI: AIe }); ok(big.status === 413, "body over 24KB → 413");
  const cj = await (await worker.fetch(req("/api/config"), { ...env, AI: AIe })).json(); ok(cj.embed === true, "config says embeddings are available");
  const cj2 = await (await worker.fetch(req("/api/config"), { ...env, AI: AIe, EMBED: "off" })).json(); ok(cj2.embed === false, "config says off when EMBED=off");
}

// ---- 위키 저장소: 고유명사면 한글 원문도 함께 검색 ----
{
  const terms = [];
  globalThis.fetch = async (url) => {
    const u = String(url); if (!u.includes("commons.wikimedia.org")) return new Response("nf", { status: 404 });
    const t = decodeURIComponent(u.match(/gsrsearch=([^&]+)/)[1]).replace(" filetype:bitmap", ""); terms.push(t);
    if (/실패/.test(t)) return new Response("x", { status: 500 });
    const mk = (n) => ({ index: n, title: `File:${t} ${n}.jpg`, imageinfo: [{ thumburl: `https://upload.wikimedia.org/${encodeURIComponent(t)}${n}t.jpg`, url: `https://upload.wikimedia.org/${encodeURIComponent(t)}${n}.jpg`, descriptionurl: "https://commons.wikimedia.org/x", width: 800, height: 600, mime: "image/jpeg" }] });
    return jres({ query: { pages: { 1: mk(1), 2: mk(2) } } });
  };
  const sq = async (qs) => (await (await worker.fetch(req("/api/search?src=wikimedia&" + qs), env)).json());
  let jw = await sq("q=" + encodeURIComponent("금강엑슬루타워") + "&qe=Geumgang%20Exelu%20Tower&page=1&pr=1");
  ok(terms.length === 2 && terms.includes("금강엑슬루타워") && terms.includes("Geumgang Exelu Tower"), "proper noun: wikimedia searched with the English name and the Korean original: " + terms.join(" | "));
  ok(jw.items.length === 4 && /Geumgang/.test(jw.items[0].title) && /금강/.test(jw.items[1].title), "results from both searches are interleaved: " + jw.items.map((i) => i.title.slice(0, 10)).join(", "));
  terms.length = 0; jw = await sq("q=" + encodeURIComponent("금강엑슬루타워") + "&qe=Geumgang%20Exelu%20Tower&page=1");
  ok(terms.length === 1 && terms[0] === "Geumgang Exelu Tower", "without pr=1 only the English search runs");
  terms.length = 0; jw = await sq("q=" + encodeURIComponent("실패") + "&qe=Fine%20Name&page=1&pr=1");
  ok(jw.items.length === 2 && !jw.err, "if the Korean search fails the English results are still returned");
  terms.length = 0; jw = await sq("q=cat&qe=cat&page=1&pr=1");
  ok(terms.length === 1, "English-only query never doubles the request");
}


// ---- 12차: 실제 인기 검색어(구글 트렌드 RSS) + 내 취향 피드 ----
{
  globalThis.caches = { default: { store: new Map(), match: async function (k) { const v = this.store.get(k.url); return v ? new Response(v) : undefined; }, put: async function (k, r) { this.store.set(k.url, await r.text()); } } };
  const rss = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
  <item><title>제주 감귤</title><ht:approx_traffic>2,000+</ht:approx_traffic><ht:news_item><ht:news_item_title>감귤 수확 한창</ht:news_item_title></ht:news_item></item>
  <item><title>홍길동</title><ht:approx_traffic>50,000+</ht:approx_traffic><ht:news_item><ht:news_item_title>배우 홍길동 열애 인정</ht:news_item_title></ht:news_item></item>
  <item><title>단풍 명소</title><ht:approx_traffic>10,000+</ht:approx_traffic><ht:news_item><ht:news_item_title>설악산 단풍 절정</ht:news_item_title></ht:news_item></item>
  <item><title>할로윈 파티</title><ht:approx_traffic>5,000+</ht:approx_traffic></item>
  <item><title>누드 사진</title><ht:approx_traffic>5,000+</ht:approx_traffic></item>
  </channel></rss>`;
  const base = globalThis.fetch, seen2 = [];
  globalThis.fetch = async (url, opt) => { const u = String(url); seen2.push(u); if (u.includes("trends.google.com")) return new Response(rss, { status: 200 }); return base(url, opt); };
  const E2 = { ...env, NAVER_ID: "id", NAVER_SECRET: "sec", PIXABAY_KEY: "pk", UNSPLASH_KEY: "uk", KAKAO_KEY: "kk" };
  let jr = await (await worker.fetch(req("/api/trends"), E2)).json();
  const live = jr.topics.filter((t) => t.kind === "live").map((t) => t.q);
  ok(live.includes("제주 감귤") && live.includes("단풍 명소"), "real trending keywords appear as chips: " + live);
  ok(!live.includes("홍길동") && !live.includes("할로윈 파티") && !live.includes("누드 사진"), "news/gossip, off-topic and adult keywords are filtered out: " + live);
  ok(jr.dl.state === "ok", "state ok when live keywords exist");
  ok(seen2.some((c) => c.includes("search/v1/image") && c.includes(encodeURIComponent("제주 감귤"))), "지금 인기 photos search the real keyword on naver");
  // AI 로 한 번 더 거르기
  caches.default.store.clear();
  const E3 = { ...E2, AI: { run: async () => ({ response: "[0]" }) } };
  jr = await (await worker.fetch(req("/api/trends"), E3)).json();
  const live3 = jr.topics.filter((t) => t.kind === "live").map((t) => t.q);
  ok(live3.length === 1 && live3[0] === "제주 감귤", "AI keeps only the visual keyword: " + live3);
  // AI 가 엉뚱하게 답하면 규칙 걸러내기 결과를 그대로 씀
  caches.default.store.clear();
  jr = await (await worker.fetch(req("/api/trends"), { ...E2, AI: { run: async () => ({ response: "sorry" }) } })).json();
  ok(jr.topics.filter((t) => t.kind === "live").length === 2, "bad AI answer falls back to rule-filtered list");
  // 가져오기 실패해도 나머지는 동작
  caches.default.store.clear();
  globalThis.fetch = async (url, opt) => { if (String(url).includes("trends.google.com")) throw new Error("blocked"); return base(url, opt); };
  jr = await (await worker.fetch(req("/api/trends"), E2)).json();
  ok(Array.isArray(jr.items) && jr.topics.some((t) => t.kind === "season") && !jr.topics.some((t) => t.kind === "live"), "google trends unreachable: response still fine, season chips remain, no live chips");
  globalThis.fetch = base;
  // 내 취향 피드: 여러 주제어를 섞음
  seen2.length = 0; globalThis.fetch = async (url, opt) => { const u = String(url); seen2.push(u);
    if (u.startsWith("https://naverapihub.apigw.ntruss.com/search/v1/image")) { const q = decodeURIComponent(u.match(/query=([^&]+)/)[1]), n = +u.match(/display=(\d+)/)[1];
      return jres({ items: Array.from({ length: n }, (_, i) => ({ title: `${q} 사진 ${i}`, link: `https://blog.test/${encodeURIComponent(q)}${i}.jpg`, thumbnail: `http://search.pstatic.net/common/?src=${encodeURIComponent(q)}${i}&type=b150`, sizewidth: "800", sizeheight: "600" })) }); }
    return base(url, opt); };
  const m = await (await worker.fetch(req("/api/trends?g=mine&mine=" + encodeURIComponent("노을,고양이,카페 인테리어,누드,할로윈")), E2)).json();
  const qs2 = ["노을", "고양이", "카페 인테리어"].map((t) => seen2.some((c) => c.includes("search/v1/image") && c.includes("query=" + encodeURIComponent(t))));
  ok(qs2.every(Boolean), "mine feed searches every topic, not just one: " + qs2);
  ok(!seen2.some((c) => c.includes(encodeURIComponent("누드")) || c.includes(encodeURIComponent("할로윈"))), "adult/off-topic taste words are never searched");
  ok(!seen2.some((c) => c.includes("Featured_pictures") || c.includes("trends.google.com")), "mine feed does not call commons or google trends");
  ok(m.items.length > 6 && new Set(m.items.map((i) => i.topic)).size >= 3, "mine items are interleaved across topics: " + [...new Set(m.items.map((i) => i.topic))]);
  ok(m.topics.length === 3 && m.topics.every((t) => t.kind === "mine"), "mine chips are the taste topics: " + m.topics.map((t) => t.q));
  const m0 = await (await worker.fetch(req("/api/trends?g=mine"), E2)).json();
  ok(m0.items.length === 0, "mine without topics is empty");
  globalThis.fetch = base;
}

// ---- 14차: 뉴스 필터(NEWSY) 오탐 수정 + 연예인·인물 이름 거르기 ----
{
  const item = (t, n) => `<item><title>${t}</title><ht:approx_traffic>1,000+</ht:approx_traffic><ht:news_item><ht:news_item_title>${n}</ht:news_item_title></ht:news_item></item>`;
  const rows = [
    ["골목 카페", "골목 카페 거리 인기", true], ["사과 농장", "사과 따기 체험 인기", true], ["승마 체험", "주말 승마 체험 인기", true],
    ["단풍 장관", "설악산 단풍 장관", true], ["폭발적 디저트", "폭발적 인기 끄는 디저트", true], ["경기도 단풍", "경기도 단풍 명소 인기", true],
    ["국회의사당 벚꽃", "국회의사당 벚꽃길 개방", true], ["가수원동 맛집", "가수원동 맛집 거리", true], ["선수촌 아파트", "선수촌 아파트 단풍", true],
    ["대통령 연설", "대통령 국회 연설", false], ["고속도로 소식", "고속도로 추돌 사고 발생", false], ["야구 결과", "한국시리즈 우승 확정", false],
    ["가수 소식", "가수 A 공식 사과", false], ["배우 소식", "배우 B 이혼 발표", false], ["여당 소식", "여당 대표 기자회견", false],
    ["신작 드라마", "배우 김아무개 주연 새 드라마 인기", false], ["아이돌 컴백", "아이돌 그룹 컴백 앨범 공개", false],
    ["사미자", "사미자 근황 화제", false], ["단풍 명소", "내장산 단풍 절정", true],
  ];
  const rss = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>${rows.map((r) => item(r[0], r[1])).join("")}</channel></rss>`;
  const wiki = { query: { normalized: [], pages: {
    1: { title: "사미자", categories: [{ title: "분류:1941년 출생" }, { title: "분류:살아 있는 사람" }, { title: "분류:대한민국의 여자 배우" }] },
    2: { title: "단풍 명소", categories: [{ title: "분류:관광" }] },
    3: { title: "사과 농장", missing: "" },
  } } };
  const base = globalThis.fetch; let wikiCalls = 0, wikiTitles = "";
  const mock = (wikiMode) => async (url, opt) => { const u = String(url);
    if (u.includes("trends.google.com")) return new Response(rss, { status: 200 });
    if (u.includes("ko.wikipedia.org")) { wikiCalls++; wikiTitles = decodeURIComponent(u.match(/titles=([^&]+)/)[1]); if (wikiMode === "fail") throw new Error("blocked"); return new Response(JSON.stringify(wiki), { status: 200, headers: { "content-type": "application/json" } }); }
    return base(url, opt); };
  const E4 = { ...env, NAVER_ID: "id", NAVER_SECRET: "sec", PIXABAY_KEY: "pk", UNSPLASH_KEY: "uk", KAKAO_KEY: "kk" };
  const liveOf = async (E) => (await (await worker.fetch(req("/api/trends"), E)).json()).topics.filter((t) => t.kind === "live").map((t) => t.q);
  caches.default.store.clear(); globalThis.fetch = mock("ok");
  let live = await liveOf(E4);
  const wantIn = rows.filter((r) => r[2]).map((r) => r[0]), wantOut = rows.filter((r) => !r[2]).map((r) => r[0]);
  ok(wantIn.every((q) => live.includes(q)), "ordinary words are not filtered (골목·사과·승마·장관·폭발적·경기도·가수원동·선수촌): missing " + wantIn.filter((q) => !live.includes(q)));
  ok(!wantOut.some((q) => live.includes(q)), "politics, accidents, sports, entertainment words, gossip and celebrity names are filtered: " + wantOut.filter((q) => live.includes(q)));
  ok(!live.includes("사미자") && wikiCalls === 1 && wikiTitles.includes("사미자"), "a celebrity name with no news keywords is caught by the Wikipedia person check (one batched call)");
  // 위키를 못 가져오면 그대로 두되 오류 없이 동작
  caches.default.store.clear(); globalThis.fetch = mock("fail");
  live = await liveOf(E4);
  ok(live.includes("단풍 명소") && !live.includes("배우 소식"), "wikipedia unreachable: still works, rule filters still apply");
  // AI 에 보내는 안내문: 인물 이름·정치·사건 제외, 이름처럼 보이는 말도 제외
  caches.default.store.clear(); globalThis.fetch = mock("ok"); let sys = "";
  await worker.fetch(req("/api/trends"), { ...E4, AI: { run: async (m, b) => { sys = b.messages[0].content; return { response: "[0]" }; } } });
  ok(/names of people/i.test(sys) && /politics/i.test(sys) && /personal name/i.test(sys) && !/entertainment/i.test(sys), "AI prompt excludes people and name-like words, no entertainment allowance");
  globalThis.fetch = base;
}

// ---- 15차: 구글 인기 검색어 7일 누적 ----
{
  const kst = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
  const day = (n) => kst(Date.now() - n * 86400000);
  const item = (t, n) => `<item><title>${t}</title><ht:approx_traffic>1,000+</ht:approx_traffic><ht:news_item><ht:news_item_title>${n}</ht:news_item_title></ht:news_item></item>`;
  const rssOf = (rows) => `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>${rows.map((r) => item(r[0], r[1])).join("")}</channel></rss>`;
  globalThis.caches = { default: { store: new Map(), match: async function (k) { const v = this.store.get(k.url); return v ? new Response(v) : undefined; }, put: async function (k, r) { this.store.set(k.url, await r.text()); } } };
  const seed = (n, rows) => caches.default.store.set(`https://cache.local/gth?d=${day(n)}`, JSON.stringify(rows.map(([label, news]) => ({ label, q: label, news: [news], traffic: 0 }))));
  const base = globalThis.fetch; let googleOk = true, today = [];
  globalThis.fetch = async (url, opt) => { const u = String(url);
    if (u.includes("trends.google.com")) { if (!googleOk) throw new Error("blocked"); return new Response(rssOf(today), { status: 200 }); }
    if (u.includes("ko.wikipedia.org")) return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { "content-type": "application/json" } });
    return base(url, opt); };
  const E5 = { ...env, NAVER_ID: "id", NAVER_SECRET: "sec", PIXABAY_KEY: "pk", UNSPLASH_KEY: "uk", KAKAO_KEY: "kk" };
  const liveOf = async (E = E5) => (await (await worker.fetch(req("/api/trends"), E)).json()).topics.filter((t) => t.kind === "live").map((t) => t.q);

  // 어제·그제에도 올라온 말이 오늘 순위가 낮아도 앞에 옴 / 이틀 이상 보였지만 오늘 사라진 말도 남음 / 며칠 전 하루만 떴던 말은 뺌
  seed(1, [["제주 감귤", "감귤 수확"], ["억새 명소", "억새 절정"], ["하루짜리 유행", "반짝 인기"]]);
  seed(2, [["제주 감귤", "감귤 수확"], ["억새 명소", "억새 절정"]]);
  seed(5, [["옛날 한 번", "지난주 인기"]]);
  today = [["단풍 명소", "내장산 단풍 절정"], ["신상 디저트", "새 디저트 인기"], ["제주 감귤", "감귤 수확 한창"]];
  let live = await liveOf();
  ok(live[0] === "제주 감귤", "a keyword seen on 3 days ranks first even though it is last in today's list: " + live);
  ok(live.indexOf("제주 감귤") < live.indexOf("단풍 명소") && live.indexOf("단풍 명소") < live.indexOf("신상 디저트"), "one-day keywords keep today's order after the multi-day ones: " + live);
  ok(live.includes("억새 명소"), "a keyword seen on 2 recent days stays even if it is not in today's list: " + live);
  ok(!live.includes("하루짜리 유행") && !live.includes("옛날 한 번"), "keywords seen only once before today (yesterday or 5 days ago) do not come back: " + live);
  const saved = JSON.parse(caches.default.store.get(`https://cache.local/gth?d=${day(0)}`) || "[]");
  ok(saved.length === 3 && saved[0].q === "단풍 명소" && saved.every((x) => x.q && Array.isArray(x.news)), "today's list is saved as today's snapshot: " + saved.map((x) => x.q));

  // 오늘 목록을 다시 받아도 같은 날 저장분과 합쳐질 뿐 날 수가 늘어나지 않음 (같은 날 여러 번 받아도 하루로 셈)
  caches.default.store.delete([...caches.default.store.keys()].find((k) => k.includes("gt2")));
  today = [["새 목록", "방금"], ["단풍 명소", "내장산 단풍 절정"]];
  live = await liveOf();
  const saved2 = JSON.parse(caches.default.store.get(`https://cache.local/gth?d=${day(0)}`));
  ok(saved2.map((x) => x.q).join() === "새 목록,단풍 명소,신상 디저트,제주 감귤" && live[0] === "제주 감귤", "re-fetching the same day merges snapshots without double counting: " + saved2.map((x) => x.q));

  // 필터는 누적된 목록에도 적용: 어제 저장분에 있던 뉴스 단어·인물·선정 단어는 나오지 않음
  seed(1, [["제주 감귤", "감귤 수확"], ["사고 소식", "고속도로 추돌 사고"], ["누드 전시", "전시"]]);
  seed(2, [["사고 소식", "고속도로 추돌 사고"], ["누드 전시", "전시"]]);
  caches.default.store.delete([...caches.default.store.keys()].find((k) => k.includes("gt2")));
  live = await liveOf();
  ok(!live.includes("사고 소식") && !live.includes("누드 전시") && live.includes("제주 감귤"), "news and adult filters apply to accumulated keywords too: " + live);

  // 구글을 못 받아도 지난 며칠 기록으로 칩을 채움
  caches.default.store.clear();
  seed(1, [["제주 감귤", "감귤 수확"], ["억새 명소", "억새 절정"]]); seed(2, [["제주 감귤", "감귤 수확"], ["억새 명소", "억새 절정"]]);
  googleOk = false;
  live = await liveOf();
  ok(live.join() === "제주 감귤,억새 명소", "google unreachable today: chips come from the last days' records: " + live);
  ok(!caches.default.store.has(`https://cache.local/gth?d=${day(0)}`), "nothing is saved for today when google gave nothing");

  // KV 바인딩이 있으면 KV 에 저장하고 거기서 읽음 (캐시는 쓰지 않음)
  googleOk = true; caches.default.store.clear();
  const kv = new Map(); let kvTtl = 0;
  const KV = { get: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null), put: async (k, v, o) => { kv.set(k, v); kvTtl = o?.expirationTtl || 0; } };
  kv.set(`gt:${day(1)}`, JSON.stringify([{ label: "제주 감귤", q: "제주 감귤", news: [], traffic: 0 }]));
  today = [["단풍 명소", "내장산 단풍 절정"], ["제주 감귤", "감귤 수확"]];
  live = await liveOf({ ...E5, TREND_KV: KV });
  ok(live[0] === "제주 감귤" && kv.has(`gt:${day(0)}`) && kvTtl >= 8 * 86400, "TREND_KV is used for reading yesterday and saving today (kept 9 days)");
  ok(![...caches.default.store.keys()].some((k) => k.includes("gth")), "with KV, history is not written to the cache");

  // 저장소가 고장 나도 오늘 목록으로 동작
  caches.default.store.clear();
  live = await liveOf({ ...E5, TREND_KV: { get: async () => { throw new Error("kv down"); }, put: async () => { throw new Error("kv down"); } } });
  ok(live.includes("단풍 명소") && live.includes("제주 감귤"), "storage failure falls back to today's list: " + live);

  // 예약 실행(scheduled): 앱을 안 열어도 오늘 목록을 쌓음
  caches.default.store.clear(); const waits = [];
  await worker.scheduled({}, E5, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits);
  ok(caches.default.store.has(`https://cache.local/gth?d=${day(0)}`), "scheduled handler saves today's keywords without a page visit");
  globalThis.fetch = base;
}

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
