// ───────────────────────────────────────────────────────────────────────────
// Motor de puntuación + render de la clasificación.
// Lee window.POOL_DATA (lo genera data.js / update.mjs) y CONFIG.
// Script clásico: sin import/export.
// ───────────────────────────────────────────────────────────────────────────

interface Window {
  POOL_DATA?: Data;
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
      const gf = side === "home" ? m.homeGoals : m.awayGoals;
      const ga = side === "home" ? m.awayGoals : m.homeGoals;
      const t = get(team);
      t.played++;
      if (gf > ga) { t.won++; t.groupPoints += P.group.win; }
      else if (gf === ga) { t.drawn++; t.groupPoints += P.group.draw; }
      else { t.lost++; t.groupPoints += P.group.loss; }
      t.groupGD += gf - ga;
      t.groupPoints += gf - ga; // golaveraje del partido
    }
  }

  // 2) +3 a los que pasan de ronda = los que aparecen en cualquier eliminatoria.
  const qualified = new Set<string>();
  for (const m of data.matches) {
    if (m.phase === "groups") continue;
    if (m.home) qualified.add(m.home);
    if (m.away) qualified.add(m.away);
  }
  for (const team of qualified) get(team).bAdvance += P.groupBonus.advance;

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
    for (const e of topScorers) get(e).bTopScorer += P.groupBonus.topScorer / topScorers.length;

    const minGA = Math.min(...teams.map((e) => ga.get(e) || 0));
    const leastConcededTeams = teams.filter((e) => (ga.get(e) || 0) === minGA);
    for (const e of leastConcededTeams) get(e).bLeastConceded += P.groupBonus.leastConceded / leastConcededTeams.length;
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
    if (m.phase === "final") get(loser).knockoutPoints += P.knockout.runnerUp;
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

// ─── Render ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
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

  let html =
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
}

function teamsTable(p: Participant, table: Map<string, TeamBreakdown>): string {
  let html =
    '<table class="teams"><thead><tr><th>Selección</th><th class="num">Liguilla</th>' +
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
    const code = FLAGS[team];
    const flag = code
      ? `<img class="flag" src="https://flagcdn.com/w40/${code}.png" ` +
        `srcset="https://flagcdn.com/w80/${code}.png 2x" alt="" width="20" height="15" loading="lazy">`
      : "";
    html +=
      `<tr><td>${flag}${team}</td><td class="num">${fmt(league)}</td><td class="num">${fmt(bonus)}</td>` +
      `<td class="num">${fmt(ko)}</td><td class="num pts">${fmt(tot)}</td></tr>`;
  }
  return html + "</tbody></table>";
}

document.addEventListener("DOMContentLoaded", render);
