"use strict";
// 브라우저 AI(nsfwjs)가 준 점수와 살색 비율로 "선정적인 이미지인가"를 판단합니다. 화면(app.js)과 테스트가 함께 쓰는 순수 함수입니다.
//
// 예전에는 점수 하나(Sexy 0.7 이상 등)만 보아서 성경책 위의 손, 펼친 책, 나무색 배경 같은 평범한 사진이 자주 블러 처리됐습니다.
// 이제는 (1) 기준 점수를 올리고 (2) 실제로 살색 면적이 어느 정도 있어야 하며 (3) 제목·태그가 성경·책·교회 같은 평범한 맥락이면 더 엄격하게 봅니다.
//  - adult   : 블러 처리할 이미지
//  - explicit: 노골적인 이미지(Porn·Hentai 점수가 높음). 트렌드에서는 블러가 아니라 아예 뺍니다.
(function (root) {
  const SAFE_CTX = /bible|scripture|gospel|church|cross|pray|worship|hymn|sermon|book|pages?|reading|library|study|food|cake|dessert|baby|성경|말씀|교회|십자가|기도|예배|찬양|설교|책|도서|공부|음식|요리|아기/i;
  // scores: { Porn, Hentai, Sexy, Neutral, Drawing }, skin: 살색 비율(모르면 null), ctx: 제목·태그 글
  function judge(scores, skin, ctx) {
    const s = scores || {}, ps = (s.Porn || 0) + (s.Hentai || 0), sx = s.Sexy || 0, hen = s.Hentai || 0;
    const sk = skin == null ? 0.3 : skin; // 살색 비율을 못 구하면 중간값으로 보아 점수만으로 판단
    if (SAFE_CTX.test(String(ctx || ""))) { // 성경·책·교회처럼 평범한 맥락: 아주 확실할 때만
      const explicit = ps > 0.85 && sk >= 0.3;
      return { adult: explicit || (sx > 0.97 && sk >= 0.4), explicit };
    }
    const explicit = ps > 0.6 && (sk >= 0.12 || hen > 0.6);
    const adult = explicit || (ps > 0.45 && sk >= 0.15) || (sx > 0.85 && sk >= 0.22) || (ps + sx > 0.9 && sk >= 0.2);
    return { adult, explicit };
  }
  const api = { judge };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Safety = api;
})(typeof self !== "undefined" ? self : this);
