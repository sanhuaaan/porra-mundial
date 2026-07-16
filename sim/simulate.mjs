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

// ── Mejora 2: blend Elo + odds de casas ─────────────────────────────────────
// El Elo de cierre-2025 ignora lesiones, forma y repescas; el mercado no. Se
// mezcla la fuerza cruda (Elo) con la implícita en las cuotas outright.
//   1) cuota americana -> prob. implícita (con margen).
//   2) quitar margen normalizando a suma 1.
//   3) fuerza de mercado = ln(prob) (≈ lineal en Elo: el campeón encadena ~7
//      victorias, así que log(prob campeón) ~ suma de log-probs ~ ∝ fuerza).
//   4) estandarizar Elo y fuerza-de-mercado a z-scores y mezclar con peso
//      BLEND_W (1 = solo Elo, 0 = solo mercado), devolviendo a escala Elo para
//      que el modelo de goles siga calibrado.
// BLEND_W es un knob ajustable.
const BLEND_W = 0.5;
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
  const mkt = teams.map((t) => Math.log(impRaw[t] / Z)); // log-prob sin margen
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
    out[t] = em + es * z; // de vuelta a escala Elo
  });
  return out;
})();

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

// ── Mejora 4: cuadro real ───────────────────────────────────────────────────
// En vez de repartir los 32 clasificados al azar cada simulación, se usa la
// plantilla del cruce REAL del Mundial (bracket.json, extraída de data.js por
// posición de grupo). Winners/segundos van a su slot exacto; los 8 huecos de
// tercero se rellenan por ranking (aprox., porque en cada sim clasifican
// terceros de grupos distintos). REAL_BRACKET=false vuelve al sorteo aleatorio.
const REAL_BRACKET = true;
const BRACKET = JSON.parse(readFileSync(join(dir, "bracket.json"), "utf8"));

// ── Mejora 3: modelo de partido Dixon-Coles ─────────────────────────────────
// Dos Poisson independientes SUBESTIMAN los empates (y los marcadores bajos
// correlacionados 0-0/1-1). Dixon-Coles (1997) corrige justo las cuatro celdas
// bajas con un parámetro ρ. Muestreamos del pmf conjunto sobre una rejilla.
const FACT = [1];
for (let i = 1; i <= 12; i++) FACT[i] = FACT[i - 1] * i;
const poisPmf = (k, l) => (Math.exp(-l) * l ** k) / FACT[k];
const RHO = -0.13; // valor del paper de Dixon-Coles; ρ<0 sube 0-0/1-1 (empates)
const MAXG = 8;    // goles máximos por equipo en la rejilla (cola despreciable)
const tau = (x, y, l, m) =>
  x === 0 && y === 0 ? 1 - l * m * RHO
  : x === 0 && y === 1 ? 1 + l * RHO
  : x === 1 && y === 0 ? 1 + m * RHO
  : x === 1 && y === 1 ? 1 - RHO
  : 1;
// Rejilla (MAXG+1)² de probabilidades conjuntas, corregida y normalizada.
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

// Ventaja de local: el Mundial 2026 lo organizan EEUU, Canadá y México, que
// juegan todo el torneo «en casa» (afición, sin viajes largos, condiciones
// conocidas). eloratings.net suma 100 de Elo al local en cada partido; como los
// anfitriones son locales SIEMPRE, aplicamos ese mismo +100 a sus tres carreras.
// HOST_ELO es un knob de calibración: subirlo/bajarlo modela más/menos efecto
// local (0 = desactivado). Si dos anfitriones se cruzan, el boost se cancela.
const HOSTS = new Set(["Estados Unidos", "Canadá", "México"]);
const HOST_ELO = 100;
const eff = (t) => (rating[t] ?? elo[t] ?? 1600) + (HOSTS.has(t) ? HOST_ELO : 0);

