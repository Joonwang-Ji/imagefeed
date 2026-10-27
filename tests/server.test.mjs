import worker from "../src/index.js";
const ROOT = new URL("../", import.meta.url).pathname; 
import { hardBlocked, isAdult } from "../src/filters.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const calls = [];
const jres = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url) => {
  const u = String(url); calls.push(u);
  if (u.includes("wikimedia.org/api/rest_v1/metrics/pageviews/top/ko")) return jres({ items: [{ articles: [
    { article: "대문" }, { article: "손흥민" }, { article: "특수:검색" }, { article: "시체_발견" }, { article: "누드_사진" }, { article: "서울_야경" }, { article: "한국_국기" }, { article: "이미지_없음" } ] }] });
  if (u.includes("wikimedia.org/api/rest_v1/metrics/pageviews/top/en")) return jres({ items: [{ articles: [
    { article: "Main_Page" }, { article: "Albert_Einstein" }, { article: "Mount_Fuji" }, { article: "Special:Search" } ] }] });
  if (u.includes("ko.wikipedia.org/w/api.php")) {
    const t = decodeURIComponent(u.match(/titles=([^&]+)/)[1]).split("|");
    if (t.some((x) => /시체|누드|대문|특수/.test(x))) return jres({ error: "bad titles" }, 500); // 걸러진 제목이 요청에 섞이면 실패
    return jres({ query: { normalized: [], redirects: [], pages: {
      1: { title: "서울 야경", thumbnail: { source: "http://upload.wikimedia.org/a.jpg", width: 640, height: 400 }, original: { source: "https://upload.wikimedia.org/a_big.jpg" } },
      2: { title: "손흥민", thumbnail: { source: "https://upload.wikimedia.org/b.jpg", width: 500, height: 640 }, original: { source: "https://upload.wikimedia.org/b_big.tif" } },
      3: { title: "한국 국기", thumbnail: { source: "https://upload.wikimedia.org/flag.svg.png", width: 640, height: 400 }, original: { source: "https://upload.wikimedia.org/flag.svg" } },
      4: { title: "이미지 없음" },
    } } });
  }
  if (u.includes("en.wikipedia.org/w/api.php")) return jres({ query: { normalized: [{ from: "Mount Fuji", to: "Mount Fuji" }], redirects: [{ from: "Albert Einstein", to: "Albert Einstein" }], pages: {
      5: { title: "Mount Fuji", thumbnail: { source: "https://upload.wikimedia.org/fuji.jpg", width: 640, height: 427 }, original: { source: "https://upload.wikimedia.org/fuji_o.jpg" } },
      6: { title: "Albert Einstein", thumbnail: { source: "https://upload.wikimedia.org/ae.jpg", width: 480, height: 640 }, original: { source: "https://upload.wikimedia.org/ae_o.png" } } } } });
  if (u.startsWith("https://pixabay.com/api/")) return jres({ hits: [
    { webformatURL: "https://pixabay.com/p1.jpg", largeImageURL: "https://pixabay.com/p1L.jpg", pageURL: "https://pixabay.com/1", imageWidth: 800, imageHeight: 600, tags: "sea, sky" },
    { webformatURL: "https://pixabay.com/p2.jpg", largeImageURL: "https://pixabay.com/p2L.jpg", pageURL: "https://pixabay.com/2", imageWidth: 600, imageHeight: 800, tags: "gore, blood" } ] });
  if (u.startsWith("https://api.unsplash.com/photos?")) return jres([{ urls: { small: "https://images.unsplash.com/u1s", regular: "https://images.unsplash.com/u1r" }, links: { html: "https://unsplash.com/u1" }, width: 400, height: 500, alt_description: "a calm lake", tags: [{ title: "lake" }] }]);
  return new Response("nf", { status: 404 });
};
const req = (path, pass = "pw") => new Request("https://x.test" + path, { headers: { "x-pass": pass } });
const env = { PASS: "pw", ASSETS: { fetch: () => new Response("a") } };

