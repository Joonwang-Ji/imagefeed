// 23차: 기기 간 동기화 (서버 쪽)
//  - 계정 = 접속 암호. PASS(본인)와 PASS_MORE(지인용, 쉼표로 여러 개)에 적은 암호마다 데이터가 따로 저장됩니다.
//    서버에는 암호 자체가 아니라 암호의 해시(계정 ID)만 키로 쓰입니다.
//  - 레코드(북마크·활동 기록·취향/설정 값)는 D1(SYNC_DB), 북마크 썸네일 이미지는 R2(SYNC_THUMBS)에 저장합니다.
//    둘 다 없으면 동기화 기능이 꺼진 채 앱은 예전처럼 동작합니다. (R2 가 없으면 레코드만 맞춰지고 썸네일은 원본 주소로 보입니다)
//  - 충돌은 "나중에 고친 쪽이 이김"(레코드 단위, v = 기기에서 고친 시각). 삭제는 tombstone(d=1)으로 남겨 다른 기기에 전달합니다.
//  - 이 서버는 내용을 해석하지 않습니다. 검색 소스·AI 로는 아무것도 보내지 않아요.

const STORES = new Set(["bm", "act", "kv"]);
const MAX_PUSH = 40;                 // 한 번에 받는 레코드 수
const MAX_J = { bm: 20000, act: 20000, kv: 200000 };
const MAX_BODY = 1_500_000;
const PULL_ROWS = 100, PULL_BYTES = 350000;
const THUMB_MAX = 1_500_000;
const TOMB_DAYS = 180;
// 24차 "새로 시작": 클라이언트(public/sync.js EPOCH)가 서버에 저장된 값보다 새로운 표지를 보내면, 이 계정의 학습·단어(취향·추천 안 함·최근 검색)와 활동 기록만 한 번 지웁니다.
// 북마크·보드·설정은 그대로. 표지를 모르는 예전 기기가 올리는 학습·단어는 받지 않아서 지운 것이 되살아나지 않습니다.
const RESET_KV = ["taste", "avoid", "recent"];
const scoped = (r) => r.s === "act" || (r.s === "kv" && RESET_KV.includes(r.id));

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sync_items (a TEXT NOT NULL, s TEXT NOT NULL, id TEXT NOT NULL, v INTEGER NOT NULL, sv INTEGER NOT NULL, d INTEGER NOT NULL DEFAULT 0, th INTEGER NOT NULL DEFAULT 0, j TEXT, PRIMARY KEY (a, s, id))`,
  `CREATE INDEX IF NOT EXISTS sync_items_sv ON sync_items (a, sv)`,
];
const ready = new WeakSet();
async function ensure(db) {
  if (ready.has(db)) return;
  await db.batch(SCHEMA.map((q) => db.prepare(q)));
  ready.add(db);
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha(s) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
function safeEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// 암호가 맞으면 계정 ID(해시 앞 24자)를, 아니면 null 을 돌려줍니다.
export async function acctOf(req, env) {
  const p = req.headers.get("x-pass") || "";
  if (!p) return null;
  const list = [env.PASS || "", ...String(env.PASS_MORE || "").split(",").map((s) => s.trim())].filter(Boolean);
  let hit = false;
  for (const s of list) if (safeEq(p, s)) hit = true; // 모두 비교(처음 맞는 것에서 멈추지 않음)
  if (!hit) return null;
  return (await sha(`imagefeed|${env.ACCT_SALT || ""}|${p}`)).slice(0, 24);
}

const jres = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const thumbKey = async (a, id) => `${a}/${(await sha(String(id))).slice(0, 32)}`;

const UPSERT = `INSERT INTO sync_items (a, s, id, v, sv, d, th, j) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (a, s, id) DO UPDATE SET v = excluded.v, sv = excluded.sv, d = excluded.d, th = excluded.th, j = excluded.j
  WHERE excluded.v > sync_items.v`;

function cleanRow(r) {
  if (!r || typeof r !== "object" || !STORES.has(r.s)) return null;
  const id = typeof r.id === "string" ? r.id : "";
  const v = Number(r.v);
  if (!id || id.length > 300 || !Number.isFinite(v) || v <= 0) return null;
  const d = r.d ? 1 : 0;
  let j = null;
  if (!d) {
    if (typeof r.j !== "string" || !r.j || r.j.length > MAX_J[r.s]) return null;
    j = r.j;
  }
  return { s: r.s, id, v: Math.floor(v), d, th: r.th ? 1 : 0, j };
}

async function doSync(req, env, a) {
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return jres({ error: "too large" }, 413);
  let body;
  try { body = await req.json(); } catch { return jres({ error: "bad json" }, 400); }
  const db = env.SYNC_DB;
  await ensure(db);
  const since = Math.max(0, Math.floor(Number(body?.since) || 0));
  let rows = (Array.isArray(body?.push) ? body.push : []).slice(0, MAX_PUSH).map(cleanRow).filter(Boolean);
  const epoch = typeof body?.epoch === "string" ? body.epoch.slice(0, 32) : "";
  const meta = await db.prepare(`SELECT j FROM sync_items WHERE a = ? AND s = 'meta' AND id = 'epoch'`).bind(a).first();
  let have = meta?.j || "";
  if (epoch > have) {
    await db.batch([
      db.prepare(`DELETE FROM sync_items WHERE a = ? AND s = 'act'`).bind(a),
      db.prepare(`DELETE FROM sync_items WHERE a = ? AND s = 'kv' AND id IN (${RESET_KV.map(() => "?").join(",")})`).bind(a, ...RESET_KV),
      db.prepare(`INSERT INTO sync_items (a, s, id, v, sv, d, th, j) VALUES (?, 'meta', 'epoch', 1, 0, 0, 0, ?) ON CONFLICT (a, s, id) DO UPDATE SET j = excluded.j`).bind(a, epoch),
    ]);
    have = epoch;
  }
  if (epoch < have) rows = rows.filter((r) => !scoped(r)); // 아직 새로 시작하지 않은 기기의 옛 학습 기록은 받지 않음

  const rejected = [];
  if (rows.length) {
    const t = Date.now() * 1000; // 같은 밀리초에 들어온 레코드도 서로 다른 sv 를 갖게
    const res = await db.batch(rows.map((r, i) => db.prepare(UPSERT).bind(a, r.s, r.id, r.v, t + i, r.d, r.th, r.j)));
    rows.forEach((r, i) => { if (!((res[i]?.meta?.changes ?? 0) > 0)) rejected.push(r); });
    // 지운 북마크의 썸네일도 함께 지웁니다 (best-effort)
    if (env.SYNC_THUMBS) {
      const gone = rows.filter((r, i) => r.s === "bm" && r.d && !rejected.includes(r));
      await Promise.allSettled(gone.map(async (r) => env.SYNC_THUMBS.delete(await thumbKey(a, r.id))));
    }
    if (Math.random() < 0.02) await db.prepare(`DELETE FROM sync_items WHERE a = ? AND d = 1 AND sv < ?`).bind(a, (Date.now() - TOMB_DAYS * 86400000) * 1000).run().catch(() => {});
  }

  // 받아 갈 것: sv >= since (경계의 한 줄은 다시 보내 줘서 같은 sv 에 걸친 레코드를 놓치지 않음)
  const q = await db.prepare(`SELECT s, id, v, sv, d, th, j FROM sync_items WHERE a = ? AND s != 'meta' AND sv >= ? ORDER BY sv LIMIT ?`).bind(a, since, PULL_ROWS + 1).all();
  let list = q.results || [], more = false, bytes = 0;
  if (list.length > PULL_ROWS) { list = list.slice(0, PULL_ROWS); more = true; }
  const cut = [];
  for (const r of list) { bytes += (r.j ? r.j.length : 0) + 80; if (bytes > PULL_BYTES && cut.length) { more = true; break; } cut.push(r); }
  list = cut;
  const next = list.length ? list[list.length - 1].sv : since;
  // 서버에 더 새로운 값이 있어서 거절된 레코드는 현재 값을 함께 돌려줍니다(이 기기가 따라가도록)
  let fix = [];
  if (rejected.length) {
    const have = new Set(list.map((r) => r.s + ":" + r.id));
    const miss = rejected.filter((r) => !have.has(r.s + ":" + r.id));
    if (miss.length) {
      const got = await db.batch(miss.map((r) => db.prepare(`SELECT s, id, v, sv, d, th, j FROM sync_items WHERE a = ? AND s = ? AND id = ?`).bind(a, r.s, r.id)));
      fix = got.flatMap((g) => g.results || []);
    }
  }
  return jres({ pull: [...list, ...fix].map(({ s, id, v, d, th, j }) => ({ s, id, v, d, th, j })), next, more, pushed: rows.length - rejected.length, rejected: rejected.length });
}

async function doThumb(req, env, a, u) {
  if (!env.SYNC_THUMBS) return jres({ error: "no thumbs" }, 501);
  const id = u.searchParams.get("id") || "";
  if (!id || id.length > 300) return jres({ error: "bad id" }, 400);
  const key = await thumbKey(a, id);
  if (req.method === "PUT") {
    if (Number(req.headers.get("content-length") || 0) > THUMB_MAX) return jres({ error: "too large" }, 413);
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) return jres({ error: "not an image" }, 415);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > THUMB_MAX || !buf.byteLength) return jres({ error: "bad size" }, 413);
    await env.SYNC_THUMBS.put(key, buf, { httpMetadata: { contentType: type } });
    return jres({ ok: true });
  }
  if (req.method === "GET") {
    const o = await env.SYNC_THUMBS.get(key);
    if (!o) return jres({ error: "none" }, 404);
    const type = o.httpMetadata?.contentType || "application/octet-stream";
    return new Response(o.body, { headers: { "content-type": type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  }
  return jres({ error: "method" }, 405);
}

async function doWipe(env, a) {
  const db = env.SYNC_DB;
  await ensure(db);
  const r = await db.prepare(`DELETE FROM sync_items WHERE a = ?`).bind(a).run();
  let thumbs = 0;
  if (env.SYNC_THUMBS) {
    for (let i = 0; i < 50; i++) {
      const l = await env.SYNC_THUMBS.list({ prefix: a + "/", limit: 500 });
      if (!l.objects.length) break;
      await env.SYNC_THUMBS.delete(l.objects.map((o) => o.key));
      thumbs += l.objects.length;
      if (!l.truncated) break;
    }
  }
  return jres({ ok: true, rows: r?.meta?.changes ?? 0, thumbs });
}

// /api/sync* 요청 처리. 동기화가 꺼져 있으면(D1 없음) 501.
export async function syncRoute(req, env, u, a) {
  if (!env.SYNC_DB) return jres({ error: "sync off" }, 501);
  try {
    if (u.pathname === "/api/sync" && req.method === "POST") return await doSync(req, env, a);
    if (u.pathname === "/api/sync/thumb") return await doThumb(req, env, a, u);
    if (u.pathname === "/api/sync/wipe" && req.method === "POST") return await doWipe(env, a);
  } catch (e) {
    return jres({ error: "sync failed", detail: String(e?.message || e).slice(0, 120) }, 500);
  }
  return jres({ error: "not found" }, 404);
}
