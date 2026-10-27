// 계절·기념일 주제 점검: 날짜 계산(부활절·수능·대림절)과 "며칠 전부터 보이는지"를 확인합니다.
import { seasonTopics, easter } from "../src/season.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const at = (s) => Date.parse(s + "T12:00:00+09:00"); // 한국 시간 정오
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// 부활절 (알려진 날짜)
ok(iso(easter(2026)) === "2026-04-05" && iso(easter(2027)) === "2027-03-28" && iso(easter(2028)) === "2028-04-16", "easter 2026/27/28");

// 지금(2026-10-27): 할로윈이 4일 뒤로 맨 앞
const now = seasonTopics(at("2026-10-27"));
ok(now[0].label === "할로윈" && now[0].days === 4, "Oct 27: Halloween first, in 4 days: " + JSON.stringify(now[0]));
const labels = now.filter((x) => x.kind === "event").map((x) => x.label);
ok(!labels.includes("빼빼로데이"), "Pepero day (15 days away, lead 12) not shown yet");
ok(now.some((x) => x.kind === "season"), "month season topics included");
ok(now.filter((x) => x.kind === "season").every((x) => x.q && x.label), "season topics have label and query");

// 수능: 2026-11-19, 2027-11-18 (11월 셋째 주 목요일)
ok(seasonTopics(at("2026-11-12")).some((x) => x.label === "수능" && x.days === 7), "Nov 12 2026: CSAT in 7 days");
ok(seasonTopics(at("2027-11-10")).some((x) => x.label === "수능" && x.days === 8), "Nov 10 2027: CSAT in 8 days (Thursday Nov 18)");

// 크리스마스는 5주 전부터, 대림절은 11월 29일(2026)
ok(!seasonTopics(at("2026-11-15")).some((x) => x.label === "크리스마스"), "Nov 15: Christmas not yet (40 days)");
ok(seasonTopics(at("2026-11-25")).some((x) => x.label === "크리스마스" && x.days === 30), "Nov 25: Christmas shown");
ok(seasonTopics(at("2026-11-20")).some((x) => x.label === "대림절" && x.days === 9), "Nov 20 2026: Advent in 9 days (Nov 29)");

// 해를 넘어가는 경우: 12월 하순에 새해
const dec = seasonTopics(at("2026-12-28"));
ok(dec.some((x) => x.label === "새해" && x.days === 4), "Dec 28: New Year in 4 days (next year)");
ok(dec.some((x) => x.label === "연말" && x.days === 3), "Dec 28: year-end in 3 days");

// 음력 기념일
ok(seasonTopics(at("2027-01-25")).some((x) => x.label === "설날" && x.days === 12), "Jan 25 2027: Lunar New Year in 12 days");
ok(seasonTopics(at("2026-09-10")).some((x) => x.label === "추석" && x.days === 15), "Sep 10 2026: Chuseok in 15 days");

// 한국 시간 기준 날짜: UTC로는 전날이어도 한국 날짜로 계산
ok(seasonTopics(Date.parse("2026-10-30T16:00:00Z"))[0].label === "할로윈" && seasonTopics(Date.parse("2026-10-30T16:00:00Z"))[0].days === 0, "KST rollover: 2026-10-31 01:00 KST is Halloween today");
// 지난 행사는 나오지 않음
ok(!seasonTopics(at("2026-11-05")).some((x) => x.label === "할로윈"), "after Halloween: gone");
// 개수 상한
ok(seasonTopics(at("2026-12-01"), 3).filter((x) => x.kind === "event").length <= 3, "max events respected");
// 검색어가 공포·잔혹 필터에 걸리지 않음
const { hardBlocked } = await import("../src/filters.js");
const every = []; for (let m = 1; m <= 12; m++) every.push(...seasonTopics(at(`2026-${String(m).padStart(2, "0")}-15`), 20));
ok(every.length > 20 && every.every((x) => !hardBlocked(x.q) && !hardBlocked(x.label)), "no topic query trips the horror/gore filter (" + every.length + " checked)");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
