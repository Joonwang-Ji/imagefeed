"use strict";
// "추천 안 함" 저장소: 내가 "이 이미지는 보고 싶지 않아요"라고 한 이미지와, 그 이미지들에 공통으로 붙은 태그를 이 기기(브라우저)에만 기억합니다.
// (화면·테스트가 함께 쓰는 순수 함수 모음)
//
// 지키는 원칙
//  - 검색어, 본 이미지 목록은 저장하지 않습니다. 저장하는 것은 (1) 숨긴 이미지의 주소 키 (2) {태그: 횟수} 두 가지뿐입니다.
//  - 취향 학습(taste.js)과 따로 동작합니다. 취향 학습을 꺼 두어도, 비공개 모드여도 이 기능은 그대로 쓸 수 있어요. (안전 기능이라서)
//  - 서버나 검색 소스로 보내지 않습니다. 받아 온 결과를 이 기기에서 다시 거를 때만 씁니다.
//
// 두 가지 종류
//  - "pref" = 관심 없어요: 그 이미지를 숨기고, 같은 태그를 덜 보여 줍니다(점수를 낮춤).
//  - "bad"  = 보기 불편해요: 숨기고, 같은 태그가 여러 번 겹치는 이미지는 블러(탭하면 보기)로 가립니다.
//
// 태그 하나만으로 넓게 걸리지 않도록(예: "woman"), 같은 이미지에 함께 붙은 태그가 둘 이상 겹칠 때만 반응합니다.
// 숫자(기준)는 아래 상수에서 고칠 수 있어요.
(function (root) {
  const KEY = "avoid";
  const MAXKEYS = 600, MAXTAGS = 300;
  const DEMOTE_PAIR = 2;   // 이 횟수 이상 겹친 태그가 2개 이상이면 순위를 낮춤
  const DEMOTE_ONE = 4;    // 태그 하나가 이 횟수 이상이면 순위를 낮춤
  const BLUR_PAIR = 2;     // "불편" 으로 이 횟수 이상 겹친 태그가 2개 이상이면 블러
  const BLUR_ONE = 4;      // "불편" 으로 태그 하나가 이 횟수 이상이면 블러
  const STOP = new Set(["the", "and", "for", "with", "from", "photo", "photos", "image", "images", "picture", "stock", "free", "jpg", "png",
    "이미지", "사진", "무료", "블로그", "네이버", "다음", "티스토리"]);
  const norm = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFC").trim();
  const okKey = (k) => k.length >= 2 && k.length <= 24 && !STOP.has(k) && !/^\d+$/.test(k);

  function create(store, now = () => Date.now()) {
    const fresh = () => ({ v: 1, keys: [], pref: {}, bad: {} });
    const read = () => { const d = store.get(KEY, null); return d && d.v === 1 ? { ...fresh(), ...d } : fresh(); };
    let data = read();
    const save = () => store.set(KEY, data);
    const tagsOf = (ks) => [...new Set((ks || []).map(norm).filter(okKey))];
    const total = (k) => (data.pref[k] || 0) + (data.bad[k] || 0);
    const prune = () => {
      if (data.keys.length > MAXKEYS) data.keys = data.keys.slice(-MAXKEYS);
      const all = [...new Set([...Object.keys(data.pref), ...Object.keys(data.bad)])];
      if (all.length > MAXTAGS) all.sort((a, b) => total(a) - total(b)).slice(0, all.length - MAXTAGS).forEach((k) => { delete data.pref[k]; delete data.bad[k]; });
    };
    // 이미지 하나를 숨기고, 그 이미지의 태그를 기억합니다. key: 이미지 주소 키, tags: 태그(또는 제목 단어), kind: "pref" | "bad"
    function hide(key, tags, kind = "pref") {
      if (!key) return false;
      if (!data.keys.some((x) => x[0] === key)) data.keys.push([key, now()]);
      const m = kind === "bad" ? data.bad : data.pref;
      for (const t of tagsOf(tags)) m[t] = (m[t] || 0) + 1;
      prune(); save(); return true;
    }
    const isHidden = (key) => !!key && data.keys.some((x) => x[0] === key);
    // 이 이미지(의 태그)에 대한 판정: 0 = 그대로, 1 = 순위 낮춤, 2 = 블러
    function verdict(tags) {
      const ts = tagsOf(tags); if (!ts.length) return 0;
      let bad2 = 0, bad4 = false, tot2 = 0, tot4 = false;
      for (const t of ts) {
        const b = data.bad[t] || 0, a = total(t);
        if (b >= BLUR_PAIR) bad2++; if (b >= BLUR_ONE) bad4 = true;
        if (a >= DEMOTE_PAIR) tot2++; if (a >= DEMOTE_ONE) tot4 = true;
      }
      if (bad2 >= 2 || bad4) return 2;
      if (tot2 >= 2 || tot4) return 1;
      return 0;
    }
    const sortTags = () => [...new Set([...Object.keys(data.pref), ...Object.keys(data.bad)])].map((k) => ({ k, pref: data.pref[k] || 0, bad: data.bad[k] || 0 })).sort((a, b) => (b.pref + b.bad) - (a.pref + a.bad));
    return {
      hide, isHidden, verdict,
      count: () => data.keys.length,
      // 설정 화면에서 보여 줄 것: 숨긴 이미지 수와, 반응하는 태그(횟수가 2 이상) 목록
      view: () => ({ n: data.keys.length, tags: sortTags().filter((x) => x.pref + x.bad >= 2).slice(0, 20), all: sortTags().length }),
      forget: (tag) => { const k = norm(tag); delete data.pref[k]; delete data.bad[k]; save(); },
      isEmpty: () => !data.keys.length && !Object.keys(data.pref).length && !Object.keys(data.bad).length,
      clear: () => { data = fresh(); save(); },
      reload: () => { data = read(); },
    };
  }

  const api = { create, MAXKEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AvoidStore = api;
})(typeof self !== "undefined" ? self : this);