let r = await worker.fetch(req("/api/trends", "bad"), env); ok(r.status === 401, "trends requires password");
r = await worker.fetch(req("/api/trends"), env); let j = await r.json();
ok(r.status === 200 && j.items.length >= 4, `trends ok without keys: ${j.items.length} items, date ${j.date}`);
ok(j.items.every((i) => i.grp === "news" && i.src === "wiki"), "without keys all items are wiki news");
ok(j.items.map((i) => i.title).join("|") === "손흥민|Albert Einstein|서울 야경|Mount Fuji", "interleaved ko / en: " + j.items.map((i) => i.title).join(" | "));
ok(!j.items.some((i) => /국기/.test(i.title)), "svg flag dropped");
ok(!j.items.some((i) => /이미지 없음/.test(i.title)), "page without image dropped");
ok(j.items.every((i) => i.thumb.startsWith("https://")), "http thumbs upgraded to https");
const son = j.items.find((i) => i.title === "손흥민"); ok(son && son.full === son.thumb, "tif original falls back to thumb");
const fuji = j.items.find((i) => i.title === "Mount Fuji"); ok(fuji.full.endsWith("fuji_o.jpg") && fuji.page === "https://en.wikipedia.org/wiki/Mount_Fuji", "full = original jpg, page link ok");
ok(!calls.some((c) => /%EC%8B%9C%EC%B2%B4|%EB%88%84%EB%93%9C/.test(c)), "blocked/adult titles never requested");

r = await worker.fetch(req("/api/trends"), { ...env, PIXABAY_KEY: "k1", UNSPLASH_KEY: "k2" }); j = await r.json();
const pops = j.items.filter((i) => i.grp === "pop");
ok(pops.length === 2 && pops.some((i) => i.src === "pixabay") && pops.some((i) => i.src === "unsplash"), "pop photos from pixabay + unsplash: " + pops.map((p) => p.src));
ok(!pops.some((i) => i.tags.includes("gore")), "hard-blocked tags dropped from pop");
ok(j.items.slice(0, 3).map((i) => i.grp).join() === "news,news,pop", "round-robin mixes ko, en, pop: " + j.items.slice(0, 6).map((i) => i.grp));