// BASE ≈ goles medios de una selección en un partido igualado (media
// internacional ~2.7 goles/partido → ~1.35 por lado). El divisor DIV controla
// cuánto inclina la diferencia de Elo el marcador; en vez de fijarlo a ojo se
// CALIBRA: se busca el DIV con el que el resultado esperado del modelo
// (P(gana) + ½·P(empate)) reproduce la curva de expectativa Elo estándar
// We(Δ)=1/(1+10^(−Δ/400)) sobre un rango de diferencias. Así el modelo de goles
// queda anclado a la definición del propio Elo, no a un número inventado.
const BASE = 1.35;
const We = (d) => 1 / (1 + 10 ** (-d / 400));
function expScore(d, div) {
  const l = BASE * 10 ** (d / div), m = BASE * 10 ** (-d / div);
  let pW = 0, pD = 0;
  for (const [x, y, p] of dcGrid(l, m)) { if (x > y) pW += p; else if (x === y) pD += p; }
  return pW + 0.5 * pD;
}
const DIV = (() => {
  let best = 800, bestErr = Infinity;
  for (let div = 300; div <= 1400; div += 10) {
    let err = 0;
    for (let d = 40; d <= 440; d += 40) err += (expScore(d, div) - We(d)) ** 2;
    if (err < bestErr) { bestErr = err; best = div; }
  }
  return best;
})();
// ── Mejora 5: estilo ataque/defensa ─────────────────────────────────────────
// Un solo Elo colapsa ataque y defensa en un número. Aquí cada equipo lleva un
// sesgo de estilo (strength-neutral, de sim/style.json): atk = marca más de lo
// que su fuerza predice; def = encaja menos. La media de goles de A se multiplica
// por exp(STYLE·(atk_A − def_B)). No cambia quién gana (los sesgos promedian ~0),
// pero sí la DISTRIBUCIÓN de goles → afecta a los bonus de máximo goleador, menos
// goleado y golaveraje. STYLE=0 lo desactiva. Ojo: GF/GA de eloratings es de todos
// los tiempos (proxy grueso); lo ideal sería un att/def ajustado a forma reciente.
const STYLE = 0.1;
const { style } = JSON.parse(readFileSync(join(dir, "style.json"), "utf8"));
const tilt = (x, opp) => Math.exp(STYLE * ((style[x]?.atk ?? 0) - (style[opp]?.def ?? 0)));

// Muestrea un marcador de la rejilla Dixon-Coles según el Elo efectivo y el estilo.
function goals(a, b) {
  const d = eff(a) - eff(b);
  const g = dcGrid(BASE * 10 ** (d / DIV) * tilt(a, b), BASE * 10 ** (-d / DIV) * tilt(b, a));
  let r = rng(), acc = 0;
  for (const [x, y, p] of g) { acc += p; if (r <= acc) return [x, y]; }
  const last = g[g.length - 1];
  return [last[0], last[1]];
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

  // Cuadro: real (Mejora 4) o sorteo aleatorio. En el real, cada slot lo fija la
  // posición de grupo (X1=ganador, X2=segundo); los 8 huecos de tercero (T) se
  // rellenan con los mejores terceros por ranking.
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
console.log(`\nMonte Carlo pre-torneo · ${N.toLocaleString("es")} simulaciones · ${REAL_BRACKET ? "cuadro REAL" : "sorteo aleatorio"} · Dixon-Coles (ρ=${RHO}, DIV=${DIV}) · estilo atk/def (STYLE=${STYLE}) · blend Elo/odds w=${BLEND_W} + local +${HOST_ELO}\n`);
console.log("CARTERA ÓPTIMA ESPERADA (36 M€, ≥7 sels, sin 9 M€)");
console.log(`  puntos esperados: ${round1(best.s)}  ·  coste: ${best.w} M€  ·  ${best.n} selecciones\n`);
best.pick
  .map((t) => ({ t, c: COST[t], p: exp.get(t) }))
  .sort((a, b) => b.p - a.p)
  .forEach((x) => console.log(`  ${x.t.padEnd(16)} ${x.c} M   ${fmt(x.p)} pts esp.`));

console.log("\nTop 15 selecciones por puntos esperados (referencia):");
[...exp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([t, p]) =>
  console.log(`  ${t.padEnd(16)} ${COST[t]} M   ${fmt(p)} pts esp.`));
