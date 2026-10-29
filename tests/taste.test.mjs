// 취향 저장소 점검: 점수 쌓기·감쇠·덜 보기·상한·저장 내용(집계값만)을 확인합니다.
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../", import.meta.url).pathname;
const sb = { module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(ROOT + "public/taste.js", "utf8"), sb);
const { create, keysOf, HALF } = sb.module.exports;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const mem = {}; const store = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
let t0 = 1_700_000_000_000; const clock = () => t0;
let T = create(store, clock);

// ---- 단어 뽑기 ----
ok(keysOf({ tags: ["Sunset", "beach", "Sea"], title: "x" }).join() === "sunset,beach,sea", "keys from tags (lowercased)");
ok(keysOf({ tags: [], title: "가을 단풍길 사진" }).join() === "가을,단풍길", "keys from title when no tags (stop words dropped): " + keysOf({ tags: [], title: "가을 단풍길 사진" }));
ok(keysOf({ tags: [], title: "손흥민", grp: "news" }).length === 0, "news items give no keys (people/event names)");
ok(keysOf({ tags: ["a", "12345", "image", "ok tag"] }).join() === "ok tag", "short/numeric/stop tags dropped");

// ---- 학습과 취향 점수 ----
ok(T.isEmpty() && T.affinity(["cat"]) === 0, "empty store: affinity 0");
T.learn(["cat", "kitten", "pet"], 3, { colors: ["gray", "white"], tone: "pastel", temp: "warm" });
ok(T.affinity(["cat", "kitten", "pet"]) > 0.9, "learned item: affinity ~1: " + T.affinity(["cat", "kitten", "pet"]).toFixed(2));
const partial = T.affinity(["cat", "dog", "tree", "sky"]);
ok(partial > 0.1 && partial < 0.5, "one shared tag of four: mild affinity " + partial.toFixed(2));
ok(T.affinity(["car", "road"]) === 0, "unrelated: 0");
ok(JSON.stringify(T.top(3)) === '["cat","kitten","pet"]' || T.top(3).length === 3, "top tags: " + T.top(3));
const v1 = T.view();
ok(v1.colors.length === 2 && v1.tones.some((x) => x.k === "pastel") && v1.tones.some((x) => x.k === "warm"), "colors and tones tracked");

// ---- 덜 보기 ----
T.learn(["dog", "puppy"], -3);
ok(T.affinity(["dog", "puppy"]) < -0.9, "less: negative affinity " + T.affinity(["dog", "puppy"]).toFixed(2));
ok(T.view().less.map((x) => x.k).includes("dog"), "less list shows dog");
ok(!T.top(10).includes("dog"), "disliked words are not in top");

// ---- 저장 내용: 집계값만 (검색어·이미지 목록·주소 없음) ----
const raw = mem.taste;
ok(raw && !/https?:|query|search|url|history/i.test(raw), "stored data has no urls/queries/history");
const parsed = JSON.parse(raw);
ok(parsed.v === 1 && Object.keys(parsed).sort().join() === "colors,mute,tags,tones,v", "stored shape: v/tags/colors/tones/mute only");
ok(Object.values(parsed.tags).every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] === "number"), "tag entries are [score, ts]");
const T2 = create(store, clock);
ok(T2.affinity(["cat", "kitten", "pet"]) > 0.9, "persisted and reloaded");

// ---- 시간이 지나면 줄어듦 ----
t0 += HALF;
const half = T.affinity(["cat", "kitten", "pet"]);
ok(half > 0.4 && half < 0.6, "after one half-life: ~half " + half.toFixed(2));
t0 += 6 * HALF;
ok(Math.abs(T.affinity(["cat", "kitten", "pet"])) < 0.02, "after many half-lives: ~0");
T.learn(["tree"], 1); // 학습할 때 오래된 항목이 정리됨
ok(!("cat" in JSON.parse(mem.taste).tags), "old faded words pruned on save");

