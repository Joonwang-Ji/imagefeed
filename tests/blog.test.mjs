// 19차 서버 점검: 카카오 블로그 소스, 카카오 이미지의 출처 이름 분리, AI 설명 문장(캡션) 응답
import worker from "../src/index.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const calls = [];
const jres = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
let blogDocs = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ u, h: init.headers || {} });
  if (u.startsWith("https://dapi.kakao.com/v2/search/blog")) return jres({ meta: { total_count: 9, pageable_count: 9, is_end: false }, documents: blogDocs });
  if (u.startsWith("https://dapi.kakao.com/v2/search/image")) return jres({ documents: [
    { image_url: "https://cafe.test/a.jpg", thumbnail_url: "https://t.kakao.test/a.jpg", display_sitename: "daum카페", width: 800, height: 600, doc_url: "https://cafe.test/a" },
    { image_url: "https://blog.test/b.jpg", thumbnail_url: "https://t.kakao.test/b.jpg", display_sitename: "티스토리", width: 800, height: 600, doc_url: "https://blog.test/b" } ] });
  return new Response("nf", { status: 404 });
};
const req = (path, pass = "pw") => new Request("https://x.test" + path, { headers: { "x-pass": pass } });
const env = { PASS: "pw", KAKAO_KEY: "k", ASSETS: { fetch: () => new Response("a") } };
const search = async (src, q = "한옥 마당", e = env) => (await worker.fetch(req(`/api/search?src=${src}&q=${encodeURIComponent(q)}&page=2&safe=1`), e)).json();

// ---- 소스 목록 ----
let cfg = await (await worker.fetch(req("/api/config"), env)).json();
ok(cfg.sources.some((s) => s.id === "kakaoblog" && s.name.includes("블로그") && s.keyless === false), "config lists the blog source when KAKAO_KEY is set");
cfg = await (await worker.fetch(req("/api/config"), { ...env, KAKAO_KEY: "" })).json();
ok(!cfg.sources.some((s) => s.id === "kakaoblog") && cfg.locked.some((s) => s.id === "kakaoblog" && s.need.includes("KAKAO_KEY")), "without a Kakao key it shows up as a locked source (not an error)");
cfg = await (await worker.fetch(req("/api/config"), { ...env, BLOG: "off" })).json();
ok(!cfg.sources.some((s) => s.id === "kakaoblog"), "BLOG=off hides the blog source");

// ---- 블로그 검색 ----
blogDocs = [
  { title: "<b>한옥</b> 마당 &amp; 툇마루", contents: "오늘은 <b>한옥</b> 마을에 다녀왔어요. 기와 지붕이 예뻐서 사진을 많이 찍었습니다.", url: "https://truth.tistory.com/12", blogname: "진실의 블로그", thumbnail: "https://search1.kakaocdn.net/argon/130x130_85_c/AbCdEf", datetime: "2026-10-01T00:00:00.000+09:00" },
  { title: "사진 없는 글", contents: "본문", url: "https://x.tistory.com/1", blogname: "x", thumbnail: "" },
  { title: "다른 호스트 사진", contents: "본문", url: "https://y.blog.me/2", blogname: "y", thumbnail: "https://img.other.test/p/1.jpg" },
  { title: "시체 사진 모음", contents: "끔찍한 사고 현장", url: "https://z.tistory.com/3", blogname: "z", thumbnail: "https://search1.kakaocdn.net/argon/130x130_85_c/ZZZ" },
];
calls.length = 0;
let j = await search("kakaoblog");
const used = calls.find((c) => c.u.includes("/search/blog"));
ok(used && /query=%ED%95%9C%EC%98%A5/.test(used.u) && /page=2&/.test(used.u) && /size=30/.test(used.u) && used.h.Authorization === "KakaoAK k", "calls the Kakao blog API with the key, query, page and size");
ok(j.items.length === 2 && !j.err, "posts without a thumbnail are skipped, and a gore-like post is dropped by the hard filter: " + j.items.map((i) => i.title).join(" | "));
const b = j.items[0];
ok(b.title === "한옥 마당 & 툇마루" && !/[<>]/.test(b.title), "title: tags removed, entities decoded: " + b.title);
ok(/기와 지붕/.test(b.desc) && !/<b>/.test(b.desc) && b.desc.length <= 160, "desc: post snippet kept as plain text (≤160 chars)");
ok(b.site === "진실의 블로그" && b.page === "https://truth.tistory.com/12" && b.src === "kakaoblog", "site (blog name), page link and source id");
ok(b.thumb === "https://search1.kakaocdn.net/argon/600x0_65_wg/AbCdEf" && b.alt === "https://search1.kakaocdn.net/argon/130x130_85_c/AbCdEf", "kakao thumbnail asks for a bigger size first, original small URL is kept as the fallback (alt)");
ok(j.items[1].thumb === "https://img.other.test/p/1.jpg" && j.items[1].alt === "https://img.other.test/p/1.jpg", "other thumbnail formats are left untouched");
ok(Array.isArray(b.tags) && b.tags.length === 0 && b.adult === false, "no tags; not adult");

