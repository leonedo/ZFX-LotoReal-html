# Plan: recap unificado, salida de Pega4 y horarios configurables

> Este archivo vive en el repo de templates (`ZFX-LotoReal-html`) pero **el trabajo que describe es
> en el repo del controlador** (`leonedo/LotoReal`). Está acá porque casi todo el contexto que hace
> falta —el contrato de `recap-uni`, la tabla de layout, las trampas de rutas— sale de este lado.
>
> Las rutas a archivos de templates son relativas a este repo; las de `.vb`, al del controlador.

Trabajamos en `leonedo/LotoReal`, la app VB.NET que controla los gráficos de los sorteos de Lotería
Real. Los templates HTML viven en otro repo, `leonedo/ZFX-LotoReal-html`, y del lado de los templates
ya está todo listo: lo que falta es el controlador.

**Creá una rama nueva antes de tocar nada.**

Son tres pedidos que **en el código son casi el mismo cambio**, todos alrededor de
`FormaPrincipal.vb`. Al final dejo lo que necesito que me preguntes; no implementes sin eso.

---

## Contexto: cómo se invoca un gráfico

```vb
CasparDevice.Channels(My.Settings.CanalTemplates - 1).CG.Add(
    CInt(My.Settings.LayerTemplates), 1, "ZFX-LotoReal-html/<carpeta>/<html sin extensión>", True, CGdata)
```

Hay 38 rutas literales así. Sólo dos se arman dinámicamente: `$"ZFX-LotoReal-html/logo/{logo}"`
(`:957`) y `grafico_recap`.

Los números de línea son de la **v3.3.4 (21-mar-2026)**. Si la rama avanzó pueden estar corridos:
verificá antes de citarlos.

## Contexto: la maquinaria de configuración de juegos

Es la pieza central de los tres pedidos. Está en `FormaPrincipal.vb:2505-2600`:

```vb
Private Enum Juegos
    FechaReal : Pega4 : ChanceReal : NuevaYol : LotoPool : LoteriaReal : LotoReal : Repartidera
End Enum

Private Configurations As New Dictionary(Of String, Juegos()) From {
    {"dia",           {FechaReal, Pega4, LotoPool, NuevaYol, LoteriaReal}},
    {"noche",         {ChanceReal, Repartidera, LotoPool}},
    {"nocheLotoReal", {ChanceReal, Repartidera, LotoPool, LotoReal}},
    {"nocheTodos",    {FechaReal, Pega4, ChanceReal, Repartidera, LotoReal, LotoPool, NuevaYol, LoteriaReal}}
}
```

- `ConfigJuegos()` (`:2536`) elige el `configName` con `DiaDeLotoReal()` e `IsItNightTime()`, y llama
  a `ApplyConfiguration(configName)` (`:2566`).
- `ApplyConfiguration` acomoda los paneles de la UI **y** setea
  `grafico_recap = GetRecapGraphic(configName)` (`:2596`).
- `GetRecapGraphic` (`:2626`) es un árbol de `If` anidados que devuelve una de ~7 rutas HTML
  distintas (`recaps/CR-RR-LP-LotoR`, `recaps/CR-RR-LP`, `recaps/LP-LotoR`, …).
- `FormaPrincipal.vb:2615` tiene una versión **vieja y comentada** de la misma función que devuelve
  rutas de `recap/` (singular). Es código muerto: no la sigas, pero tampoco la borres sin preguntar.

**Ojo con `"nocheTodos"`: es inalcanzable.** Las tres referencias a `My.Settings.NocheTodosLosJuegos`
que lo activarían están comentadas (`:2541`, `:2543`, y en `ButtonJuegosDia_Click`). Así que esa
entrada del dict y su `Case` en `GetRecapGraphic` son código muerto. Preguntame qué hacer con eso.

---

## Pedido 1 — Recap unificado, en una ruta única

