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

// 모든 소스 실패 → 502
const saved = globalThis.fetch; globalThis.fetch = async () => new Response("x", { status: 500 });
r = await worker.fetch(req("/api/trends"), env); ok(r.status === 502, "502 when nothing available");
globalThis.fetch = saved;

// 필터 점검: 홈 카테고리 세부 주제가 필터에 걸리지 않는지 (app.js 의 CATS 를 그대로 읽어 검사)
import fs from "node:fs";
const app = fs.readFileSync(ROOT + "public/app.js", "utf8");
const m = app.match(/const CATS = (\[[\s\S]*?\n\]);/); const CATS = eval(m[1]);
ok(CATS.length >= 30, `categories: ${CATS.length}`);
const bad = CATS.flatMap((c) => [c[1], ...c[2]]).filter((t) => hardBlocked(t) || isAdult(t));
ok(bad.length === 0, "no home topic trips the filters" + (bad.length ? ": " + bad : ""));
ok(CATS.every((c) => c[2].length >= 5), "each category has >= 5 sub topics");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
