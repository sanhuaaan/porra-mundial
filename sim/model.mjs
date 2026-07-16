// ───────────────────────────────────────────────────────────────────────────
// Modelo Monte Carlo PRE-TORNEO de la porra (núcleo reutilizable).
//
// Genera un Mundial sintético con la MISMA forma que data.js y lo pasa por el
// `compute()` real del motor, así puntúa EXACTAMENTE como la web. `runMonteCarlo`
// devuelve, además de la media por selección, la MATRIZ equipo×simulación con los
// puntos de cada torneo — necesaria para optimizar la distribución (no solo la
// media): ver optimize.mjs.
//
// Mejoras incorporadas (todas con knobs):
//   1. Ventaja de local (HOST_ELO)   2. Blend Elo+odds (BLEND_W)
//   3. Dixon-Coles + DIV calibrado (RHO)   4. Cuadro real (REAL_BRACKET)
//   5. Estilo ataque/defensa (STYLE)
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEngine } from "../lib/engine.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const { POOL_DATA, compute } = loadEngine();
const GROUPS = Object.fromEntries(
  Object.entries(POOL_DATA.groups).map(([g, teams]) => [g, [...teams]]),
);
const { elo } = JSON.parse(readFileSync(join(dir, "ratings.json"), "utf8"));

// ── Mejora 2: blend Elo + odds de casas ─────────────────────────────────────
export const BLEND_W = 0.5;
const { americanOdds } = JSON.parse(readFileSync(join(dir, "odds.json"), "utf8"));
const rating = (() => {
  const teams = Object.keys(elo);
  const impRaw = Object.fromEntries(
    teams.map((t) => {
      const a = americanOdds[t];
      const p = a == null ? 1e-6 : a > 0 ? 100 / (a + 100) : -a / (-a + 100);
      return [t, p];
    }),
  );
  const Z = Object.values(impRaw).reduce((s, x) => s + x, 0);
  const mkt = teams.map((t) => Math.log(impRaw[t] / Z));
  const eloArr = teams.map((t) => elo[t]);
  const ms = (a) => {
    const m = a.reduce((s, x) => s + x, 0) / a.length;
    const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) || 1;
    return [m, sd];
  };
  const [em, es] = ms(eloArr), [mm, msd] = ms(mkt);
  const out = {};
  teams.forEach((t, i) => {
    const z = BLEND_W * (eloArr[i] - em) / es + (1 - BLEND_W) * (mkt[i] - mm) / msd;
    out[t] = em + es * z;
  });
  return out;
})();

