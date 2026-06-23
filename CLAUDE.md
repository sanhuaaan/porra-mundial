# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm install        # solo TypeScript (devDependency única)
npm run build      # tsc: src/*.ts -> dist/*.js  (noEmitOnError: un error de tipos aborta)
npm run watch      # tsc -w mientras editas

npm test           # test/smoke.mjs: motor de puntuación con escenario fijo
npm run verify     # test/verify-teams.mjs: las selecciones de CONFIG existen en data.js
npm run standings  # test/standings.mjs: imprime la clasificación actual

FOOTBALL_DATA_TOKEN=xxx node update.mjs   # baja resultados reales y reescribe data.js
NOTIFY_DRY_RUN=1 node notify.mjs          # imprime el aviso de Google Chat sin postear ni guardar estado
```

**`npm run build` es prerrequisito de los scripts Node.** `dist/` está en `.gitignore`, y `test`, `verify`, `standings` y `notify.mjs` cargan `dist/config.js` + `dist/app.js`. Tras tocar cualquier `.ts`, recompila antes de ejecutarlos o leerás código viejo. No hay watcher de tests: build manual y vuelve a lanzar.

No hay linter ni framework de test: los tests son scripts `node` planos que lanzan al fallar (`assert`).

## Arquitectura

Web estática sin backend. El navegador sirve `index.html` + `dist/*.js` + `data.js`; **la clave de la API nunca llega al navegador**. Quien habla con football-data.org es `update.mjs`, que corre solo en el CI.

### Ámbito global compartido (clave para tocar el TypeScript)

`src/config.ts` y `src/app.ts` se compilan a **`<script>` clásicos** (`tsconfig` con `module: "none"`), sin `import`/`export`. Comparten un único ámbito global, por eso `app.ts` usa `CONFIG`, `FLAGS` y los tipos (`Match`, `Data`, `Phase`…) **sin importarlos** y `lib/engine.mjs` los recoge como globals. Consecuencia al editar: no añadas `import`/`export` a estos dos ficheros (rompe el modelo); los tipos e interfaces declarados en uno son visibles en el otro.

### El sandbox que iguala Node y navegador

`lib/engine.mjs` (`loadEngine`) ejecuta `dist/config.js` + `data.js` + `dist/app.js` en un contexto `vm` que finge `window`/`document`, y devuelve `{ CONFIG, POOL_DATA, compute, participantPoints, phaseProgress }`. Así los scripts de Node (`notify.mjs`, tests) calculan **exactamente igual** que el navegador en vez de reimplementar el motor. Si cambias la firma de esos globals en `app.ts`, actualiza también lo que extrae `loadEngine`.

### El motor (`src/app.ts`)

`compute(data)` recorre `data.matches` y construye un `Map<team, TeamBreakdown>` con el desglose por selección. Invariante: las `lines[]` del desglose se generan en la misma pasada que los totales, así que su suma **siempre** cuadra con `total`. `participantPoints` suma los totales de las selecciones de cada participante; `render()` ordena y pinta clasificación + stepper de progreso (`phaseProgress`) + detalle expandible.

Matiz de directo: la **liguilla puntúa en vivo** (cuenta partidos `IN_PLAY`), las **eliminatorias solo cuando `FINISHED`** (dependen de quién pasa). Reglas exactas de puntuación: en `CONFIG.points` (`src/config.ts`) y en el README.

### Flujo de datos y CI

`data.js` (`window.POOL_DATA = {…}`) **no se edita a mano**: lo regenera `update.mjs` en cada corrida del CI (hay un ejemplo versionado para abrir la web en local sin clave). `update.mjs` traduce inglés→español con la tabla `NAMES` y las etapas de la API→fases de la porra con `PHASES`. Las selecciones en `CONFIG.participants` (`config.ts`) deben usar los **nombres canónicos en español** de `NAMES`; si `npm run verify` se queja, la API devolvió un nombre nuevo y hay que añadir la equivalencia en `NAMES`.

`.github/workflows/deploy.yml` compila → `update.mjs` → `notify.mjs` → publica en GitHub Pages. Lo dispara un **cron externo** (cron-job.org) vía `workflow_dispatch` cada 15 min; el scheduler interno de GitHub se descartó por poco fiable. `notify.mjs` avisa a Google Chat al cerrar cada fase y persiste el estado en `notified.json`, que el workflow commitea con `[skip ci]`.

## Cambiar participantes o selecciones

Edita la lista `CONFIG.participants` en `src/config.ts`, añade la bandera en `FLAGS` si la selección es nueva, `npm run build` y `npm run verify`.
