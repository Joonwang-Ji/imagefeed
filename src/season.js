// 계절·기념일 주제: 날짜만으로 "곧 다가오는 때"의 이미지 검색어를 만듭니다. (외부 호출 없음)
// 핀터레스트도 사람들이 때가 되기 몇 주 전부터 검색한다고 알려져 있어서, 행사 며칠~몇 주 전부터 미리 보여 줍니다.
//
// 고치는 법
//  - FIXED: 매년 같은 날짜(월-일)인 기념일. [이름, 월, 일, 검색어, 며칠 전부터 보일지]
//  - LUNAR: 음력 기반이라 해마다 날짜가 달라 표에 직접 적어 둔 값입니다. 해가 바뀌면 다음 해 날짜를 추가하세요. (2026~2028)
//  - 수능은 11월 셋째 주 목요일로 계산합니다.
//  - 부활절은 계산식(그레고리력)으로, 대림절은 성탄절 4주 전 일요일로 계산합니다.
const FIXED = [
  ["새해", 1, 1, "새해 일출", 14],
  ["발렌타인데이", 2, 14, "발렌타인 초콜릿", 18],
  ["화이트데이", 3, 14, "화이트데이 사탕", 14],
  ["어린이날", 5, 5, "어린이날 풍선", 14],
  ["어버이날·스승의날", 5, 8, "카네이션", 14],
  ["광복절", 8, 15, "태극기 하늘", 10],
  ["할로윈", 10, 31, "할로윈 호박", 21],
  ["빼빼로데이", 11, 11, "빼빼로 선물", 12],
  ["크리스마스", 12, 25, "크리스마스 트리", 35],
  ["연말", 12, 31, "연말 불꽃놀이", 14],
];
const LUNAR = [
  ["설날", "설날 한복", [[2026, 2, 17], [2027, 2, 6], [2028, 1, 26]], 18],
  ["부처님오신날", "연등", [[2026, 5, 24], [2027, 5, 13], [2028, 5, 2]], 21],
  ["추석", "추석 보름달", [[2026, 9, 25], [2027, 9, 15], [2028, 10, 3]], 21],
];
// 달마다 어울리는 계절 주제 (월 → [이름, 검색어])
const SEASON = {
  1: [["한겨울", "눈 내린 마을"], ["새해 다짐", "새 노트 만년필"]],
  2: [["늦겨울", "얼음 호수"], ["봄 기다림", "매화"]],
  3: [["새 학기", "새 학기 교실"], ["봄맞이", "목련"]],
  4: [["벚꽃철", "벚꽃"], ["봄 소풍", "봄 소풍 돗자리"]],
  5: [["초록 5월", "신록 숲길"], ["장미", "장미 정원"]],
  6: [["초여름", "수국"], ["장마", "장마 빗방울"]],
  7: [["여름 휴가", "여름 바다"], ["소나기", "여름 소나기"]],
  8: [["한여름", "해바라기 밭"], ["늦여름 노을", "여름 노을"]],
  9: [["가을 하늘", "가을 하늘 구름"], ["코스모스", "코스모스 들판"]],
  10: [["단풍", "가을 단풍길"], ["억새", "억새 노을"]],
  11: [["늦가을", "은행나무길"], ["첫눈 기다림", "첫눈"]],
  12: [["겨울 시작", "눈 내린 마을"], ["연말 분위기", "겨울 조명"]],
};
const DAY = 86400000;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

// 부활절 (그레고리력, Anonymous 알고리즘)
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, mo, da);
}
// 대림절 첫 주일: 성탄절(12/25) 직전 일요일에서 3주 앞
function advent(y) {
  const x = new Date(utc(y, 12, 25)), dow = x.getUTCDay() || 7; // 월=1 … 일=7
  return utc(y, 12, 25) - (dow + 21) * DAY;
}
// 수능: 11월 셋째 주 목요일
function csat(y) { const first = new Date(utc(y, 11, 1)).getUTCDay(); return utc(y, 11, 1 + ((4 - first + 7) % 7) + 14); }

function events(y) {
  const out = [];
  for (const [label, m, d, q, lead] of FIXED) out.push({ label, q, at: utc(y, m, d), lead });
  for (const [label, q, dates, lead] of LUNAR) for (const [yy, m, d] of dates) if (yy === y) out.push({ label, q, at: utc(yy, m, d), lead });
  out.push({ label: "부활절", q: "부활절 달걀", at: easter(y), lead: 21 });
  out.push({ label: "대림절", q: "대림절 촛불", at: advent(y), lead: 10 });
  out.push({ label: "수능", q: "수험생 응원", at: csat(y), lead: 21 });
  return out;
}

// 지금(KST 기준 날짜)에서 가까운 기념일과 이달의 계절 주제. 반환: [{ label, q, days, kind: "event" | "season" }]
export function seasonTopics(now = Date.now(), max = 6) {
  const k = new Date(now + 9 * 3600000); // 한국 시간의 날짜로 계산
  const y = k.getUTCFullYear(), today = utc(y, k.getUTCMonth() + 1, k.getUTCDate());
  const list = [];
  for (const yy of [y, y + 1]) for (const e of events(yy)) {
    const days = Math.round((e.at - today) / DAY);
    if (days >= -1 && days <= e.lead) list.push({ label: e.label, q: e.q, days: Math.max(0, days), kind: "event" });
  }
  list.sort((a, b) => a.days - b.days);
  const out = list.slice(0, max);
  for (const [label, q] of SEASON[k.getUTCMonth() + 1] || []) if (out.length < max + 2) out.push({ label, q, days: 0, kind: "season" });
  return out;
}
