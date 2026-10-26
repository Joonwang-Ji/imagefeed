// 화면 파일만 캐시합니다. /api/ (검색·이미지)는 절대 캐시하지 않습니다.
const NAME = "imagefeed-shell-v4";
const SHELL = ["/", "/style.css", "/app.js", "/color.js", "/manifest.webmanifest", "/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(NAME).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(NAME).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
