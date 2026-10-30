// 22차 서버 점검: Flickr · Are.na · Bluesky · Wallhaven 소스 (실제 응답은 모의)
import worker from "../src/index.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
let calls = [];
const jres = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
let flickrFail = false, bskyExpireOnce = false, bskyLoginFail = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ u, h: init.headers || {}, m: init.method || "GET", b: init.body });
  if (u.startsWith("https://api.flickr.com/services/rest/")) {
    if (flickrFail) return jres({ stat: "fail", code: 100, message: "Invalid API Key" });
    return jres({ stat: "ok", photos: { photo: [
      { id: "1", owner: "o1", title: "Misty lake", ownername: "Kim", tags: "lake mist taken:date=2020 geo:lat=3 nature", url_c: "https://live.staticflickr.com/c1.jpg", width_c: "800", height_c: "533", url_m: "https://live.staticflickr.com/m1.jpg", url_l: "https://live.staticflickr.com/l1.jpg" },
      { id: "2", owner: "o2", title: "small only", tags: "", url_m: "https://live.staticflickr.com/m2.jpg", width_m: "500", height_m: "375" },
      { id: "3", owner: "o3", title: "no urls" } ] } });
  }
  if (u.startsWith("https://api.are.na/v2/search/blocks")) return jres({ blocks: [
    { id: 11, class: "Image", title: "ref", user: { username: "sam" }, image: { thumb: { url: "https://d2w9rnfcy7mm78.cloudfront.net/t.jpg" }, display: { url: "https://d2w9rnfcy7mm78.cloudfront.net/d.jpg" }, large: { url: "https://d2w9rnfcy7mm78.cloudfront.net/l.jpg" }, original: { url: "https://d2w9rnfcy7mm78.cloudfront.net/o.jpg" } } },
    { id: 12, class: "Link", title: "a link", image: { display: { url: "https://x/y.jpg" } } },
    { id: 13, class: "Text", content: "words" } ] });
  if (u.startsWith("https://bsky.social/xrpc/com.atproto.server.createSession")) {
    if (bskyLoginFail) return jres({ error: "AuthenticationRequired" }, 401);
    return jres({ accessJwt: "jwt" + calls.filter((c) => c.u.includes("createSession")).length });
  }
  if (u.startsWith("https://bsky.social/xrpc/app.bsky.feed.searchPosts")) {
    if (bskyExpireOnce) { bskyExpireOnce = false; return jres({ error: "ExpiredToken" }, 400); }
    const img = { thumb: "https://cdn.bsky.app/img/feed_thumbnail/a.jpg", fullsize: "https://cdn.bsky.app/img/feed_fullsize/a.jpg", alt: "big moon rising", aspectRatio: { width: 4, height: 3 } };
    return jres({ posts: [
      { uri: "at://did:plc:x/app.bsky.feed.post/3abc", author: { handle: "ann.bsky.social", displayName: "Ann" }, record: { text: "moon tonight #moonphoto", tags: ["night"] }, embed: { images: [img] } },
      { uri: "at://did:plc:x/app.bsky.feed.post/3def", author: { handle: "b.bsky.social" }, record: { text: "quote with media" }, embed: { media: { images: [img] } } },
      { uri: "at://did:plc:x/app.bsky.feed.post/3ghi", author: { handle: "c.bsky.social" }, record: { text: "spicy" }, labels: [{ val: "porn" }], embed: { images: [img] } },
      { uri: "at://did:plc:x/app.bsky.feed.post/3jkl", author: { handle: "d.bsky.social", labels: [{ val: "sexual" }] }, record: { text: "x" }, embed: { images: [img] } },
      { uri: "at://did:plc:x/app.bsky.feed.post/3mno", author: { handle: "e.bsky.social" }, record: { text: "text only" } } ] });
  }
  if (u.startsWith("https://wallhaven.cc/api/v1/search")) return jres({ data: [
    { id: "w1", url: "https://wallhaven.cc/w/w1", path: "https://w.wallhaven.cc/full/w1/wallhaven-w1.jpg", dimension_x: 3840, dimension_y: 2160, category: "general", thumbs: { large: "https://th.wallhaven.cc/lg/w1/w1.jpg", original: "https://th.wallhaven.cc/orig/w1/w1.jpg" } },
    { id: "w2", url: "https://wallhaven.cc/w/w2", dimension_x: 10, dimension_y: 10, thumbs: {} } ] });
  return new Response("nf", { status: 404 });
};
const req = (path, pass = "pw") => new Request("https://x.test" + path, { headers: { "x-pass": pass } });
const base = { PASS: "pw", ASSETS: { fetch: () => new Response("a") } };
const env = { ...base, FLICKR_KEY: "fk", ARENA_TOKEN: "at", BSKY_ID: "me.bsky.social", BSKY_PASSWORD: "app-pw" };
const search = async (src, q = "moon", e = env, page = 1, extra = "") => (await worker.fetch(req(`/api/search?src=${src}&q=${encodeURIComponent(q)}&page=${page}&safe=1${extra}`), e)).json();
const reset = () => { calls = []; };

