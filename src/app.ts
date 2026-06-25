// ───────────────────────────────────────────────────────────────────────────
// Motor de puntuación + render de la clasificación.
// Lee window.POOL_DATA (lo genera data.js / update.mjs) y CONFIG.
// Script clásico: sin import/export.
// ───────────────────────────────────────────────────────────────────────────

interface Window {
  POOL_DATA?: Data;
}

// Una línea del desglose: de dónde sale cada trozo de puntuación de una
// selección. Se genera en compute() (misma fuente que los totales), así que la
// suma de points de todas las líneas SIEMPRE cuadra con el total.
interface BreakdownLine {
  section: "Liguilla" | "Bonus de grupo" | "Eliminatorias";
  text: string;          // p. ej. "3-0 vs Croacia"
  note?: string;         // aclaración en gris, p. ej. "victoria +3, golaveraje +3"
  points: number;        // puntos que aporta esta línea
  live?: boolean;        // el partido se está jugando (marcador y puntos provisionales)
}

interface TeamBreakdown {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  groupGD: number;         // suma de diferencias de gol en la liguilla
  groupPoints: number;     // 3/1/0 por resultado + golaveraje de cada partido
  bAdvance: number;        // +3 si clasifica para eliminatorias
  bTopScorer: number;      // +6 al más goleador del grupo (repartido si empate)
  bLeastConceded: number;  // +6 al menos goleado del grupo (repartido si empate)
  knockoutPoints: number;  // bonos por superar cada ronda (+ subcampeón / tercero)
  knockoutGD: number;      // golaveraje a favor en eliminatorias ganadas
  total: number;
  lines: BreakdownLine[];  // desglose línea a línea (para el detalle expandible)
}

function newTeam(team: string): TeamBreakdown {
  return {
    team,
    played: 0, won: 0, drawn: 0, lost: 0,
    groupGD: 0,
    groupPoints: 0,
    bAdvance: 0,
    bTopScorer: 0,
    bLeastConceded: 0,
    knockoutPoints: 0,
    knockoutGD: 0,
    total: 0,
    lines: [],
  };
}

