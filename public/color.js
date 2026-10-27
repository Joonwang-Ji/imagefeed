"use strict";
// 이미지의 대표 색을 12가지 이름(화면의 색상 점과 같은 이름)으로 분류하고, 색 분포끼리 비교합니다.
// rgba: 캔버스 getImageData().data 와 같은 [r,g,b,a,...] 배열, w·h: 그 가로·세로(정사각형이면 생략 가능).
// - 가운데에 있는 픽셀과 채도가 높은 픽셀에 더 큰 비중을 둡니다 (배경이 흰색·회색이어도 주인공 색을 찾기 위해).
(function (root) {
  const NEUTRAL = { black: 1, white: 1, gray: 1 };

  function bucket(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const v = mx / 255, s = mx ? d / mx : 0;
    if (v < 0.16) return "black";
    if (s < 0.1) return v > 0.85 ? "white" : v < 0.3 ? "black" : "gray";
    if (s < 0.16 && v > 0.9) return "white";
    let h;
    if (d === 0) h = 0;
    else if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    if (h >= 8 && h < 45 && v < 0.62 && s > 0.25) return "brown";
    if (s < 0.18) return v > 0.88 ? "white" : "gray";
    if ((h < 12 || h >= 345) && s < 0.5 && v > 0.75) return "pink"; // 연한 빨강은 분홍으로
    if (h < 12 || h >= 345) return "red";
    if (h < 40) return "orange";
    if (h < 70) return "yellow";
    if (h < 165) return "green";
    if (h < 200) return "teal";
    if (h < 255) return "blue";
    if (h < 300) return "purple";
    return "pink";
  }

  // 색 이름별 비율(합계 1). 투명한 픽셀은 제외합니다. 비어 있으면 null.
  function shares(rgba, w, h) {
    const n = rgba.length >> 2;
    if (!n) return null;
    if (!w || !h) { w = h = Math.round(Math.sqrt(n)); }
    const cnt = {};
    let tot = 0;
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      const k = bucket(r, g, b);
      const x = ((i % w) + 0.5) / w - 0.5, y = (Math.floor(i / w) + 0.5) / h - 0.5;
      const center = 1 + 1.2 * Math.max(0, 1 - Math.hypot(x, y) / 0.5); // 가운데 2.2배 → 가장자리 1배
      const mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      const wt = center * (NEUTRAL[k] ? 1 : 0.7 + sat);
      cnt[k] = (cnt[k] || 0) + wt;
      tot += wt;
    }
    if (!tot) return null;
    for (const k in cnt) cnt[k] /= tot;
    return cnt;
  }

  // 화면의 색상 점으로 거를 때 쓰는 "대표 색" 목록: 채도 있는 색은 15% 이상, 흰색·검정·회색은 40% 이상일 때 포함합니다.
  function classify(rgba, w, h) {
    const sh = shares(rgba, w, h);
    if (!sh) return null;
    const rows = Object.entries(sh).sort((a, b) => b[1] - a[1]);
    const out = rows.filter(([k, s]) => s >= (NEUTRAL[k] ? 0.4 : 0.15)).map(([k]) => k).slice(0, 3);
    return out.length ? out : [rows[0][0]];
  }

  // 두 색 분포가 얼마나 비슷한지 0(전혀 다름)~1(같음). 분포가 없으면 null.
  function similarity(a, b) {
    if (!a || !b) return null;
    let diff = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff += Math.abs((a[k] || 0) - (b[k] || 0));
    return 1 - diff / 2;
  }

  // 검색어에 덧붙일 한 단어(영어 색 이름). 채도 있는 색이 20% 이상이면 그 색, 아니면 흰색·검정·회색 중 가장 많은 것.
  function topColor(sh) {
    if (!sh) return "";
    const rows = Object.entries(sh).sort((a, b) => b[1] - a[1]);
    const chroma = rows.filter(([k]) => !NEUTRAL[k]);
    const csum = chroma.reduce((t, [, s]) => t + s, 0);
    if (chroma.length && csum >= 0.2) return chroma[0][0];
    return rows[0]?.[0] || "";
  }

  // 살색에 가까운 픽셀의 비율(0~1). 브라우저 AI가 "선정적"이라고 한 이미지가 정말 피부가 많이 보이는 사진인지 확인하는 데 씁니다.
  // (성경책 위에 놓인 손, 펼친 책, 나무색 배경처럼 AI가 잘못 짚기 쉬운 것은 살색 면적이 작거나 모양이 달라 걸러집니다.)
  function skin(rgba) {
    const n = rgba.length >> 2;
    let sk = 0, tot = 0;
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      tot++;
      const y = 0.299 * r + 0.587 * g + 0.114 * b, cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (y > 50 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > g && r > b) sk++;
    }
    return tot ? sk / tot : 0;
  }

  const api = { classify, bucket, shares, similarity, topColor, skin };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ColorTools = api;
})(typeof self !== "undefined" ? self : this);