// ---- 설정 화면: 키가 있으면 보이고 없으면 locked, Wallhaven 은 키 없이 보임 ----
let cfg = await (await worker.fetch(req("/api/config"), env)).json();
ok(["flickr", "arena", "bluesky", "wallhaven"].every((id) => cfg.sources.some((s) => s.id === id)), "config lists all four with keys");
cfg = await (await worker.fetch(req("/api/config"), base)).json();
ok(cfg.sources.some((s) => s.id === "wallhaven") && !cfg.sources.some((s) => ["flickr", "arena", "bluesky"].includes(s.id)), "without keys only wallhaven is active");
ok(["flickr", "arena", "bluesky"].every((id) => cfg.locked.some((s) => s.id === id && s.need.length)), "keyed sources show up as locked with the needed variable names");
cfg = await (await worker.fetch(req("/api/config"), { ...base, BSKY_ID: "me" })).json();
ok(!cfg.sources.some((s) => s.id === "bluesky"), "bluesky needs both id and password");

// ---- Flickr ----
let j = await search("flickr", "moon");
ok(j.items.length === 2, "flickr: photos without any image url are dropped");
ok(j.items[0].thumb.endsWith("c1.jpg") && j.items[0].full.endsWith("l1.jpg") && j.items[0].w === 800 && j.items[0].h === 533 && j.items[0].site === "Kim" && j.items[0].page === "https://www.flickr.com/photos/o1/1", "flickr: 800px thumb, 1024px full, size, owner, page link");
ok(j.items[0].tags.join(",") === "lake,mist,nature", "flickr: machine tags (taken:, geo:) are removed from tags: " + j.items[0].tags);
ok(j.items[1].thumb.endsWith("m2.jpg") && j.items[1].full.endsWith("m2.jpg") && j.items[1].w === 500, "flickr: falls back to the medium size");
ok(calls.some((c) => /api_key=fk/.test(c.u) && /safe_search=1/.test(c.u) && /media=photos/.test(c.u) && /sort=relevance/.test(c.u)), "flickr: key, safe_search=1, photos only, relevance sort");
// (Flickr 의 4,000장 한도는 /api/search 의 쪽 번호 상한 50쪽 × 40장 = 2,000장 안쪽이라 화면에서는 도달하지 않습니다. 어댑터의 방어 코드로만 둡니다.)
flickrFail = true;
j = await search("flickr", "moon2");
ok(j.items.length === 0 && j.err === "denied" && /100/.test(j.detail), "flickr: stat:fail is reported as a ⚠ reason: " + j.err + " " + j.detail);
flickrFail = false;

// ---- Are.na ----
reset();
j = await search("arena", "poster");
ok(j.items.length === 1 && j.items[0].full.endsWith("l.jpg") && j.items[0].thumb.endsWith("d.jpg") && j.items[0].alt.endsWith("t.jpg") && j.items[0].page === "https://www.are.na/block/11", "arena: only Image blocks, display thumb, large full, block link");
ok(calls.some((c) => c.h.Authorization === "Bearer at"), "arena: token is sent as Bearer");