// 성인 단어가 본문에만 있어도 블러 표시
blogDocs = [{ title: "여행 일기", contents: "야한 누드 사진", url: "https://a.tistory.com/1", blogname: "a", thumbnail: "https://search1.kakaocdn.net/argon/130x130_85_c/Q" }];
j = await search("kakaoblog"); ok(j.items.length === 1 && j.items[0].adult === true, "adult words in the snippet mark the item adult (blur)");

// 오류는 사유와 함께
globalThis.fetch = async () => new Response("no", { status: 429 });
j = await search("kakaoblog"); ok(j.items.length === 0 && j.err === "limit", "kakao rate limit is reported as a reason, not a crash: " + j.err);
globalThis.fetch = async () => jres({ documents: [] });

// ---- 카카오 이미지: 출처 이름은 title 이 아니라 site ----
globalThis.fetch = async (url) => { const u = String(url); return u.includes("/search/image") ? jres({ documents: [{ image_url: "https://cafe.test/a.jpg", thumbnail_url: "https://t.kakao.test/a.jpg", display_sitename: "daum카페", width: 800, height: 600, doc_url: "https://cafe.test/a" }] }) : new Response("nf", { status: 404 }); };
j = await search("kakao");
ok(j.items.length === 1 && j.items[0].title === "" && j.items[0].site === "daum카페", "kakao image: the site name goes to 'site', title stays empty (so it is never learned as a taste word)");

// ---- 설명(캡션): 문장도 함께 ----
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const postCap = (e, body = jpeg) => worker.fetch(new Request("https://x.test/api/caption", { method: "POST", headers: { "x-pass": "pw", "content-type": "image/jpeg" }, body }), e);
const seenCap = [];
const long = "A white ceramic vase with dried flowers sits on a wooden windowsill. Soft morning light, calm and minimal Scandinavian style. " + "x".repeat(300);
const AIc = { run: async (model, input) => { seenCap.push({ model, input }); return { description: long }; } };
const caches0 = globalThis.caches; const store = new Map();
globalThis.caches = { default: { match: async (k) => store.get(k.url), put: async (k, v) => { store.set(k.url, v); } } };
let r = await postCap({ ...env, AI: AIc }); j = await r.json();
ok(j.q && /ceramic/.test(j.q) && typeof j.text === "string" && j.text.length === 240 && /^A white ceramic vase/.test(j.text), "caption returns keywords and a sentence (cut to 240 chars)");
ok(/one or two short sentences/.test(seenCap[0].input.prompt) && seenCap[0].input.max_tokens === 80, "asks for one or two sentences (subject, setting, mood/style, colors) with room for them");
ok([...store.keys()].some((k) => k.includes("/cap2?h=")), "results are cached under the new cap2 key (old one-line results are not reused)");
const n0 = seenCap.length; r = await postCap({ ...env, AI: AIc }); await r.json(); ok(seenCap.length === n0, "same image is served from cache (no second AI call)");
r = await postCap({ ...env, AI: { run: async () => ({ description: "a bloody corpse lying on the road" }) } }, new Uint8Array([0xff, 0xd8, 9, 9, 9])); j = await r.json();
ok(j.blocked === true && !j.text, "hard-blocked descriptions return blocked, no sentence");
globalThis.caches = caches0;

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
