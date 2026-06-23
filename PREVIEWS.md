# Previsualización de estados

La web cambia bastante según el momento del torneo (fase de grupos, clasificados,
cuadro de eliminatorias…). Para poder **revisar todos esos estados sin esperar a
datos reales**, hay una galería autocontenida: un único `preview.html` con un
selector que alterna entre varios `data.js` de ejemplo, reutilizando el CSS y el
motor reales de la página.

> Los datos son de **ejemplo, no reales**. Cada estado se deriva del `data.js`
> del repo (grupos en curso), así que el preview siempre refleja el código de la
> rama.

## Cómo verlo

### En una Pull Request (sin clonar)

El workflow [`preview.yml`](.github/workflows/preview.yml) se ejecuta en cada PR:
genera `preview.html` y lo sube como artefacto **preview**, y comenta el enlace en
la PR. Para verlo:

1. En la PR, abre el comentario del bot (o la pestaña **Checks → Preview de
   estados**) y entra en la ejecución.
2. Descarga el artefacto **preview** (al final de la página, en *Artifacts*).
3. Descomprime y abre `preview.html` con doble clic (no necesita servidor).
4. Cambia de estado con los botones de arriba.

### En local

```bash
npm run build      # genera dist/ (lo usa el preview)
npm run preview    # genera preview.html
```

Abre `preview.html` en el navegador. `preview.html` está en `.gitignore` (es
generado, como `dist/`). Necesita conexión solo para las banderas (flagcdn).

## Estados incluidos

| Botón | Qué muestra | En qué fijarse |
|-------|-------------|----------------|
| **Grupos en curso** | Fase de grupos a medias. | Clasificación en directo; **no** aparece el cuadro de eliminatorias. |
| **Grupos cerrados** | Fase de grupos terminada, sin sorteo aún. | Badge **✓ Finalizada** en «Ver grupos», los **clasificados en verde** (1.º, 2.º y 8 mejores terceros) y el cuadro con todo en **«Por definir»**. |
| **Bracket en progreso** | Eliminatorias en marcha. | 16avos y octavos cerrados con ganadores resaltados, **un cuarto en vivo**, y semis/final por definir: el cuadro «se va cerrando». |
| **Campeón** | Torneo completo. | Todas las rondas jugadas, ganador de la final y partido por el **tercer puesto** resuelto. |

Los estados se definen en [`make-preview.mjs`](make-preview.mjs): ahí se ajusta
el grado de avance del cuadro o se añaden nuevos escenarios.