function compute(data: Data): Map<string, TeamBreakdown> {
  const table = new Map<string, TeamBreakdown>();
  const get = (team: string): TeamBreakdown => {
    let t = table.get(team);
    if (!t) { t = newTeam(team); table.set(team, t); }
    return t;
  };
  const P = CONFIG.points;

  const counts = (m: Match): boolean =>
    (m.status === "FINISHED" || m.status === "IN_PLAY") && m.homeGoals != null && m.awayGoals != null;

  // 1) FASE 1 — Liguilla: 3/1/0 por resultado + golaveraje de cada partido.
  for (const m of data.matches) {
    if (m.phase !== "groups" || !counts(m) || m.homeGoals == null || m.awayGoals == null) continue;
    for (const side of ["home", "away"] as const) {
      const team = side === "home" ? m.home : m.away;
      if (!team) continue;
      const opp = side === "home" ? m.away : m.home;
      const gf = side === "home" ? m.homeGoals : m.awayGoals;
      const ga = side === "home" ? m.awayGoals : m.homeGoals;
      const t = get(team);
      t.played++;
      let wdl: number;
      let res: string;
      if (gf > ga) { t.won++; wdl = P.group.win; res = "victoria"; }
      else if (gf === ga) { t.drawn++; wdl = P.group.draw; res = "empate"; }
      else { t.lost++; wdl = P.group.loss; res = "derrota"; }
      const gd = gf - ga;
      t.groupPoints += wdl + gd; // resultado + golaveraje del partido
      t.groupGD += gd;
      t.lines.push({
        section: "Liguilla",
        text: `${gf}-${ga} vs ${opp || "—"}`,
        note: `${res} ${signed(wdl)}, golaveraje ${signed(gd)}`,
        points: wdl + gd,
        live: m.status === "IN_PLAY",
      });
    }
  }

  // 2) +3 a los que pasan de ronda = los que aparecen en cualquier eliminatoria.
  const qualified = new Set<string>();
  for (const m of data.matches) {
    if (m.phase === "groups") continue;
    if (m.home) qualified.add(m.home);
    if (m.away) qualified.add(m.away);
  }
  for (const team of qualified) {
    const t = get(team);
    t.bAdvance += P.groupBonus.advance;
    t.lines.push({
      section: "Bonus de grupo",
      text: "Clasifica para eliminatorias",
      points: P.groupBonus.advance,
    });
  }

  // 3) Bonus de grupo (sólo cuando el grupo está completo):
  //    +6 al más goleador, +6 al menos goleado (repartidos en caso de empate).
  for (const [group, teams] of Object.entries(data.groups)) {
    if (teams.length === 0) continue;
    const groupMatches = data.matches.filter((m) => m.phase === "groups" && m.group === group);
    // Liga de todos contra todos: n equipos -> n*(n-1)/2 partidos. El bonus de
    // grupo sólo se reparte cuando se han jugado (y finalizado) todos.
    const expected = (teams.length * (teams.length - 1)) / 2;
    const finished = groupMatches.filter((m) => m.status === "FINISHED").length;
    const complete = finished >= expected && groupMatches.every((m) => m.status === "FINISHED");
    if (!complete) continue;

    const gf = new Map<string, number>();
    const ga = new Map<string, number>();
    for (const team of teams) { gf.set(team, 0); ga.set(team, 0); }
    for (const m of groupMatches) {
      if (m.homeGoals == null || m.awayGoals == null) continue;
      gf.set(m.home, (gf.get(m.home) || 0) + m.homeGoals);
      ga.set(m.home, (ga.get(m.home) || 0) + m.awayGoals);
      gf.set(m.away, (gf.get(m.away) || 0) + m.awayGoals);
      ga.set(m.away, (ga.get(m.away) || 0) + m.homeGoals);
    }

    const maxGF = Math.max(...teams.map((e) => gf.get(e) || 0));
    const topScorers = teams.filter((e) => (gf.get(e) || 0) === maxGF);
    const topPts = P.groupBonus.topScorer / topScorers.length;
    for (const e of topScorers) {
      const t = get(e);
      t.bTopScorer += topPts;
      t.lines.push({
        section: "Bonus de grupo",
        text: "Máximo goleador del grupo",
        note: topScorers.length > 1 ? `compartido entre ${topScorers.length}` : undefined,
        points: topPts,
      });
    }

    const minGA = Math.min(...teams.map((e) => ga.get(e) || 0));
    const leastConcededTeams = teams.filter((e) => (ga.get(e) || 0) === minGA);
    const leastPts = P.groupBonus.leastConceded / leastConcededTeams.length;
    for (const e of leastConcededTeams) {
      const t = get(e);
      t.bLeastConceded += leastPts;
      t.lines.push({
        section: "Bonus de grupo",
        text: "Menos goleado del grupo",
        note: leastConcededTeams.length > 1 ? `compartido entre ${leastConcededTeams.length}` : undefined,
        points: leastPts,
      });
    }
  }

  // 4) FASE 2 — Eliminatorias: bono por ronda + golaveraje a favor (penaltis = 0).
  const bonus: Record<Phase, number> = {
    groups: 0,
    round_of_32: P.knockout.roundOf32,
    round_of_16: P.knockout.roundOf16,
    quarter_finals: P.knockout.quarterFinals,
    semi_finals: P.knockout.semiFinals,
    third_place: P.knockout.thirdPlace,
    final: P.knockout.final,
  };
  const phaseLabel: Record<Phase, string> = {
    groups: "",
    round_of_32: "Dieciseisavos",
    round_of_16: "Octavos",
    quarter_finals: "Cuartos",
    semi_finals: "Semifinal",
    third_place: "Tercer puesto",
    final: "Final (campeón)",
  };
  for (const m of data.matches) {
    if (m.phase === "groups") continue;
    if (m.status !== "FINISHED" || m.homeGoals == null || m.awayGoals == null) continue;

    let winner: string;
    let loser: string;
    let gd: number;
    if (m.homeGoals === m.awayGoals) {
      // Empate en el tiempo reglamentario/prórroga -> se decide en penaltis.
      winner = m.winner || m.home;
      loser = winner === m.home ? m.away : m.home;
      gd = 0; // el golaveraje en penaltis es 0
    } else {
      winner = m.homeGoals > m.awayGoals ? m.home : m.away;
      loser = m.homeGoals > m.awayGoals ? m.away : m.home;
      gd = Math.abs(m.homeGoals - m.awayGoals); // prórroga: cuenta el resultado final
    }

    const w = get(winner);
    w.knockoutPoints += bonus[m.phase];
    w.knockoutGD += gd;

    const wgf = winner === m.home ? m.homeGoals : m.awayGoals;
    const wga = winner === m.home ? m.awayGoals : m.homeGoals;
    const penalties = m.homeGoals === m.awayGoals;
    const gdNote = penalties ? "penaltis (golaveraje 0)" : `golaveraje ${signed(gd)}`;
    w.lines.push({
      section: "Eliminatorias",
      text: `${phaseLabel[m.phase]}: ${wgf}-${wga} vs ${loser || "—"}${penalties ? " (pen.)" : ""}`,
      note: `bono ${signed(bonus[m.phase])}, ${gdNote}`,
      points: bonus[m.phase] + gd,
    });

    if (m.phase === "final") {
      const l = get(loser);
      l.knockoutPoints += P.knockout.runnerUp;
      l.lines.push({
        section: "Eliminatorias",
        text: "Subcampeón",
        note: `final perdida vs ${winner}`,
        points: P.knockout.runnerUp,
      });
    }
  }

  for (const t of table.values()) {
    t.total =
      t.groupPoints +
      t.bAdvance + t.bTopScorer + t.bLeastConceded +
      t.knockoutPoints + t.knockoutGD;
  }
  return table;
}

function participantPoints(participant: Participant, table: Map<string, TeamBreakdown>): number {
  return participant.teams.reduce((s, team) => s + (table.get(team)?.total ?? 0), 0);
}

// ─── Progreso del torneo ──────────────────────────────────────────────────────
// Para cada hito (jornadas de grupos + cada ronda de eliminatorias) cuenta
// partidos FINISHED vs total. Un hito está "completo" cuando todos los suyos lo
// están: así se ve de un vistazo hasta dónde ha llegado el torneo para todos.

interface PhaseStep {
  label: string;     // etiqueta corta bajo el punto (J1, 8º, F…)
  full: string;      // nombre completo (para el title al pasar el ratón)
  finished: number;
  total: number;
  inPlay: boolean;
}

function phaseProgress(data: Data): PhaseStep[] {
  const tally = (ms: Match[]) => ({
    finished: ms.filter((m) => m.status === "FINISHED").length,
    total: ms.length,
    inPlay: ms.some((m) => m.status === "IN_PLAY"),
  });

  const steps: PhaseStep[] = [];
  for (const md of [1, 2, 3]) {
    const ms = data.matches.filter((m) => m.phase === "groups" && m.matchday === md);
    steps.push({ label: `J${md}`, full: `Jornada ${md}`, ...tally(ms) });
  }
  const ko: [Phase, string, string][] = [
    ["round_of_32", "16", "Dieciseisavos"],
    ["round_of_16", "8º", "Octavos"],
    ["quarter_finals", "4º", "Cuartos"],
    ["semi_finals", "SF", "Semifinales"],
    ["third_place", "3º", "3.er puesto"],
    ["final", "F", "Final"],
  ];
  for (const [phase, label, full] of ko) {
    steps.push({ label, full, ...tally(data.matches.filter((m) => m.phase === phase)) });
  }
  return steps;
}

