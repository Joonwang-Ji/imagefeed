// 최근 7일 누적: 구글 인기 검색어는 하루짜리 소음(속보·가십)이 많아서, 날짜별로 쌓아 둔 목록을 합쳐
// "여러 날 계속 등장한 말"을 앞에 둡니다. 외부 호출 없는 순수 함수라 테스트하기 쉽습니다.
// 저장하는 것은 사용자 기록이 아니라 구글이 공개한 인기 검색어 목록뿐입니다.
export const HIST_DAYS = 7;

// 저장할 때 쓰는 가벼운 모양 (뉴스 제목은 필터 판단용으로만 2개, 80자까지)
export const slim = (x) => ({ label: x.label, q: x.q, news: (x.news || []).slice(0, 2).map((n) => String(n).slice(0, 80)), traffic: x.traffic || 0 });

// days[0] = 오늘 목록(구글이 준 순서), days[1] = 어제, … (비어 있거나 없는 날은 건너뜀)
// 돌려주는 값: 앞에 둘 만한 순서의 목록. 각 항목에 days(등장한 날 수)·today·last(마지막으로 본 날: 0=오늘) 를 붙입니다.
//  - 오늘 있거나, 최근 2일 안에 보였고 이틀 이상 등장한 말만 남김 (며칠 전에 한 번 떴다 사라진 말은 뺌)
//  - 점수 = 등장한 날 수 + (오늘 있으면 1.5) → 같으면 오늘 순위, 그다음 검색량
export function mergeHistory(days) {
  const m = new Map();
  (days || []).forEach((rows, i) => (rows || []).forEach((x, idx) => {
    if (!x || !x.q) return;
    let e = m.get(x.q);
    if (!e) m.set(x.q, (e = { label: x.label || x.q, q: x.q, news: [], days: 0, last: i, today: false, idx: 999, traffic: 0 }));
    e.days++; e.last = Math.min(e.last, i);
    if (i === 0) { e.today = true; e.idx = idx; e.label = x.label || e.label; }
    e.traffic = Math.max(e.traffic, +x.traffic || 0);
    for (const n of x.news || []) if (e.news.length < 4 && !e.news.includes(n)) e.news.push(n);
  }));
  const score = (e) => e.days + (e.today ? 1.5 : 0);
  return [...m.values()]
    .filter((e) => e.today || (e.days >= 2 && e.last <= 2))
    .sort((a, b) => score(b) - score(a) || a.idx - b.idx || b.traffic - a.traffic);
}

// 오늘 저장분에 새로 받은 목록을 합침: 새로 받은 것이 앞(구글 순서 유지), 오늘 이미 있던 것 중 빠진 것은 뒤에 붙임
export function mergeToday(stored, fresh, cap = 60) {
  const seen = new Set((fresh || []).map((x) => x.q));
  return [...(fresh || []).map(slim), ...(stored || []).filter((x) => x && !seen.has(x.q))].slice(0, cap);
}
