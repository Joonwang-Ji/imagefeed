// 화면 파일만 캐시합니다. /api/ (검색·이미지)는 절대 캐시하지 않습니다.
const NAME = "imagefeed-shell-v20";
const VENDOR = "imagefeed-vendor-nsfw4"; // 브라우저 AI 검사 번들(약 4.6MB). 내용이 바뀌지 않는 파일이라 한 번 받으면 계속 씁니다.
const SHELL = ["/", "/style.css", "/app.js", "/color.js", "/relevance.js", "/safety.js", "/taste.js", "/interests.js", "/avoid.js", "/manifest.webmanifest", "/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(NAME).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== NAME && k !== VENDOR).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (u.pathname.startsWith("/vendor/nsfw4/")) {
    // 캐시에 있으면 바로 쓰고, 없으면 받아서 저장합니다.
    e.respondWith(caches.open(VENDOR).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(NAME).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