function progressBar(data: Data, button = ""): string {
  const steps = phaseProgress(data);
  let html =
    '<section class="progress"><div class="progress-head"><h2>Progreso del torneo</h2>' +
    button +
    '</div><div class="steps-scroll"><div class="steps">';
  for (const s of steps) {
    const done = s.total > 0 && s.finished === s.total;
    const cur = !done && (s.finished > 0 || s.inPlay);
    const cls = done ? "done" : cur ? "cur" : "pending";
    const frac = s.total > 0 ? `${s.finished}/${s.total}` : "—";
    const cnt = done ? "✓" : cur ? frac : "";
    html +=
      `<div class="step ${cls}" title="${s.full} — ${frac}">` +
      `<span class="dot"></span><span class="lbl">${s.label}</span><span class="cnt">${cnt}</span></div>`;
  }
  return html + "</div></div>" +
    '<div class="legend"><span class="k done"></span>completa ' +
    '<span class="k cur"></span>en curso ' +
    '<span class="k pending"></span>pendiente</div></section>';
}

// ─── Render ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Igual que fmt pero con signo explícito (+4, 0, -2) para el desglose.
function signed(n: number): string {
  return (n > 0 ? "+" : "") + fmt(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// Bandera de una selección (vacío si no tenemos su código ISO en FLAGS).
function flagImg(team: string): string {
  const code = FLAGS[team];
  return code
    ? `<img class="flag" src="https://flagcdn.com/w40/${code}.png" ` +
      `srcset="https://flagcdn.com/w80/${code}.png 2x" alt="" width="20" height="15" loading="lazy">`
    : "";
}

// ─── Últimos y próximos partidos ─────────────────────────────────────────────
// Ventana alrededor del momento actual: los 4 últimos partidos ya empezados
// (jugados o en curso) y los 4 siguientes aún por jugar. Cada fila lleva su
// fecha y hora (en hora LOCAL del navegador). Si data.js no trae utcDate (datos
// antiguos) la sección no se muestra.
function upcomingMatches(data: Data): string {
  const dated = data.matches
    .filter((m) => m.utcDate)
    .map((m) => ({ m, ts: new Date(m.utcDate!).getTime() }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);
  if (!dated.length) return "";

  // Ya empezados (FINISHED/IN_PLAY): los 4 más recientes. Por jugar: los 4 más próximos.
  const started = (s: Match["status"]): boolean => s === "FINISHED" || s === "IN_PLAY";
  const rows = dated.filter((x) => started(x.m.status)).slice(-4)
    .concat(dated.filter((x) => x.m.status === "SCHEDULED").slice(0, 4));
  if (!rows.length) return "";

  const when = (ts: number) =>
    new Date(ts).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  let html = '<section class="upcoming"><h2>Últimos y próximos partidos</h2><div class="up-list">';
  for (const { m, ts } of rows) {
    const played = m.status === "FINISHED" || m.status === "IN_PLAY";
    const pen = m.penalties ? " (pen)" : "";
    const score = played
      ? `<span class="up-score">${m.homeGoals ?? 0}–${m.awayGoals ?? 0}${pen}</span>`
      : '<span class="up-score vs">vs</span>';
    const state =
      m.status === "IN_PLAY" ? '<span class="bd-live">en vivo</span>'
      : m.status === "FINISHED" ? '<span class="up-final">final</span>'
      : "";
    html +=
      '<div class="up-row">' +
      `<span class="up-time">${when(ts)}</span>` +
      `<span class="up-home"><span class="up-name">${m.home}</span>${flagImg(m.home)}</span>` +
      score +
      `<span class="up-away">${flagImg(m.away)}<span class="up-name">${m.away}</span></span>` +
      `<span class="up-state">${state}</span>` +
      "</div>";
  }
  return html + "</div></section>";
}

// ─── Visualización de grupos ─────────────────────────────────────────────────
// Clasificación DEPORTIVA de cada grupo (puntos reales 3/1/0, no los de la
// porra): una mini-tabla por grupo, plegable bajo un botón. Igual que la
// liguilla de compute(), cuenta los partidos IN_PLAY, así que va en directo.

interface GroupRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

// Tabla de un grupo ordenada por puntos -> diferencia de goles -> goles a favor.
// `matches` deben ser ya solo los del grupo. Lista todos los equipos del grupo,
// incluidos los que aún no han jugado (a 0).
function groupStandings(teams: string[], matches: Match[]): GroupRow[] {
  const rows = new Map<string, GroupRow>();
  for (const team of teams) {
    rows.set(team, { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 });
  }
  const counts = (m: Match): boolean =>
    (m.status === "FINISHED" || m.status === "IN_PLAY") && m.homeGoals != null && m.awayGoals != null;

  for (const m of matches) {
    if (!counts(m) || m.homeGoals == null || m.awayGoals == null) continue;
    for (const side of ["home", "away"] as const) {
      const row = rows.get(side === "home" ? m.home : m.away);
      if (!row) continue; // equipo ajeno al grupo (defensa)
      const gf = side === "home" ? m.homeGoals : m.awayGoals;
      const ga = side === "home" ? m.awayGoals : m.homeGoals;
      row.played++;
      row.gf += gf;
      row.ga += ga;
      if (gf > ga) { row.won++; row.points += 3; }
      else if (gf === ga) { row.drawn++; row.points += 1; }
      else { row.lost++; }
    }
  }
  for (const row of rows.values()) row.gd = row.gf - row.ga;

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, "es"),
  );
}

// ¿Ha terminado la fase de grupos? (hay partidos de grupo y todos FINISHED).
function groupMatchesFinished(data: Data): boolean {
  const gm = data.matches.filter((m) => m.phase === "groups");
  return gm.length > 0 && gm.every((m) => m.status === "FINISHED");
}

// Equipos clasificados a dieciseisavos UNA VEZ cerrada la fase: 1.º y 2.º de
// cada grupo + los 8 mejores terceros (formato del Mundial de 48: 24 + 8 = 32).
// Set vacío mientras la fase siga abierta (no marcamos nada en directo).
function qualifiedTeams(data: Data): Set<string> {
  const set = new Set<string>();
  if (!groupMatchesFinished(data)) return set;
  const thirds: GroupRow[] = [];
  for (const [group, teams] of Object.entries(data.groups)) {
    if (teams.length === 0) continue;
    const ms = data.matches.filter((m) => m.phase === "groups" && m.group === group);
    const rows = groupStandings(teams, ms);
    if (rows[0]) set.add(rows[0].team);
    if (rows[1]) set.add(rows[1].team);
    if (rows[2]) thirds.push(rows[2]);
  }
  // Mejores terceros por los mismos criterios: puntos -> dif. de goles -> goles a favor.
  thirds.sort(
    (a, b) =>
      b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, "es"),
  );
  for (const t of thirds.slice(0, 8)) set.add(t.team);
  return set;
}

