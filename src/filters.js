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
  "오럴\\s?-?b",
  "nude\\s+(?:colou?rs?|tones?|shades?|palettes?|lipsticks?|makeup|nails?|pink|beige|dress|heels?|aesthetic)",
  "naked\\s+(?:eyes?|singularity|mole\\s+rat)",
].join("|"), "gi");
const neutral = (s) => String(s ?? "").replace(SAFE, " ");

const build = (ko, en) => new RegExp(`(${ko.join("|")})|\\b(${en.join("|")})`, "i");
const hardRe = build(KO_HARD, EN_HARD);

// 성행위·성기 같은 노골적인 표현. 트렌드에서는 이런 항목을 아예 빼고, 검색에서는 블러 처리합니다.
// ("형성기"·"생성기"처럼 글자가 붙은 말이 걸리지 않도록 한글은 앞뒤를 확인하고, 영어는 단어 단위로 봅니다.)
const KO_EXPLICIT = [
  "성행위", "성관계", "성교(?!육)", "음경", "음부", "음순", "음낭", "고환", "페니스", "자위(?!대|권|적|단|군)", "오르가슴", "오럴", "정액(?![제권])",
  "성폭행", "성폭력", "강간", "성매매", "매춘", "윤락", "성인물", "야설", "근친상간",
  "(?<![가-힣])성기(?:[은는이가을를의에도와과로]|(?![가-힣]))",
  "카마수트라", "슌가", "춘화",
];
const EN_EXPLICIT = [
  "sex", "sexual\\w*", "intercourse", "penis", "penile", "vagina\\w*", "vulva", "genital\\w*", "phall\\w*", "testicle\\w*", "scrotum", "anus", "anal\\s+sex",
  "clitor\\w*", "masturbat\\w*", "orgasm\\w*", "orgy", "ejaculat\\w*", "fellatio", "cunnilingus", "oral\\s+sex", "kama\\s?sutra", "shunga",
  "erotic\\w*", "porn\\w*", "dildo", "rape[ds]?", "incest\\w*", "prostitut\\w*", "brothel\\w*", "sex\\s*(?:toy|tape|scene|slave)",
];
const explicitRe = new RegExp(`(${KO_EXPLICIT.join("|")})|\\b(?:${EN_EXPLICIT.join("|")})\\b`, "i");
// 나체 표현(누드·알몸). 미술·역사 작품이면 트렌드에서도 블러로 남기고, 아니면 뺍니다.
const nudeRe = new RegExp("(누드|나체|알몸|벌거벗)|\\b(?:nude|nudes|nudity|naked|topless)\\b", "i");
// 미술·역사 맥락(작품·유적·박물관 등): 이런 설명이 붙은 나체는 정상적인 미술·역사 자료로 보고 블러만 합니다.
const artRe = new RegExp("(그림|회화|조각|석상|벽화|부조|사원|사찰|신전|박물관|미술|예술|유물|고대|르네상스|바로크|신화|왕조|세기|도자|유화|판화|목판|동상)|" +
  "(paint\\w*|sculpt\\w*|statue\\w*|fresco\\w*|mural\\w*|relief|temple|museum|galler(?:y|ies)|artwork|\\bart\\b|artist|renaissance|baroque|ancient|antique|classical|mytholog\\w*|century|dynasty|woodblock|ukiyo|engraving|etching|manuscript|vase|pottery|mosaic|marble|bronze|archaeolog\\w*|monument)", "i");
const adultRe = build(KO_ADULT, EN_ADULT);

export const hardBlocked = (s = "") => hardRe.test(neutral(s));
export const isExplicit = (s = "") => explicitRe.test(neutral(s));
export const isNude = (s = "") => nudeRe.test(neutral(s));
export const hasArtContext = (s = "") => artRe.test(String(s ?? ""));
export const isAdult = (s = "") => { const t = neutral(s); return adultRe.test(t) || explicitRe.test(t); };