// ---- Bluesky ----
reset();
j = await search("bluesky", "moon");
ok(calls.filter((c) => c.u.includes("createSession")).length === 1 && JSON.parse(calls.find((c) => c.u.includes("createSession")).b).password === "app-pw", "bluesky: logs in once with the app password");
ok(j.items.length === 2, "bluesky: image posts only, porn/sexual labelled post or author skipped: " + j.items.length);
ok(j.items[0].full.endsWith("a.jpg") && j.items[0].w === 4 && j.items[0].h === 3 && j.items[0].title === "big moon rising" && j.items[0].page === "https://bsky.app/profile/ann.bsky.social/post/3abc" && j.items[0].tags.includes("moonphoto") && j.items[0].tags.includes("night"), "bluesky: fields, hashtag + record tags");
ok(j.items[1].page.endsWith("/3def"), "bluesky: images inside recordWithMedia are read too");
reset();
await search("bluesky", "moon2", env, 2);
ok(calls.filter((c) => c.u.includes("createSession")).length === 0, "bluesky: login token is reused (no second login)");
ok(calls.some((c) => c.u.includes("searchPosts") && /cursor=100/.test(c.u)), "bluesky: page 2 sends offset cursor 100");
reset(); bskyExpireOnce = true;
j = await search("bluesky", "moon3");
ok(j.items.length === 2 && calls.filter((c) => c.u.includes("createSession")).length === 1, "bluesky: expired token -> log in again once and retry");
j = await search("bluesky", "moon4", env, 21);
ok(j.items.length === 0, "bluesky: page > 20 is empty");
// 로그인 실패 사유 (새 토큰이 필요하도록 시간 경과를 흉내: 다른 모듈 상태를 건드리지 않으려고 만료 응답 + 로그인 실패 조합)
reset(); bskyExpireOnce = true; bskyLoginFail = true;
j = await search("bluesky", "moon5");
ok(j.items.length === 0 && j.err === "denied" && /Bluesky 로그인/.test(j.detail), "bluesky: wrong app password shows a clear ⚠ reason: " + j.err + " " + j.detail);
bskyLoginFail = false;

// ---- Wallhaven ----
reset();
j = await search("wallhaven", "fog forest", base, 1, "&orient=h");
ok(j.items.length === 1 && j.items[0].thumb.endsWith("orig/w1/w1.jpg") && j.items[0].alt.includes("/lg/") && j.items[0].full.includes("full/w1") && j.items[0].w === 3840 && j.items[0].h === 2160, "wallhaven: orig thumb, large alt, full path, size; items without path/thumb dropped");
ok(calls.some((c) => /purity=100/.test(c.u) && /ratios=landscape/.test(c.u) && /sorting=relevance/.test(c.u)), "wallhaven: SFW only, orientation → ratios");
ok(!calls.some((c) => /apikey/i.test(c.u)), "wallhaven: no key is sent");

// ---- 트렌드 베스트: Flickr 는 최근 30일 흥미도순 ----
reset();
j = await (await worker.fetch(req("/api/trends?g=best&page=1"), { ...env, FLICKR_KEY: "fk" })).json();
const fc = calls.filter((c) => c.u.startsWith("https://api.flickr.com/"));
ok(fc.length === 1 && /sort=interestingness-desc/.test(fc[0].u) && /min_upload_date=\d{10}/.test(fc[0].u), "best: one flickr call, interestingness sort within the last 30 days");
ok(j.items.some((i) => i.src === "flickr" && i.grp === "best"), "best: flickr photos appear with grp best");
reset();
await worker.fetch(req("/api/trends?g=best&page=1"), base);
ok(!calls.some((c) => c.u.startsWith("https://api.flickr.com/")), "best: no flickr call without FLICKR_KEY");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
