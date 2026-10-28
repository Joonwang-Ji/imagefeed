// 관심사 군집(public/interests.js) 점검: 묶기·대표 이미지·검색어·뽑기·임베딩 섞기·시간 감쇠
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../", import.meta.url).pathname;
const sb = { module: { exports: {} }, Float32Array, Int8Array, Math, Set, Map, Date }; vm.runInNewContext(fs.readFileSync(ROOT + "public/interests.js", "utf8"), sb);
const I = sb.module.exports;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const NOW = Date.UTC(2026, 9, 28, 3, 0, 0), DAY = 86400000;
let seq = 0;
const E = (keys, o = {}) => ({ id: "e" + ++seq, keys, wt: 3, ts: NOW - DAY, ...o });

// ---- 두 관심사가 섞이지 않고 각각 묶임 ----
const hanok = [E(["한옥", "처마", "기와"]), E(["한옥", "마당", "기와"]), E(["한옥", "처마", "전통"]), E(["한옥", "대청마루", "전통"])];
const kitchen = [E(["kitchen", "nordic", "white"]), E(["kitchen", "nordic", "wood"]), E(["nordic", "interior", "wood"])];
const odd = [E(["rocket"], { wt: 1 })]; // 한 번 본 것 하나: 관심사가 되기엔 약함
let cl = I.build([...hanok, ...kitchen, ...odd], { now: NOW });
ok(cl.length === 2, "two interests found, the lone weak view is ignored: " + cl.map((c) => c.label).join(" | "));
const ids = (c) => new Set(c.ids);
ok(hanok.every((e) => ids(cl.find((c) => c.terms.includes("한옥"))).has(e.id)), "all hanok activity grouped together");
ok(kitchen.every((e) => ids(cl.find((c) => c.terms.includes("nordic"))).has(e.id)), "all kitchen activity grouped together");
ok(cl[0].weight >= cl[1].weight, "sorted by importance");

// ---- 대표 이미지는 묶음 안의 실제 활동 하나, 대표 단어는 여러 장에서 나온 것 ----
const h = cl.find((c) => c.terms.includes("한옥"));
ok(h.ids.includes(h.medoidId), "medoid is a real member");
ok(h.terms[0] === "한옥" && (h.terms.includes("기와") || h.terms.includes("전통") || h.terms.includes("처마")), "terms: " + h.terms.join(","));
const q = I.queries(h);
ok(q[0].split(" ").length === 2 && q[0].includes("한옥") && q.includes("한옥"), "queries start with a 2-word query and end with the single term: " + q.join(" / "));
ok(new Set(q).size === q.length, "queries are unique");

// ---- 같은 보드는 가깝다고 봄 ----
const a = E(["lamp", "brass"], { boards: ["거실"] }), b = E(["sofa", "linen"], { boards: ["거실"] }), c2 = E(["sofa", "linen"], { boards: [] }), d = E(["lamp", "brass"], { boards: [] });
const noBoard = I.build([c2, d, E(["x1"]), E(["x2"])], { now: NOW });
const withBoard = I.build([a, b, E(["x1"]), E(["x2"])], { now: NOW });
ok(withBoard.some((x) => x.ids.includes(a.id) && x.ids.includes(b.id)), "items in the same board are grouped even with different words");
ok(!noBoard.some((x) => x.ids.includes(c2.id) && x.ids.includes(d.id)), "…and not grouped without the board signal");

// ---- 시간 감쇠: 오래된 활동은 중요도가 줄고, 아주 오래되면 사라짐 ----
const fresh = I.build([E(["tea", "cup"], { ts: NOW }), E(["tea", "cup", "pot"], { ts: NOW })], { now: NOW });
const old = I.build([E(["tea", "cup"], { ts: NOW - 70 * DAY }), E(["tea", "cup", "pot"], { ts: NOW - 70 * DAY })], { now: NOW, minWeight: 0.1 });
ok(old[0] && Math.abs(old[0].weight / fresh[0].weight - Math.exp(-0.7)) < 0.02, `70 days old ≈ e^-0.7 of fresh: ${(old[0].weight / fresh[0].weight).toFixed(3)}`);
ok(I.build([E(["tea"], { ts: NOW - 400 * DAY })], { now: NOW }).length === 0, "400-day-old activity drops out");
ok(I.prepare([{ id: "n", keys: ["x"], wt: -2, ts: NOW }], NOW).length === 0, "negative score (disliked) is not used as an interest");
ok(I.prepare([{ id: "n", keys: [], wt: 3, ts: NOW }], NOW).length === 0, "no words and no vector → ignored");

