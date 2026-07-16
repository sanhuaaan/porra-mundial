#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Cartera óptima PRE-TORNEO por PUNTOS ESPERADOS.
//
// Corre el modelo Monte Carlo (sim/model.mjs) y resuelve el knapsack sobre la
// media por selección: 36 M€, ≥7 selecciones, ninguna de coste 9 M€.
// Para optimizar la DISTRIBUCIÓN (mediana / percentil / riesgo) en vez de la
// media, ver sim/optimize.mjs.
//
//   node sim/simulate.mjs [N]     (N = nº de simulaciones, por defecto 20000)
// ───────────────────────────────────────────────────────────────────────────
import { round1 } from "../lib/engine.mjs";
import {
  runMonteCarlo, COST, ALL_TEAMS,
  REAL_BRACKET, RHO, DIV, STYLE, BLEND_W, HOST_ELO,
} from "./model.mjs";

const N = Number(process.argv[2]) || 20000;
const { mean } = runMonteCarlo(N);

// ── Knapsack sobre puntos ESPERADOS: 36 M€, ≥7 sels, ninguna de 9 M€ ────────
const items = ALL_TEAMS.filter((t) => COST[t] !== 9).map((t) => ({ t, c: COST[t], p: mean.get(t) }));
const CAP = 36, MAXN = 12, NEG = -1e9;
const dp = Array.from({ length: MAXN + 1 }, () =>
  Array.from({ length: CAP + 1 }, () => ({ s: NEG, pick: [] })));
dp[0][0] = { s: 0, pick: [] };
for (const it of items)
  for (let k = MAXN - 1; k >= 0; k--)
    for (let w = CAP - it.c; w >= 0; w--) {
      if (dp[k][w].s <= NEG / 2) continue;
      const ns = dp[k][w].s + it.p;
      if (ns > dp[k + 1][w + it.c].s) dp[k + 1][w + it.c] = { s: ns, pick: [...dp[k][w].pick, it.t] };
    }
let best = { s: NEG, pick: [], n: 0, w: 0 };
for (let k = 7; k <= MAXN; k++)
  for (let w = 0; w <= CAP; w++) if (dp[k][w].s > best.s) best = { ...dp[k][w], n: k, w };

// ── Salida ─────────────────────────────────────────────────────────────────
const fmt = (x) => round1(x).toString().padStart(6);
console.log(`\nMonte Carlo pre-torneo · ${N.toLocaleString("es")} simulaciones · ${REAL_BRACKET ? "cuadro REAL" : "sorteo aleatorio"} · Dixon-Coles (ρ=${RHO}, DIV=${DIV}) · estilo atk/def (STYLE=${STYLE}) · blend Elo/odds w=${BLEND_W} + local +${HOST_ELO}\n`);
console.log("CARTERA ÓPTIMA ESPERADA (36 M€, ≥7 sels, sin 9 M€)");
console.log(`  puntos esperados: ${round1(best.s)}  ·  coste: ${best.w} M€  ·  ${best.n} selecciones\n`);
best.pick
  .map((t) => ({ t, c: COST[t], p: mean.get(t) }))
  .sort((a, b) => b.p - a.p)
  .forEach((x) => console.log(`  ${x.t.padEnd(16)} ${x.c} M   ${fmt(x.p)} pts esp.`));

console.log("\nTop 15 selecciones por puntos esperados (referencia):");
[...mean.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([t, p]) =>
  console.log(`  ${t.padEnd(16)} ${COST[t]} M   ${fmt(p)} pts esp.`));
