// ───────────────────────────────────────────────────────────────────────────
// Motor de puntuación + render de la clasificación.
// Lee window.PORRA_DATOS (lo genera datos.js / actualizar.mjs) y CONFIG.
// Script clásico: sin import/export.
// ───────────────────────────────────────────────────────────────────────────

interface Window {
  PORRA_DATOS?: Datos;
}

interface DesgloseEquipo {
  equipo: string;
  pj: number;
  v: number;
  e: number;
  d: number;
  golavGrupo: number;        // suma de diferencias de gol en la liguilla
  ptsLiguilla: number;       // 3/1/0 por resultado + golaveraje de cada partido
  bPasaRonda: number;        // +3 si clasifica para eliminatorias
  bMasGoleador: number;      // +6 al más goleador del grupo (repartido si empate)
  bMenosGoleado: number;     // +6 al menos goleado del grupo (repartido si empate)
  ptsEliminatoria: number;   // bonos por superar cada ronda (+ subcampeón / tercero)
  golavEliminatoria: number; // golaveraje a favor en eliminatorias ganadas
  total: number;
}

function nuevoEquipo(equipo: string): DesgloseEquipo {
  return {
    equipo,
    pj: 0, v: 0, e: 0, d: 0,
    golavGrupo: 0,
    ptsLiguilla: 0,
    bPasaRonda: 0,
    bMasGoleador: 0,
    bMenosGoleado: 0,
    ptsEliminatoria: 0,
    golavEliminatoria: 0,
    total: 0,
  };
}

function calcular(datos: Datos): Map<string, DesgloseEquipo> {
  const tabla = new Map<string, DesgloseEquipo>();
  const get = (eq: string): DesgloseEquipo => {
    let d = tabla.get(eq);
    if (!d) { d = nuevoEquipo(eq); tabla.set(eq, d); }
    return d;
  };
  const P = CONFIG.puntos;

  const cuenta = (p: Partido): boolean =>
    (p.estado === "FINISHED" || p.estado === "IN_PLAY") && p.gl != null && p.gv != null;

  // 1) FASE 1 — Liguilla: 3/1/0 por resultado + golaveraje de cada partido.
  for (const p of datos.partidos) {
    if (p.fase !== "grupos" || !cuenta(p) || p.gl == null || p.gv == null) continue;
    for (const lado of ["local", "visitante"] as const) {
      const eq = lado === "local" ? p.local : p.visitante;
      if (!eq) continue;
      const gf = lado === "local" ? p.gl : p.gv;
      const ga = lado === "local" ? p.gv : p.gl;
      const d = get(eq);
      d.pj++;
      if (gf > ga) { d.v++; d.ptsLiguilla += P.grupo.victoria; }
      else if (gf === ga) { d.e++; d.ptsLiguilla += P.grupo.empate; }
      else { d.d++; d.ptsLiguilla += P.grupo.derrota; }
      d.golavGrupo += gf - ga;
      d.ptsLiguilla += gf - ga; // golaveraje del partido
    }
  }

  // 2) +3 a los que pasan de ronda = los que aparecen en cualquier eliminatoria.
  const clasificados = new Set<string>();
  for (const p of datos.partidos) {
    if (p.fase === "grupos") continue;
    if (p.local) clasificados.add(p.local);
    if (p.visitante) clasificados.add(p.visitante);
  }
  for (const eq of clasificados) get(eq).bPasaRonda += P.bonusGrupo.pasaRonda;

  // 3) Bonus de grupo (sólo cuando el grupo está completo):
  //    +6 al más goleador, +6 al menos goleado (repartidos en caso de empate).
  for (const [grupo, equipos] of Object.entries(datos.grupos)) {
    if (equipos.length === 0) continue;
    const partidosGrupo = datos.partidos.filter((p) => p.fase === "grupos" && p.grupo === grupo);
    // Liga de todos contra todos: n equipos -> n*(n-1)/2 partidos. El bonus de
    // grupo sólo se reparte cuando se han jugado (y finalizado) todos.
    const esperados = (equipos.length * (equipos.length - 1)) / 2;
    const finalizados = partidosGrupo.filter((p) => p.estado === "FINISHED").length;
    const completo = finalizados >= esperados && partidosGrupo.every((p) => p.estado === "FINISHED");
    if (!completo) continue;

    const gf = new Map<string, number>();
    const ga = new Map<string, number>();
    for (const eq of equipos) { gf.set(eq, 0); ga.set(eq, 0); }
    for (const p of partidosGrupo) {
      if (p.gl == null || p.gv == null) continue;
      gf.set(p.local, (gf.get(p.local) || 0) + p.gl);
      ga.set(p.local, (ga.get(p.local) || 0) + p.gv);
      gf.set(p.visitante, (gf.get(p.visitante) || 0) + p.gv);
      ga.set(p.visitante, (ga.get(p.visitante) || 0) + p.gl);
    }

    const maxGF = Math.max(...equipos.map((e) => gf.get(e) || 0));
    const masGoleadores = equipos.filter((e) => (gf.get(e) || 0) === maxGF);
    for (const e of masGoleadores) get(e).bMasGoleador += P.bonusGrupo.masGoleador / masGoleadores.length;

    const minGA = Math.min(...equipos.map((e) => ga.get(e) || 0));
    const menosGoleados = equipos.filter((e) => (ga.get(e) || 0) === minGA);
    for (const e of menosGoleados) get(e).bMenosGoleado += P.bonusGrupo.menosGoleado / menosGoleados.length;
  }

  // 4) FASE 2 — Eliminatorias: bono por ronda + golaveraje a favor (penaltis = 0).
  const bono: Record<Fase, number> = {
    grupos: 0,
    dieciseisavos: P.eliminatoria.dieciseisavos,
    octavos: P.eliminatoria.octavos,
    cuartos: P.eliminatoria.cuartos,
    semis: P.eliminatoria.semis,
    tercer_puesto: P.eliminatoria.tercer_puesto,
    final: P.eliminatoria.final,
  };
  for (const p of datos.partidos) {
    if (p.fase === "grupos") continue;
    if (p.estado !== "FINISHED" || p.gl == null || p.gv == null) continue;

    let ganador: string;
    let perdedor: string;
    let gd: number;
    if (p.gl === p.gv) {
      // Empate en el tiempo reglamentario/prórroga -> se decide en penaltis.
      ganador = p.ganador || p.local;
      perdedor = ganador === p.local ? p.visitante : p.local;
      gd = 0; // el golaveraje en penaltis es 0
    } else {
      ganador = p.gl > p.gv ? p.local : p.visitante;
      perdedor = p.gl > p.gv ? p.visitante : p.local;
      gd = Math.abs(p.gl - p.gv); // prórroga: cuenta el resultado final
    }

    const g = get(ganador);
    g.ptsEliminatoria += bono[p.fase];
    g.golavEliminatoria += gd;
    if (p.fase === "final") get(perdedor).ptsEliminatoria += P.eliminatoria.subcampeon;
  }

  for (const d of tabla.values()) {
    d.total =
      d.ptsLiguilla +
      d.bPasaRonda + d.bMasGoleador + d.bMenosGoleado +
      d.ptsEliminatoria + d.golavEliminatoria;
  }
  return tabla;
}

