"use strict";
// 취향 저장소: 내가 북마크하거나 오래 본 이미지의 "태그·색·톤" 점수만 이 기기(브라우저)에 저장합니다. (화면·테스트가 함께 쓰는 순수 함수 모음)
//
// 지키는 원칙
//  - 이 파일의 취향 저장소는 {단어: 점수} 집계값만 남깁니다. (17차부터 이미지 단위 활동·최근 검색은 app.js 의 ACT·Recent 가 이 기기에 따로 저장합니다)
//  - 점수는 시간이 지나면 절반씩 줄어듭니다 (반감기 45일). 오래된 취향이 계속 남지 않습니다.
//  - 취향은 이 기기 안에서 "받아 온 결과를 다시 줄 세울 때"만 씁니다. 검색어에 덧붙여 서버·검색 소스로 보내지 않습니다.
//  - 선정적으로 판정된 이미지는 학습하지 않습니다 (호출하는 쪽에서 걸러냄).
(function (root) {
  const KEY = "taste";
  const HALF = 45 * 86400000;           // 반감기
  const MAXTAGS = 160;                  // 저장하는 단어 수 상한
  const LO = -8, HI = 12;               // 점수 범위
  const STOP = new Set(["the", "and", "for", "with", "from", "photo", "photos", "image", "images", "picture", "stock", "free", "jpg", "png",
    "이미지", "사진", "무료", "블로그", "네이버", "다음", "티스토리"]);
  const norm = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFC").trim();
  // 출처 사이트 이름(daum카페·티스토리 등)은 이미지 내용이 아니라서 취향 단어로 배우지 않습니다 (18차 신고: ⭐ 칩에 'daum카페'가 계속 뜸)
  const SITE = /^(daum|다음|naver|네이버|tistory|티스토리|kakao|카카오|google|구글|brunch|브런치)(카페|블로그|뉴스|지식in|지식인|포스트|cafe|blog|news|post)?$/;
  const okKey = (k) => k.length >= 2 && k.length <= 24 && !STOP.has(k) && !SITE.test(k) && !/^\d+$/.test(k) && !/[\s]{2,}/.test(k);

  // 이미지 하나에서 취향 단어를 뽑습니다: 태그가 충분하면 태그, 부족하면 제목의 단어(위키 화제 사진은 인물·사건 이름이라 제외)
  function keysOf(it) {
    const tags = [...new Set((it.tags || []).map(norm).filter(okKey))];
    if (tags.length >= 2 || it.grp === "news" || it.grp === "hot") return tags.slice(0, 8); // 위키 화제(인물·사건)와 네이버 웹 이미지(제목이 잡다함)는 제목에서 배우지 않음
    const title = (norm(it.title).match(/[\p{L}\p{N}]{2,}/gu) || []).filter(okKey);
    return [...new Set([...tags, ...title])].slice(0, 6);
  }

  function create(store, now = () => Date.now()) {
    // mute: 사용자가 "이 말은 이제 그만"이라고 뺀 단어. 점수를 지워도 활동 기록·북마크에서 다시 올라오지 않게, 취향·관심사·추천 칩 어디서든 이 단어는 건너뜁니다.
    const read = () => { const d = store.get(KEY, null); if (d && d.v === 1) { d.mute = d.mute || {}; return d; } return { v: 1, tags: {}, colors: {}, tones: {}, mute: {} }; };
    let data = read();
    const save = () => store.set(KEY, data);
    const eff = (e, t = now()) => (e ? e[0] * Math.pow(0.5, Math.max(0, t - e[1]) / HALF) : 0);
    const bump = (m, k, w) => { const t = now(); m[k] = [Math.max(LO, Math.min(HI, eff(m[k], t) + w)), t]; };
    const prune = () => {
      const t = now(), ks = Object.keys(data.tags);
      for (const k of ks) if (Math.abs(eff(data.tags[k], t)) < 0.15) delete data.tags[k];
      const left = Object.keys(data.tags);
      if (left.length > MAXTAGS) left.sort((a, b) => Math.abs(eff(data.tags[a], t)) - Math.abs(eff(data.tags[b], t))).slice(0, left.length - MAXTAGS).forEach((k) => delete data.tags[k]);
    };
    // 이미지에서 배운 것 기록. keys: 단어 배열, w: 가중치(좋으면 +, 싫으면 -), extra: { colors:[이름...], tone, temp }
    function learn(keys, w, extra = {}) {
      if (!w) return;
      for (const k of (keys || []).map(norm).filter((x) => okKey(x) && !data.mute[x])) bump(data.tags, k, w);
      for (const c of (extra.colors || []).slice(0, 2)) bump(data.colors, c, w * 0.5);
      for (const t of [extra.tone, extra.temp]) if (t && t !== "neutral") bump(data.tones, t, w * 0.6);
      prune(); save();
    }
    // 이미지(단어들)가 내 취향과 얼마나 맞는지 -1(덜 보고 싶음) ~ 1(많이 보고 싶음). 모르면 0.
    function affinity(keys) {
      const ks = (keys || []).map(norm).filter((x) => okKey(x) && !data.mute[x]); if (!ks.length) return 0;
      const t = now(); let sum = 0;
      for (const k of ks) sum += eff(data.tags[k], t);
      return Math.max(-1, Math.min(1, sum / Math.max(2, ks.length) / 3));
    }
    const rank = (m, n, pos) => { const t = now(); return Object.keys(m).filter((k) => !(m === data.tags && data.mute[k])).map((k) => ({ k, v: eff(m[k], t) })).filter((x) => (pos ? x.v >= 0.5 : x.v <= -0.5)).sort((a, b) => (pos ? b.v - a.v : a.v - b.v)).slice(0, n); };
    return {
      learn, affinity,
      top: (n = 8) => rank(data.tags, n, true).map((x) => x.k),
      view: () => ({ tags: rank(data.tags, 14, true), less: rank(data.tags, 6, false), colors: rank(data.colors, 4, true), tones: rank(data.tones, 3, true) }),
      isEmpty: () => { const v = [rank(data.tags, 1, true), rank(data.tags, 1, false), rank(data.colors, 1, true), rank(data.tones, 1, true)]; return v.every((a) => !a.length); },
      // 학습된 항목 하나를 지웁니다. kind: "tags" | "tones" | "colors". 좋아하던 단어(tags)를 지우면 그 단어는 "뺀 단어"가 되어 다시 올라오지 않아요 (mute=false 면 점수만 지움).
      forget: (kind, k, mute = kind === "tags") => {
        const key = kind === "tags" ? norm(k) : k, had = !!data[kind] && key in data[kind];
        if (had) delete data[kind][key];
        if (had && kind === "tags" && mute && okKey(key)) { data.mute[key] = now(); save(); return true; }
        if (had) save();
        return had;
      },
      // 뺀 단어: 추천(⭐ 칩·관심사 묶음·트렌드 내 취향)에서 쓰지 않을 단어
      mute: (k) => { const key = norm(k); if (!okKey(key)) return false; delete data.tags[key]; data.mute[key] = now(); save(); return true; },
      unmute: (k) => { const key = norm(k); if (!(key in data.mute)) return false; delete data.mute[key]; save(); return true; },
      isMuted: (k) => !!data.mute[norm(k)],
      muted: () => Object.keys(data.mute).sort((a, b) => data.mute[b] - data.mute[a]),
      // "모두 지우기"는 배운 점수만 지웁니다. 뺀 단어는 내가 직접 정한 것이라 그대로 둡니다.
      clear: () => { data = { v: 1, tags: {}, colors: {}, tones: {}, mute: data.mute || {} }; save(); },
      reload: () => { data = read(); },
    };
  }

  const api = { create, keysOf, HALF };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TasteStore = api;
})(typeof self !== "undefined" ? self : this);