El template nuevo es **`ZFX-LotoReal-html/recap-uni/index`**: un solo gráfico que muestra cualquier
subconjunto de 7 juegos, en el orden que le mandes. **Decisión ya tomada: se implementa como una
ruta única**, no como varios HTML.

Su contrato está en `recap-uni/README.md` del repo de templates — **leelo antes de escribir el
mapeo**, es la fuente de verdad. Lo esencial: acepta una clave `juegos` con las claves separadas por
coma, y el orden de esa lista es el orden en pantalla.

El mapeo contra el enum `Juegos` es directo:

| `Juegos` | clave recap-uni | | `Juegos` | clave recap-uni |
|---|---|---|---|---|
| `FechaReal` | `fr` | | `LotoPool` | `lp` |
| `ChanceReal` | `cr` | | `LotoReal` | `lotor` |
| `Repartidera` | `rr` | | `LoteriaReal` | `lr` |
| `NuevaYol` | `ny` | | `Pega4` | **no existe** (ver pedido 2) |

> Cuidado: `lotor` es **Loto Real** y `lr` es **Lotería Real**. Son juegos distintos y se confunden
> muy fácil. El README lo advierte explícitamente.

**Esto es lo que hace el trabajo chico**: `Configurations` ya guarda exactamente lo que `recap-uni`
necesita — una lista ordenada de juegos por configuración. Así que todo el árbol de `If` de
`GetRecapGraphic` colapsa en una ruta fija más un `String.Join(",", …)` sobre el mapeo de arriba. No
hace falta una ruta por combinación nunca más.

**Rollback**: en el repo de templates, `recap/` y `recaps/` se dejan en su lugar a propósito hasta
que el unificado se estabilice. Preguntame si querés la migración directa o detrás de un flag que
permita volver sin recompilar.

## Pedido 2 — Sacar Pega4 de aire

**El sorteo se discontinúa.** No es una animación de salida: hay que retirarlo.

Confirmado con el cliente: **Pega4 y "Pega Real" son el mismo juego.** Eso importa porque
`recap-uni` **ya no lo soporta** — su README dice "Pega Real quedó afuera: no está en ninguna de las
combinaciones que usa el cliente hoy". Los dos pedidos van en la misma dirección, no chocan.

Footprint real, para que dimensiones antes de empezar:

| archivo | menciones |
|---|---|
| `FormaPrincipal.Designer.vb` | 138 (UI: `PanelPega4`, `bt_In_pega4`, `bt_Vi_pega4`, `bt_pega4_1`, `Bt_in_bumper_Pega4`) |
| `FormaPrincipal.vb` | 56 (`pega4(3) As Bola`, región `#Region "Pega4"` en `:1171`, `MyBackgroundThreadPega4Entrada`) |
| `RundownController.vb` | 6 (`Case "Pega4"` → `Templates.Pega4` y → `LotoType.Pega4`) |
| `RundownBuilder.vb` | 2 (los `ComboBoxLoto.Items.AddRange`) |
| `FormaNumber.vb`, `Settings`, `App.config` | 6 |

Puntos que hay que decidir, no asumir:

- **`Configurations`**: `Juegos.Pega4` está en `"dia"` y en `"nocheTodos"`. Sacarlo de `"dia"` la
  deja como `{fr, lp, ny, lr}`, que `recap-uni` cubre entera.
- **Compatibilidad de datos guardados**: la clase `Resultados` se serializa a JSON con una propiedad
  `Pega4` (`:576`) y se deserializa en `:587`. Los JSON ya guardados la traen. Preguntame si hay que
  seguir leyéndolos sin romper.
- **El enum `Juegos`**: sacar el miembro corre los valores de los que siguen. Si algo persiste el
  enum como número, eso corrompe datos. Verificalo antes de tocarlo.
- **UI**: preguntame si el panel y los botones se borran o se ocultan. Ocultar es reversible; borrar
  toca 138 líneas del Designer y es más difícil de revertir.

