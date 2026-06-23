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

function progressBar(data: Data): string {
  const steps = phaseProgress(data);
  let html = '<section class="progress"><h2>Progreso del torneo</h2><div class="steps-scroll"><div class="steps">';
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

// ─── Partidos de hoy y mañana ────────────────────────────────────────────────
// Lista compacta de los encuentros del día en curso y el siguiente. La franja
// "hoy/mañana" se calcula en hora LOCAL del navegador (la del que mira), no en
// UTC. Si data.js no trae utcDate (datos antiguos) la sección no se muestra.
function upcomingMatches(data: Data): string {
  const dayMs = 86400000;
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOf = (t: number) => Math.floor((t - today0) / dayMs); // 0 = hoy, 1 = mañana

  const rows = data.matches
    .filter((m) => m.utcDate)
    .map((m) => ({ m, ts: new Date(m.utcDate!).getTime() }))
    .filter((x) => !Number.isNaN(x.ts) && (dayOf(x.ts) === 0 || dayOf(x.ts) === 1))
    .sort((a, b) => a.ts - b.ts);
  if (!rows.length) return "";

  const time = (ts: number) =>
    new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  let html = '<section class="upcoming"><h2>Partidos de hoy y mañana</h2>';
  for (const bucket of [0, 1]) {
    const day = rows.filter((x) => dayOf(x.ts) === bucket);
    if (!day.length) continue;
    html += `<div class="up-daylabel">${bucket === 0 ? "Hoy" : "Mañana"}</div><div class="up-list">`;
    for (const { m, ts } of day) {
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
        `<span class="up-time">${time(ts)}</span>` +
        `<span class="up-home"><span class="up-name">${m.home}</span>${flagImg(m.home)}</span>` +
        score +
        `<span class="up-away">${flagImg(m.away)}<span class="up-name">${m.away}</span></span>` +
        `<span class="up-state">${state}</span>` +
        "</div>";
    }
    html += "</div>";
  }
  return html + "</section>";
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

function groupsView(data: Data): string {
  const groups = Object.entries(data.groups)
    .filter(([, teams]) => teams.length > 0)
    .sort(([a], [b]) => a.localeCompare(b, "es"));
  if (!groups.length) return "";

  const phaseOver = groupMatchesFinished(data);
  const qualified = qualifiedTeams(data);

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
      // En directo resaltamos la zona de clasificación (1.º/2.º) con tinte cálido;
      // una vez cerrada la fase, el único distintivo es el fondo verde de los
      // que realmente pasan (1.º, 2.º y mejores terceros). No se solapan.
      const isQual = phaseOver && qualified.has(r.team);
      const cls = isQual ? " qualified" : !phaseOver && i < 2 ? " q" : "";
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

  return (
    '<section class="groups">' +
    '<button class="groups-toggle" type="button" aria-expanded="false">' +
    '<span class="gt-caret">›</span><span class="gt-label">Ver grupos</span>' +
    (phaseOver ? '<span class="gt-done">✓ Finalizada</span>' : "") +
    `<span class="gt-hint">${groups.length} grupos · ${phaseOver ? "clasificados a dieciseisavos" : "clasificación en directo"}</span></button>` +
    '<div class="groups-panel"><div class="groups-panel-inner">' +
    `<div class="g-grid">${cards}</div>` +
    `<div class="g-legend"><span class="g-key${phaseOver ? " q-done" : ""}"></span>` +
    (phaseOver
      ? "Clasificados a dieciseisavos: 1.º, 2.º y los 8 mejores terceros."
      : "Las dos primeras de cada grupo se clasifican directas (también avanzan los mejores terceros).") +
    "</div></div></div></section>"
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

// Árbol anidado (raíz = final, hojas = dieciseisavos). El anidamiento hace que
// las líneas de conexión salgan robustas en CSS sin alturas fijas.
function bracketNode(rounds: Match[][], level: number, idx: number): string {
  if (level === 0) return `<div class="bk-node leaf">${bracketMatch(rounds[0]?.[idx])}</div>`;
  const left = bracketNode(rounds, level - 1, idx * 2);
  const right = bracketNode(rounds, level - 1, idx * 2 + 1);
  return (
    '<div class="bk-node">' +
    `<div class="bk-children">${left}${right}</div>` +
    '<div class="bk-branch"></div>' +
    bracketMatch(rounds[level]?.[idx]) +
    "</div>"
  );
}

function bracketView(data: Data): string {
  if (!groupMatchesFinished(data)) return ""; // sólo con la fase de grupos cerrada
  const order: [Phase, string][] = [
    ["round_of_32", "Dieciseisavos"],
    ["round_of_16", "Octavos"],
    ["quarter_finals", "Cuartos"],
    ["semi_finals", "Semifinales"],
    ["final", "Final"],
  ];
  const rounds = order.map(([phase]) => data.matches.filter((m) => m.phase === phase));
  if (rounds.every((r) => r.length === 0)) return "";

  const heads = order.map(([, label]) => `<div class="bk-col-head">${label}</div>`).join("");
  const tree = bracketNode(rounds, rounds.length - 1, 0);

  const third = data.matches.filter((m) => m.phase === "third_place")[0];
  const thirdHtml = third
    ? '<div class="bk-third"><span class="bk-third-label">Tercer puesto</span>' +
      bracketMatch(third) +
      "</div>"
    : "";

  return (
    '<section class="bracket-section"><h2>Cuadro de eliminatorias</h2>' +
    '<div class="bracket-scroll"><div class="bracket-inner">' +
    `<div class="bk-heads">${heads}</div>` +
    `<div class="bracket">${tree}</div>` +
    thirdHtml +
    "</div></div></section>"
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

  html += progressBar(data);
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
  html += groupsView(data);
  html += bracketView(data);
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

  // Botón plegable de la visualización de grupos (mismo patrón de acordeón CSS).
  const gt = app.querySelector<HTMLButtonElement>(".groups-toggle");
  const panel = gt?.nextElementSibling;
  if (gt && panel) {
    gt.addEventListener("click", () => {
      const open = panel.classList.toggle("open");
      gt.classList.toggle("open", open);
      gt.setAttribute("aria-expanded", String(open));
      const label = gt.querySelector(".gt-label");
      if (label) label.textContent = open ? "Ocultar grupos" : "Ver grupos";
    });
  }
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
