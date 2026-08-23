# Desplegar al playout

El artefacto de deploy es el **zip del Release** de GitHub ("Source code (zip)"). No se hace `rsync`
del repo ni se copian carpetas a mano.

```
1. GitHub → Releases → la versión que corresponda → Source code (zip)
2. descomprimir en el server, en la ruta que CasparCG tiene configurada como carpeta de templates
```

El zip trae **664 archivos, 236.8 MB** (49.4 MB comprimido). El repo completo son 288.5 MB: la
diferencia la saca `.gitattributes` con `export-ignore`.

## Qué queda afuera, y por qué

Cada línea de `.gitattributes` se verificó contra el repo del controlador (`leonedo/LotoReal`) en
**sus tres ramas** — `master`, `recap-uni-horarios` y `lr-2025` — no adivinando desde este repo.

| patrón | MB | por qué |
|---|---:|---|
| `/acumulado/data.all.json` | 25.7 | Es un Lottie completo pero **huérfano**: no tiene markers, y para que CasparCG lo alcance haría falta un `acumulado/resultado.html` que no existe en ninguna rama. Las otras 9 carpetas sí tienen ese HTML y por eso su `data.all.json` **se queda** |
| `/sueño-real` | 13.3 | Nombre viejo de Chance Real. Ninguna de las 3 ramas lo invoca. `lr-2025` sí manda datos `sr_bolo*`, pero al recap (`recap/recap_1..5`), no a esta carpeta |
| `/lt-chance/loop_old.json` | 7.1 | Copia de referencia de la entrega de marzo; la que se usa es `lt-chance/loop.json` |
| `/tools` | 3.9 | El build del recap unificado y sus dos JSON de entrada. Corre en la máquina de desarrollo; lo que sale de ahí es `recap-uni/` |
| `/recap/recap_5.bk.json` | 0.9 | Backup con 50 referencias a imágenes inexistentes. **`recap/recap_5.json` sí se usa** (`lr-2025`): lo que se excluye es el `.bk` |
| `/webcg-devtools.umd.js` | 0.8 | Herramienta de desarrollo; ningún HTML la carga |
| `/.vscode` | — | Config del editor |
| `*.md` salvo `/README.md` | — | Documentación. Este archivo también queda afuera: es para quien publica, no para el server |

**Criterio**: afuera la documentación y las herramientas; **los gráficos se quedan aunque no estén
en uso hoy**, porque una versión anterior o posterior del controlador puede invocarlos. Lo que se
excluyó son gráficos *huérfanos* (sin ningún HTML que los cargue en ninguna versión), no gráficos
sin uso actual.

`.DS_Store` no figura: nunca estuvo trackeado, así que jamás entró al zip.

## Las 43 rutas que el controlador invoca

Unión de las tres ramas. **Esta es la fuente de verdad**: si un archivo no está acá ni lo pide
alguno de estos HTML, es candidato a excluirse.

| ruta | ruta | ruta |
|---|---|---|
| `acumulado/index` | `lt-chance/resultado` | `recap/recap_4` |
| `autoridades/index_1` | `lt-fecha-real/index` | `recap/recap_5` |
| `autoridades/index_2` | `lt-fecha-real/resultado` | `recap/recap_6` |
| `autoridades/index_3` | `lt-ny-real/index` | `recaps/CR-RR` |
| `autoridades/index_4` ⚠️ | `lt-ny-real/resultado` | `recaps/CR-RR-LotoR` |
| `crawl/Cintillo` ⚠️ | `lt-pega4/index` | `recaps/CR-RR-LP` |
| `host/index` | `lt-pega4/resultado` | `recaps/CR-RR-LP-LotoR` |
| `logo/index` | `lt-repartidera/index` | `recaps/FR-PR-LP-NY-LR` |
| `loteria-real/index` | `lt-repartidera/resultado` | `recaps/LotoR` |
| `loteria-real/resultado` | `recap-uni/index` | `recaps/LP` ⚠️ |
| `loto-pool/index` | `recap/CR-RR-LP` ⚠️ | `recaps/LP-LotoR` |
| `loto-pool/resultado` | `recap/CR-RR-LP-LotoR` ⚠️ | `slates/countdown` ⚠️ |
| `loto-real/index` | `recap/recap_1` | `slates/Slate` |
| `loto-real/resultado` | `recap/recap_2` |  |
| `lt-chance/index` | `recap/recap_3` |  |

⚠️ = el controlador la invoca pero **no resuelve**. Son bugs preexistentes del controlador o del
repo, no del deploy:

- `autoridades/index_4` — no existe; sólo hay index_1..3
- `recaps/LP` — el archivo es LP-LotoR.html
- `recap/CR-RR-LP` — no existe; recap/ tiene recap_1..6
- `recap/CR-RR-LP-LotoR` — no existe; recap/ tiene recap_1..6
- `crawl/Cintillo` — el archivo es crawl/cintillo.html (minúscula)
- `slates/countdown` — el archivo es slates/Countdown.html (mayúscula)

## Antes de agregar una línea a `.gitattributes`

1. Comprobá que ninguna de las 43 rutas lo cargue, ni directa ni indirectamente (un HTML puede pedir
   un JSON, y ese JSON pedir imágenes por ruta relativa).
2. `git check-attr export-ignore -- <ruta>` para confirmar que el patrón matchea lo que creés — y
   que **no** matchea de más.
3. Regenerá el zip y contá: `git archive --format=zip -o /tmp/t.zip <tag>` y comparalo contra el
   anterior.

### Cuatro formas de referencia que un grep ingenuo no encuentra

- **Mayúsculas.** `host/index.html` pide `host.json` y el archivo es `Host.json`. El controlador
  invoca `crawl/Cintillo` y el archivo es `crawl/cintillo.html`. Y `slates/countdown` contra
  `slates/Countdown.html`. En Windows anda; en cualquier sistema sensible a mayúsculas, no.
- **Rutas armadas en runtime.** `logo/` se invoca como `$"ZFX-LotoReal-html/logo/{logo}"`: buscar el
  literal no encuentra nada.
- **Mismo nombre en varias carpetas.** Hay **10** `data.all.json` y **8 quedan en el zip**: se van el
  de `acumulado/` (huérfano) y el de `sueño-real/` (arrastrado con su carpeta). Por eso el patrón va
  anclado con `/` inicial — un `data.all.json` suelto rompe los 8 `resultado.html` que sí lo cargan.
- **NFD vs NFC.** macOS guarda `sueño-real` en NFD y git en NFC. El patrón de `.gitattributes` tiene
  que estar en **NFC** o no matchea nunca.

### `sequence/full/images/` no se excluye

No la usan sólo `recap/` y `recaps/`: también `recap-uni/`, cuyos 50 frames de transición salen de
ahí en vez de estar duplicados. Se queda incluso cuando se borren los recaps viejos.

## Límites de `export-ignore`

- **Sólo aplica al commit que se taggea.** Un release taggeado antes de que existiera
  `.gitattributes` genera el zip viejo y completo. Los releases hasta `v1.0.7` no cambian.
- **No es seguridad.** Los archivos excluidos siguen en la historia del repo y en cualquier clon.
- **`.gitattributes` no lleva reglas `text` ni `eol`.** `index.js` está en CRLF y lo cargan 39
  páginas; una normalización de finales de línea lo reescribiría entero.
- Para probar cambios sin commitear: `git archive --worktree-attributes ...`. Sin ese flag, git lee
  el `.gitattributes` del commit y parece que la lista no hace nada.
