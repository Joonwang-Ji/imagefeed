// 관련도 점수(public/relevance.js) 점검: "금강엑슬루타워" 같은 고유명사 검색에서 엉뚱한 자연 사진이 위로 오지 않는지
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../", import.meta.url).pathname;
const sb = { module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(ROOT + "public/relevance.js", "utf8"), sb);
const R = sb.module.exports;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const tier = (it, T, src = "pixabay") => R.judge(it, T, src).tier;

// ---- 고유명사(한글 복합어): 금강엑슬루타워 → 번역은 "Geumgang Exelu Tower" ----
const T = R.makeTerms({ q: "금강엑슬루타워", qe: "Geumgang Exelu Tower", type: "apartment tower", proper: true });
ok(T.proper && T.specific, "proper-noun query is specific");
ok(tier({ title: "", tags: ["river", "geumgang", "nature", "landscape"] }, T) === "weak", "river photo that only matches '금강/geumgang' is weak");
ok(tier({ title: "Geumgang River at sunset", tags: [] }, T, "wikimedia") === "weak", "title with only the river name is weak");
ok(tier({ title: "금강 풍경", tags: [] }, T, "wikimedia") === "weak", "Korean '금강 풍경' only matches 금강 → weak");
ok(tier({ title: "금강엑슬루타워 전경", tags: [] }, T, "wikimedia") === "strong", "exact Korean name in title is strong");
ok(tier({ title: "금강 엑슬루 타워", tags: [] }, T, "wikimedia") === "strong", "spacing differences do not matter (금강 엑슬루 타워)");
ok(tier({ title: "엑슬루타워 대전", tags: [] }, T, "wikimedia") !== "weak", "partial compound (엑슬루타워) is not folded away");
ok(tier({ title: "Geumgang Exelu Tower apartment", tags: [] }, T, "openverse") === "strong", "English name match is strong");
ok(tier({ title: "", tags: [] }, T, "unsplash") === "unknown" && R.mul("unknown") > R.mul("weak"), "no metadata → unknown, not punished");
ok(tier({ title: "엉뚱한 블로그 글", tags: [] }, T, "naver") === "trust" && R.mul("trust") < 1 && R.mul("trust") > R.mul("weak"), "Korean engine (naver) results are not folded even if the title does not match, but rank below real matches");
ok(R.judge({ title: "네이버 블로그" , tags: [] }, T, "kakao").known === false, "kakao title is a site name → unknown");

// 번역이 없을 때: 한글 검색어 vs 영어 태그뿐인 이미지는 비교 불가 → 접지 않음
const Tko = R.makeTerms({ q: "크리스마스트리장식" });
ok(Tko.specific && Tko.proper, "(no translation) long Hangul word is treated as a name by the fallback rule");
ok(tier({ title: "", tags: ["christmas", "tree", "decoration"] }, Tko) === "unknown", "English-only tags cannot be compared with a Hangul-only query → unknown (not folded)");
ok(tier({ title: "크리스마스 트리 장식", tags: [] }, Tko, "naver") === "strong", "Hangul title still matches");
ok(tier({ title: "한옥 마을 전경", tags: [] }, Tko, "wikimedia") === "weak", "Hangul title that does not match is weak");
ok(tier({ title: "Christmas tree", tags: ["감성"] }, R.makeTerms({ q: "christmas tree" })) === "strong", "Latin query matches Latin words even when other tags are Hangul");

// ---- 일반 검색어 ----
const Tg = R.makeTerms({ q: "고양이", qe: "cat" });
ok(!Tg.specific && !Tg.proper, "single common word is not specific (weak results are demoted, never folded)");
ok(tier({ title: "", tags: ["cat", "pet"] }, Tg) === "strong", "tag match is strong");
ok(tier({ title: "", tags: ["dog", "pet"] }, Tg) === "weak", "no match is weak");
const Td = R.makeTerms({ q: "비 오는 거리", qe: "rainy street" });
ok(Td.specific && !Td.proper, "descriptive multi-word query: specific but not proper");
ok(tier({ title: "", tags: ["street", "city", "night"] }, Td) === "medium", "descriptive: one of two words still counts (medium)");
ok(tier({ title: "", tags: ["mountain", "snow"] }, Td) === "weak", "descriptive: zero overlap is weak");
ok(tier({ title: "Rainy street in Tokyo", tags: [] }, Td, "unsplash") === "strong", "descriptive: all words → strong");
ok(tier({ title: "", tags: ["towers", "city"] }, R.makeTerms({ q: "tower" })) === "strong", "plural/stem: tower ↔ towers");

// ---- 영어 고유명사 ----
const Te = R.makeTerms({ q: "Namsan Seoul Tower" });
ok(Te.specific, "multi-word English query is specific");
ok(tier({ title: "Seoul Tower at night", tags: ["namsan"] }, Te) === "strong", "english all-words match");
ok(tier({ title: "N Seoul Tower", tags: [] }, Te) !== "weak", "english partial (2 of 3) is not weak");
ok(tier({ title: "Namsan mountain trail", tags: [] }, R.makeTerms({ q: "Namsan Seoul Tower", proper: true }), "wikimedia") === "weak", "proper: only 'Namsan' matched → weak");

// ---- 소스별 가중치 ----
const Tart = R.makeTerms({ q: "인상주의 풍경화", qe: "impressionist landscape painting" });
ok(R.bias("artic", Tart, false) > 1 && R.bias("nasa", Tart, false) < 0.5, "art query boosts museums, mutes NASA");
ok(R.bias("artic", T, false) < 0.5 && R.bias("nasa", T, false) < 0.5, "tower name query mutes museums and NASA");
ok(R.bias("nasa", R.makeTerms({ q: "은하수", qe: "milky way" }), false) > 1, "space query boosts NASA");
ok(R.bias("naver", T, false) > R.bias("unsplash", T, false), "Hangul proper noun: Korean engines outrank generic photo sources");
ok(R.bias("artic", T, true) === 1 && R.bias("nasa", T, true) === 1, "pinned (user chose the source) → no bias");
ok(R.bias("naver", R.makeTerms({ q: "sunset beach" }), false) < 1, "English query: Korean engines get a slight cut");

// ---- 순위: 같은 소스 순위여도 관련도 등급이 우선 ----
const score = (it, src, rank) => R.mul(R.judge(it, T, src).tier) / (60 + rank);
ok(score({ title: "금강엑슬루타워", tags: [] }, "wikimedia", 15) > score({ title: "", tags: ["river", "geumgang"] }, "pixabay", 0), "a relevant item ranked 16th beats an irrelevant river photo ranked 1st");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
