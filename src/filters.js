// 필터 단어 목록. 직접 고쳐서 쓰세요.
// - HARD: 공포/잔혹 계열. 화면에서 해제할 수 없고, 서버가 검색어와 결과 제목/태그를 모두 걸러냅니다.
// - ADULT: 선정적 계열. 기본은 블러, 설정에서 해제할 수 있습니다.
// 한글은 "포함" 기준, 영어는 단어 앞부분 기준으로 검사합니다.

const KO_HARD = [
  "시체", "사체", "시신", "변사", "참수", "학살", "고어", "잔혹", "참혹", "끔찍",
  "공포", "귀신", "악령", "괴담", "호러", "좀비", "유혈", "피투성이", "토막",
  "자살", "자해", "살인", "혈흔", "교통사고", "사고현장", "폭행", "섬뜩", "소름",
  "처형", "전사자", "린치", "참사",
];
const EN_HARD = [
  "gore", "gory", "corpse", "cadaver", "dead\\s+bod", "mutilat", "decapitat", "behead",
  "dismember", "torture", "massacre", "bloody", "bloodshed", "bloodstain", "horror",
  "scary", "creepy", "spooky", "haunted", "zombie", "slasher", "suicide", "self[- ]?harm",
  "murder", "crime\\s+scene", "autopsy",
  // 역사 사진·미술 소스(의회도서관·미술관)에 섞일 수 있는 전쟁·처형 장면
  "lynch", "execution", "atrocit", "slain", "casualt", "wounded", "victim", "battlefield",
  "dead\\s+(?:soldier|men|man|woman|child|horse|body|bodies)",
];

const KO_ADULT = ["누드", "나체", "야동", "포르노", "19금", "에로", "섹스", "섹시", "음란", "야한", "노출"];
const EN_ADULT = ["nude", "nudity", "naked", "porn", "nsfw", "erotic", "xxx", "hentai", "topless", "fetish", "bdsm", "sexy", "lingerie", "onlyfans"];

// 정상적인 디자인·사진·패션 용어는 검사 전에 지웁니다. (예: 노출 콘크리트, 노출 보정, 고어텍스, nude 색상, naked eye)
// 목록에 더하고 싶은 용어가 있으면 아래 SAFE 에 추가하세요.
const SAFE = new RegExp([
  "노출\\s*(?:콘크리트|보정|시간|계|값|천장|벽돌|벽|배관|조명|슬라브|마감|인테리어|형)",
  "장노출|단노출|과노출|저노출",
  "고어\\s?텍스",
  "에로스|에로우",
  "nude\\s+(?:colou?rs?|tones?|shades?|palettes?|lipsticks?|makeup|nails?|pink|beige|dress|heels?|aesthetic)",
  "naked\\s+(?:eyes?|singularity|mole\\s+rat)",
].join("|"), "gi");
const neutral = (s) => String(s ?? "").replace(SAFE, " ");

const build = (ko, en) => new RegExp(`(${ko.join("|")})|\\b(${en.join("|")})`, "i");
const hardRe = build(KO_HARD, EN_HARD);
const adultRe = build(KO_ADULT, EN_ADULT);

export const hardBlocked = (s = "") => hardRe.test(neutral(s));
export const isAdult = (s = "") => adultRe.test(neutral(s));
