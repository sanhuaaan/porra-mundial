# Porra Mundial 2026

Web estática para llevar la clasificación de la porra del Mundial. Cada
participante elige sus selecciones y la web calcula los puntos según las reglas
de la porra a partir de los resultados reales, que se descargan de
[football-data.org](https://www.football-data.org).

No hay backend: la web es HTML + JavaScript (compilado de TypeScript) y lee los
resultados de un fichero `data.js`. Ese fichero lo reescribe el script
`update.mjs`, que es la única pieza que habla con la API (y la única que
conoce tu clave). En producción se lanza con un cron cada hora.

```
navegador  ─►  index.html + dist/*.js + data.js        (estático, sin clave)
cron (1h)  ─►  node update.mjs ─► football-data.org  (reescribe data.js)
```

## Estructura

| Fichero            | Qué es                                                        |
|--------------------|---------------------------------------------------------------|
| `index.html`       | La página. Carga `config.js`, `data.js` y `app.js`.          |
| `src/config.ts`    | **Participantes, sus selecciones y las reglas de puntuación.** |
| `src/app.ts`       | Motor de puntuación + render de la tabla.                     |
| `data.js`         | Resultados (lo genera `update.mjs`; se incluye un ejemplo).|
| `update.mjs`   | Descarga los resultados y reescribe `data.js`.               |
| `notify.mjs`       | Avisa a Google Chat al terminar cada fase (ver más abajo).    |
| `lib/engine.mjs`   | Cargador compartido del motor (sandbox) para los scripts Node.|
| `dist/`            | JavaScript compilado que carga el navegador.                  |
| `test/smoke.mjs`   | Prueba del motor de puntuación.                               |

## Puesta en marcha

```bash
npm install      # instala TypeScript
npm run build    # compila src/*.ts -> dist/*.js
```

Abre `index.html` en el navegador (doble clic vale) y verás la clasificación
con los **datos de ejemplo**.

Mientras tocas el TypeScript, `npm run watch` recompila al guardar.

## Datos reales (football-data.org)

1. Regístrate gratis en https://www.football-data.org/client/register y copia tu
   token.
2. Genera `data.js` con los resultados reales:

   ```bash
   FOOTBALL_DATA_TOKEN=tu_clave node update.mjs
   ```

   Por defecto usa la competición `WC` (Mundial). Si tu plan usa otro código,
   pásalo con `FD_COMPETITION`:

   ```bash
   FOOTBALL_DATA_TOKEN=tu_clave FD_COMPETITION=WC node update.mjs
   ```

3. Recarga la web.

> **Nota:** el plan gratuito y los nombres exactos de las fases del torneo de 48
> equipos conviene verificarlos con tu clave la primera vez. Los nombres de
> selección (inglés → español) y las fases se mapean en `update.mjs`
> (tablas `NAMES` y `PHASES`); si alguna selección apareciera con su nombre en
> inglés o una eliminatoria no puntuara, basta con añadir la entrada que falte.

## Despliegue en GitHub Pages (recomendado)

La web se publica en GitHub Pages y un workflow de GitHub Actions
(`.github/workflows/deploy.yml`) la **reconstruye y redespliega con datos
frescos**: compila el TypeScript, ejecuta `update.mjs` y publica el sitio. No
hace falta servidor ni commitear `data.js` (lo regenera el CI en cada
ejecución). El workflow se dispara con cada `push`, manualmente
(`workflow_dispatch`) y, sobre todo, desde un **cron externo cada 15 min** (ver
más abajo).

Pasos (una sola vez):

1. **Crea el repositorio y súbelo** (sustituye `TU_USUARIO`):

   ```bash
   git init && git add -A && git commit -m "Porra Mundial 2026"
   git branch -M main
   gh repo create porra-mundial --public --source=. --remote=origin --push
   # o, sin gh: crea el repo en github.com y luego
   # git remote add origin https://github.com/TU_USUARIO/porra-mundial.git && git push -u origin main
   ```

2. **Guarda el token como secret** (no se commitea nunca):

   ```bash
   gh secret set FOOTBALL_DATA_TOKEN --body "tu_clave"
   # o en github.com: Settings → Secrets and variables → Actions → New repository secret
   #   Name: FOOTBALL_DATA_TOKEN   Value: tu_clave
   ```

3. **Activa Pages con origen «GitHub Actions»**: en github.com, Settings →
   Pages → Build and deployment → Source: **GitHub Actions**.

4. Lanza el primer despliegue: Actions → «Desplegar porra» → *Run workflow*
   (o haz cualquier push). La web quedará en
   `https://TU_USUARIO.github.io/porra-mundial/`.

> **Nota:** con repo público la web y el código quedan públicos (los datos de la
> porra no son sensibles). El token va en *secrets*, nunca en el repo.

### Actualización periódica: cron EXTERNO (no el de GitHub)

El scheduler interno de GitHub Actions (`on: schedule`) es «best effort»: a la
hora redonda se retrasa o se salta ciclos enteros, así que se descartó. En su
lugar, un **servicio de cron externo** (p. ej. [cron-job.org](https://cron-job.org))
llama cada 15 min a la API de `workflow_dispatch`, de modo que el reloj lo pone
el servicio externo y la cadencia es fiable.

Montaje (una sola vez):

1. **Token** — un *fine-grained PAT* con el mínimo privilegio:
   Settings → Developer settings → Personal access tokens → Fine-grained tokens.
   - *Repository access:* solo `porra-mundial`.
   - *Permissions:* **Actions → Read and write**.
   - *Expiration:* una fecha posterior al torneo (los fine-grained caducan).

2. **La petición** que dispara el workflow:
   - Método: `POST`
   - URL: `https://api.github.com/repos/TU_USUARIO/porra-mundial/actions/workflows/deploy.yml/dispatches`
   - Headers: `Accept: application/vnd.github+json`,
     `Authorization: Bearer <TU_TOKEN>`, `X-GitHub-Api-Version: 2022-11-28`,
     `Content-Type: application/json`
   - Body: `{"ref":"main"}`
   - Respuesta correcta: **`204 No Content`**.

   Prueba rápida con `curl`:

   ```bash
   curl -i -X POST \
     -H "Accept: application/vnd.github+json" \
     -H "Authorization: Bearer <TU_TOKEN>" \
     -H "X-GitHub-Api-Version: 2022-11-28" \
     https://api.github.com/repos/TU_USUARIO/porra-mundial/actions/workflows/deploy.yml/dispatches \
     -d '{"ref":"main"}'
   ```

3. **cron-job.org** — *Create cronjob* con esa URL, *schedule* cada 15 min
   (minutos `0,15,30,45`), método `POST`, los headers de arriba y el body
   `{"ref":"main"}`. Cualquier `2xx` (el `204`) cuenta como éxito.

El límite del plan gratuito de la API de football-data (10 req/min) va
sobradísimo: `update.mjs` hace 2 peticiones por ejecución → ~8 req/h.

> **Seguridad:** el token da escritura sobre Actions **solo** de este repo.
> Vive únicamente en el servicio de cron; nunca se commitea y conviene ponerle
> caducidad.

## Notificaciones a Google Chat

`notify.mjs` publica un mensaje (una *card*) en un espacio de Google Chat con la
clasificación **cada vez que termina una fase** del torneo: las 9 del progreso
(jornadas J1/J2/J3 y cada eliminatoria). Corre en el workflow justo después de
`update.mjs`, así que usa los resultados recién descargados.

Para no repetir el mensaje en cada ejecución del cron (cada 15 min), las fases ya
anunciadas se guardan en **`notified.json`**, que el propio workflow commitea con
`[skip ci]` (por eso el job tiene `contents: write`). El fichero guarda además el
ranking del último anuncio para mostrar la **variación de puesto** (▲/▼).

Puesta en marcha (una sola vez):

1. En el espacio de Google Chat: **Gestionar webhooks → Añadir webhook**, copia la
   URL (`https://chat.googleapis.com/v1/spaces/.../messages?key=...`).
2. Guárdala como secret del repo:

   ```bash
   gh secret set GOOGLE_CHAT_WEBHOOK --body "https://chat.googleapis.com/v1/spaces/…"
   ```

> **Primera ejecución (bootstrap):** si `notified.json` no existe, la primera
> corrida lo **siembra en silencio** con las fases ya jugadas (no envía mensajes
> retroactivos) y solo avisará de las que terminen a partir de entonces.

Probar en local sin webhook (no postea ni escribe el estado):

```bash
npm run build
NOTIFY_DRY_RUN=1 node notify.mjs   # imprime por pantalla lo que se enviaría
```

## Alternativa: VPS / servidor propio con cron

Sirve `index.html`, `dist/` y `data.js` con cualquier servidor estático (Nginx,
Apache…) y añade al `crontab -e`:

```cron
0 * * * * cd /ruta/a/porra-mundial && FOOTBALL_DATA_TOKEN=tu_clave /usr/bin/node update.mjs >> update.log 2>&1
```

Cada hora reescribe `data.js` y la web sirve siempre el último resultado.

## Cambiar participantes o selecciones

Edita `src/config.ts` (lista `participantes`) y vuelve a `npm run build`. Los
nombres de selección deben coincidir con los nombres canónicos en español de la
tabla `NAMES` de `update.mjs`.

## Reglas de puntuación implementadas

**Fase 1 — Liguilla** (por cada partido de cada selección):
- 3 / 1 / 0 por victoria / empate / derrota.
- **+** el golaveraje del partido (ganar 3-0 → +3; perder 2-4 → −2; empatar 3-3 → 0).
- En el grupo, una vez disputado entero: **+3** a cada equipo que pasa de ronda,
  **+6** al más goleador del grupo y **+6** al menos goleado (repartidos en caso
  de empate).

**Fase 2 — Eliminatorias** (ya no se resta): al que pasa cada ronda
**+6** dieciseisavos, **+9** octavos, **+12** cuartos, **+15** semis,
**+18** campeón, **+6** subcampeón, **+3** tercero, **+** el golaveraje a favor de
cada eliminatoria ganada (penaltis = 0; prórroga cuenta el resultado final).

La puntuación de cada participante es la suma de los puntos de todas sus
selecciones.

## Tests y utilidades

```bash
npm run build     # imprescindible antes de los tests (usan dist/)
npm test          # prueba del motor con un escenario fijo
npm run verify    # comprueba que las 27 selecciones elegidas existen en data.js
npm run standings # imprime la clasificación actual en la terminal
```

Si tras una actualización `npm run verify` se queja de alguna selección, es que
la API la devuelve con un nombre nuevo: añade la equivalencia a la tabla `NAMES`
de `update.mjs`.
