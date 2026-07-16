#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Simulación Monte Carlo PRE-TORNEO de la porra.
//
// Estima los PUNTOS ESPERADOS de cada selección jugando el Mundial N veces con
// un modelo de fuerza (Elo aproximado), y con esos puntos esperados resuelve el
// mismo knapsack que la cartera óptima a posteriori: presupuesto 36 M€, mínimo 7
// selecciones, ninguna de coste 9 M€.
//
// CLAVE: NO reimplementa la fórmula de puntos. Genera un torneo sintético con la
// MISMA forma que data.js y lo pasa por el `compute()` real del motor
// (lib/engine.mjs), así puntúa EXACTAMENTE como la web.
//
//   node sim/simulate.mjs [N]     (N = nº de simulaciones, por defecto 20000)
//
// ── Cambiar los ratings ────────────────────────────────────────────────────
// La fuerza sale de sim/ratings.json (Elo APROXIMADOS a ojo por tramo de coste).
// Para afinar el modelo NO se toca este script: se edita ese JSON. Fuentes
// posibles a investigar más adelante para rellenarlo con datos reales:
//   · Elo de fútbol (eloratings.net) — ratings por selección, gratis.
//   · Odds de casas de apuestas pre-torneo (ganador + "pasa de grupos"),
//     quitándoles el margen y convirtiéndolas a un rating equivalente.
// Mientras el JSON tenga los 48 nombres del motor, este script no cambia.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEngine, round1 } from "../lib/engine.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2]) || 20000;

// Motor real cargado UNA vez; `compute(synth)` se llama por cada simulación.
const { CONFIG, POOL_DATA, compute } = loadEngine();
const GROUPS = Object.fromEntries(
  Object.entries(POOL_DATA.groups).map(([g, teams]) => [g, [...teams]]),
);
const { elo } = JSON.parse(readFileSync(join(dir, "ratings.json"), "utf8"));

// Coste por selección (mismo tarifario de la porra).
const COST = {
  España: 9, Francia: 9, Inglaterra: 9, Argentina: 9,
  Brasil: 8, Portugal: 8, Alemania: 8, "Países Bajos": 8,
  Noruega: 7, Colombia: 7, Bélgica: 7, Japón: 7,
  "Estados Unidos": 6, Marruecos: 6, Uruguay: 6, Suiza: 6, México: 6, Croacia: 6, Turquía: 6,
  Ecuador: 5, Senegal: 5, Suecia: 5, Canadá: 5, Austria: 5, Paraguay: 5,
  Escocia: 4, Bosnia: 4, "Costa de Marfil": 4, Egipto: 4, "Rep. Checa": 4, Ghana: 4, Argelia: 4,
  "Corea Sur": 3, Túnez: 3, Australia: 3, Irán: 3, Congo: 3,
  Sudáfrica: 2, Catar: 2, "Arabia Saudí": 2, Panamá: 2, "Nueva Zelanda": 2,
  Irak: 1, "Cabo Verde": 1, Curazao: 1, Uzbekistán: 1, Jordania: 1, Haití: 1,
};

// PRNG sembrado (mulberry32) para que el resultado sea reproducible corrida a
// corrida. Cambiar la semilla solo mueve el ruido Monte Carlo, no el fondo.
let seed = 0x9e3779b9;
function rng() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Goles Poisson (Knuth) a partir de la media λ.
function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

// Ventaja de local: el Mundial 2026 lo organizan EEUU, Canadá y México, que
// juegan todo el torneo «en casa» (afición, sin viajes largos, condiciones
// conocidas). eloratings.net suma 100 de Elo al local en cada partido; como los
// anfitriones son locales SIEMPRE, aplicamos ese mismo +100 a sus tres carreras.
// HOST_ELO es un knob de calibración: subirlo/bajarlo modela más/menos efecto
// local (0 = desactivado). Si dos anfitriones se cruzan, el boost se cancela.
const HOSTS = new Set(["Estados Unidos", "Canadá", "México"]);
const HOST_ELO = 100;
const eff = (t) => (elo[t] ?? 1600) + (HOSTS.has(t) ? HOST_ELO : 0);

// Medias de goles de cada equipo según la diferencia de Elo EFECTIVO. BASE ≈
// goles medios de una selección por partido; el factor 10^(dif/800) inclina el
// marcador hacia el más fuerte. BASE y el divisor son knobs de calibración.
const BASE = 1.35;
function goals(a, b) {
  const d = eff(a) - eff(b);
  return [poisson(BASE * 10 ** (d / 800)), poisson(BASE * 10 ** (-d / 800))];
}
// Probabilidad de que A gane unos penaltis (moneda ponderada por Elo efectivo).
function shootout(a, b) {
  const pa = 1 / (1 + 10 ** ((eff(b) - eff(a)) / 400));
  return rng() < pa ? a : b;
}

function groupMatch(a, b, group) {
  const [ga, gb] = goals(a, b);
  return { phase: "groups", group, home: a, away: b, homeGoals: ga, awayGoals: gb, status: "FINISHED", matchday: 1 };
}
function koMatch(a, b, phase) {
  let [ga, gb] = goals(a, b);
  let winner = ga > gb ? a : gb > ga ? b : shootout(a, b);
  return { phase, home: a, away: b, homeGoals: ga, awayGoals: gb, status: "FINISHED", winner };
}