// Coste por selección (mismo tarifario de la porra).
export const COST = {
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

// PRNG sembrado (mulberry32). runMonteCarlo lo reinicia para que las corridas
// sean reproducibles e idénticas entre simulate.mjs y optimize.mjs.
const SEED0 = 0x9e3779b9;
let seed = SEED0;
function rng() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── Mejora 4: cuadro real ───────────────────────────────────────────────────
export const REAL_BRACKET = true;
const BRACKET = JSON.parse(readFileSync(join(dir, "bracket.json"), "utf8"));

// ── Mejora 3: modelo de partido Dixon-Coles ─────────────────────────────────
const FACT = [1];
for (let i = 1; i <= 12; i++) FACT[i] = FACT[i - 1] * i;
const poisPmf = (k, l) => (Math.exp(-l) * l ** k) / FACT[k];
export const RHO = -0.13;
const MAXG = 8;
const tau = (x, y, l, m) =>
  x === 0 && y === 0 ? 1 - l * m * RHO
  : x === 0 && y === 1 ? 1 + l * RHO
  : x === 1 && y === 0 ? 1 + m * RHO
  : x === 1 && y === 1 ? 1 - RHO
  : 1;
function dcGrid(l, m) {
  const g = [];
  let s = 0;
  for (let x = 0; x <= MAXG; x++)
    for (let y = 0; y <= MAXG; y++) {
      const p = poisPmf(x, l) * poisPmf(y, m) * tau(x, y, l, m);
      g.push([x, y, p]);
      s += p;
    }
  for (const c of g) c[2] /= s;
  return g;
}

// ── Mejora 1: ventaja de local ──────────────────────────────────────────────
const HOSTS = new Set(["Estados Unidos", "Canadá", "México"]);
export const HOST_ELO = 100;
const eff = (t) => (rating[t] ?? elo[t] ?? 1600) + (HOSTS.has(t) ? HOST_ELO : 0);

// BASE fija (media internacional ~2.7 goles/partido ÷ 2); DIV calibrado para que
// el resultado esperado del modelo reproduzca la curva de expectativa Elo.
const BASE = 1.35;
const We = (d) => 1 / (1 + 10 ** (-d / 400));
function expScore(d, div) {
  const l = BASE * 10 ** (d / div), m = BASE * 10 ** (-d / div);
  let pW = 0, pD = 0;
  for (const [x, y, p] of dcGrid(l, m)) { if (x > y) pW += p; else if (x === y) pD += p; }
  return pW + 0.5 * pD;
}
export const DIV = (() => {
  let best = 800, bestErr = Infinity;
  for (let div = 300; div <= 1400; div += 10) {
    let err = 0;
    for (let d = 40; d <= 440; d += 40) err += (expScore(d, div) - We(d)) ** 2;
    if (err < bestErr) { bestErr = err; best = div; }
  }
  return best;
})();

// ── Mejora 5: estilo ataque/defensa ─────────────────────────────────────────
export const STYLE = 0.1;
const { style } = JSON.parse(readFileSync(join(dir, "style.json"), "utf8"));
const tilt = (x, opp) => Math.exp(STYLE * ((style[x]?.atk ?? 0) - (style[opp]?.def ?? 0)));

function goals(a, b) {
  const d = eff(a) - eff(b);
  const g = dcGrid(BASE * 10 ** (d / DIV) * tilt(a, b), BASE * 10 ** (-d / DIV) * tilt(b, a));
  let r = rng(), acc = 0;
  for (const [x, y, p] of g) { acc += p; if (r <= acc) return [x, y]; }
  const last = g[g.length - 1];
  return [last[0], last[1]];
}
function shootout(a, b) {
  const pa = 1 / (1 + 10 ** ((eff(b) - eff(a)) / 400));
  return rng() < pa ? a : b;
}

function groupMatch(a, b, group) {
  const [ga, gb] = goals(a, b);
  return { phase: "groups", group, home: a, away: b, homeGoals: ga, awayGoals: gb, status: "FINISHED", matchday: 1 };
}
function koMatch(a, b, phase) {
  const [ga, gb] = goals(a, b);
  const winner = ga > gb ? a : gb > ga ? b : shootout(a, b);
  return { phase, home: a, away: b, homeGoals: ga, awayGoals: gb, status: "FINISHED", winner };
}

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

function playRound(teams, phase) {
  const matches = [], winners = [];
  for (let i = 0; i < teams.length; i += 2) {
    const m = koMatch(teams[i], teams[i + 1], phase);
    matches.push(m);
    winners.push(m.winner);
  }
  return { matches, winners };
}

function simulateTournament() {
  const matches = [];
  const sortedGroups = {};
  const thirds = [];
  const qualifiers = [];

  for (const [g, teams] of Object.entries(GROUPS)) {
    const gms = [];
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) gms.push(groupMatch(teams[i], teams[j], g));
    matches.push(...gms);
    const table = standings(teams, gms);
    sortedGroups[g] = table.map((r) => r.t);
    qualifiers.push(table[0].t, table[1].t);
    thirds.push(table[2]);
  }

  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (elo[y.t] ?? 0) - (elo[x.t] ?? 0));
  qualifiers.push(...thirds.slice(0, 8).map((r) => r.t));

  let round;
  if (REAL_BRACKET) {
    const thirdsQ = thirds.slice(0, 8).map((r) => r.t);
    let ti = 0;
    const fill = (s) => (s === "T" ? thirdsQ[ti++] : sortedGroups[s[0]][+s[1] - 1]);
    round = BRACKET.r32.flatMap(([a, b]) => [fill(a), fill(b)]);
  } else {
    round = shuffle(qualifiers);
  }
  for (const phase of ["round_of_32", "round_of_16", "quarter_finals"]) {
    const { matches: ms, winners } = playRound(round, phase);
    matches.push(...ms);
    round = winners;
  }
  const sf = playRound(round, "semi_finals");
  matches.push(...sf.matches);
  const finalists = sf.winners;
  const sfLosers = sf.matches.map((m) => (m.winner === m.home ? m.away : m.home));

  matches.push(koMatch(sfLosers[0], sfLosers[1], "third_place"));
  matches.push(koMatch(finalists[0], finalists[1], "final"));

  return { groups: sortedGroups, matches, unknownStages: [] };
}

export const ALL_TEAMS = Object.values(GROUPS).flat();

// Corre N torneos. Devuelve:
//   mean:   Map<team, puntos medios>
//   matrix: Map<team, Float64Array(N)> con los puntos de cada simulación
// (la matriz es lo que permite optimizar mediana/percentil/varianza, no solo media).
export function runMonteCarlo(N) {
  seed = SEED0; // reproducible
  const matrix = new Map(ALL_TEAMS.map((t) => [t, new Float64Array(N)]));
  for (let n = 0; n < N; n++) {
    const table = compute(simulateTournament());
    for (const t of ALL_TEAMS) matrix.get(t)[n] = table.get(t)?.total ?? 0;
  }
  const mean = new Map(ALL_TEAMS.map((t) => {
    const row = matrix.get(t);
    let s = 0; for (let n = 0; n < N; n++) s += row[n];
    return [t, s / N];
  }));
  return { mean, matrix, N };
}
