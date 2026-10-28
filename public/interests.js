"use strict";
// 관심사 묶음(군집): 내가 북마크·좋아요·오래 본 이미지들을 "비슷한 것끼리" 묶어서, 묶음마다 대표 이미지 한 장과 검색어를 만듭니다.
// 화면(app.js)과 자동 점검이 함께 쓰는 순수 함수 모음이라 DOM·네트워크를 쓰지 않습니다.
//
// 핀터레스트가 공개한 방식(PinnerSage)에서 가져온 구조:
//  - 사람을 벡터 하나가 아니라 "여러 개의 관심사"로 봅니다. 최근 활동 이미지를 비슷한 것끼리 묶고(평균 연결 군집),
//  - 묶음마다 실제 이미지 한 장(medoid)을 대표로 삼고, 묶음의 중요도 = 시간이 지날수록 줄어드는 가중치의 합(하루 1%씩 감쇠),
//  - 보여 줄 때는 중요도에 비례해 최대 3개 관심사를 뽑고, 가장 최근에 한 활동의 묶음은 반드시 포함합니다.
//  - 같은 보드에 담은 이미지는 서로 가깝다고 봅니다(PinSage 가 쓰는 "같은 보드" 신호).
// 외부 검색 API 로 이미지를 가져오는 구조라서, 이웃 검색은 벡터가 아니라 "묶음의 검색어"로 합니다.
(function (root) {
  const DAY = 86400000;
  const LAMBDA = 0.01;           // 하루당 감쇠율 (PinnerSage 와 같은 값). 약 69일마다 절반
  const MAXN = 200;              // 한 번에 묶는 활동 수 상한 (계산량 제한)
  const THRESH = 0.2;            // 이 유사도보다 낮은 묶음끼리는 합치지 않음
  const MIN_W = 1.5;             // 이 중요도보다 작은 묶음은 관심사로 보지 않음 (북마크 1개=3, 오래 본 것 1개=1)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const norm = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFC").trim();

  // ---- 벡터 (Int8 로 줄여 저장한 임베딩) ----
  function cosine(a, b) {
    if (!a || !b || a.length !== b.length || !a.length) return null;
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? d / Math.sqrt(na * nb) : null;
  }
  // 여러 벡터의 가중 평균(중심). 길이가 다른 것은 건너뜀.
  function centroid(vecs, ws) {
    const first = vecs.find(Boolean); if (!first) return null;
    const c = new Float32Array(first.length); let n = 0;
    vecs.forEach((v, i) => { if (!v || v.length !== c.length) return; const w = ws ? ws[i] : 1; for (let j = 0; j < c.length; j++) c[j] += v[j] * w; n++; });
    return n ? c : null;
  }

  // ---- 두 활동의 비슷한 정도 0~1 ----
  // 글자(태그·제목 단어) 겹침을 "드문 단어일수록 더 중요하게" 세고(IDF), 색·톤이 비슷하면 조금 더하고, 같은 보드면 크게 더합니다.
  // 임베딩이 둘 다 있으면 의미 유사도를 함께 씁니다(한글·영어가 섞여도 비슷하게 읽힘).
  function makeSim(es) {
    const df = new Map();
    for (const e of es) for (const k of new Set(e.keys || [])) df.set(k, (df.get(k) || 0) + 1);
    const N = Math.max(1, es.length), idf = (k) => Math.log(1 + N / (df.get(k) || 1));
    const text = (a, b) => {
      const A = new Set(a.keys || []), B = new Set(b.keys || []); if (!A.size || !B.size) return 0;
      let inter = 0, uni = 0;
      for (const k of A) { const w = idf(k); uni += w; if (B.has(k)) inter += w; }
      for (const k of B) if (!A.has(k)) uni += idf(k);
      return uni ? inter / uni : 0;
    };
    const visual = (a, b) => {
      const x = a.an, y = b.an; if (!x?.tone || !y?.tone) return 0;
      let v = 0;
      if (x.tone === y.tone) v += 0.06;
      if (x.temp && x.temp === y.temp && x.temp !== "neutral") v += 0.03;
      if ((x.cols || []).length && (y.cols || []).length && x.cols[0] === y.cols[0]) v += 0.04;
      return v;
    };
    const sim = (a, b) => {
      const t = text(a, b), c = cosine(a.vec, b.vec);
      // 임베딩 코사인은 관련 있어도 0.5~0.7, 무관해도 0.3 안팎이라 0.35~0.85 구간을 0~1로 펴서 씁니다
      let s = c == null ? t : 0.65 * clamp((c - 0.35) / 0.5, 0, 1) + 0.35 * t;
      s += visual(a, b);
      if (a.boards?.length && b.boards?.length && a.boards.some((x) => b.boards.includes(x))) s += 0.3; // 같은 보드
      return clamp(s, 0, 1);
    };
    return { sim, idf };
  }

  // ---- 활동 목록을 정리: 시간 감쇠 적용, 약한 것·단서 없는 것 제외, 중요한 순으로 상한까지 ----
  // 입력 e: { id, keys[], an?, boards?[], wt(점수 합), ts, vec? }
  function prepare(entries, now = Date.now()) {
    const out = [];
    for (const e of entries || []) {
      if (!e || !e.id || !(e.wt > 0)) continue;
      if (!(e.keys && e.keys.length) && !e.vec) continue;
      const days = Math.max(0, (now - (e.ts || now)) / DAY), eff = e.wt * Math.exp(-LAMBDA * days);
      if (eff < 0.05) continue;
      out.push({ ...e, eff });
    }
    return out.sort((a, b) => b.eff - a.eff).slice(0, MAXN);
  }

  // ---- 평균 연결 군집 (Lance-Williams 갱신) ----
  // 반환: [{ ids, members(인덱스), weight, latest, medoid(인덱스), terms[], label, vec }] 중요도 큰 순
  function build(entries, opts = {}) {
    const now = opts.now || Date.now(), T = opts.threshold ?? THRESH;
    const es = prepare(entries, now), n = es.length;
    if (!n) return [];
    const { sim, idf } = makeSim(es);
    const S = new Float32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = sim(es[i], es[j]); S[i * n + j] = S[j * n + i] = s; }
    const D = Float32Array.from(S), size = new Array(n).fill(1), alive = new Array(n).fill(true), mem = es.map((_, i) => [i]);
    for (;;) {
      let bi = -1, bj = -1, best = T;
      for (let i = 0; i < n; i++) { if (!alive[i]) continue; for (let j = i + 1; j < n; j++) if (alive[j] && D[i * n + j] >= best) { best = D[i * n + j]; bi = i; bj = j; } }
      if (bi < 0) break;
      for (let k = 0; k < n; k++) {
        if (!alive[k] || k === bi || k === bj) continue;
        const v = (size[bi] * D[bi * n + k] + size[bj] * D[bj * n + k]) / (size[bi] + size[bj]);
        D[bi * n + k] = D[k * n + bi] = v;
      }
      size[bi] += size[bj]; mem[bi].push(...mem[bj]); alive[bj] = false;
    }
    const clusters = [];
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const m = mem[i], weight = m.reduce((t, k) => t + es[k].eff, 0);
      if (weight < (opts.minWeight ?? MIN_W)) continue;
      // 대표 이미지: 같은 묶음의 다른 이미지들과 가장 가까운(중요도로 가중) 실제 활동 하나
      let medoid = m[0], bs = -1;
      for (const a of m) { let s = 0; for (const b of m) if (a !== b) s += S[a * n + b] * es[b].eff; s += es[a].eff * 0.5; if (s > bs) { bs = s; medoid = a; } }
      // 묶음을 대표하는 단어: 묶음 안에서 (중요도 × 드문 정도) 합이 큰 것. 두 개 이상에서 나온 단어를 우선(묶음이 3개 이상일 때)
      const sc = new Map(), cnt = new Map();
      for (const k of m) for (const t of new Set(es[k].keys || [])) { sc.set(t, (sc.get(t) || 0) + es[k].eff * idf(t)); cnt.set(t, (cnt.get(t) || 0) + 1); }
      let terms = [...sc.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
      if (m.length >= 3) { const multi = terms.filter((t) => cnt.get(t) >= 2); if (multi.length) terms = [...multi, ...terms.filter((t) => cnt.get(t) < 2)]; }
      terms = terms.slice(0, 6);
      const ws = m.map((k) => es[k].eff), vec = centroid(m.map((k) => es[k].vec), ws);
      clusters.push({ ids: m.map((k) => es[k].id), members: m, weight, latest: Math.max(...m.map((k) => es[k].ts || 0)), medoid, medoidId: es[medoid].id, terms, label: terms.slice(0, 2).join(" "), vec, entries: es });
    }
    return clusters.sort((a, b) => b.weight - a.weight);
  }

  // ---- 묶음에서 검색어 후보를 만듭니다 (앞에서부터 시도) ----
  function queries(cl) {
    const es = cl.entries, med = es[cl.medoid], out = [];
    const t = cl.terms || [];
    if (t.length >= 2) out.push(t.slice(0, 2).join(" "));
    const mk = (med?.keys || []).slice(0, 2);
    if (mk.length === 2) out.push(mk.join(" "));
    if (t.length >= 3) out.push([t[0], t[2]].join(" "));
    if (t[0]) out.push(t[0]);
    if (mk[0]) out.push(mk[0]);
    return [...new Set(out.filter((q) => q && q.length > 1))];
  }

  // ---- 보여 줄 관심사 고르기 ----
  // 가장 최근(36시간 안)에 한 활동의 묶음은 반드시 넣고(중요도가 낮아도 조금은 있어야 함), 나머지는 중요도에 비례해 무작위로 뽑습니다.
  function pick(clusters, n = 3, opts = {}) {
    const rand = opts.rand || Math.random, now = opts.now || Date.now();
    const pool = clusters.filter((c) => c.weight >= (opts.minWeight ?? MIN_W)); if (!pool.length) return [];
    const out = [], left = pool.slice();
    const fresh = left.filter((c) => now - c.latest < 36 * 3600000 && c.weight >= 1).sort((a, b) => b.latest - a.latest)[0];
    if (fresh) { out.push(fresh); left.splice(left.indexOf(fresh), 1); }
    while (out.length < n && left.length) {
      const ws = left.map((c) => Math.pow(c.weight, 0.9)), tot = ws.reduce((a, b) => a + b, 0);
      let r = rand() * tot, i = 0;
      for (; i < left.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  }

  // 후보 이미지를 묶음 중심과의 의미 유사도로 다시 줄 세울 때의 점수 (원래 순서 55% + 유사도 45%). 임베딩이 없으면 null.
  function blend(index, total, cos) {
    if (cos == null) return null;
    return 0.55 * (1 - index / Math.max(1, total)) + 0.45 * clamp((cos - 0.3) / 0.4, 0, 1);
  }

  const api = { build, queries, pick, prepare, makeSim, cosine, centroid, blend, DAY, LAMBDA, MIN_W, THRESH, MAXN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Interests = api;
})(typeof self !== "undefined" ? self : this);
