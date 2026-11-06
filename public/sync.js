"use strict";
// 기기 간 동기화 (앱 쪽). 화면·테스트가 함께 쓰는 모듈입니다. (서버: src/sync.js)
//
// 맞추는 것(3종류)
//  - bm  : 북마크 레코드(보드·메모·태그 …). 썸네일 이미지(blob)는 따로 올립니다(R2 가 있을 때).
//  - act : 활동 기록(관심사 묶음의 재료). 의미 벡터(vec)는 base64 로 함께 보냅니다.
//  - kv  : 취향·추천 안 함·보드 순서·최근 검색·설정 몇 가지(KV_KEYS). 값 전체를 한 덩어리로 다룹니다.
// 충돌: 레코드마다 "고친 시각(v)"이 더 나중인 쪽이 이깁니다. 삭제는 d=1 로 전달합니다.
// 이 기기의 변경은 "올릴 목록(q)"에 모아 두었다가(저장됨) 천천히 한꺼번에 올리고, 서버에서 바뀐 것은 sv 커서로 받아 옵니다.
(function (root) {
  // 기기마다 달라야 하는 것(암호 pass, 비공개 모드 priv, 하루 설명 한도 capDay …)은 일부러 뺍니다.
  const KV_KEYS = ["taste", "avoid", "boardOrder", "lastBoard", "recent", "blur", "ml", "cap", "tasteOn", "off", "cw", "bmsort"];
  const BATCH = 25, DELAY = 6000, MIN_PULL = 60000, THUMB_MAX = 1_400_000;

  // "새로 시작" 표지. 이 값이 서버·기기와 다르면 한 번만 학습·단어(취향·추천 안 함·최근 검색·활동 기록)를 비우고 새로 쌓기 시작합니다.
  // (북마크·보드·설정은 그대로.) 다음에 또 한 번 비워야 할 일이 생기면 이 값을 더 큰(나중 날짜) 문자열로 바꿉니다.
  const EPOCH = "2026-11-06";
  const RESET_KV = ["taste", "avoid", "recent"];

  // 두 기기에서 동시에 바뀐 값은 덮어쓰지 않고 합칩니다(단어가 양쪽 모두 살아남게). 합치는 규칙은 순서와 상관없이 같은 결과가 나오고, 여러 번 합쳐도 변하지 않습니다.
  const sortKeys = (o) => { const r = {}; for (const k of Object.keys(o).sort()) r[k] = o[k]; return r; }; // 같은 내용이면 항상 같은 글자열이 되게
  const newer = (a, b) => (a && b ? (b[1] > a[1] ? b : a) : a || b);
  const mergeScored = (x, y) => { const o = Object.assign({}, x || {}); for (const k of Object.keys(y || {})) o[k] = newer(o[k], y[k]); return sortKeys(o); };
  const mergeCount = (x, y) => { const o = Object.assign({}, x || {}); for (const k of Object.keys(y || {})) o[k] = Math.max(o[k] || 0, y[k] || 0); return sortKeys(o); };
  function mergeTaste(x, y) {
    x = x && x.v === 1 ? x : {}; y = y && y.v === 1 ? y : {};
    const mute = mergeCount(x.mute, y.mute), tags = mergeScored(x.tags, y.tags);
    for (const k of Object.keys(mute)) delete tags[k];
    return { v: 1, tags, colors: mergeScored(x.colors, y.colors), tones: mergeScored(x.tones, y.tones), mute };
  }
  function mergeAvoid(x, y) {
    x = x && x.v === 1 ? x : {}; y = y && y.v === 1 ? y : {};
    const by = {}; for (const e of [].concat(x.keys || [], y.keys || [])) if (Array.isArray(e) && e[0] != null) by[e[0]] = Math.max(by[e[0]] || 0, e[1] || 0);
    const keys = Object.keys(by).map((k) => [k, by[k]]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).slice(-600);
    return { v: 1, keys, pref: mergeCount(x.pref, y.pref), bad: mergeCount(x.bad, y.bad) };
  }
  function mergeRecent(x, y) {
    const by = {}; for (const e of [].concat(Array.isArray(x) ? x : [], Array.isArray(y) ? y : [])) if (e && e.q) by[e.q] = Math.max(by[e.q] || 0, e.ts || 0);
    return Object.keys(by).map((q) => ({ q, ts: by[q] })).sort((a, b) => b.ts - a.ts || (a.q < b.q ? -1 : 1)).slice(0, 30);
  }
  const MERGE = { taste: mergeTaste, avoid: mergeAvoid, recent: mergeRecent };

  const toB64 = (vec) => {
    const u = vec instanceof Uint8Array ? vec : new Uint8Array(vec.buffer ? vec.buffer : Int8Array.from(vec).buffer, vec.byteOffset || 0, vec.length);
    let s = ""; for (let i = 0; i < u.length; i += 0x2000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x2000));
    return btoa(s);
  };
  const fromB64 = (b) => Int8Array.from(atob(b), (c) => c.charCodeAt(0));

  function create(o) {
    // o: { call(path, init) → Response, bm, act: { get, all, putRaw, delRaw }, ls: { has, getRaw, setRaw }, meta: { get, set },
    //      now, onApply(info), putThumb(id, blob), getThumb(id) → Blob|null, thumbs() → boolean, timers(set/clear) }
    const now = o.now || (() => Date.now());
    const st = (o.timers && o.timers.set) || ((f, ms) => setTimeout(f, ms)), ct = (o.timers && o.timers.clear) || ((t) => clearTimeout(t));
    let m = Object.assign({ since: 0, init: 0, acct: "", on: true, q: {}, kv: {} }, o.meta.get() || {});
    m.q = m.q || {}; m.kv = m.kv || {}; m.rv = m.rv || {}; // rv: 서버에서 마지막으로 확인한 값의 버전 (그 뒤에 다른 기기가 고쳤는지 알아보는 기준)
    const save = () => { try { o.meta.set(m); } catch { /* 저장 실패는 다음 기회에 */ } };
    let saveT = null; const saveSoon = () => { if (saveT) return; saveT = st(() => { saveT = null; save(); }, 300); }; // 한꺼번에 많이 바뀔 때(모두 지우기 등) 저장을 모아서
    let timer = null, running = null, again = false, lastRun = 0, lastErr = "", scanned = false;
    const needTh = new Set();

    const active = () => !!m.on && !(o.enabled && !o.enabled());
    function kick(ms = DELAY) {
      if (!active()) return;
      ct(timer); timer = st(() => { timer = null; run().catch(() => {}); }, ms);
    }
    function mark(s, id, v, d) {
      if (!m.on) return;
      const k = s + ":" + id, e = m.q[k], vv = v || now();
      if (e && e.v > vv) return;
      m.q[k] = { s, id, v: vv, d: d ? 1 : 0 }; saveSoon(); kick();
    }
    function markKv(key) {
      if (!KV_KEYS.includes(key)) return;
      const v = now(); m.kv[key] = v; mark("kv", key, v);
    }

    // 처음 켤 때: 이 기기에 있는 것을 모두 올릴 목록에 넣습니다. (설정 값은 아주 오래된 것(v=1)으로 두어 서버에 이미 있는 값을 덮어쓰지 않게)
    async function initial() {
      const t0 = now();
      for (const x of await o.bm.all()) m.q["bm:" + x.id] = { s: "bm", id: x.id, v: x._v || x.ts || t0, d: 0 };
      for (const r of await o.act.all()) m.q["act:" + r.id] = { s: "act", id: r.id, v: r._v || r.ts || t0, d: 0 };
      for (const k of KV_KEYS) if (o.ls.has(k)) { m.kv[k] = m.kv[k] || 1; m.q["kv:" + k] = { s: "kv", id: k, v: m.kv[k], d: 0 }; }
      m.init = 1; save();
    }

    const bmJson = (rec) => { const { blob, _th, _tf, _v, ...rest } = rec; return JSON.stringify(rest); };
    const actJson = (rec) => { const { vec, _v, ...rest } = rec; if (vec && vec.length) rest.vec64 = toB64(vec); return JSON.stringify(rest); };

    // 올릴 레코드를 만듭니다. 사라진 레코드는 목록에서 뺍니다.
    async function takeRows() {
      const ents = Object.values(m.q).sort((a, b) => a.v - b.v).slice(0, BATCH), rows = [], sent = [];
      for (const e of ents) {
        if (e.d) { rows.push({ s: e.s, id: e.id, v: e.v, d: 1 }); sent.push(e); continue; }
        if (e.s === "bm") {
          const rec = await o.bm.get(e.id);
          if (!rec) { delete m.q["bm:" + e.id]; continue; }
          if (o.thumbs && o.thumbs() && rec.blob && !rec._th && (rec._tf || 0) < 3 && rec.blob.size <= THUMB_MAX) {
            try { await o.putThumb(e.id, rec.blob); rec._th = 1; await o.bm.putRaw(rec); }
            catch (err) { if (err && err.message === "auth") throw err; rec._tf = (rec._tf || 0) + 1; await o.bm.putRaw(rec); /* 3번 실패하면 그만 시도 */ }
          }
          rows.push({ s: "bm", id: e.id, v: rec._v || e.v, th: rec._th ? 1 : 0, j: bmJson(rec) }); sent.push(e);
        } else if (e.s === "act") {
          const rec = await o.act.get(e.id);
          if (!rec) { delete m.q["act:" + e.id]; continue; }
          rows.push({ s: "act", id: e.id, v: rec._v || e.v, j: actJson(rec) }); sent.push(e);
        } else if (e.s === "kv") {
          if (!o.ls.has(e.id)) { delete m.q["kv:" + e.id]; continue; }
          rows.push({ s: "kv", id: e.id, v: m.kv[e.id] || e.v, j: JSON.stringify(o.ls.getRaw(e.id)) }); sent.push(e);
        }
      }
      return { rows, sent };
    }

    // 서버에서 받은 레코드를 이 기기에 반영합니다 (이 기기 것이 더 새것이면 건너뜀)
    async function apply(list, info, pushed) {
      for (const r of list) {
        const k = r.s + ":" + r.id, pend = m.q[k];
        if (r.s === "kv") {
          if (!KV_KEYS.includes(r.id) || r.d) continue;
          const mine = pushed && pushed.get(k);
          if (mine && r.v === mine.v && r.j === mine.j) { m.rv[r.id] = r.v; continue; } // 방금 올린 내 값이 받아들여짐
          // 두 기기에서 따로 바뀐 경우: ① 방금 올린 값을 서버가 받지 않았고(서버가 더 새것이거나 같은 시각) 내용이 다름
          // ② 올리려고 기다리는 내 변경이 있는데, 내가 마지막으로 확인한 뒤에 다른 기기가 서버 값을 바꿈
          const cur = pend || mine ? JSON.stringify(o.ls.getRaw(r.id)) : "";
          const conflict = (!!mine && r.v >= mine.v && r.j !== mine.j) || (!!pend && !!MERGE[r.id] && r.v > (m.rv[r.id] || 0) && r.j !== cur);
          if (!conflict) {
            if (pend && pend.v >= r.v) continue; // 그 사이에 이 기기에서 또 고쳤으면 이 기기 값을 유지
            if ((m.kv[r.id] || 0) >= r.v) { if (m.kv[r.id] === r.v && r.j === cur) m.rv[r.id] = r.v; continue; }
          }
          let val; try { val = JSON.parse(r.j); } catch { continue; }
          m.rv[r.id] = r.v;
          if (conflict && MERGE[r.id]) {
            let mine0; try { mine0 = JSON.parse(pend || !mine ? cur : mine.j); } catch { mine0 = null; }
            const merged = MERGE[r.id](mine0, val);
            o.ls.setRaw(r.id, merged); info.kv.push(r.id);
            if (JSON.stringify(merged) === JSON.stringify(val)) { m.kv[r.id] = r.v; delete m.q[k]; } // 서버 값이 이미 전부 포함: 다시 올릴 필요 없음
            else { const mv = Math.max(now(), r.v + 1); m.kv[r.id] = mv; m.q[k] = { s: "kv", id: r.id, v: mv, d: 0 }; again = true; } // 합친 값을 올림
            continue;
          }
          o.ls.setRaw(r.id, val); m.kv[r.id] = r.v; delete m.q[k]; info.kv.push(r.id); continue; // 합치지 않는 값(설정)은 서버 값이 이김
        }
        const store = r.s === "bm" ? o.bm : r.s === "act" ? o.act : null; if (!store) continue;
        const local = await store.get(r.id), lv = local ? (local._v || local.ts || 0) : 0;
        if ((local && lv >= r.v) || (pend && pend.v >= r.v)) continue;
        if (r.d) {
          if (local) { await store.delRaw(r.id); info[r.s]++; if (r.s === "bm") info.bmGone.push(r.id); }
          delete m.q[k]; continue;
        }
        let rec; try { rec = JSON.parse(r.j); } catch { continue; }
        rec.id = r.id; rec._v = r.v;
        if (r.s === "bm") {
          rec._th = r.th ? 1 : 0;
          if (local && local.blob) rec.blob = local.blob;
          else if (rec._th && o.getThumb) needTh.add(r.id);
        } else {
          if (rec.vec64) { try { rec.vec = fromB64(rec.vec64); } catch { /* 벡터는 다시 만들면 됨 */ } delete rec.vec64; }
        }
        await store.putRaw(rec); info[r.s]++;
        if (r.s === "bm") info.bmNew.push(r.id);
        delete m.q[k];
      }
    }

    // 썸네일이 없는 북마크(다른 기기에서 온 것)의 이미지를 천천히 받아 옵니다
    async function fetchThumbs(info) {
      if (!o.getThumb) return;
      if (!scanned) { scanned = true; for (const x of await o.bm.all()) if (x._th && !x.blob) needTh.add(x.id); }
      const ids = [...needTh]; let n = 0;
      const one = async (id) => {
        needTh.delete(id);
        try { const blob = await o.getThumb(id); if (!blob) return; const rec = await o.bm.get(id); if (rec && !rec.blob) { rec.blob = blob; await o.bm.putRaw(rec); n++; } }
        catch (err) { if (err && err.message === "auth") throw err; }
      };
      for (let i = 0; i < ids.length; i += 3) await Promise.all(ids.slice(i, i + 3).map(one));
      info.thumbs = n;
    }

    async function post(body) {
      const r = await o.call("/api/sync", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
      return r.json();
    }

    async function cycle() {
      const info = { bm: 0, act: 0, kv: [], bmNew: [], bmGone: [], thumbs: 0, pushed: 0 };
      // 새로 시작: 이 표지를 아직 모르는 기기는 한 번만 학습·단어를 비웁니다 (동기화를 켜기 전부터 쌓인 것도 포함 — 예전 단어가 섞여 들어가지 않게)
      if (m.epoch !== EPOCH) {
        await o.resetLocal();
        for (const key of Object.keys(m.q)) { const e = m.q[key]; if (e.s === "act" || (e.s === "kv" && RESET_KV.includes(e.id))) delete m.q[key]; }
        for (const key of RESET_KV) { delete m.kv[key]; delete m.rv[key]; }
        info.kv.push(...RESET_KV); info.act++;
      }
      m.epoch = EPOCH; save();
      if (!m.init) await initial();
      // 올릴 취향·단어가 있으면 먼저 서버 값을 받아서, 다른 기기가 그 사이에 바꾼 것과 합친 뒤에 올립니다 (덮어써서 잃지 않게)
      if (Object.values(m.q).some((e) => e.s === "kv" && MERGE[e.id])) {
        const r0 = await post({ since: m.since, push: [], epoch: EPOCH });
        await apply(r0.pull || [], info, null);
        if (typeof r0.next === "number") m.since = r0.next;
        save();
      }
      for (let i = 0; i < 40; i++) {
        const { rows, sent } = await takeRows();
        const r = await post({ since: m.since, push: rows, epoch: EPOCH });
        for (const e of sent) { const cur = m.q[e.s + ":" + e.id]; if (cur && cur.v === e.v) delete m.q[e.s + ":" + e.id]; }
        info.pushed += rows.length;
        const pushed = new Map(rows.filter((x) => x.s === "kv" && !x.d).map((x) => [x.s + ":" + x.id, x]));
        await apply(r.pull || [], info, pushed);
        if (typeof r.next === "number") m.since = r.next;
        save();
        if (!r.more && !Object.keys(m.q).length) break;
        if (!r.more && !rows.length) break;
      }
      await fetchThumbs(info);
      return info;
    }

    function run() {
      if (!active()) return Promise.resolve(null);
      if (running) { again = true; return running; }
      running = (async () => {
        let info = null;
        try {
          info = await cycle(); lastErr = ""; lastRun = now();
          if (info.bm || info.act || info.kv.length || info.thumbs) { try { await o.onApply(info); } catch { /* 화면 갱신 실패는 무시 */ } }
        } catch (e) { lastErr = (e && e.message) || "error"; }
        finally { running = null; save(); }
        if (again) { again = false; kick(500); }
        return info;
      })();
      return running;
    }

    return {
      KV_KEYS, mark, markKv, run,
      kick, // 변경이 쌓였을 때 곧 올리기
      flush: () => { if (Object.keys(m.q).length) { ct(timer); timer = null; return run(); } return Promise.resolve(null); },
      // 오래 안 맞췄으면 맞춥니다 (앱을 다시 켜거나 화면으로 돌아왔을 때)
      refresh: () => (now() - lastRun > MIN_PULL ? run() : Promise.resolve(null)),
      isOn: () => !!m.on,
      setOn(v) { m.on = !!v; if (m.on) { m.init = 0; m.since = 0; } save(); if (m.on) kick(300); },
      // 계정 확인: 이 기기에 남은 데이터가 다른 계정 것이면 "mismatch"
      adopt(acct) {
        if (!acct || !m.on) return "ok";
        if (m.acct && m.acct !== acct) return "mismatch";
        if (!m.acct) { m.acct = acct; save(); }
        return "ok";
      },
      merge(acct) { m.acct = acct; m.init = 0; m.since = 0; m.q = {}; m.kv = {}; m.on = true; save(); kick(300); },
      async wipeRemote() {
        await o.call("/api/sync/wipe", { method: "POST" });
        m.on = false; m.init = 0; m.since = 0; m.q = {}; m.kv = {}; save();
      },
      status: () => ({ on: !!m.on, running: !!running, last: lastRun, err: lastErr, pending: Object.keys(m.q).length }),
    };
  }

  const api = { create, KV_KEYS, toB64, fromB64, EPOCH, MERGE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SyncStore = api;
})(typeof self !== "undefined" ? self : this);
