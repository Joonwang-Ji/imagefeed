"use strict";
// 검색어와 이미지(제목·태그)가 얼마나 맞는지 점수를 매깁니다. 화면(app.js)과 테스트가 함께 쓰는 순수 함수 모음입니다.
//
// 순위 결정 방식 (소스가 준 순위만 합산하던 것을 보완):
//  1) 이미지마다 "관련도(rel 0~1)"를 구합니다: 검색어 단어가 제목·태그에 얼마나 들어 있는지.
//     - 한글은 띄어쓰기가 달라도(금강 엑슬루 타워 / 금강엑슬루타워) 맞게 비교하고, 긴 복합어는 두 글자 조각 단위로 부분 일치를 셉니다.
//     - 검색어를 번역한 영어, 번역 전 원문 둘 중 더 잘 맞는 쪽을 씁니다.
//  2) 관련도로 등급(strong / medium / weak / unknown / trust)을 나누고, 등급별 배수를 소스 순위 점수에 곱합니다.
//     unknown = 제목·태그가 없어 판단할 수 없음(거의 감점하지 않음). trust = 한국 검색엔진이 준 결과인데 제목이 안 맞음(접지 않고 살짝 감점).
//  3) 소스마다 어울리는 검색어가 다르므로(미술관=미술, NASA=우주, 네이버·카카오=한글) 소스별 가중치를 검색어에 맞춰 바꿉니다.
(function (root) {
  const HAN = /[ㄱ-ㆎ가-힣]/;
  const STOP = new Set(["the", "and", "for", "with", "from", "of", "in", "on", "at", "to", "photo", "photos", "image", "images", "picture", "pictures", "stock", "free",
    "jpg", "png", "이미지", "사진", "무료", "블로그", "네이버", "다음", "티스토리"]);
  // 너무 흔해서 단독으로는 변별력이 낮은 말(가중치 절반). 예: "금강 엑슬루 타워"에서 "타워"만 맞는 이미지를 걸러내기 위함.
  const GENERIC = new Set(["tower", "building", "apartment", "apartments", "house", "city", "view", "street", "room", "park", "bridge", "river", "mountain", "sea", "lake",
    "타워", "아파트", "빌딩", "건물", "풍경", "거리", "도시", "공원", "다리", "강", "산", "바다", "호수"]);

  const norm = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = (s) => norm(s).split(" ").filter(Boolean);
  const okTok = (t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t);

  function group(s) {
    let ws = words(s);
    const toks = ws.filter(okTok).map((t) => ({ t, w: GENERIC.has(t) ? 0.5 : 1 }));
    return { toks, compact: toks.map((x) => x.t).join("") };
  }

  // 검색어 정보. q: 입력한 원문, qe: 영어로 번역한 말, type: 고유명사의 종류(예: "apartment complex"), proper: 고유명사 여부(모르면 생략)
  function makeTerms({ q = "", qe = "", type = "", proper } = {}) {
    const gq = group(q), ge = qe && norm(qe) !== norm(q) ? group(qe) : null;
    const groups = [gq, ge].filter((g) => g && g.toks.length);
    const n = Math.max(gq.toks.length, ge ? ge.toks.length : 0);
    // 띄어쓰기 없는 긴 한글 한 덩어리(금강엑슬루타워)는 고유명사일 가능성이 높다고 봅니다. (AI 판정이 있으면 그것을 따름)
    const hanSingle = gq.toks.length === 1 && HAN.test(gq.toks[0].t) && gq.toks[0].t.length >= 5;
    const pr = proper == null ? hanSingle : !!proper;
    return { q: String(q), qe: ge ? String(qe) : String(q), groups, type: words(type).filter(okTok), proper: pr, specific: n >= 2 || pr, text: norm(`${q} ${qe}`) };
  }

  // 단어 하나가 제목·태그(hw: 단어 집합, hc: 공백 뺀 문자열)에 얼마나 들어 있는지 0~1
  function m1(t, hw, hc) {
    if (HAN.test(t)) {
      if (hc.includes(t)) return 1;
      const s = t.replace(/(에서|으로|까지|부터|처럼|이랑|하고|은|는|이|가|을|를|의|에|와|과|도|로)$/, "");
      if (s !== t && s.length >= 2 && hc.includes(s)) return 1;
      if (t.length >= 4) { // 긴 복합어: 두 글자 조각이 얼마나 들어 있는지
        let n = 0; const tot = t.length - 1;
        for (let i = 0; i < tot; i++) if (hc.includes(t.slice(i, i + 2))) n++;
        return n / tot;
      }
      return 0;
    }
    if (hw.has(t)) return 1;
    if (t.length >= 3) for (const w of hw) {
      if (w.startsWith(t)) return 1; // towers ← tower
      if (w.length >= 4 && t.startsWith(w) && t.length - w.length <= 3) return 0.9; // tower ← towers
    }
    return 0;
  }
  function coverage(g, hw, hc) {
    if (!g.toks.length) return 0;
    if (g.compact.length >= 3 && hc.includes(g.compact)) return 1; // 검색어 전체가 그대로 들어 있음
    let got = 0, tot = 0;
    for (const { t, w } of g.toks) { tot += w; got += w * m1(t, hw, hc); }
    return tot ? got / tot : 0;
  }

  const NO_TEXT = new Set(["kakao"]);          // 카카오의 title 은 사이트 이름이라 이미지 설명이 아님
  const TRUST = new Set(["naver", "kakao"]);   // 한국 검색엔진: 제목에 안 보여도 본문 기준으로 찾은 것이라 약해도 버리지 않음

  // 이미지 하나의 관련도와 등급. 소스가 제목·태그를 주지 않으면 unknown(판단 불가, 감점 없음)
  function judge(it, T, srcId) {
    const hay = norm(`${NO_TEXT.has(srcId) ? "" : it.title || ""} ${(it.tags || []).join(" ")}`);
    if (!T || !T.groups.length || hay.replace(/[^\p{L}]/gu, "").length < 2) return { known: false, rel: 0.5, tier: "unknown" };
    const hw = new Set(hay.split(" ")), hc = hay.replace(/ /g, "");
    // 글자 종류가 다르면 비교할 수 없습니다. (한글 검색어만 있는데 영어 태그뿐인 이미지 → 판단 불가. 번역이 없을 때 영어 이미지를 통째로 접지 않기 위함)
    const hanHay = HAN.test(hay), latHay = /[a-z]/.test(hay);
    const gs = T.groups.filter((g) => (g.toks.some((x) => HAN.test(x.t)) ? hanHay : latHay));
    if (!gs.length) return { known: false, rel: 0.5, tier: "unknown" };
    let rel = 0;
    for (const g of gs) rel = Math.max(rel, coverage(g, hw, hc));
    if (rel < 1 && T.type.length && T.type.some((t) => m1(t, hw, hc) === 1)) rel = Math.min(1, rel + 0.1); // 종류(아파트·타워 등)가 맞으면 조금 가산
    // 고유명사는 일부 단어만 걸린 것(금강 강변 풍경)을 약하다고 봅니다. 일반 검색어는 하나도 안 맞을 때만 약함.
    let tier = rel >= 0.8 ? "strong" : (T.proper ? rel >= 0.5 : rel > 0) ? "medium" : "weak";
    if (tier === "weak" && TRUST.has(srcId)) tier = "trust"; // 접지는 않지만(본문 기준으로 찾았을 수 있음) 일치한 이미지보다는 아래로
    return { known: true, rel, tier };
  }
  const MUL = { strong: 2, medium: 1, unknown: 0.9, trust: 0.6, weak: 0.3 };
  const mul = (tier) => MUL[tier] || 1;

  const ART_EN = /(^|\s)(art|artwork|paint|portrait|sculpt|statue|museum|vase|ceramic|porcelain|print|drawing|sketch|mural|fresco|impression|baroque|renaissance|gothic|medieval|ancient|antique|relic|armor|costume|dress|fashion|textile|furniture|chair|jewel|poster|calligraph|illustrat|design|pattern|tile|mosaic|stained|vintage|retro|folk|craft|lacquer|silk|kimono|hanbok)/;
  const ART_KO = /미술|그림|회화|조각|유화|수채|판화|동양화|추상|인상주의|도자|공예|골동|빈티지|고전|옛|패션|디자인|포스터|패턴|타일|모자이크|스테인드|문양|가구|의상|한복|병풍|서예|민화|자수/;
  const SPACE_EN = /(^|\s)(space|galaxy|nebula|moon|lunar|mars|planet|star|stars|astronaut|rocket|earth|sun|solar|telescope|satellite|orbit|cosmos|comet|eclipse|aurora|shuttle|iss|hubble|webb|apollo|nasa|milky|jupiter|saturn|venus|mercury|asteroid|supernova)/;
  const SPACE_KO = /우주|은하|성운|보름달|초승달|행성|로켓|지구|태양|일식|월식|오로라|천체|망원경|위성|혜성|화성|목성|토성|금성|(^|\s)(달|별)($|\s)/;

  // 소스별 가중치 배수. 사용자가 소스를 직접 골랐으면(pinned) 건드리지 않습니다.
  function bias(id, T, pinned) {
    if (pinned || !T) return 1;
    const han = HAN.test(T.q), t = T.text;
    switch (id) {
      case "naver": case "kakao": return han ? 1.25 : 0.85;
      case "artic": case "cleveland": case "vam": return ART_EN.test(t) || ART_KO.test(t) ? 1.4 : 0.35;
      case "nasa": return SPACE_EN.test(t) || SPACE_KO.test(t) ? 1.4 : 0.2;
      case "wikimedia": return T.proper ? 1.3 : 1;
      case "pixabay": case "unsplash": return T.proper ? 0.75 : 1;
      default: return 1;
    }
  }

  const api = { makeTerms, judge, mul, bias, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Relevance = api;
})(typeof self !== "undefined" ? self : this);