## Pedido 3 — Horarios configurables, en un módulo oculto

El cliente pidió horarios nuevos, pero **la dirección que queremos no es hardcodearlos**: es un
módulo oculto de configuración donde se puedan definir las ventanas a gusto, sin recompilar. Los
valores concretos te los paso yo; lo que hay que diseñar es el mecanismo.

### Cómo funciona hoy

`ConfigJuegos()` (`:2536`) elige entre tres horarios efectivos:

```vb
If DiaDeLotoReal() Then      configName = "nocheLotoReal"
ElseIf IsItNightTime() Then  configName = "noche"
Else                         configName = "dia"
```

Y las dos funciones que deciden están en `:141-160`, ya parcialmente parametrizadas por settings:

```vb
' My.Settings.LotoRealDays = "3,6"        <- Weekday() arranca en domingo=1, así que es martes y viernes
' My.Settings.LotoRealStartTime = "14:00"
' My.Settings.LotoRealEndTime = "18:00"
Return allowedDays.Contains(Weekday(Today)) AndAlso IsItNightTime()   ' DiaDeLotoReal
Return nowTime >= startTime AndAlso nowTime < endTime                 ' IsItNightTime, default 15:00-23:00
```

**Limitación estructural que hay que resolver**: hay **una sola ventana horaria** en todo el sistema.
`DiaDeLotoReal()` es "día permitido **Y** `IsItNightTime()`", o sea reusa la misma ventana que la
noche. No se puede expresar "martes de 14 a 18" y "resto de noches de 19 a 23" al mismo tiempo. Si
los horarios nuevos necesitan ventanas distintas por día, cambiar settings no alcanza.

### Lo que se quiere

Desde la UI, con libertad total: **para cada día de la semana, un turno día y un turno noche**, y en
cada turno su ventana horaria y qué sorteos están activos. O sea una grilla de 7 × 2 = 14 celdas:

```
DíaSemana -> { dia:   { desde, hasta, juegos() },
               noche: { desde, hasta, juegos() } }
```

`ConfigJuegos()` pasa a ser: mirar el día de hoy, ver en qué turno cae `DateTime.Now`, y de esa celda
salen las dos cosas que hoy salen por caminos separados — el layout de paneles de la UI y la clave
`juegos` del payload del recap.

### La convergencia

Con la ruta única del recap (pedido 1), tres piezas se colapsan en esa grilla:

| hoy | queda como |
|---|---|
| `Configurations` — dict hardcodeado de configName → `Juegos()` | los `juegos()` de cada celda |
| `DiaDeLotoReal()` / `IsItNightTime()` — una ventana global | la ventana de cada celda |
| `GetRecapGraphic()` — árbol de `If` que devuelve ~7 rutas HTML | ruta fija + `juegos` como string |

Los cuatro combos que el diseñador afinó son un buen set inicial para precargar la grilla:
`fr,lp,lr,ny` (Diurna — que es la config `"dia"` de hoy menos Pega4), `cr,lotor,lp,lr,rr`
(Completa noche), `cr,fr,lotor,lp,lr,ny,rr` (Nocturna 2026) y `lr` (Lotería Real sola).

### Riesgo ya descartado: la libertad total no rompe el gráfico

`recap-uni/recap-layout.js` tiene una tabla `exact` con esos 4 combos afinados a mano, **y un
`byCount` que cubre de 1 a 7 juegos**. Cualquier subconjunto que arme el operador renderiza bien; los
`exact` son sólo refinamientos. No hace falta restringir las combinaciones que la UI ofrece.

Dato relacionado: la clave `juegos` **es ordenada** — `"lp,cr,rr"` pone Loto Pool arriba. Si la UI
son sólo checkboxes se pierde el orden, pero el template tiene un `DEFAULT_ORDER`
(`fr, cr, rr, lp, lotor, ny, lr`) que aplica cuando el payload no manda uno. Preguntame si el orden
se configura o alcanza con el default.