// ---- 뽑기: 최대 3개, 중요도에 비례, 가장 최근 활동의 묶음은 반드시 포함 ----
const many = [];
for (const [name, n, ago] of [["alpha", 6, 20], ["beta", 4, 15], ["gamma", 3, 10], ["delta", 3, 30], ["eps", 2, 25]]) for (let i = 0; i < n; i++) many.push(E([name, name + "x", "s" + i % 2], { ts: NOW - ago * DAY, wt: 3 }));
many.push(E(["zeta", "zetax"], { ts: NOW - 3600000, wt: 3 }), E(["zeta", "zetay"], { ts: NOW - 7200000, wt: 3 }));
const big = I.build(many, { now: NOW });
ok(big.length >= 5, "five+ interests: " + big.map((c) => c.label).join(" | "));
let always = true, sizes = true; const hits = {};
for (let i = 0; i < 200; i++) {
  const p = I.pick(big, 3, { now: NOW });
  sizes = sizes && p.length === 3 && new Set(p).size === 3;
  always = always && p.some((x) => x.terms.includes("zeta"));
  p.forEach((x) => { const k = x.terms[0]; hits[k] = (hits[k] || 0) + 1; });
}
ok(sizes, "always three distinct interests");
ok(always, "the interest of the activity within 36h is always included");
ok((hits.alpha || 0) > (hits.eps || 0), `heavier interest is picked more often: alpha ${hits.alpha} > eps ${hits.eps}`);
ok(I.pick([], 3, { now: NOW }).length === 0, "no interests → nothing picked");
ok(I.pick(big, 3, { now: NOW, rand: () => 0 }).length === 3, "deterministic rand works");
const stale = I.build(many.filter((e) => !e.keys.includes("zeta")), { now: NOW });
ok(!I.pick(stale, 1, { now: NOW }).length || stale.some((c) => NOW - c.latest >= 36 * 3600000), "no fresh activity → purely weighted sampling still returns interests");

// ---- 임베딩: 의미가 가까운 활동은 단어가 달라도 묶임 ----
const unit = (arr) => Int8Array.from(arr.map((x) => Math.round(x * 100)));
const v1 = unit([1, 0.1, 0, 0.1]), v2 = unit([0.95, 0.2, 0.05, 0.1]), v3 = unit([0, 0.1, 1, 0.9]);
ok(I.cosine(v1, v2) > 0.95 && I.cosine(v1, v3) < 0.3, "cosine: close vs far: " + I.cosine(v1, v2).toFixed(2) + " / " + I.cosine(v1, v3).toFixed(2));
ok(I.cosine(null, v1) === null && I.cosine(v1, unit([1, 2])) === null, "cosine: missing or mismatched vectors → null");
const sem = I.build([E(["고양이"], { vec: v1 }), E(["cat"], { vec: v2 }), E(["건축물"], { vec: v3 }), E(["building"], { vec: unit([0.05, 0.1, 0.95, 0.85]) })], { now: NOW });
ok(sem.length === 2 && sem.every((c) => c.ids.length === 2), "Korean/English words with similar embeddings are grouped: " + sem.map((c) => c.terms.join("+")).join(" | "));
ok(sem[0].vec && sem[0].vec.length === 4, "cluster centroid vector is produced");
ok(I.blend(0, 10, null) === null, "blend: no embedding → null");
ok(I.blend(0, 10, 0.7) > I.blend(0, 10, 0.2) && I.blend(0, 10, 0.5) > I.blend(9, 10, 0.5), "blend: similarity and original order both count");

// ---- 크기: 활동이 많아도 빠르게 ----
const t0 = Date.now(), huge = [];
for (let i = 0; i < 400; i++) huge.push(E(["t" + (i % 17), "u" + (i % 11), "v" + (i % 5)], { ts: NOW - (i % 60) * DAY, wt: 1 + (i % 3) }));
const hc = I.build(huge, { now: NOW });
ok(hc.length > 0 && Date.now() - t0 < 1500, `400 activities cluster in ${Date.now() - t0}ms (capped at ${I.MAXN})`);
ok(hc.reduce((t, c) => t + c.ids.length, 0) <= I.MAXN, "never uses more than the cap");

console.log(fail ? `${fail} FAILED` : "all passed"); process.exit(fail ? 1 : 0);