function puntosParticipante(part: Participante, tabla: Map<string, DesgloseEquipo>): number {
  return part.equipos.reduce((s, eq) => s + (tabla.get(eq)?.total ?? 0), 0);
}

// ─── Render ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;
  const datos = window.PORRA_DATOS;

  const fechaEl = document.getElementById("actualizado");
  if (fechaEl) fechaEl.textContent = datos ? formatearFecha(datos.actualizado) : "—";

  if (!datos) {
    app.innerHTML =
      '<p class="aviso">No hay datos todavía. Ejecuta <code>node actualizar.mjs</code> ' +
      "para generar <code>datos.js</code>.</p>";
    return;
  }

  const tabla = calcular(datos);
  const ranking = CONFIG.participantes
    .map((p) => ({ p, pts: puntosParticipante(p, tabla) }))
    .sort((a, b) => b.pts - a.pts);

  let html =
    '<table class="ranking"><thead><tr><th class="caret-col"></th><th class="pos">#</th>' +
    '<th>Participante</th><th class="num">Puntos</th></tr></thead><tbody>';

  ranking.forEach((r, i) => {
    html +=
      `<tr class="fila" data-i="${i}"><td class="caret">›</td>` +
      `<td class="pos">${i + 1}</td><td class="nombre">${r.p.nombre}</td>` +
      `<td class="num pts">${fmt(r.pts)}</td></tr>`;
    html +=
      '<tr class="detalle"><td></td><td colspan="3">' +
      '<div class="acordeon"><div class="acordeon-inner">' +
      tablaEquipos(r.p, tabla) +
      "</div></div></td></tr>";
  });

  html += "</tbody></table>";
  app.innerHTML = html;

  // Expandir / contraer el detalle de cada participante (la animación es CSS).
  app.querySelectorAll<HTMLTableRowElement>("tr.fila").forEach((fila) => {
    fila.addEventListener("click", () => {
      const detalle = fila.nextElementSibling;
      if (!detalle) return;
      const abierta = detalle.classList.toggle("abierta");
      fila.classList.toggle("abierta", abierta);
    });
  });
}

function tablaEquipos(p: Participante, tabla: Map<string, DesgloseEquipo>): string {
  let html =
    '<table class="equipos"><thead><tr><th>Selección</th><th class="num">Liguilla</th>' +
    '<th class="num" title="Bonus de grupo: clasificar + más goleador + menos goleado">Bonus</th>' +
    '<th class="num">Eliminat.</th><th class="num">Total</th></tr></thead><tbody>';
  const eqs = p.equipos
    .map((eq) => ({ eq, d: tabla.get(eq) }))
    .sort((a, b) => (b.d?.total ?? 0) - (a.d?.total ?? 0));
  for (const { eq, d } of eqs) {
    const liga = d ? d.ptsLiguilla : 0;
    const bonus = d ? d.bPasaRonda + d.bMasGoleador + d.bMenosGoleado : 0;
    const eli = d ? d.ptsEliminatoria + d.golavEliminatoria : 0;
    const tot = d ? d.total : 0;
    const code = BANDERAS[eq];
    const bandera = code
      ? `<img class="bandera" src="https://flagcdn.com/w40/${code}.png" ` +
        `srcset="https://flagcdn.com/w80/${code}.png 2x" alt="" width="20" height="15" loading="lazy">`
      : "";
    html +=
      `<tr><td>${bandera}${eq}</td><td class="num">${fmt(liga)}</td><td class="num">${fmt(bonus)}</td>` +
      `<td class="num">${fmt(eli)}</td><td class="num pts">${fmt(tot)}</td></tr>`;
  }
  return html + "</tbody></table>";
}

document.addEventListener("DOMContentLoaded", render);
