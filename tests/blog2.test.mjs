// 20차 서버 점검: 네이버 블로그·WordPress.com·Tumblr 소스, /api/og (대표 이미지 찾기, 내부망 차단)
import worker from "../src/index.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const calls = [];
const jres = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const html = (b, status = 200) => new Response(b, { status, headers: { "content-type": "text/html; charset=utf-8" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ u, h: init.headers || {} });
  if (u.startsWith("https://openapi.naver.com/v1/search/blog")) return jres({ items: [
    { title: "<b>한옥</b> 마당", description: "오늘은 <b>한옥</b> 마을", link: "https://blog.naver.com/abc/1", bloggername: "아무개" },
    { title: "시체 사진 모음", description: "끔찍한 사고 현장", link: "https://blog.naver.com/abc/2", bloggername: "z" } ] });
  if (u.startsWith("https://public-api.wordpress.com/rest/v1.1/read/tags/")) return jres({ posts: [
    { title: "Old house", excerpt: "<p>A quiet yard</p>", site_name: "Home Blog", URL: "https://home.wordpress.com/a", featured_image: "https://home.files.wordpress.com/a.jpg", tags: { Yard: {}, Uncategorized: {} } },
    { title: "No picture", excerpt: "x", site_name: "n", URL: "https://n.wordpress.com/b" } ] });
  if (u.startsWith("https://api.tumblr.com/v2/tagged")) return jres({ response: [
    { type: "photo", summary: "A cat on a roof", blog_name: "catblog", post_url: "https://catblog.tumblr.com/1", tags: ["cat"], photos: [{ original_size: { url: "https://64.media.tumblr.com/o.jpg", width: 1200, height: 900 }, alt_sizes: [{ url: "https://64.media.tumblr.com/s500.jpg", width: 500, height: 375 }, { url: "https://64.media.tumblr.com/s250.jpg", width: 250, height: 188 }] }] },
    { type: "blocks", summary: "npf photo", blog_name: "npfblog", post_url: "https://npfblog.tumblr.com/3", tags: [], content: [{ type: "image", media: [{ url: "https://64.media.tumblr.com/n250.jpg", width: 250, height: 188 }, { url: "https://64.media.tumblr.com/n1280.jpg", width: 1280, height: 960 }, { url: "https://64.media.tumblr.com/n640.jpg", width: 640, height: 480 }] }] },
    { type: "text", summary: "just text", blog_name: "t", post_url: "https://t.tumblr.com/2" } ] });
  if (u === "https://m.blog.naver.com/abc/1") return html('<html><head><meta property="og:image" content="https://blogthumb.pstatic.net/x/1.jpg"></head><body></body></html>');
  if (u === "https://page.test/og") return html('<html><head><meta content="https://page.test/img.png" property="og:image"></head>');
  if (u === "https://page.test/none") return html("<html><head><title>x</title></head>");
  if (u === "https://page.test/redir") return new Response("", { status: 302, headers: { location: "http://127.0.0.1/admin" } });
  return new Response("nf", { status: 404 });
};
const req = (path, pass = "pw") => new Request("https://x.test" + path, { headers: { "x-pass": pass } });
const env = { PASS: "pw", NAVER_ID: "i", NAVER_SECRET: "s", NAVER_BASE: "https://openapi.naver.com/v1/search/image.json", TUMBLR_KEY: "t", ASSETS: { fetch: () => new Response("a") } };
const search = async (src, q = "한옥 마당", e = env, page = 1) => (await worker.fetch(req(`/api/search?src=${src}&q=${encodeURIComponent(q)}&page=${page}&safe=1`), e)).json();

let cfg = await (await worker.fetch(req("/api/config"), env)).json();
ok(["naverblog", "wpcom", "tumblr"].every((id) => cfg.sources.some((s) => s.id === id)), "config lists the three new sources");
cfg = await (await worker.fetch(req("/api/config"), { ...env, TUMBLR_KEY: "", NAVER_ID: "", BLOG: "off" })).json();
ok(!cfg.sources.some((s) => ["naverblog", "wpcom", "tumblr"].includes(s.id)), "no keys / BLOG=off hide them");

let j = await search("naverblog");
ok(j.items.length === 1 && j.items[0].title === "한옥 마당" && j.items[0].og === "card" && j.items[0].site === "아무개", "naverblog: tags stripped, gore dropped, og:card: " + JSON.stringify(j.items[0]));
ok(calls.some((c) => /search\/blog/.test(c.u) && /start=1/.test(c.u)) , "naverblog calls the blog endpoint");
j = await search("naverblog", "한옥", env, 50);
ok(calls.some((c) => /start=981/.test(c.u)), "naverblog page 50 -> start=981 (within Naver's 1000 limit)");

j = await search("wpcom", "old house", env);
ok(j.items.length === 1 && /\?w=640$/.test(j.items[0].thumb) && /\?w=1600$/.test(j.items[0].full) && !j.items[0].tags.includes("uncategorized"), "wpcom: only posts with image, sized urls: " + JSON.stringify(j.items[0]));
ok(calls.some((c) => /read\/tags\/old-house\/posts/.test(c.u)), "wpcom tag from the first two words");

j = await search("tumblr", "cat", env);
ok(j.items.length === 2 && j.items[1].full.endsWith("n1280.jpg") && j.items[1].thumb.endsWith("n640.jpg") && j.items[0].thumb.endsWith("s500.jpg") && j.items[0].full.endsWith("o.jpg") && j.items[0].site === "catblog", "tumblr: photo posts only, 500px thumb, original full");
ok(calls.some((c) => /api_key=t/.test(c.u)), "tumblr key is sent");
j = await search("tumblr", "cat", env, 30);
ok(j.items.length === 0, "tumblr page > 20 is empty");

// ---- /api/og ----
const og = async (u, pass = "pw") => (await worker.fetch(req(`/api/og?u=${encodeURIComponent(u)}`, pass), env));
ok((await og("https://page.test/og", "bad")).status === 401, "og requires password");
let r = await og("https://page.test/og"); j = await r.json();
ok(j.img === "https://page.test/img.png", "og:image found even with attribute order swapped");
j = await (await og("https://blog.naver.com/abc/1")).json();
ok(j.img.startsWith("https://blogthumb.pstatic.net/") && calls.some((c) => c.u === "https://m.blog.naver.com/abc/1"), "naver blog goes through the mobile page");
j = await (await og("https://page.test/none")).json();
ok(j.img === "" && j.err === "no og:image", "no og:image -> empty with reason");
j = await (await og("http://page.test/og")).json();
ok(j.img === "https://page.test/img.png", "http link is upgraded to https before fetching");
j = await (await og("https://127.0.0.1/x")).json();
ok(!j.img, "private host refused");
j = await (await og("https://page.test/redir")).json();
ok(!j.img, "redirect to internal host refused");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
