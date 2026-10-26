"use strict";
// 이미지의 대표 색을 12가지 이름(화면의 색상 점과 같은 이름)으로 분류합니다.
// rgba: 캔버스 getImageData().data 와 같은 [r,g,b,a,...] 배열. 회색·검정·흰색은 25% 이상, 나머지 색은 12% 이상일 때 포함합니다.
(function (root) {
  function bucket(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const v = mx / 255, s = mx ? d / mx : 0;
    if (v < 0.18) return "black";
    if (s < 0.12) return v > 0.85 ? "white" : v < 0.3 ? "black" : "gray";
    if (s < 0.18 && v > 0.9) return "white";
    let h;
    if (d === 0) h = 0;
    else if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    if (h >= 8 && h < 45 && v < 0.62 && s > 0.25) return "brown";
    if (s < 0.2) return "gray";
    if (h < 12 || h >= 345) return "red";
    if (h < 40) return "orange";
    if (h < 70) return "yellow";
    if (h < 165) return "green";
    if (h < 200) return "teal";
    if (h < 255) return "blue";
    if (h < 300) return "purple";
    return "pink";
  }
  const NEUTRAL = { black: 1, white: 1, gray: 1 };
  function classify(rgba) {
    const cnt = {};
    let n = 0;
    for (let i = 0; i + 3 < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      const k = bucket(rgba[i], rgba[i + 1], rgba[i + 2]);
      cnt[k] = (cnt[k] || 0) + 1;
      n++;
    }
    if (!n) return null;
    const rows = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const out = rows.filter(([k, c]) => c / n >= (NEUTRAL[k] ? 0.25 : 0.12)).map(([k]) => k).slice(0, 3);
    return out.length ? out : [rows[0][0]];
  }
  const api = { classify, bucket };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ColorTools = api;
})(typeof self !== "undefined" ? self : this);