// Clasificación CRUZADA de los terceros, para el pintado de la fase de grupos.
// Ordena por los criterios de desempate DISPONIBLES en el feed: puntos ->
// diferencia de goles -> goles a favor. El reglamento añade fair play (tarjetas)
// y ranking FIFA, pero esos datos no llegan, así que un empate en estos tres es
// INDECIDIBLE para nosotros. Devuelve dos conjuntos de terceros:
//   in   = entran sin discusión en los 8 mejores.
//   tied = empatados justo en el corte (8.º == 9.º), sin desempate posible.
// A diferencia de qualifiedTeams (que parte ties por orden alfabético para dar
// 32 deterministas a la simulación del cuadro), aquí NO se rompe el empate: se
// marca. Vale en directo (proyección con la clasificación actual) y al cerrar.
function classifyThirds(data: Data): { in: Set<string>; tied: Set<string> } {
  const thirds: GroupRow[] = [];
  for (const [group, teams] of Object.entries(data.groups)) {
    if (teams.length === 0) continue;
    const ms = data.matches.filter((m) => m.phase === "groups" && m.group === group);
    const rows = groupStandings(teams, ms);
    if (rows[2]) thirds.push(rows[2]);
  }
  // Sin desempate alfabético: los empatados quedan adyacentes y "iguales".
  thirds.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  const inSet = new Set<string>();
  const tied = new Set<string>();
  const key = (r: GroupRow): string => `${r.points}|${r.gd}|${r.gf}`;
  // Empate en el corte: el 8.º y el 9.º comparten los tres criterios.
  const cutTie = thirds.length > 8 && key(thirds[7]) === key(thirds[8]) ? key(thirds[7]) : null;
  thirds.forEach((r, i) => {
    if (cutTie && key(r) === cutTie) tied.add(r.team);
    else if (i < 8) inSet.add(r.team);
  });
  return { in: inSet, tied };
}