// 트렌드 선정성: 성행위·성기는 아예 제외, 나체는 미술·역사 맥락이면 블러로 남기고 아니면 제외
{
  const keep = globalThis.fetch; const asked = [];
  const pg = (id, title, desc, file) => ({ [id]: { title, terms: { description: desc ? [desc] : [] }, thumbnail: { source: `https://upload.wikimedia.org/thumb/${file}`, width: 600, height: 400 }, original: { source: `https://upload.wikimedia.org/orig/${file}` } } });
  globalThis.fetch = async (url) => {
    const u = String(url); asked.push(u);
    if (u.includes("pageviews/top/ko")) return jres({ items: [{ articles: [
      { article: "성행위" }, { article: "다비드상" }, { article: "카주라호" }, { article: "사진_속_나체" }, { article: "우키요에" }, { article: "오럴B" }, { article: "자위대" }, { article: "서울_야경" }, { article: "누드_사진" } ] }] });
    if (u.includes("pageviews/top/en")) return jres({ items: [{ articles: [{ article: "Michelangelo" }] }] });
    if (u.includes("ko.wikipedia.org/w/api.php")) {
      // 제목이 이미 걸러졌다면 요청에 없어야 함
      const t = decodeURIComponent(u.match(/titles=([^&]+)/)[1]).split("|");
      if (t.some((x) => /성행위|누드/.test(x))) return jres({ error: "filtered titles leaked" }, 500);
      return jres({ query: { pages: {
        ...pg(1, "다비드상", "르네상스 시대의 나체 대리석 조각", "David.jpg"),
        ...pg(2, "카주라호", "인도의 사원 유적", "Khajuraho_erotic_sculpture_couple.jpg"),
        ...pg(3, "사진 속 나체", "사진 기법", "photo_naked_model.jpg"),
        ...pg(4, "우키요에", "일본 목판화", "ukiyoe_shunga_scroll.jpg"),
        ...pg(5, "오럴B", "칫솔 브랜드", "oralb.jpg"),
        ...pg(6, "자위대", "일본의 군대", "jsdf.jpg"),
        ...pg(7, "서울 야경", "대한민국의 수도", "seoul.jpg"),
      } } });
    }
    if (u.includes("en.wikipedia.org/w/api.php")) return jres({ query: { pages: { ...pg(8, "Michelangelo", "Italian sculptor and painter", "Michelangelo.jpg") } } });
    return new Response("nf", { status: 404 });
  };
  const rr2 = await worker.fetch(req("/api/trends"), env), jj = await rr2.json(); globalThis.fetch = keep;
  const byT = Object.fromEntries(jj.items.map((i) => [i.title, i]));
  ok(!byT["카주라호"], "explicit word in the photo file name (erotic) -> dropped even though it is an art/heritage page");
  ok(!byT["우키요에"], "shunga file name -> dropped even in an art context");
  ok(!byT["사진 속 나체"], "nudity without art context -> dropped");
  ok(byT["다비드상"] && byT["다비드상"].adult === true, "nude marble sculpture (art context) stays, but blurred");
  ok(byT["오럴B"] && byT["자위대"] && byT["서울 야경"] && byT["Michelangelo"], "normal pages (toothbrush brand, Self-Defense Forces, city view, artist) are not caught");
  ok(["오럴B", "자위대", "서울 야경", "Michelangelo"].every((t) => byT[t].adult === false), "normal pages are not blurred");
  ok(!asked.some((c) => /%EC%84%B1%ED%96%89%EC%9C%84|%EB%88%84%EB%93%9C/.test(c)), "explicit and nude-titled pages are never requested");
  ok(jj.items.every((i) => !("ctx" in i)), "internal context text is not sent to the browser");
}

// 모든 소스 실패 → 사진은 비어 있지만 기념일·계절 주제는 외부 호출 없이 계속 보여 줌
const saved = globalThis.fetch; globalThis.fetch = async () => new Response("x", { status: 500 });
r = await worker.fetch(req("/api/trends"), env); j = await r.json();
ok(r.status === 200 && j.items.length === 0 && j.season.length > 0 && j.dl.state === "off", "nothing available: empty photos, but season topics still shown (dl off without keys)");
globalThis.fetch = saved;

