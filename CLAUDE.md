# Notas para trabajar en este repo

Templates HTML de CasparCG para los sorteos de Lotería Real. El **[README](README.md)** explica cómo
funciona un template, el despacho del payload y qué hay en cada carpeta; el
**[README de recap-uni](recap-uni/README.md)** es el contrato del recap unificado. Esto de acá es sólo
lo operativo: cómo correr las cosas, cómo verificarlas y qué no romper.

## Cómo llega el material del diseñador

**Siempre entrega en crudo: el arte terminado y nada más.** Sin markers, con los campos de texto
numerados (`t0`, `t1`…) en vez de nombrados, sin las clases de color en los rellenos, con capas de
audio embebidas y, a veces, con track mattes sobre nulls. Es el formato normal de trabajo, no el
error de una entrega puntual.

**Adaptarlo es un paso propio del proceso y ya está automatizado** con MCP y skills del equipo. Antes
de escribir un script de normalización desde cero, preguntá cuál corresponde usar. No lo reportes
como si fuera una sorpresa ni le pidas al diseñador que cambie cómo entrega: no va a pasar, y no
hace falta.

La lista de qué se normaliza está en el [README](README.md#normalizar-una-entrega-del-diseñador).
`tools/build-recap-master.mjs` es la versión de ese proceso para el recap unificado.

Corolario al comparar una entrega nueva contra lo que está en producción: **lo de producción suele
estar mejor**, porque ya pasó por la normalización. Que el archivo nuevo esté "más crudo" no es razón
para no integrarlo, pero tampoco lo es para reemplazar sin más: hay que mirar qué cambió de verdad en
el arte y traer sólo eso.

## Radio de explosión

**`index.js` lo cargan 39 páginas.** Es el motor compartido de casi todo el aire. Cualquier cambio ahí
se verifica contra los demás templates antes de commitear, no sólo contra el que estás tocando.

`lottie.js` y `webcg-framework.umd.js` son librerías de terceros versionadas en el repo. No se tocan.

## Levantar y ver

No hay build de aplicación ni dev server: son archivos estáticos. Pero **no sirve abrirlos con
`file://`** (los `fetch` y los XHR de lottie mueren por CORS). Siempre por HTTP:

```bash
python3 -m http.server 8099 --bind 127.0.0.1 &
# después: http://localhost:8099/recap-uni/index.html
```

## Verificar en navegador

Chromium está preinstalado; Playwright no, pero se instala sin bajar navegador:

```bash
cd <un scratchpad, no el repo>
npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright
```

```js
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
await page.goto('http://localhost:8099/recap-uni/index.html');
await page.evaluate((d) => window.data(d), payload);   // como CG ADD
await page.evaluate(() => window.play());              // como CG PLAY
```

Para congelar la imagen y comparar, parar **todas** las animaciones registradas, no sólo la principal
— el fondo corre como una animación aparte en `#loop`:

```js
await page.evaluate((f) => {
  window.lottie.getRegisteredAnimations().forEach((a) => a.goToAndStop(f, true));
}, 200);   // frame 200: el alfa ya abrió (barre entre el 24 y el 48) y todavía no entró al loop
```

Si no te interesa la transición, `await page.route('**/*.png', r => r.abort())` acelera bastante.

`executablePath` tiene que apuntar al build que esté cacheado, y el `playwright` que instales tiene
que ser el que pide **ese** build: si no coinciden, el launch falla pidiendo bajar navegadores. En
macOS el cacheado vive en `~/Library/Caches/ms-playwright/chromium-<build>/chrome-mac-arm64/`, y el
binario se llama `Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.

Para comparar contra el estado anterior **no hace falta `git stash`**: serví la versión de `HEAD` con
un route, y el working tree queda como está.

```js
await page.route('**/data.json', (r) =>
  r.fulfill({ contentType: 'application/json', body: headJson }));
```

### Trampas al testear — todas costaron un bug que se escapó

1. **Mandá el payload en el evento `load`, no después.** CasparCG lo manda apenas carga la página. Un
   test que hace `goto()` y *después* `data()` le da al template cientos de milisegundos de ventaja y
   no ejercita la carrera real. Así se escapó que la lista de juegos se perdía en 4 de cada 5 cargas.
2. **Pedí colores que NO existan en el diseño.** Si mandás el mismo color que ya tiene el bolo, la
   captura se ve perfecta aunque el mecanismo esté muerto. Usá magenta y compará el `fill` computado.
   Así se escapó que ninguno de los 13 bolos recoloreables respondía al payload.
3. **No leas `textContent` de un bolo.** Arrastra glifos viejos ocultos: si el valor era `"100"` y
   mandás `"25"`, devuelve `"250"` aunque en pantalla se lea `25`. Medí por bounding box.
4. **El bounding box es el del grupo, no el del `<text>`.** lottie renderiza **un `<text>` por
   glifo**: con `"25"` hay dos. `g.bola1 text` te devuelve sólo el `"2"` y parece que el template
   trunca el payload. Medí `g.bola1`. Corolario: un assert de "sigue centrado" se hace sobre el
   grupo — el centro de cada glifo suelto se corre, el del grupo no.
5. **La `@font-face` la registra `fFamily`, no `fName`.** Un assert tipo
   `[...document.fonts].some(f => f.family.includes("Montserrat-Medium"))` no matchea nunca: la
   familia es `"Montserrat"` a secas. Para afirmar que llegó la fuente que querías, compará el
   base64 que quedó inyectado en el `<style>` contra el del JSON, y usá `document.fonts.check()`
   para descartar que haya caído a una del sistema.
6. **Afirmá, no mires.** Una captura que "se ve bien" no prueba nada; comparala contra un archivo de
   referencia o contra un valor esperado.

## Reconstruir el recap unificado

```bash
node tools/build-recap-master.mjs
```

Pisa `recap-uni/recap-master.json`, `recap-manifest.json` y `loop.json` — **esos tres son generados,
no se editan a mano**. `recap-uni/images/` sólo se copia si no existe.

El build es determinista: corrido dos veces sobre la misma entrada da archivos idénticos. Si después
de correrlo `git diff recap-uni/` muestra algo que no esperabas, hay un bug en el build o alguien
editó a mano un archivo generado.

Para retocar cómo se ve el gráfico **no hace falta reconstruir nada**: la tabla de layout vive en
`recap-uni/recap-layout.js`.

## Copiar a los servers

```bash
rsync -a --delete --exclude-from=.deployignore ./ usuario@server:/ruta/ZFX-LotoReal-html/
```

`.deployignore` saca ~70 MB de 366 que no carga ningún template. La lista se armó contra las **38
rutas que el controlador invoca con `CG.Add`** (repo `leonedo/LotoReal`, `FormaPrincipal.vb`), no
adivinando desde el repo. Si vas a agregarle una línea, comprobá contra esas rutas primero: hay tres
referencias que no se ven grepeando ingenuamente, y están anotadas en el encabezado del archivo.

## Convenciones a respetar

- **`index.js` está en CRLF.** Varios editores lo pasan a LF al guardar y eso convierte el diff en el
  archivo entero. Verificalo con `file index.js` antes de commitear.
- Los mensajes de commit y los comentarios del código van **en español**, como el resto del repo.
- Los templates viejos (`recaps/`, `recap/`) se dejan en su lugar hasta que el unificado se estabilice:
  son el plan de rollback.
- `New_aug_2026/` es material crudo del diseñador. Sus imágenes están deduplicadas contra
  `recap-uni/images/` (los JSON apuntan ahí por ruta relativa), así que borrar esa carpeta de
  producción rompe las entregas de referencia.

## Cosas rotas conocidas, preexistentes

No son regresiones; si las tocás, que sea a propósito.

- `host/index.html` pide `host.json` pero el archivo es `Host.json`. Anda en Windows, falla en
  cualquier sistema sensible a mayúsculas.
- El controlador invoca dos templates que no existen acá, desde código **activo** (visto en
  `LotoReal` v3.3.4): `autoridades/index_4` (sólo hay `index_1..3`) y `recaps/LP` (hay
  `LP-LotoR.html`, no `LP.html`). Si esas dos salidas fallan en aire, es esto y no el template.
- `crawl/cintillo.html` no usa `index.js` sino su propio motor (`cintillo.js`).
- Un `UPDATE` que llega después de que la animación principal terminó su tramo de entrada escribe el
  dato pero no se re-renderiza hasta el próximo movimiento. Pasa igual en los recaps viejos.
