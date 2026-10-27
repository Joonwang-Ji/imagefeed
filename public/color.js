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

  // 살색이 아닌 '선명한 색' 픽셀의 비율(0~1): 빨강·초록·파랑처럼 채도가 높고 살색 계열(주황~노랑 사이)이 아닌 색.
  // 나무 탁자 위에 소품(사탕·솔잎·장식)을 놓은 사진처럼 살색 비슷한 배경에 다른 물건이 많이 보이는 사진을 가려내는 데 씁니다.
  function vivid(rgba) {
    const n = rgba.length >> 2; let v = 0, tot = 0;
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]; tot++;
      const [h, s, val] = hsvOf(r, g, b);
      if (s > 0.5 && val > 0.3 && (h < 5 || h > 55)) v++;
    }
    return tot ? v / tot : 0;
  }

  // ---------- 톤(분위기) 분류 ----------
  // 이미지 한 장을 "밝기·채도 분위기(tone)"와 "색 온도(temp)"로 나눕니다. (핀터레스트의 톤 검색처럼, 사진에서 톤만 뽑아 필터로 씀)
  //  tone: mono(흑백·무채색) / dark(어두운) / vivid(선명한) / pastel(파스텔) / bright(밝은) / muted(차분한)
  //  temp: warm(따뜻한) / cool(차가운) / neutral(중립)
  const TONE_KO = { mono: "흑백", dark: "어두운", vivid: "비비드", pastel: "파스텔", bright: "밝은", muted: "차분한", warm: "따뜻한", cool: "차가운", neutral: "중립" };
  function hsvOf(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx / 255];
  }
  function tone(rgba) {
    const n = rgba.length >> 2;
    let tot = 0, sumS = 0, sumV = 0, lowS = 0, hiS = 0, warm = 0, cool = 0;
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      const [h, s, v] = hsvOf(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      tot++; sumS += s; sumV += v;
      if (s < 0.1) lowS++;
      if (s > 0.6) hiS++;
      if (s >= 0.18 && v >= 0.2) { if (h < 70 || h >= 330) warm++; else if (h >= 165 && h < 285) cool++; }
    }
    if (!tot) return null;
    const meanS = sumS / tot, meanV = sumV / tot, lowShare = lowS / tot, hiShare = hiS / tot;
    let t;
    if (lowShare >= 0.8) t = "mono";
    else if (meanV < 0.33) t = "dark";
    else if (meanS >= 0.5 && meanV >= 0.45 || hiShare > 0.4) t = "vivid";
    else if (meanV >= 0.6 && meanS >= 0.1 && meanS < 0.42) t = "pastel";
    else if (meanV >= 0.72) t = "bright";
    else t = "muted";
    const chroma = (warm + cool) / tot;
    const temp = chroma < 0.15 ? "neutral" : warm > cool * 1.5 ? "warm" : cool > warm * 1.5 ? "cool" : "neutral";
    return { tone: t, temp, v: +meanV.toFixed(2), s: +meanS.toFixed(2) };
  }

  // ---------- 팔레트 ----------
  // 이미지에서 눈에 띄는 색 n 가지(실제 색값 hex + 12가지 색 이름 + 비율). 가운데·선명한 색에 더 큰 비중을 둡니다.
  // 비슷한 색(RGB 거리 가까움)은 하나로 합칩니다.
  const hex2 = (v) => Math.round(v).toString(16).padStart(2, "0");
  function palette(rgba, w, h, n = 5) {
    const px = rgba.length >> 2;
    if (!px) return [];
    if (!w || !h) { w = h = Math.round(Math.sqrt(px)); }
    const bins = new Map(); let tot = 0;
    for (let i = 0; i < px; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      const x = ((i % w) + 0.5) / w - 0.5, y = (Math.floor(i / w) + 0.5) / h - 0.5;
      const mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      const wt = (1 + 1.2 * Math.max(0, 1 - Math.hypot(x, y) / 0.5)) * (0.6 + sat);
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = bins.get(k) || { w: 0, r: 0, g: 0, b: 0 };
      e.w += wt; e.r += r * wt; e.g += g * wt; e.b += b * wt; bins.set(k, e); tot += wt;
    }
    if (!tot) return [];
    const rows = [...bins.values()].map((e) => ({ w: e.w, r: e.r / e.w, g: e.g / e.w, b: e.b / e.w })).sort((a, b) => b.w - a.w);
    const out = [];
    for (const c of rows) {
      const hit = out.find((o) => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) < 56);
      if (hit) { const t = hit.w + c.w; hit.r = (hit.r * hit.w + c.r * c.w) / t; hit.g = (hit.g * hit.w + c.g * c.w) / t; hit.b = (hit.b * hit.w + c.b * c.w) / t; hit.w = t; }
      else out.push({ ...c });
    }
    return out.sort((a, b) => b.w - a.w).slice(0, n)
      .map((c) => ({ hex: "#" + hex2(c.r) + hex2(c.g) + hex2(c.b), name: bucket(c.r, c.g, c.b), share: +(c.w / tot).toFixed(3) }));
  }

  const api = { classify, bucket, shares, similarity, topColor, skin, vivid, tone, palette, TONE_KO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ColorTools = api;
})(typeof self !== "undefined" ? self : this);