// ---- 새 트렌드: 잘 찍은 사진(커먼즈 우수 사진) + 요즘 뜨는 주제(데이터랩) + 시즌 주제 ----
{
  globalThis.caches = { default: { store: new Map(), match: async function (k) { const v = this.store.get(k.url); return v ? new Response(v) : undefined; }, put: async function (k, r) { this.store.set(k.url, await r.text()); } } };
  const keep = globalThis.fetch; const seen = []; let dlMode = "ok", fpStart = true;
  const fp = (id, name, cats, desc, w = 3000) => ({ index: id, title: `File:${name}.jpg`, imageinfo: [{ thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/640px-${name}.jpg`, thumbwidth: 640, thumbheight: 427, url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}.jpg`, width: w, height: Math.round(w * 0.67), mime: "image/jpeg", descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
    extmetadata: { ObjectName: { value: name.replace(/_/g, " ") }, ImageDescription: { value: desc }, Categories: { value: cats } } }] });
  const dlBody = (groups, grow) => ({ results: groups.map((g) => ({ title: g, keywords: [g], data: Array.from({ length: 27 }, (_, i) => ({ period: "d" + i, ratio: g === "사진" ? 50 : i >= 20 ? (grow[g] ?? 5) : 5 })) })) });
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url); seen.push({ u, opt });
    if (u.includes("commons.wikimedia.org") && u.includes("Featured_pictures")) {
      if (u.includes("gcmstart") && !fpStart) return new Response("bad", { status: 400 });
      return jres({ query: { pages: {
        11: fp(2, "Sunset_over_Jeju", "Featured pictures of South Korea|Sunsets in Jeju|Taken with Canon EOS|Quality images|Jeju Island", "A calm sunset over the sea", 4000),
        12: fp(1, "Old_town_street", "Featured pictures of Spain|Streets in Spain|2019 in Spain", "Narrow street", 1500),
        13: fp(3, "Venus_de_Milo_front", "Featured pictures of sculptures|Nude statues", "Ancient marble statue", 3000),
        14: fp(4, "Explicit_shunga_print", "Featured pictures|Shunga", "Edo period erotic woodblock print"),
        15: { index: 5, title: "File:Doc.pdf", imageinfo: [{ thumburl: "https://upload.wikimedia.org/x.png", mime: "application/pdf" }] },
      } } });
    }
    if (u.startsWith("https://naverapihub.apigw.ntruss.com/search-trend/v1/search")) {
      if (dlMode === "denied") return new Response("no", { status: 403 });
      const b = JSON.parse(opt.body); const grow = { 벚꽃: 40, 한옥: 20, 캠핑: 2 };
      return jres(dlBody(b.keywordGroups.map((g) => g.groupName), grow));
    }
    if (u.startsWith("https://naverapihub.apigw.ntruss.com/search/v1/image")) { // 뜨는 주제의 네이버 이미지
      const q = decodeURIComponent(u.match(/query=([^&]+)/)[1]);
      return jres({ items: Array.from({ length: 20 }, (_, i) => ({ title: `<b>${q}</b> 사진 ${i}`, link: `https://blog.test/${encodeURIComponent(q)}${i}.jpg`, thumbnail: `http://search.pstatic.net/common/?src=${i}&type=b150`, sizewidth: "800", sizeheight: "600" })) });
    }
    return keep(url, opt);
  };
  const E = { ...env, NAVER_ID: "id", NAVER_SECRET: "sec" };
  let rt = await worker.fetch(req("/api/trends"), E), jt = await rt.json();
  const picks = jt.items.filter((i) => i.grp === "pick"), byTitle = Object.fromEntries(picks.map((i) => [i.title, i]));
  ok(picks.length >= 2, "featured pictures included (grp pick): " + picks.map((p) => p.title).join(" | "));
  ok(picks[0].title === "Old town street" && picks[1].title === "Sunset over Jeju", "featured pictures keep the generator order (index): " + picks.map((p) => p.title));
  ok(!byTitle["Explicit shunga print"], "explicit featured picture dropped (title/description/category)");
  ok(byTitle["Venus de Milo front"] && byTitle["Venus de Milo front"].adult === true, "nude statue with art context stays but blurred");
  ok(!picks.some((p) => /Doc/.test(p.title)), "non-image mime (pdf) dropped");
  const jeju = byTitle["Sunset over Jeju"];
  ok(/\/1600px-/.test(jeju.full) && !/original|\/a\/ab\/Sunset_over_Jeju\.jpg$/.test(jeju.full), "huge original replaced by a 1600px version: " + jeju.full);
  ok(byTitle["Old town street"].full.endsWith("Old_town_street.jpg") && !/px-/.test(byTitle["Old town street"].full), "medium original (<=1800px) used as is");
  ok(jeju.tags.join() === "Sunsets in Jeju,Jeju Island", "useful category names become tags, noise dropped: " + jeju.tags);
  ok(jeju.src === "wikimedia" && jeju.page.includes("commons.wikimedia.org/wiki/File:"), "source and page link");
  ok(jt.items.every((i) => !("ctx" in i)), "no internal ctx leaked");
  ok(seen.some((c) => c.u.includes("gcmstart")), "first request rotates the browsing window with gcmstart");
  // 시기 지정이 거절되면 가장 최근 것으로 다시 요청
  fpStart = false; caches.default.store.clear(); seen.length = 0;
  rt = await worker.fetch(req("/api/trends"), E); jt = await rt.json();
  ok(jt.items.filter((i) => i.grp === "pick").length >= 2 && seen.filter((c) => c.u.includes("Featured_pictures")).length === 2, "if gcmstart is rejected, retries without it");

  // 데이터랩
  fpStart = true; caches.default.store.clear(); seen.length = 0;
  rt = await worker.fetch(req("/api/trends"), E); jt = await rt.json();
  const dlCalls = seen.filter((c) => c.u.includes("search-trend/v1/search"));
  ok(jt.dl.state === "ok" && dlCalls.length === 10, "datalab asked in 10 chunks (40 topics, 4 + anchor each): " + dlCalls.length);
  ok(dlCalls.every((c) => c.opt.method === "POST" && c.opt.headers["X-NCP-APIGW-API-KEY-ID"] === "id" && c.opt.headers["X-NCP-APIGW-API-KEY"] === "sec"), "uses NAVER API HUB headers");
  const b0 = JSON.parse(dlCalls[0].opt.body);
  ok(b0.timeUnit === "date" && b0.keywordGroups.length === 5 && b0.keywordGroups[0].groupName === "사진" && /^\d{4}-\d\d-\d\d$/.test(b0.startDate), "request body: anchor + 4 topics, daily");
  ok(jt.rising.length >= 3 && jt.rising[0].q === "벚꽃" && jt.rising[0].note === "▲700%" || jt.rising[0].q === "벚꽃", "fastest riser first: " + JSON.stringify(jt.rising.slice(0, 3)));
  ok(jt.rising.filter((x) => x.kind === "rising").every((x) => x.note.startsWith("▲")), "rising topics carry a growth note");
  ok(!jt.rising.some((x) => x.q === "캠핑" && x.kind === "rising"), "flat topic (growth below 15%) is not 'rising'");
  ok(jt.rising.length === 6 && jt.rising.slice(2).every((x) => x.kind === "hot"), "list filled up to 6 with high-volume topics: " + jt.rising.map((x) => x.q + ":" + x.kind));
  // 뜨는 주제의 네이버 이미지 (grp hot): 뜨는 주제 앞 3개로 이미지 검색, 주제당 14장
  {
    const hot = jt.items.filter((i) => i.grp === "hot"), imgCalls = seen.filter((c) => c.u.includes("search/v1/image"));
    const top3 = jt.rising.slice(0, 3).map((x) => x.label);
    ok(imgCalls.length === 3 && imgCalls.every((c) => c.opt.headers["X-NCP-APIGW-API-KEY-ID"] === "id"), "hot photos: exactly 3 naver image searches: " + imgCalls.length);
    ok(hot.length === 42 && hot.every((i) => i.src === "naver" && i.thumb.startsWith("https://")), "hot photos: 3 topics x 14 images, https: " + hot.length);
    ok(new Set(hot.map((i) => i.topic)).size === 3 && hot.every((i) => top3.includes(i.topic)), "hot photos come from the top-3 rising topics: " + [...new Set(hot.map((i) => i.topic))]);
    ok(hot.every((i) => !/<b>/.test(i.title)) && hot.every((i) => !i.alt || i.alt.startsWith("https://")), "naver html stripped from titles, alt upgraded to https");
    ok(jt.items.slice(0, 6).some((i) => i.grp === "hot"), "hot photos are mixed into the round-robin near the top: " + jt.items.slice(0, 6).map((i) => i.grp));
  }
  // 12시간 캐시
  seen.length = 0; await worker.fetch(req("/api/trends"), E);
  ok(seen.filter((c) => c.u.includes("search-trend")).length === 0, "datalab result cached (no second round of requests)");
  // 권한 없음 → 이유를 알림, 다른 구성은 그대로
  caches.default.store.clear(); dlMode = "denied"; seen.length = 0;
  rt = await worker.fetch(req("/api/trends"), E); jt = await rt.json();
  ok(!jt.items.some((i) => i.grp === "hot") && !seen.some((c) => c.u.includes("search/v1/image")), "no topics (datalab denied) -> no hot photos and no image searches");
  ok(rt.status === 200 && jt.dl.state === "err" && jt.dl.why === "denied" && jt.dl.status === 403 && jt.rising.length === 0, "datalab denied: reason reported, rest still works: " + JSON.stringify(jt.dl));
  ok(jt.season.length > 0 && jt.items.some((i) => i.grp === "pick"), "season topics and photos unaffected by datalab failure");
  // 키가 없으면 호출 안 함
  seen.length = 0; rt = await worker.fetch(req("/api/trends"), env); jt = await rt.json();
  ok(jt.dl.state === "off" && !seen.some((c) => c.u.includes("search-trend")) && !seen.some((c) => c.u.includes("search/v1/image")), "no naver key -> datalab off, never called, no hot photos");
  // 끄기
  seen.length = 0; rt = await worker.fetch(req("/api/trends"), { ...E, TREND_TOPICS: "off" }); jt = await rt.json();
  ok(jt.dl.state === "off" && !seen.some((c) => c.u.includes("search-trend")), "TREND_TOPICS=off skips datalab");
  // 시즌 주제는 외부 호출 없이
  ok(jt.season.every((s) => s.label && s.q && ["event", "season"].includes(s.kind)), "season topics shape");
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
  ok(j2.t === "Gold River Exclusive Tower" && Date.now() - t0 < 6000, "a hanging model is abandoned after ~4 s: " + (Date.now() - t0) + "ms");
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

