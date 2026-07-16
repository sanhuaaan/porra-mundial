# Cartera óptima de la porra

> Análisis privado (no se publica en la web: el deploy solo sirve `index.html`,
> `data.js` y `dist/*.js`).

**Datos:** puntuación acumulada por selección del propio motor de la porra
(`compute(POOL_DATA)`), snapshot del **2026-07-16** — jugado todo el torneo salvo
**3.er puesto** y **final**.

## Reglas del ejercicio

- Presupuesto: **36 M€** por participante.
- **Prohibido** elegir selecciones de coste **9 M€** (España, Francia, Inglaterra, Argentina).
- Mínimo **7 selecciones**.
- Objetivo: maximizar los puntos acumulados hasta este punto.

## Resultado óptimo (≥7 selecciones)

| Selección | Coste | Puntos |
|---|---:|---:|
| Bélgica | 7 M | 43 |
| México | 6 M | 38 |
| Suiza | 6 M | 35 |
| Marruecos | 6 M | 32 |
| Canadá | 5 M | 28 |
| Australia | 3 M | 13 |
| Sudáfrica | 2 M | 6 |
| Cabo Verde | 1 M | 6 |
| **Total** | **36 M** | **201** |

**201 puntos**, presupuesto clavado (36/36), 8 selecciones. Óptimo exacto
(programación dinámica 0/1 sobre nº de equipos × coste).

## Notas

- El DP elige **8** selecciones, no 7: gastar las migajas del presupuesto en
  baratas rentables (Australia + Sudáfrica + Cabo Verde = 25 pts por 6 M) rinde
  más que quedarse en 7 y dejar euros sin usar.
- Sin el mínimo de 7, el óptimo serían **6 selecciones y 203 pts** (misma base +
  Estados Unidos 27 pts en lugar de las tres baratas). El límite de 7 cuesta 2 pts.
- **Bélgica (7 M, 43 pts)** es la mejor relación calidad-precio del torneo entre
  las permitidas: ninguna de 8 M (Brasil 35, Portugal 29, Alemania 21) la supera
  por M€, y las de 9 M están excluidas.

### Top selecciones por puntos (referencia)

| Selección | Coste | Puntos |
|---|---:|---:|
| Bélgica | 7 M | 43 |
| México | 6 M | 38 |
| Brasil | 8 M | 35 |
| Suiza | 6 M | 35 |
| Marruecos | 6 M | 32 |
| Portugal | 8 M | 29 |
| Canadá | 5 M | 28 |
| Noruega | 7 M | 27 |
| Estados Unidos | 6 M | 27 |

---

# Simulación pre-torneo (Monte Carlo)

**¿Se podía llegar a algo parecido ANTES de empezar, solo con datos?** Sí a la
estructura, no al número exacto. Herramienta: `sim/simulate.mjs`.

## Cómo funciona

No reimplementa la fórmula de puntos: genera un Mundial sintético (mismo formato
que `data.js`) y lo pasa por el **`compute()` real** del motor, así puntúa
idéntico a la web. Repite N veces (por defecto 20.000) con un modelo de fuerza y
promedia → **puntos esperados** por selección. Con esos puntos corre el mismo
knapsack (36 M€, ≥7 selecciones, sin 9 M€).

- **Modelo de partido:** goles Poisson con media inclinada por diferencia de Elo
  (`BASE=1.35`, factor `10^(Δelo/800)`); empates de eliminatoria → penaltis por
  moneda ponderada. Constantes de calibración, ajustables.
- **Cuadro:** reparto aleatorio de los 32 clasificados en cada simulación
  (simplificación: el Mundial real cruza por posición de grupo; al promediar
  sobre N sorteos la dificultad esperada sale insesgada).
- **PRNG sembrado** → resultado reproducible corrida a corrida.

## Cambiar los ratings (pendiente de investigar)

La fuerza sale de **`sim/ratings.json`** — hoy son **Elo APROXIMADOS a ojo** por
tramo de coste, no reales. Para afinar el modelo **no se toca el script**: se
edita ese JSON. Fuentes a investigar más adelante para rellenarlo con datos de
verdad:

- **Elo de fútbol** (eloratings.net u similar): ratings por selección, gratis.
- **Odds de casas de apuestas** pre-torneo (ganador + «pasa de grupos»),
  quitándoles el margen y convirtiéndolas a un rating equivalente. Incorporan más
  información (lesiones, forma, sorteo) que el Elo puro.

Mientras el JSON tenga los 48 nombres exactos del motor, el simulador no cambia.

## Resultado con los Elo aproximados actuales

Cartera óptima **esperada** (20.000 simulaciones):

| Selección | Coste | Pts esperados |
|---|---:|---:|
| Brasil | 8 M | 53.5 |
| Portugal | 8 M | 47.3 |
| Bélgica | 7 M | 37.8 |
| México | 6 M | 29.9 |
| Irán | 3 M | 9.6 |
| Corea Sur | 3 M | 8.0 |
| Uzbekistán | 1 M | −6.0 |
| **Total** | **36 M** | **180** |

El modelo gasta el 7.º hueco obligatorio en una selección de 1 M€ con puntos
esperados negativos: seis fuertes agotan casi el presupuesto (35 M€) y solo queda
1 M€ para cumplir el mínimo de 7.

## Contraste modelo vs realidad

- Las **3 mejores del modelo son las de 9 M€** (Argentina 72.9, Francia 65.9,
  España 60.7) — prohibidas. El precio ya era una predicción excelente.
- Entre las permitidas el modelo acierta la **estructura**: cargar en Brasil,
  Portugal, Bélgica, México. **Bélgica y México** están también en la cartera
  óptima real.
- Pero **sobrevalora** a Brasil (esperado 53.5 → real 35) y Portugal (47.3 → 29),
  y **no puede anticipar** las sorpresas que ganaron la porra de verdad (Suiza 35,
  Marruecos 32, Canadá 28): su esperanza estaba muy por debajo.

**Prueba de fuego** — puntos REALES que habría sacado la cartera del modelo:

| | Puntos reales |
|---|---:|
| Cartera del modelo (pre-torneo) | **141** |
| Cartera óptima a posteriori | 201 |
| **Ratio** | **70 %** |

Es decir: con obtención de datos habrías capturado **~70 % del techo** y acertado
la mitad de los nombres. El 30 % restante es varianza pura (Bélgica 43, las
sorpresas) que ningún modelo pre-torneo predice — eso lo pone el balón.

## Uso

```bash
node sim/simulate.mjs [N]   # N simulaciones, por defecto 20000
```

No se despliega en la web (el deploy solo sirve `index.html` + `data.js` + `dist/*.js`).
