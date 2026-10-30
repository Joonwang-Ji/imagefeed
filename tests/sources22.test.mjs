// 22차 서버 점검: Bluesky · Wallhaven 소스 (Flickr·Are.na 는 무료 계정으로 키·검색이 안 되어 제거) (실제 응답은 모의)
import worker from "../src/index.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
let calls = [];
const jres = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
let bskyExpireOnce = false, bskyLoginFail = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ u, h: init.headers || {}, m: init.method || "GET", b: init.body });
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
const env = { ...base, BSKY_ID: "me.bsky.social", BSKY_PASSWORD: "app-pw" };
const search = async (src, q = "moon", e = env, page = 1, extra = "") => (await worker.fetch(req(`/api/search?src=${src}&q=${encodeURIComponent(q)}&page=${page}&safe=1${extra}`), e)).json();
const reset = () => { calls = []; };
let j;

// ---- 설정 화면: Bluesky 는 아이디·앱 비밀번호가 있을 때만, Wallhaven 은 키 없이 보임. 제거한 소스는 어떤 설정에서도 안 보임 ----
let cfg = await (await worker.fetch(req("/api/config"), env)).json();
ok(["bluesky", "wallhaven"].every((id) => cfg.sources.some((s) => s.id === id)), "config lists bluesky and wallhaven");
ok(![...cfg.sources, ...cfg.locked].some((s) => ["flickr", "arena"].includes(s.id)), "removed sources never appear (not even as locked)");
cfg = await (await worker.fetch(req("/api/config"), base)).json();
ok(cfg.sources.some((s) => s.id === "wallhaven") && !cfg.sources.some((s) => s.id === "bluesky") && cfg.locked.some((s) => s.id === "bluesky" && s.need.length === 2), "without keys only wallhaven is active, bluesky is locked with both variable names");
cfg = await (await worker.fetch(req("/api/config"), { ...base, BSKY_ID: "me" })).json();
ok(!cfg.sources.some((s) => s.id === "bluesky"), "bluesky needs both id and password");

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

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
