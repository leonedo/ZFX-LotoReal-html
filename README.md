# ZFX LotoReal — templates HTML

Gráficos para CasparCG de los sorteos de Lotería Real. Cada template es una carpeta con un
`index.html` que carga una animación Lottie y recibe los datos desde CasparCG.

## Cómo funciona un template

Todos siguen el mismo patrón: un HTML mínimo que declara qué animación cargar y engancha el motor
compartido.

```html
<div id="loop"></div>   <!-- fondo, opcional: se carga desde loop.json -->
<div id="bm"></div>     <!-- la animación principal -->
<script>
    let data_file = "data.json";
    let audio_inframe = 1;
</script>
<script src="../webcg-framework.umd.js"></script>  <!-- puente con CasparCG -->
<script src="../lottie.js"></script>
<script src="../index.js"></script>                <!-- el motor -->
```

**`index.js` es el motor compartido: lo cargan 39 páginas.** Tocarlo afecta a casi todo el aire;
conviene verificar que los demás siguen cargando antes de commitear.

### Cómo llegan los datos

`index.js` reparte el payload por el **nombre de la clase de la capa** (`cl` en el JSON de Lottie).
No hay tabla de mapeo: el nombre de la capa en After Effects *es* el nombre del campo.

| la clave del payload…            | …hace                                                  |
|----------------------------------|--------------------------------------------------------|
| contiene `color`                 | pinta el `fill` de `.<clave>`                          |
| contiene `opacidad`              | cambia la opacidad de `.<clave>`                       |
| cualquier otra                   | escribe el texto de la capa con esa clase              |

Se acepta `"campo": "valor"` o `"campo": {"text": "valor"}` (que es como manda CasparCG por XML).

### Comandos

`play`, `stop`, `update`, `playAnimation <marker>`, `entrada1`..`entrada6`, `startclock`, `stopclock`.

### Markers

La animación **tiene que traer markers** o no responde a nada:

- `play` — el tramo de entrada
- `loop` — con `loopDelay: <frames>` y `loopExternal: true|false`
- `stop` — el tramo de salida

Con `loopExternal: true`, el motor busca un **`loop.json` al lado del template** y lo corre en
`#loop` como fondo repetido. El nombre es fijo.

## Qué hay en el repo

| carpeta | qué es |
|---|---|
| `recap-uni/` | **el recap unificado** — un gráfico para cualquier combinación de juegos ([ver README](recap-uni/README.md)) |
| `recaps/`, `recap/` | los recaps viejos, uno por combinación fija; se van cuando el unificado se estabilice |
| `lt-*/`, `loto-*/`, `loteria-real/`, `sueño-real/` | lower thirds y resultados por sorteo |
| `acumulado/`, `autoridades/`, `host/`, `logo/`, `slates/`, `crawl/` | el resto de los gráficos del aire |
| `tools/` | scripts de build (no van al playout) |
| `New_aug_2026/` | material crudo del diseñador; no se despliega |
| `sequence/` | secuencias de transición compartidas |

## Cómo debe venir un Lottie para que funque acá

Cosas que llegaron rotas en entregas reales y costaron tiempo. Vale la pena chequearlas antes de
integrar un archivo nuevo:

1. **Markers `play` / `loop` / `stop`.** Sin ellos `goToAndPlay` falla y el gráfico no hace nada.
2. **Nada de track mattes en capas que no pintan.** Un `tt`/`tp` sobre un null o una capa de audio
   hace que lottie tire `element.setMatte is not a function` al construir el DOM: la animación nunca
   dispara `DOMLoaded` y **no se ve nada**.
3. **Nada de capas de audio dentro del Lottie.** El `lottie.js` del proyecto no tiene `audioFactory`,
   así que cualquier `pause`/`stop` revienta. El SFX se dispara desde el `<audio id="sfxOut">` de la
   página con `audio_inframe`.
4. **Las clases de color van en el RELLENO, no en la capa.** Lottie le pone la clase de capa a un
   `<g>` y la del relleno al `<path>`; el `style.fill` que escribe el motor sólo le gana al atributo
   del `<path>`. En After Effects: la clase sobre el ítem de relleno, no sobre la capa.
5. **Las clases de opacidad tienen que contener la palabra `opacidad`**, que es por donde el motor
   decide qué hacer con la clave.
6. **Una clase de datos, una sola capa.** El motor resuelve con `querySelector` y se queda con la
   primera coincidencia; una clase repetida hace que la segunda nunca reciba nada.
7. **Los valores de maqueta van en blanco.** Si un campo sale al aire sin dato, un número de relleno
   parece un resultado real.

## Notas

- `index.js` está en **CRLF**. Cuidado con los editores que lo normalizan: ensucia el diff entero.
- `host/index.html` pide `host.json` pero el archivo es `Host.json`. Funciona en Windows y falla en
  cualquier sistema sensible a mayúsculas. Preexistente, sin arreglar.