// Clasificación de un grupo: 3/1/0 + golaveraje total + goles a favor, desempate
// final por Elo (proxy de fair-play + ranking FIFA, que aquí no modelamos).
function standings(teams, matches) {
  const s = new Map(teams.map((t) => [t, { t, pts: 0, gd: 0, gf: 0 }]));
  for (const m of matches) {
    const h = s.get(m.home), a = s.get(m.away);
    h.gf += m.homeGoals; a.gf += m.awayGoals;
    h.gd += m.homeGoals - m.awayGoals; a.gd += m.awayGoals - m.homeGoals;
    if (m.homeGoals > m.awayGoals) h.pts += 3;
    else if (m.homeGoals < m.awayGoals) a.pts += 3;
    else { h.pts += 1; a.pts += 1; }
  }
  return [...s.values()].sort(
    (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (elo[y.t] ?? 0) - (elo[x.t] ?? 0),
  );
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Juega una ronda completa: empareja de dos en dos y devuelve {matches, winners}.
function playRound(teams, phase) {
  const matches = [], winners = [];
  for (let i = 0; i < teams.length; i += 2) {
    const m = koMatch(teams[i], teams[i + 1], phase);
    matches.push(m);
    winners.push(m.winner);
  }
  return { matches, winners };
}

// Una simulación completa del torneo -> objeto POOL_DATA sintético.
function simulateTournament() {
  const matches = [];
  const sortedGroups = {};
  const thirds = [];
  const qualifiers = []; // los 2 primeros de cada grupo (los terceros se añaden luego)

  for (const [g, teams] of Object.entries(GROUPS)) {
    const gms = [];
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) gms.push(groupMatch(teams[i], teams[j], g));
    matches.push(...gms);
    const table = standings(teams, gms);
    sortedGroups[g] = table.map((r) => r.t); // data.groups ORDENADO por clasificación
    qualifiers.push(table[0].t, table[1].t);
    thirds.push(table[2]);
  }

  // 8 mejores terceros: mismo criterio de desempate.
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (elo[y.t] ?? 0) - (elo[x.t] ?? 0));
  qualifiers.push(...thirds.slice(0, 8).map((r) => r.t));

  // Cuadro: reparto ALEATORIO de los 32 en los huecos (simplificación — el
  // Mundial real tiene un cruce fijo por posición de grupo; al promediar sobre N
  // sorteos la dificultad esperada sale insesgada).
  let round = shuffle(qualifiers);
  for (const phase of ["round_of_32", "round_of_16", "quarter_finals"]) {
    const { matches: ms, winners } = playRound(round, phase);
    matches.push(...ms);
    round = winners;
  }
  // Semifinales: guardamos ganadores (a la final) y perdedores (al 3.er puesto).
  const sf = playRound(round, "semi_finals");
  matches.push(...sf.matches);
  const finalists = sf.winners;
  const sfLosers = sf.matches.map((m) => (m.winner === m.home ? m.away : m.home));

  matches.push(koMatch(sfLosers[0], sfLosers[1], "third_place"));
  matches.push(koMatch(finalists[0], finalists[1], "final"));

  return { groups: sortedGroups, matches, unknownStages: [] };
}

// ── Monte Carlo ────────────────────────────────────────────────────────────
const allTeams = Object.values(GROUPS).flat();
const sum = new Map(allTeams.map((t) => [t, 0]));
for (let n = 0; n < N; n++) {
  const table = compute(simulateTournament());
  for (const t of allTeams) sum.set(t, sum.get(t) + (table.get(t)?.total ?? 0));
}
const exp = new Map(allTeams.map((t) => [t, sum.get(t) / N]));

// ── Knapsack sobre puntos ESPERADOS: 36 M€, ≥7 sels, ninguna de 9 M€ ────────
const items = allTeams
  .filter((t) => COST[t] !== 9)
  .map((t) => ({ t, c: COST[t], p: exp.get(t) }));
const CAP = 36, MAXN = 12, NEG = -1e9;
let dp = Array.from({ length: MAXN + 1 }, () =>
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
console.log(`\nMonte Carlo pre-torneo · ${N.toLocaleString("es")} simulaciones · Elo eloratings.net (cierre 2025) + local +${HOST_ELO} (${[...HOSTS].join(", ")})\n`);
console.log("CARTERA ÓPTIMA ESPERADA (36 M€, ≥7 sels, sin 9 M€)");
console.log(`  puntos esperados: ${round1(best.s)}  ·  coste: ${best.w} M€  ·  ${best.n} selecciones\n`);
best.pick
  .map((t) => ({ t, c: COST[t], p: exp.get(t) }))
  .sort((a, b) => b.p - a.p)
  .forEach((x) => console.log(`  ${x.t.padEnd(16)} ${x.c} M   ${fmt(x.p)} pts esp.`));

console.log("\nTop 15 selecciones por puntos esperados (referencia):");
[...exp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([t, p]) =>
  console.log(`  ${t.padEnd(16)} ${COST[t]} M   ${fmt(p)} pts esp.`));
