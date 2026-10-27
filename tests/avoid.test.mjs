// "추천 안 함" 저장소 점검: 숨기기·태그 겹침 판정(순위 낮춤/블러)·상한·저장 내용·되돌리기를 확인합니다.
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../", import.meta.url).pathname;
const sb = { module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(ROOT + "public/avoid.js", "utf8"), sb);
const { create, MAXKEYS } = sb.module.exports;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const mem = {}; const store = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
let A = create(store);

ok(A.isEmpty() && A.count() === 0 && A.verdict(["cat", "dog"]) === 0 && !A.isHidden("x.test/a.jpg"), "empty store: nothing hidden, verdict 0");

// ---- 숨기기 ----
ok(A.hide("x.test/a.jpg", ["neon", "club", "night"], "pref") === true && A.isHidden("x.test/a.jpg") && !A.isHidden("x.test/b.jpg"), "hidden image is remembered by its address key");
A.hide("x.test/a.jpg", ["neon"], "pref");
ok(A.count() === 1, "hiding the same image twice keeps one key");
ok(A.hide("", ["a"]) === false, "empty key rejected");

// ---- 태그 겹침: 한 번 숨긴 것만으로는 다른 이미지에 영향이 없음 ----
A = create(store); A.clear();
A.hide("k1", ["neon", "club", "night"], "pref");
ok(A.verdict(["neon", "club", "night"]) === 0, "one report: other images with the same tags are unaffected");
// 두 번째 이미지에서 태그 두 개가 겹치면 순위를 낮춤
A.hide("k2", ["neon", "club", "street"], "pref");
ok(A.verdict(["neon", "club", "sky"]) === 1, "two images sharing two tags: images with those tags are demoted");
ok(A.verdict(["neon", "sky", "sea"]) === 0, "only one of the repeated tags: not demoted");
ok(A.verdict(["night", "street"]) === 0, "tags seen once are ignored");
// 태그 하나가 4번 이상이면 단독으로 낮춤
A.hide("k3", ["neon"], "pref"); A.hide("k4", ["neon"], "pref");
ok(A.verdict(["neon", "x1"]) === 1, "a single tag reported 4 times demotes on its own");
ok(A.verdict(["neon", "x1"]) !== 2, "'pref' never blurs");

// ---- 불편 → 블러 ----
A = create(store); A.clear();
A.hide("b1", ["bikini", "pool", "party"], "bad");
ok(A.verdict(["bikini", "pool"]) === 0, "one 'bad' report does not blur other images");
A.hide("b2", ["bikini", "pool", "beach"], "bad");
ok(A.verdict(["bikini", "pool", "sun"]) === 2, "two 'bad' reports sharing two tags: matching images are blurred");
ok(A.verdict(["bikini", "sun"]) === 0, "only one repeated tag (reported twice): not enough to act, so generic tags do not spread");
ok(A.verdict(["beach", "sun"]) === 0, "unrelated tags untouched");
A.hide("b3", ["bikini"], "bad"); A.hide("b4", ["bikini"], "bad");
ok(A.verdict(["bikini", "sun"]) === 2, "a single tag reported 4 times as 'bad' blurs on its own");
// 섞어서: 관심 없음 + 불편
A = create(store); A.clear(); A.hide("m1", ["alpha", "beta"], "pref"); A.hide("m2", ["alpha", "beta"], "bad");
ok(A.verdict(["alpha", "beta"]) === 1, "mixed pref+bad counts for demotion but not for blur: " + A.verdict(["alpha", "beta"]));

// ---- 태그 정리: 짧은 말·숫자·불용어는 기억하지 않음 ----
A = create(store); A.clear(); A.hide("n1", ["a", "12345", "image", "ok tag", "OK TAG"], "pref"); A.hide("n2", ["ok tag", "image"], "pref");
ok(A.view().tags.map((x) => x.k).join() === "ok tag", "short/numeric/stop tags are not stored; case folded: " + A.view().tags.map((x) => x.k));

// ---- 보기·되돌리기 ----
A = create(store); A.clear(); A.hide("v1", ["rose", "garden"], "pref"); A.hide("v2", ["rose", "garden"], "pref");
const v = A.view();
ok(v.n === 2 && v.tags.length === 2 && v.tags[0].pref === 2, "view: hidden count and repeated tags with their counts");
A.forget("Rose");
ok(A.view().tags.map((x) => x.k).join() === "garden" && A.verdict(["rose", "garden"]) === 0, "forgetting a tag removes its effect (case-insensitive)");
ok(A.isHidden("v1"), "forgetting a tag does not un-hide images");
A.clear();
ok(A.isEmpty() && !A.isHidden("v1"), "clear removes everything");

// ---- 상한 ----
A = create(store); A.clear();
for (let i = 0; i < MAXKEYS + 50; i++) A.hide("key" + i, ["tag" + (i % 7) + "x"], "pref");
ok(A.count() === MAXKEYS && !A.isHidden("key0") && A.isHidden("key" + (MAXKEYS + 49)), "key list capped; oldest dropped: " + A.count());

// ---- 저장 내용: 주소 키와 태그 횟수뿐, 검색어나 시각 목록 같은 것은 없음 ----
A = create(store); A.clear(); A.hide("host.test/p.jpg", ["tree", "leaf"], "pref");
const saved = JSON.parse(mem.avoid);
ok(Object.keys(saved).sort().join() === "bad,keys,pref,v", "saved fields: " + Object.keys(saved).sort());
ok(!/query|search|q"/.test(mem.avoid), "no search words stored");
// 다시 열기
const B = create(store);
ok(B.isHidden("host.test/p.jpg") && B.view().all === 2, "reloaded from storage");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
