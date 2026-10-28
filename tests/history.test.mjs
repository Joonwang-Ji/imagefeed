// 7일 누적 합치기 점검 (순수 함수): 여러 날 등장한 말이 앞, 하루짜리·오래된 말은 뒤/제외
import { mergeHistory, mergeToday, slim, HIST_DAYS } from "../src/history.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const r = (...qs) => qs.map((q, i) => ({ label: q, q, news: [q + " 뉴스"], traffic: 100 - i }));

ok(HIST_DAYS === 7, "history window is 7 days");
ok(mergeHistory([]).length === 0 && mergeHistory(undefined).length === 0 && mergeHistory([[], [], []]).length === 0, "empty input gives an empty list");
let m = mergeHistory([r("a", "b", "c")]);
ok(m.map((x) => x.q).join() === "a,b,c", "only today: today's order is kept: " + m.map((x) => x.q));
m = mergeHistory([r("a", "b", "c"), r("c"), r("c", "b")]);
ok(m.map((x) => x.q).join() === "c,b,a" && m[0].days === 3 && m[1].days === 2 && m[2].days === 1, "more days ranks first: " + m.map((x) => x.q + ":" + x.days));
m = mergeHistory([r("a"), r("x"), r("x")]);
ok(m.some((x) => x.q === "x" && !x.today && x.days === 2), "seen on 2 recent days but not today: kept");
m = mergeHistory([r("a"), [], [], [], r("y"), r("y")]);
ok(!m.some((x) => x.q === "y"), "seen on 2 days but last seen 4 days ago: dropped");
m = mergeHistory([r("a"), r("z")]);
ok(!m.some((x) => x.q === "z"), "seen only yesterday (once): dropped");
m = mergeHistory([r("a", "b"), r("b", "a")]);
ok(m.map((x) => x.q).join() === "a,b", "same day count: today's rank decides: " + m.map((x) => x.q));
m = mergeHistory([[{ label: "k", q: "k", news: ["n1", "n2"], traffic: 5 }], [{ label: "k", q: "k", news: ["n2", "n3", "n4", "n5"], traffic: 9 }]]);
ok(m[0].news.join() === "n1,n2,n3,n4" && m[0].traffic === 9, "news titles merged (unique, up to 4) and the largest traffic kept: " + m[0].news);
ok(mergeHistory([[null, { q: "" }, { label: "no q" }, r("ok")[0]]]).length === 1, "broken rows are ignored");

const s = slim({ label: "L", q: "Q", news: ["가".repeat(200), "b", "c"], traffic: 7, extra: "x" });
ok(s.news.length === 2 && s.news[0].length === 80 && !("extra" in s) && s.traffic === 7, "slim keeps only what is needed (2 news titles, 80 chars)");
const t = mergeToday([{ label: "old", q: "old", news: [], traffic: 0 }, { label: "a", q: "a", news: [], traffic: 0 }], r("a", "b"));
ok(t.map((x) => x.q).join() === "a,b,old", "mergeToday: fresh list first, earlier ones appended without duplicates: " + t.map((x) => x.q));
ok(mergeToday([], Array.from({ length: 100 }, (_, i) => ({ label: "k" + i, q: "k" + i, news: [] }))).length === 60, "mergeToday caps at 60");
ok(mergeToday(null, null).length === 0, "mergeToday handles missing input");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
