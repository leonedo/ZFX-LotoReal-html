# Recap unificado

Un solo gráfico de resultados que muestra **cualquier subconjunto de los 7 juegos**, en el orden que
se le pida, y se acomoda solo: reparte las filas, centra el bloque y ajusta la escala según cuántos
juegos haya.

Reemplaza a los recaps de una combinación fija (`recaps/`, `recap/`), que quedan en el repo mientras
este se estabiliza.

```
CG 1 ADD 1 "recap-uni/index" 1 "<datos>"
CG 1 PLAY 1
CG 1 UPDATE 1 "<datos>"      // refresca valores; NO cambia la lista de juegos
CG 1 STOP 1
```

## Los juegos

| clave   | juego              | bolos | color por bolo |
|---------|--------------------|:-----:|:--------------:|
| `fr`    | Tu Fecha Real      |   1   | fijo           |
| `cr`    | Chance Real        |   5   | **dinámico**   |
| `rr`    | Repartidera Real   |   1   | **dinámico**   |
| `lp`    | Loto Pool          |   4   | **dinámico**   |
| `lotor` | Loto Real          |   6   | fijo           |
| `ny`    | Nueva Yol Real     |   3   | **dinámico**   |
| `lr`    | **Lotería** Real   |   3   | fijo           |

> `lotor` es **Loto Real** y `lr` es **Lotería Real**. Son juegos distintos y se confunden fácil;
> en el proyecto también aparecen como `Logo_LREAL` y `Logo_LOTREAL` respectivamente.

Pega Real quedó afuera: no está en ninguna de las combinaciones que usa el cliente hoy.

## El payload

```json
{
  "juegos": "cr,rr,lp,lotor,lr",

  "cr_bolo1": "25",  "color_cr_bolo1": "#86DA00",
  "cr_bolo2": "50",  "color_cr_bolo2": "#E30613",
  "rr_bolo1": "2",   "color_rr_bolo1": "#E30613",
  "lotor_bolo1": "15",
  "lr_bolo1": "98",

  "opacidad_manzanita_amarilla": "1",
  "t_Resultados": "RESULTADOS"
}
```

- **`juegos`** — qué juegos se muestran y **en qué orden**. `"lp,cr,rr"` pone Loto Pool arriba.
  Acepta coma, punto y coma o espacios; ignora mayúsculas; tolera duplicados y nombres desconocidos
  (los descarta y lo avisa por consola). También se acepta como array o como `{"text": "..."}`.
- **`<juego>_bolo<N>`** — el número del bolo N, contando de izquierda a derecha desde 1.
- **`color_<juego>_bolo<N>`** — sólo para los cuatro juegos marcados dinámicos arriba. Cualquier color
  CSS. Los otros tres tienen el color grabado en el diseño y no se pueden repintar desde datos.
- **`opacidad_manzanita_amarilla` / `_verde` / `_roja`** — la manzanita de Nueva Yol. `0` la esconde,
  `1` la muestra.
- **`t_Resultados`** — el título de la píldora superior.

Los juegos que no estén en `juegos` se ocultan aunque manden sus valores. Los bolos sin valor salen
**en blanco**, nunca con números de relleno.

### Alternativa por URL

`recap-uni/index.html?games=cr,rr,lp` fija la lista al cargar. **Tiene prioridad sobre el payload**,
así que no conviene dejarlo pegado en la ruta del template dentro de CasparCG.

### Cuándo se decide la lista

La composición se hace una sola vez, antes de construir la animación. Se cierra con lo primero que
llegue de: `?games=` en la URL → la clave `juegos` de un payload → un `play`. Si no llega nada,
a los 8 segundos sale con los 7 juegos en blanco, en vez de dejar el aire en negro.

**Limitación conocida:** una vez compuesto, un `UPDATE` con otra lista de `juegos` **no cambia el
set** — refresca valores nada más. Para cambiar qué juegos se ven hay que recargar el template.

## Retocar el layout

Todo vive en `recap-layout.js`, arriba del archivo, en coordenadas de cuadro (1920×1080):

- **`LAYOUT.exact`** — las cuatro combinaciones que el cliente usa al aire, con la Y exacta de cada
  fila medida de los archivos que entregó el diseñador. Si una de esas se ve corrida, se corrige acá.
- **`LAYOUT.byCount`** — para cualquier otra combinación: paso entre filas, centro del bloque y escala
  global según cuántos juegos haya. Los valores de 4, 5 y 7 salen de los archivos medidos; 2, 3 y 6
  están interpolados y nunca se validaron contra un diseño.
- **`LAYOUT.extraGapBefore`** — el respiro extra arriba de Lotería Real.

No hace falta tocar nada más ni reconstruir el maestro para cambiar el layout.

## Cómo se genera

```
node tools/build-recap-master.mjs
```

Lee la entrega del diseñador en `New_aug_2026/newDelivery/RECAP_ Posible versión Nocturna en 2 meses/`
—el único archivo que trae los 7 juegos— y escribe esta carpeta. Ver `tools/build-recap-master.mjs`
para qué normaliza y qué repara.

## Archivos

| archivo               | qué es                                                        |
|-----------------------|---------------------------------------------------------------|
| `index.html`          | la página; carga el motor compartido `../index.js`            |
| `recap-layout.js`     | tabla de layout y composición — **lo único que se edita a mano** |
| `recap-master.json`   | generado: el Lottie con los 7 juegos                          |
| `recap-manifest.json` | generado: qué capa es de qué juego                            |
| `loop.json`           | generado: el fondo, que corre como loop externo               |
| `images/`             | la secuencia de transición                                    |

`recap-master.json`, `recap-manifest.json` y `loop.json` los pisa el build: no editarlos a mano.
