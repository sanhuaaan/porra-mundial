#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Mejora #1: optimizar la DISTRIBUCIÓN, no solo la media.
//
// El knapsack de simulate.mjs maximiza puntos ESPERADOS = suma de medias
// marginales, y por linealidad de la esperanza ignora TODA correlación entre las
// selecciones propias. Pero en una sola porra manda la varianza. Aquí guardamos
// la matriz equipo×simulación (runMonteCarlo) y optimizamos el subconjunto para
// objetivos conscientes del riesgo, que SÍ usan la correlación (dos equipos del
// mismo grupo o que se cruzan pronto tienen puntos negativamente correlados →
// menos varianza):
//   · media            — referencia (≈ el knapsack lineal)
//   · mediana (p50)     — el resultado «típico»
//   · percentil 25      — el SUELO (para no hundirte)
//   · media − σ         — penaliza la varianza
//
// Objetivo no separable → no hay DP; se usa recocido simulado con la matriz.
//   node sim/optimize.mjs [N]     (por defecto 20000)
// ───────────────────────────────────────────────────────────────────────────
import { runMonteCarlo, COST, ALL_TEAMS } from "./model.mjs";
import { loadEngine } from "../lib/engine.mjs";

const N = Number(process.argv[2]) || 20000;
const CAP = 36, MINN = 7, MAXN = 11;
const { matrix } = runMonteCarlo(N);
const { POOL_DATA } = loadEngine();
const GROUP_OF = {};
for (const [g, ts] of Object.entries(POOL_DATA.groups)) ts.forEach((t) => (GROUP_OF[t] = g));

const eligible = ALL_TEAMS.filter((t) => COST[t] !== 9);
const round1 = (x) => Math.round(x * 10) / 10;

// PRNG local (fijo) para que el recocido sea reproducible.
let seed = 0x1234abcd;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ── Estadísticos de un vector de totales (Float64Array de longitud N) ────────
const scratch = new Float64Array(N);
function percentile(tot, q) {
  scratch.set(tot);
  scratch.sort();
  return scratch[Math.floor(q * (N - 1))];
}
function meanStd(tot) {
  let s = 0; for (let n = 0; n < N; n++) s += tot[n];
  const m = s / N;
  let v = 0; for (let n = 0; n < N; n++) v += (tot[n] - m) ** 2;
  return [m, Math.sqrt(v / N)];
}
const OBJECTIVES = {
  media: (tot) => meanStd(tot)[0],
  mediana: (tot) => percentile(tot, 0.5),
  "percentil-25": (tot) => percentile(tot, 0.25),
  "media−σ": (tot) => { const [m, sd] = meanStd(tot); return m - sd; },
  "σ-mínima (ref)": (tot) => -meanStd(tot)[1], // cuánto baja la varianza aunque hunda la media
};

// ── Totales de una cartera + deltas incrementales ────────────────────────────
function totalsOf(set) {
  const tot = new Float64Array(N);
  for (const t of set) { const r = matrix.get(t); for (let n = 0; n < N; n++) tot[n] += r[n]; }
  return tot;
}
function apply(tot, teams, sign) {
  for (const t of teams) { const r = matrix.get(t); for (let n = 0; n < N; n++) tot[n] += sign * r[n]; }
}
const costOf = (set) => [...set].reduce((s, t) => s + COST[t], 0);