### No te compliques

Los dos turnos son **uno cerca del mediodía y otro cerca de las 19-20h**. Eso descarta de entrada
casi todos los casos borde que uno imaginaría:

- **Nada cruza medianoche.** La comparación de hoy (`nowTime >= start AndAlso nowTime < end`) alcanza
  tal cual. No implementes soporte para ventanas que dan la vuelta; si acaso, validá al guardar que
  `desde < hasta` y listo.
- **El solapamiento no es un caso real** con mediodía contra 19-20h. Una validación simple al guardar
  basta, no hace falta resolver precedencias.

Lo único que sí hay que definir: **qué manda cuando la hora no cae en ningún turno** (a las 3 de la
mañana, por ejemplo). Hoy existe un fallback implícito a `"dia"` por el `Else` final de
`ConfigJuegos()`; con la grilla eso desaparece y hace falta un default explícito.

### Lo que hay que decidir, no asumir

- **Qué tan oculto y para quién**: ¿ítem de menú escondido, combinación de teclas, argumento de línea
  de comandos? ¿Lo editamos nosotros o los operadores del cliente? Si lo tocan operadores, la
  validación tiene que ser más firme, porque una config mala saca los gráficos de aire.
- **Dónde persiste**: `My.Settings` ya se usa y aguanta la grilla serializada, pero es incómodo de
  editar y de versionar. Un JSON al lado del ejecutable es más legible y se puede respaldar.
- **Pega4 no va en la lista de sorteos** de la UI: son los 7 de `recap-uni` (ver pedido 2).

---

## Dos rutas rotas, preexistentes, en código activo

El controlador invoca templates que no existen en el repo HTML:

- `FormaPrincipal.vb:1878` → `autoridades/index_4` — sólo existen `index_1`, `index_2`, `index_3`
- `FormaPrincipal.vb:2663` → `recaps/LP` — existe `LP-LotoR.html`, no `LP.html`

Fuera de alcance, pero si tocás `GetRecapGraphic` vas a pasar por la segunda sí o sí. Preguntame.

## Si escribís cualquier script que verifique rutas de template

Tres trampas que dan falsos negativos. Me pasaron las tres:

1. `host/index.html` pide `host.json` y el archivo es `Host.json`. Anda sólo porque Windows no
   distingue mayúsculas.
2. `crawl/cintillo.js` nombra su JSON como `"crawl/Cintillo.json"`, relativo a la raíz del server y
   no a su carpeta. Además `crawl/` no usa el motor compartido.
3. macOS guarda los nombres en NFD: `sueño-real` no matchea contra lo que devuelve git en NFC.

---

## Preguntame antes de implementar

1. **El módulo de horarios**: qué tan oculto, si lo editan los operadores del cliente o sólo
   nosotros, dónde persiste la grilla, y qué manda cuando la hora no cae en ningún turno.
2. **Pega4**: ¿UI borrada u oculta? ¿Hay que seguir leyendo los JSON viejos que traen la propiedad?
3. **Recap unificado**: ¿migración directa, o detrás de un flag con rollback a `recaps/`?
4. **Alcance y orden**: el módulo se come `Configurations` y `GetRecapGraphic`, así que el pedido 1
   sale casi gratis con él — pero es bastante más trabajo que cambiar dos settings. ¿Va todo junto, o
   primero los horarios nuevos a mano y el módulo después?
5. **`"nocheTodos"`**: ¿se revive el flag `NocheTodosLosJuegos`, o se borra como código muerto?
6. Si la rama que tenés delante es la que va a producción (mi referencia es v3.3.4 de marzo).

Sin 1, 2, 3 y 4 no empieces.

Los valores concretos de los horarios nuevos te los paso yo cuando arranques; no los inventes ni los
deduzcas de los nombres de las carpetas del diseñador.