// Contenido de la vista de grupos (rejilla de mini-clasificaciones + leyenda).
// Sin envoltura ni botón: se inyecta dentro de la modal. "" si no hay grupos.
function groupsContent(data: Data): string {
  const groups = Object.entries(data.groups)
    .filter(([, teams]) => teams.length > 0)
    .sort(([a], [b]) => a.localeCompare(b, "es"));
  if (!groups.length) return "";

  const phaseOver = groupMatchesFinished(data);
  const { in: thirdsIn, tied: thirdsTied } = classifyThirds(data);

  let cards = "";
  for (const [group, teams] of groups) {
    const ms = data.matches.filter((m) => m.phase === "groups" && m.group === group);
    const rows = groupStandings(teams, ms);
    // Todos contra todos: n equipos -> n*(n-1)/2 partidos. Estado del grupo.
    const expected = (teams.length * (teams.length - 1)) / 2;
    const finished = ms.filter((m) => m.status === "FINISHED").length;
    const live = ms.some((m) => m.status === "IN_PLAY");
    const status =
      finished === 0 && !live ? "sin jugar"
      : finished >= expected ? "cerrado"
      : `${finished}/${expected}`;

    let body = "";
    rows.forEach((r, i) => {
      // Zona de clasificación: 1.º y 2.º (directos) + mejores terceros. En directo
      // es proyección (tinte cálido "q"); al cerrar la fase, definitivo (verde
      // "qualified"). Los terceros empatados en el corte sin desempate posible van
      // aparte (ámbar "tie"), porque no podemos decidir quién pasa.
      const cls =
        thirdsTied.has(r.team) ? " tie"
        : (i < 2 || thirdsIn.has(r.team)) ? (phaseOver ? " qualified" : " q")
        : "";
      const gdTxt = r.played ? signed(r.gd) : "—";
      const ptsTxt = r.played ? String(r.points) : "—";
      body +=
        `<tr class="g-row${cls}">` +
        `<td class="g-pos">${i + 1}</td>` +
        `<td class="g-team">${flagImg(r.team)}<span class="g-name">${r.team}</span></td>` +
        `<td class="num">${r.played}</td>` +
        `<td class="num g-gd">${gdTxt}</td>` +
        `<td class="num g-pts">${ptsTxt}</td>` +
        "</tr>";
    });

    cards +=
      '<div class="g-card">' +
      `<div class="g-head"><span class="g-title">Grupo ${group}</span>` +
      `<span class="g-status${live ? " live" : ""}">${live ? "en vivo" : status}</span></div>` +
      '<table class="g-table"><thead><tr>' +
      '<th class="g-pos"></th><th>Equipo</th>' +
      '<th class="num" title="Partidos jugados">PJ</th>' +
      '<th class="num" title="Diferencia de goles">DG</th>' +
      '<th class="num" title="Puntos (3 victoria / 1 empate / 0 derrota)">Pts</th>' +
      `</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  const tieLegend = thirdsTied.size
    ? '<div class="g-legend"><span class="g-key tie"></span>' +
      "Terceros empatados en puntos, diferencia de goles y goles a favor: sin fair play " +
      "ni ranking FIFA en los datos, el último billete a dieciseisavos queda sin decidir." +
      "</div>"
    : "";

  return (
    `<div class="g-grid">${cards}</div>` +
    `<div class="g-legend"><span class="g-key${phaseOver ? " q-done" : ""}"></span>` +
    (phaseOver
      ? "Clasificados a dieciseisavos: 1.º, 2.º y los 8 mejores terceros."
      : "Zona de clasificación: 1.º y 2.º (directos) y los mejores terceros (provisional).") +
    "</div>" + tieLegend
  );
}

// ─── Cuadro de eliminatorias (bracket) ───────────────────────────────────────
// Aparece al cerrarse la fase de grupos. Como los datos NO traen la topología
// del cuadro (qué cruce alimenta a cuál), se asume el emparejamiento posicional
// de un bracket balanceado: el cruce k de una ronda se nutre de los cruces 2k y
// 2k+1 de la ronda anterior. Cada celda se rellena con los equipos/resultados
// reales según van llegando, así que el árbol "se cierra" solo al avanzar.

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

// Una celda del cuadro: los dos equipos, marcador y ganador resaltado.
function bracketMatch(m: Match | undefined): string {
  const tbd = '<div class="bk-team tbd"><span class="bk-name">Por definir</span></div>';
  if (!m || (!m.home && !m.away)) return `<div class="bk-match empty">${tbd}${tbd}</div>`;

  const played =
    (m.status === "FINISHED" || m.status === "IN_PLAY") && m.homeGoals != null && m.awayGoals != null;
  const live = m.status === "IN_PLAY";
  // Ganador: winner explícito (cubre penaltis) o, si no, el de más goles.
  let winner = "";
  if (m.winner) winner = m.winner;
  else if (played && m.homeGoals !== m.awayGoals) winner = m.homeGoals! > m.awayGoals! ? m.home : m.away;

  const teamRow = (team: string, goals: number | null): string => {
    if (!team) return tbd;
    const isWin = !!winner && team === winner;
    const cls = isWin ? " win" : m.status === "FINISHED" && winner ? " lose" : "";
    const pen = m.penalties && isWin ? '<span class="bk-pen">pen</span>' : "";
    const score = played ? `<span class="bk-score">${goals ?? 0}</span>` : "";
    return `<div class="bk-team${cls}">${flagImg(team)}<span class="bk-name">${team}</span>${pen}${score}</div>`;
  };

  const state = live
    ? '<span class="bd-live">en vivo</span>'
    : m.status === "SCHEDULED" && m.utcDate
      ? `<span class="bk-date">${shortDate(m.utcDate)}</span>`
      : "";
  const cls = live ? "live" : m.status === "FINISHED" ? "done" : "sched";
  return (
    `<div class="bk-match ${cls}">` +
    teamRow(m.home, m.homeGoals) +
    teamRow(m.away, m.awayGoals) +
    (state ? `<div class="bk-state">${state}</div>` : "") +
    "</div>"
  );
}

// Árbol anidado (raíz = semifinal de un lado, hojas = dieciseisavos). El
// anidamiento hace que las líneas de conexión salgan robustas en CSS sin alturas
// fijas. `mirror` voltea el lado derecho (raíz a la izquierda, hojas a la
// derecha) reordenando en CSS, para que el cuadro crezca de los dos extremos
// hacia el centro. El índice ya direcciona el medio-cuadro correcto: la SF k se
// nutre de los cruces 2k/2k+1 de la ronda anterior, sobre los arrays completos.
function bracketNode(rounds: Match[][], level: number, idx: number, mirror: boolean): string {
  const m = mirror ? " mirror" : "";
  if (level === 0) return `<div class="bk-node leaf${m}">${bracketMatch(rounds[0]?.[idx])}</div>`;
  const left = bracketNode(rounds, level - 1, idx * 2, mirror);
  const right = bracketNode(rounds, level - 1, idx * 2 + 1, mirror);
  return (
    `<div class="bk-node${m}">` +
    `<div class="bk-children">${left}${right}</div>` +
    '<div class="bk-branch"></div>' +
    bracketMatch(rounds[level]?.[idx]) +
    "</div>"
  );
}

// Contenido del cuadro (cabeceras + árbol de dos lados + tercer puesto). Sin
// sección ni scroll: se inyecta en la modal, que lo escala para caber sin
// scroll. "" si la fase de grupos no ha terminado o no hay partidos de KO.
function bracketContent(data: Data): string {
  if (!groupMatchesFinished(data)) return ""; // sólo con la fase de grupos cerrada
  // Rondas hasta semifinales para los dos sub-árboles; la final va en el centro.
  const treePhases: Phase[] = ["round_of_32", "round_of_16", "quarter_finals", "semi_finals"];
  const rounds = treePhases.map((phase) => data.matches.filter((m) => m.phase === phase));
  const finalMatch = data.matches.filter((m) => m.phase === "final")[0];
  if (rounds.every((r) => r.length === 0) && !finalMatch) return "";

  // Cabeceras simétricas: de fuera adentro a ambos lados, con la final al centro.
  const labels = ["Dieciseisavos", "Octavos", "Cuartos", "Semifinales"];
  const headCell = (label: string, leaf: boolean): string =>
    `<div class="bk-col-head${leaf ? " h-leaf" : ""}">${label}</div>`;
  const heads =
    labels.map((l, i) => headCell(l, i === 0)).join("") +
    '<div class="bk-col-head h-final">Final</div>' +
    labels.map((l, i) => headCell(l, i === 0)).reverse().join("");

  const root = rounds.length - 1; // semifinales
  const left = bracketNode(rounds, root, 0, false);
  const right = bracketNode(rounds, root, 1, true);
  const tree =
    '<div class="bracket two-sided">' +
    left +
    '<div class="bk-link"></div>' +
    bracketMatch(finalMatch) +
    '<div class="bk-link"></div>' +
    right +
    "</div>";

  const third = data.matches.filter((m) => m.phase === "third_place")[0];
  const thirdHtml = third
    ? '<div class="bk-third"><span class="bk-third-label">Tercer puesto</span>' +
      bracketMatch(third) +
      "</div>"
    : "";

  return (
    `<div class="bk-heads two-sided">${heads}</div>` +
    tree +
    thirdHtml
  );
}

// ─── Reglas de puntuación (modal propio) ─────────────────────────────────────
// Contenido derivado de CONFIG.points (única fuente de verdad). Usa clases
// propias (rules-modal-*) para no chocar con la modal de torneo (.modal).
function rulesHtml(): string {
  const g = CONFIG.points.group, gb = CONFIG.points.groupBonus, k = CONFIG.points.knockout;
  return (
    '<div class="rules">' +
    '<div class="rules-sec"><h3>Fase 1 · Liguilla</h3>' +
    '<p class="rules-lead">Por cada partido de grupos de cada selección:</p><ul>' +
    `<li><b>+${g.win}</b> victoria · <b>+${g.draw}</b> empate · <b>+${g.loss}</b> derrota.</li>` +
    "<li>Más el <b>golaveraje</b> del partido (ganar 3-0 → +3; perder 2-4 → −2; empatar 3-3 → 0).</li>" +
    '</ul><p class="rules-lead">Con el grupo ya disputado entero:</p><ul>' +
    `<li><b>+${gb.advance}</b> a cada equipo que se clasifica para eliminatorias.</li>` +
    `<li><b>+${gb.topScorer}</b> al más goleador del grupo y <b>+${gb.leastConceded}</b> al menos goleado (repartidos si hay empate).</li>` +
    "</ul></div>" +
    '<div class="rules-sec"><h3>Fase 2 · Eliminatorias</h3>' +
    '<p class="rules-lead">Por superar cada ronda (ya no se resta):</p><ul>' +
    `<li><b>+${k.roundOf32}</b> dieciseisavos · <b>+${k.roundOf16}</b> octavos · <b>+${k.quarterFinals}</b> cuartos · <b>+${k.semiFinals}</b> semifinales.</li>` +
    `<li><b>+${k.final}</b> campeón · <b>+${k.runnerUp}</b> subcampeón · <b>+${k.thirdPlace}</b> tercer puesto.</li>` +
    "<li>Más el <b>golaveraje a favor</b> de cada eliminatoria ganada (penaltis = 0; la prórroga cuenta con el resultado final).</li>" +
    "</ul></div>" +
    '<p class="rules-total">La puntuación de cada participante es la <b>suma</b> de los puntos de todas sus selecciones.</p>' +
    "</div>"
  );
}

function rulesModal(): string {
  return (
    '<div class="rules-modal" hidden><div class="rules-modal-backdrop"></div>' +
    '<div class="rules-modal-box">' +
    '<div class="rules-modal-bar"><span class="rules-modal-title">Reglas de puntuación</span>' +
    '<button class="rules-modal-close" type="button" aria-label="Cerrar">×</button></div>' +
    '<div class="rules-modal-scroll">' + rulesHtml() + "</div>" +
    "</div></div>"
  );
}

// ─── Puntos por selección (modal con buscador) ───────────────────────────────
// Lista TODAS las selecciones del torneo con los puntos que darían y el mismo
// desglose expandible (breakdown) que se ve al abrir una selección de un
// participante. Reutiliza las clases .team-row / .team-detail, así que el
// listener de expansión de render() también las cubre.
const searchKey = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function allTeamsContent(data: Data, table: Map<string, TeamBreakdown>): string {
  const teams = Object.values(data.groups).flat();
  const rows = teams
    .map((team) => ({ team, t: table.get(team) }))
    .sort((a, b) => (b.t?.total ?? 0) - (a.t?.total ?? 0));
  let html =
    '<table class="teams"><thead><tr><th>Selección</th><th class="num">Liguilla</th>' +
    '<th class="num" title="Bonus de grupo: clasificar + más goleador + menos goleado">Bonus</th>' +
    '<th class="num">Eliminat.</th><th class="num">Total</th></tr></thead><tbody>';
  for (const { team, t } of rows) {
    const league = t ? t.groupPoints : 0;
    const bonus = t ? t.bAdvance + t.bTopScorer + t.bLeastConceded : 0;
    const ko = t ? t.knockoutPoints + t.knockoutGD : 0;
    const tot = t ? t.total : 0;
    const hasDetail = !!(t && t.lines.length);
    const caret = hasDetail ? '<span class="t-caret">›</span>' : '<span class="t-caret-empty"></span>';
    const key = searchKey(team);
    html +=
      `<tr class="team-row${hasDetail ? " has-detail" : ""}" data-team="${key}">` +
      `<td>${caret}${flagImg(team)}${team}</td>` +
      `<td class="num">${fmt(league)}</td><td class="num">${fmt(bonus)}</td>` +
      `<td class="num">${fmt(ko)}</td><td class="num pts">${fmt(tot)}</td></tr>`;
    if (hasDetail) {
      html +=
        `<tr class="team-detail" data-team="${key}"><td colspan="5">` +
        '<div class="t-accordion"><div class="t-accordion-inner">' +
        breakdown(t!) +
        "</div></div></td></tr>";
    }
  }
  return html + "</tbody></table>";
}

function teamsModal(data: Data, table: Map<string, TeamBreakdown>): string {
  return (
    '<div class="teams-modal" hidden><div class="teams-modal-backdrop"></div>' +
    '<div class="teams-modal-box">' +
    '<div class="teams-modal-bar"><span class="teams-modal-title">Puntos por selección</span>' +
    '<button class="teams-modal-close" type="button" aria-label="Cerrar">×</button></div>' +
    '<div class="teams-modal-search"><input type="search" class="teams-search" placeholder="Buscar selección…" autocomplete="off"></div>' +
    '<div class="teams-modal-scroll">' + allTeamsContent(data, table) + "</div>" +
    "</div></div>"
  );
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;
  const data = window.POOL_DATA;

  const updatedEl = document.getElementById("updated");
  if (updatedEl) updatedEl.textContent = data ? formatDate(data.updated) : "—";

  if (!data) {
    app.innerHTML =
      '<p class="notice">No hay datos todavía. Ejecuta <code>node update.mjs</code> ' +
      "para generar <code>data.js</code>.</p>";
    return;
  }

  const table = compute(data);
  const ranking = CONFIG.participants
    .map((p) => ({ p, pts: participantPoints(p, table) }))
    .sort((a, b) => b.pts - a.pts);

  let html = "";

  // Banner si hay etapas de eliminatoria que la app no reconoce: esos partidos
  // todavía no puntúan (hay que añadir su etiqueta a PHASES en update.mjs).
  const unknown = data.unknownStages ?? [];
  if (unknown.length) {
    html +=
      '<div class="warning">⚠ Hay partidos de eliminatoria con una fase no reconocida ' +
      `(${unknown.join(", ")}), así que todavía <strong>no puntúan</strong>. ` +
      "Hay que añadir esa fase a la app.</div>";
  }

  const modal = modalSection(data);
  html += progressBar(data, modal.button);
  html += upcomingMatches(data);

  html +=
    '<table class="ranking"><thead><tr><th class="caret-col"></th><th class="pos">#</th>' +
    '<th>Participante</th><th class="num">Puntos</th></tr></thead><tbody>';

  ranking.forEach((r, i) => {
    html +=
      `<tr class="row" data-i="${i}"><td class="caret">›</td>` +
      `<td class="pos">${i + 1}</td><td class="name">${r.p.name}</td>` +
      `<td class="num pts">${fmt(r.pts)}</td></tr>`;
    html += '<tr class="detail"><td></td><td colspan="3">' +
      '<div class="accordion"><div class="accordion-inner">' +
      teamsTable(r.p, table) +
      "</div></div></td></tr>";
  });

  html += "</tbody></table>";
  html += modal.overlay;
  html += rulesModal();
  html += teamsModal(data, table);
  app.innerHTML = html;

  // Expandir / contraer el detalle de cada participante (la animación es CSS).
  app.querySelectorAll<HTMLTableRowElement>("tr.row").forEach((row) => {
    row.addEventListener("click", () => {
      const detail = row.nextElementSibling;
      if (!detail) return;
      const open = detail.classList.toggle("open");
      row.classList.toggle("open", open);
    });
  });

  // Segundo nivel: expandir / contraer el desglose de puntos de cada selección.
  app.querySelectorAll<HTMLTableRowElement>("tr.team-row.has-detail").forEach((row) => {
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      const detail = row.nextElementSibling;
      if (!detail) return;
      const open = detail.classList.toggle("open");
      row.classList.toggle("open", open);
    });
  });

  // Modal de la vista de torneo (grupos / cuadro). El cuadro se reescala para
  // verse de un vistazo sin scroll; los grupos scrollean en vertical si no caben.
  const modalEl = app.querySelector<HTMLElement>(".modal");
  const openBtn = app.querySelector<HTMLButtonElement>(".modal-open");
  if (modalEl && openBtn) {
    const fit = (): void => {
      const inner = modalEl.querySelector<HTMLElement>(".bk-fit-inner");
      const box = inner?.parentElement;
      if (!inner || !box) return;
      inner.style.transform = "none"; // medir tamaño natural sin escalar
      const s = Math.min(1, box.clientWidth / inner.scrollWidth, box.clientHeight / inner.scrollHeight);
      inner.style.transform = `scale(${s * 0.98})`; // 0.98 = pequeño margen de respiro
    };
    const open = (): void => { modalEl.hidden = false; document.body.classList.add("modal-on"); fit(); };
    const close = (): void => { modalEl.hidden = true; document.body.classList.remove("modal-on"); };
    openBtn.addEventListener("click", open);
    modalEl.querySelectorAll(".modal-close, .modal-backdrop").forEach((el) => el.addEventListener("click", close));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalEl.hidden) close(); });
    window.addEventListener("resize", () => { if (!modalEl.hidden) fit(); });
  }

  // Modales propios (reglas y puntos por selección). Sus botones viven en el
  // <header> (fuera de #app): se buscan en el documento y se usa onclick para no
  // acumular handlers en re-render.
  const rulesEl = app.querySelector<HTMLElement>(".rules-modal");
  const rulesBtn = document.querySelector<HTMLButtonElement>(".rules-open");
  if (rulesEl) {
    const close = (): void => { rulesEl.hidden = true; document.body.classList.remove("modal-on"); };
    if (rulesBtn) rulesBtn.onclick = () => { rulesEl.hidden = false; document.body.classList.add("modal-on"); };
    rulesEl.querySelectorAll(".rules-modal-close, .rules-modal-backdrop").forEach((el) =>
      el.addEventListener("click", close));
  }

  const teamsEl = app.querySelector<HTMLElement>(".teams-modal");
  const teamsBtn = document.querySelector<HTMLButtonElement>(".teams-open");
  if (teamsEl) {
    const close = (): void => { teamsEl.hidden = true; document.body.classList.remove("modal-on"); };
    const search = teamsEl.querySelector<HTMLInputElement>(".teams-search");
    if (teamsBtn) teamsBtn.onclick = () => {
      teamsEl.hidden = false; document.body.classList.add("modal-on"); search?.focus();
    };
    teamsEl.querySelectorAll(".teams-modal-close, .teams-modal-backdrop").forEach((el) =>
      el.addEventListener("click", close));
    // Buscador: filtra filas (y su detalle) por nombre sin acentos.
    if (search) search.addEventListener("input", () => {
      const q = searchKey(search.value).trim();
      teamsEl.querySelectorAll<HTMLElement>("[data-team]").forEach((el) => {
        el.style.display = (el.dataset.team ?? "").includes(q) ? "" : "none";
      });
    });
  }

  // Escape cierra cualquiera de los dos modales propios (un solo handler, no pisa
  // el de la modal de torneo, que usa su propio addEventListener).
  document.onkeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    for (const el of [rulesEl, teamsEl]) {
      if (el && !el.hidden) { el.hidden = true; document.body.classList.remove("modal-on"); }
    }
  };
}

// Botón + modal de la vista de torneo. Dentro: los grupos mientras la fase de
// grupos sigue abierta; el cuadro de eliminatorias una vez cerrada (con fallback
// a grupos si todavía no hay partidos de KO). Devuelve el botón (pequeño, va
// junto al título de progreso) y el overlay (fijo, se inyecta al final) por
// separado. Ambos "" si no hay nada que mostrar.
function modalSection(data: Data): { button: string; overlay: string } {
  const phaseOver = groupMatchesFinished(data);
  const bracket = phaseOver ? bracketContent(data) : "";
  const content = bracket || groupsContent(data);
  if (!content) return { button: "", overlay: "" };
  const isBracket = !!bracket;
  const title = isBracket ? "Cuadro de eliminatorias" : "Grupos";
  const label = isBracket ? "Ver eliminatorias" : "Ver grupos";
  const inner = isBracket
    ? `<div class="bk-fit"><div class="bk-fit-inner">${content}</div></div>`
    : `<div class="modal-scroll">${content}</div>`;
  return {
    button: `<button class="modal-open" type="button">${label}</button>`,
    overlay:
      '<div class="modal" hidden><div class="modal-backdrop"></div>' +
      '<div class="modal-box">' +
      `<div class="modal-bar"><span class="modal-title">${title}</span>` +
      '<button class="modal-close" type="button" aria-label="Cerrar">×</button></div>' +
      inner +
      "</div></div>",
  };
}

function teamsTable(p: Participant, table: Map<string, TeamBreakdown>): string {
  let html =
    '<div class="teams-scroll"><table class="teams"><thead><tr><th>Selección</th><th class="num">Liguilla</th>' +
    '<th class="num" title="Bonus de grupo: clasificar + más goleador + menos goleado">Bonus</th>' +
    '<th class="num">Eliminat.</th><th class="num">Total</th></tr></thead><tbody>';
  const rows = p.teams
    .map((team) => ({ team, t: table.get(team) }))
    .sort((a, b) => (b.t?.total ?? 0) - (a.t?.total ?? 0));
  for (const { team, t } of rows) {
    const league = t ? t.groupPoints : 0;
    const bonus = t ? t.bAdvance + t.bTopScorer + t.bLeastConceded : 0;
    const ko = t ? t.knockoutPoints + t.knockoutGD : 0;
    const tot = t ? t.total : 0;
    const flag = flagImg(team);
    const hasDetail = !!(t && t.lines.length);
    const caret = hasDetail ? '<span class="t-caret">›</span>' : '<span class="t-caret-empty"></span>';
    html +=
      `<tr class="team-row${hasDetail ? " has-detail" : ""}"><td>${caret}${flag}${team}</td>` +
      `<td class="num">${fmt(league)}</td><td class="num">${fmt(bonus)}</td>` +
      `<td class="num">${fmt(ko)}</td><td class="num pts">${fmt(tot)}</td></tr>`;
    if (hasDetail) {
      html +=
        '<tr class="team-detail"><td colspan="5">' +
        '<div class="t-accordion"><div class="t-accordion-inner">' +
        breakdown(t!) +
        "</div></div></td></tr>";
    }
  }
  return html + "</tbody></table></div>";
}

// Desglose línea a línea de una selección, agrupado por sección, para el detalle
// expandible. Las líneas ya vienen calculadas en compute().
function breakdown(t: TeamBreakdown): string {
  const sections: BreakdownLine["section"][] = ["Liguilla", "Bonus de grupo", "Eliminatorias"];
  let html = '<div class="bd">';
  for (const sec of sections) {
    const lines = t.lines.filter((l) => l.section === sec);
    if (!lines.length) continue;
    html += `<div class="bd-sec">${sec}</div>`;
    for (const l of lines) {
      const note = l.note ? `<span class="bd-note">${l.note}</span>` : "";
      const live = l.live ? '<span class="bd-live">en vivo</span>' : "";
      html +=
        `<div class="bd-line"><span class="bd-text">${l.text}${live}${note}</span>` +
        `<span class="bd-pts">${signed(l.points)}</span></div>`;
    }
  }
  return html + "</div>";
}

document.addEventListener("DOMContentLoaded", render);