// Punto de partida factible: knapsack-DP por media marginal (garantiza ≥7 y
// ≤36 M€, igual que simulate.mjs). Un greedy ingenuo se gastaba el presupuesto en
// las caras y no dejaba hueco para 7 selecciones.
function meanStart() {
  const mean = new Map(eligible.map((t) => {
    const r = matrix.get(t); let s = 0; for (let n = 0; n < N; n++) s += r[n]; return [t, s / N];
  }));
  const NEG = -1e9;
  const dp = Array.from({ length: MAXN + 1 }, () =>
    Array.from({ length: CAP + 1 }, () => ({ s: NEG, pick: [] })));
  dp[0][0] = { s: 0, pick: [] };
  for (const t of eligible)
    for (let k = MAXN - 1; k >= 0; k--)
      for (let w = CAP - COST[t]; w >= 0; w--) {
        if (dp[k][w].s <= NEG / 2) continue;
        const ns = dp[k][w].s + mean.get(t);
        if (ns > dp[k + 1][w + COST[t]].s) dp[k + 1][w + COST[t]] = { s: ns, pick: [...dp[k][w].pick, t] };
      }
  let best = { s: NEG, pick: [] };
  for (let k = MINN; k <= MAXN; k++)
    for (let w = 0; w <= CAP; w++) if (dp[k][w].s > best.s) best = dp[k][w];
  return new Set(best.pick);
}

// ── Recocido simulado para un objetivo ───────────────────────────────────────
function anneal(objName, iters = 4000) {
  const score = OBJECTIVES[objName];
  let set = meanStart();
  let tot = totalsOf(set);
  let cur = score(tot);
  let best = { set: new Set(set), val: cur };
  for (let i = 0; i < iters; i++) {
    const T = 6 * (1 - i / iters) + 0.05; // enfriamiento lineal
    const inSet = [...set], outSet = eligible.filter((t) => !set.has(t));
    // Elegir movimiento factible: swap (frecuente), add o remove.
    const roll = rnd();
    let remove = [], add = [];
    if (roll < 0.7 || set.size <= MINN) {           // swap
      const out = pick(inSet), inn = pick(outSet);
      if (costOf(set) - COST[out] + COST[inn] <= CAP) { remove = [out]; add = [inn]; }
    } else if (roll < 0.85 && set.size < MAXN) {     // add
      const inn = pick(outSet);
      if (costOf(set) + COST[inn] <= CAP) add = [inn];
    } else if (set.size > MINN) {                     // remove
      remove = [pick(inSet)];
    }
    if (!remove.length && !add.length) continue;
    apply(tot, add, +1); apply(tot, remove, -1);
    const val = score(tot);
    const accept = val > cur || rnd() < Math.exp((val - cur) / T);
    if (accept) {
      remove.forEach((t) => set.delete(t)); add.forEach((t) => set.add(t));
      cur = val;
      if (val > best.val) best = { set: new Set(set), val };
    } else {
      apply(tot, add, -1); apply(tot, remove, +1); // revertir
    }
  }
  return best.set;
}

// ── Puntos REALES (para contrastar; una cartera pre-torneo NO los conoce) ─────
const { POOL_DATA: LIVE, compute } = loadEngine();
const realTable = compute(LIVE);
const realPts = (t) => round1(realTable.get(t)?.total ?? 0);

function describe(name, set) {
  const teams = [...set].sort((a, b) => COST[b] - COST[a]);
  const tot = totalsOf(set);
  const [m, sd] = meanStd(tot);
  const p25 = percentile(tot, 0.25), p50 = percentile(tot, 0.5);
  const cost = costOf(set);
  const real = teams.reduce((s, t) => s + realPts(t), 0);
  const groups = teams.map((t) => GROUP_OF[t]);
  const dupGroups = groups.length - new Set(groups).size;
  console.log(`\n■ Objetivo: ${name}`);
  console.log(`  ${teams.map((t) => `${t}(${COST[t]})`).join(", ")}`);
  console.log(`  coste ${cost} M€ · ${teams.length} sels · grupos repetidos: ${dupGroups}`);
  console.log(`  media ${round1(m)} · mediana ${round1(p50)} · p25 ${round1(p25)} · σ ${round1(sd)}  →  REAL ${round1(real)}`);
}

console.log(`\nOptimización de la DISTRIBUCIÓN · ${N.toLocaleString("es")} simulaciones · 36 M€, ≥7, sin 9 M€`);
for (const name of Object.keys(OBJECTIVES)) describe(name, anneal(name));