// ---- 기독교 세계관: 할로윈·다른 종교 주제는 추천에서 뺌 ----
{
  const { offTopic } = await import("../src/topics.js");
  ok(["할로윈 호박", "핼러윈 파티", "Halloween costume", "부처님오신날 연등", "Buddhism", "이슬람 모스크", "Islam", "라마단", "타로 카드", "사주 보는 법", "마녀 빗자루"].every((t) => offTopic(t)), "other-faith / halloween / occult phrases are caught");
  ok(["크리스마스 트리", "부활절 달걀", "대림절 촛불", "고딕 성당", "스테인드글라스", "교회 첨탑", "Islamabad skyline", "추석 보름달", "설날 한복", "수능 응원"].every((t) => !offTopic(t)), "Christian and ordinary Korean holiday topics are not caught");
  const keep = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("pageviews/top/ko")) return new Response("x", { status: 500 });
    if (u.includes("pageviews/top/en")) return jres({ items: [{ articles: [{ article: "Halloween" }, { article: "Ramadan" }, { article: "Mount_Fuji" }, { article: "Buddhism" }] }] });
    if (u.includes("en.wikipedia.org/w/api.php")) {
      const pg = (id, t) => ({ [id]: { title: t, thumbnail: { source: `https://upload.wikimedia.org/${id}.jpg`, width: 640, height: 400 }, original: { source: `https://upload.wikimedia.org/${id}_o.jpg` } } });
      return jres({ query: { pages: { ...pg(1, "Halloween"), ...pg(2, "Ramadan"), ...pg(3, "Mount Fuji"), ...pg(4, "Buddhism") } } });
    }
    return new Response("nf", { status: 404 });
  };
  const rx = await worker.fetch(req("/api/trends"), env), jx = await rx.json();
  ok(jx.items.map((i) => i.title).join() === "Mount Fuji", "trend photos: Halloween / Ramadan / Buddhism pages dropped: " + jx.items.map((i) => i.title));
  globalThis.fetch = keep;
}

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