// ---- 상한 ----
T.clear();
for (let i = 0; i < 400; i++) T.learn(["word" + String(i).padStart(3, "0")], 1 + (i % 5));
ok(Object.keys(JSON.parse(mem.taste).tags).length <= 160, "tag count capped: " + Object.keys(JSON.parse(mem.taste).tags).length);
// 점수 상한
T.clear(); for (let i = 0; i < 50; i++) T.learn(["cat"], 3);
ok(JSON.parse(mem.taste).tags.cat[0] <= 12, "score capped at 12");

// ---- 모두 지우기 ----
T.clear();
ok(T.isEmpty() && JSON.stringify(JSON.parse(mem.taste).tags) === "{}", "clear wipes everything");
// 이상한 저장값은 무시하고 빈 상태로 시작
mem.taste = JSON.stringify({ v: 99, junk: 1 });
ok(create(store, clock).isEmpty(), "unknown stored format ignored");

// ---- 학습된 항목 하나씩 지우기 ----
{
  const T2 = create({ get: (k, d) => d, set: () => {} }, clock);
  T2.learn(["alpha", "beta"], 3, { colors: ["red"], tone: "vivid" }); T2.learn(["gamma"], -3);
  ok(T2.forget("tags", "alpha") === true && !T2.view().tags.some((x) => x.k === "alpha") && T2.view().tags.some((x) => x.k === "beta"), "forget one tag leaves the others");
  ok(T2.affinity(["alpha"]) === 0, "forgotten tag no longer influences ranking");
  ok(T2.forget("tags", "gamma") === true && T2.view().less.length === 0, "a 'less' tag can be removed too");
  ok(T2.forget("tones", "vivid") === true && T2.forget("colors", "red") === true && T2.view().tones.length === 0 && T2.view().colors.length === 0, "tones and colors can be removed");
  ok(T2.forget("tags", "nope") === false, "unknown item: nothing happens");
  ok(keysOf({ tags: [], title: "블로그 후기 맛집", grp: "hot" }).length === 0, "naver hot-photo titles are not learned");
}

// ---- 뺀 단어(mute): 지운 단어가 다른 경로로 다시 올라오지 않게 ----
{
  const m2 = {}, st2 = { get: (k, d) => (k in m2 ? JSON.parse(m2[k]) : d), set: (k, v) => { m2[k] = JSON.stringify(v); } };
  const T3 = create(st2, clock);
  T3.learn(["cafe벚꽃", "모임"], 3);
  ok(T3.top(5).includes("cafe벚꽃") && !T3.isMuted("cafe벚꽃"), "before: learned word is in top");
  ok(T3.forget("tags", "cafe벚꽃") === true && T3.isMuted("cafe벚꽃") && !T3.top(5).includes("cafe벚꽃"), "deleting a liked tag also mutes it");
  T3.learn(["cafe벚꽃", "카페"], 3);
  ok(!T3.top(5).includes("cafe벚꽃") && !T3.view().tags.some((x) => x.k === "cafe벚꽃") && T3.top(5).includes("카페"), "muted word is not learned again (other words still are)");
  ok(T3.affinity(["cafe벚꽃"]) === 0, "muted word has no influence on ranking");
  ok(T3.muted().join() === "cafe벚꽃" && T3.isMuted("CAFE벚꽃"), "muted list is case-insensitive");
  T3.clear();
  ok(T3.isMuted("cafe벚꽃") && T3.isEmpty(), "clear wipes scores but keeps muted words");
  ok(create(st2, clock).isMuted("cafe벚꽃"), "muted words survive reload");
  ok(T3.unmute("cafe벚꽃") === true && !T3.isMuted("cafe벚꽃") && T3.unmute("cafe벚꽃") === false, "unmute restores the word");
  T3.learn(["gamma2"], -3); ok(T3.forget("tags", "gamma2", false) === true && !T3.isMuted("gamma2"), "removing a 'less' tag does not mute it");
  ok(T3.mute("신혼여행계획") === true && T3.isMuted("신혼여행계획") && T3.mute("a") === false, "mute() works for bookmark-derived words; too-short words are rejected");
  ok(JSON.stringify(JSON.parse(m2.taste).mute).indexOf("http") < 0, "muted words are stored as plain words only");
}

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
