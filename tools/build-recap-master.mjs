#!/usr/bin/env node
/**
 * Construye el maestro unificado del recap a partir de la entrega del diseñador.
 *
 *   node tools/build-recap-master.mjs
 *
 * Entrada  New_aug_2026/newDelivery/RECAP_ Posible versión Nocturna en 2 meses/
 *          (el único archivo que trae los 7 juegos y el null Control Central)
 * Salida   recap/recap-master.json     el maestro, con los 7 juegos
 *          recap/recap-manifest.json   qué capa pertenece a qué juego, y el layout por defecto
 *
 * El archivo del diseñador ya trae la arquitectura que necesitamos: cada juego cuelga de un null
 * `Control <Juego>`, y todos esos cuelgan de `Control Central`. Este script no reacomoda nada
 * visualmente — normaliza nombres, repara lo que viene roto y deja el archivo manejable desde código.
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DELIVERY = `${ROOT}/New_aug_2026/newDelivery/RECAP_ Posible versión Nocturna en 2 meses`;
const SRC = `${DELIVERY}/RECAP_ Posible versión Nocturna en 2 meses.json`;
const SRC_IMAGES = `${DELIVERY}/images`;
const SRC_FONDO = `${ROOT}/New_aug_2026/Fondo Recap/Fondo_Recap.json`;

/** Carpeta del template unificado. Autocontenida: es la que se despliega al playout. */
const OUT_DIR = `${ROOT}/recap-uni`;
const OUT_MASTER = `${OUT_DIR}/recap-master.json`;
const OUT_MANIFEST = `${OUT_DIR}/recap-manifest.json`;
const OUT_FONDO = `${OUT_DIR}/loop.json`; // index.js:133 carga el loop externo por este nombre fijo
const OUT_IMAGES = `${OUT_DIR}/images`;

/** Los 7 juegos, en el orden canónico por defecto (el cliente puede mandar otro). */
const GAMES = ['fr', 'cr', 'rr', 'lp', 'lotor', 'ny', 'lr'];

/**
 * Cómo reconocer el null de control de cada juego.
 * Se matchea contra el `nm` del null; el primero que pegue gana.
 * `Null 17` quedó sin nombre en la entrega y es el de Nueva Yol — por eso el match por descendientes.
 */
const CONTROL_RULES = [
  { game: 'fr', nm: /^Control Fecha/i },
  { game: 'cr', nm: /^Control Chance/i },
  { game: 'rr', nm: /^Control Repartidera/i },
  { game: 'lp', nm: /^Control Lott?oPool/i },
  { game: 'lotor', nm: /^Control Lott?oReal/i },
  { game: 'lr', nm: /^Control Loteri/i },
  { game: 'ny', descendant: /_NYR\b/ },
];

const CENTRAL_NM = /^Control Central/i;

/** Markers que index.js necesita para play/loop/stop. Copiados de recaps/CR-RR-LP-LotoR.json. */
const MARKERS = [
  { tm: 0, cm: 'play', dr: 300 },
  { tm: 300, cm: 'name:loop\r\nloopDelay: 1\r\nloopExternal: true', dr: 50 },
  { tm: 650, cm: 'stop', dr: 100 },
];

/**
 * Markers del fondo, que corre como loop externo. Copiados de recaps/loop.json.
 *
 * El `stop` no anima una salida: salta a un tramo de timeline donde ya no hay ninguna capa viva,
 * y la pantalla queda limpia porque no queda nada que dibujar. Así que **tiene que caer después
 * del `op` más alto de todas las capas**, no después del `op` de la composición.
 *
 * En `recaps/loop.json` los dos coincidían en 339 y el 500 sobraba. El fondo nuevo declara `op` 339
 * igual, pero sus capas llegan hasta 866: con el `stop` en 500 quedaban 366 frames de fondo dibujado
 * y la salida no limpiaba. Por eso se calcula acá abajo en vez de quedar fijo.
 */
const MARKERS_FONDO = [
  { tm: 0, cm: 'play', dr: 330 },
  { tm: 50, cm: 'name:loop\r\nloopDelay: 0\r\nloopExternal: false', dr: 280 },
  { tm: 500, cm: 'stop', dr: 100 }, // tm real: lo pisa stopLimpio() con el largo del fondo
];

/**
 * Devuelve los markers con el `stop` corrido a un frame sin capas vivas.
 * Idempotente: si el `stop` ya estaba despejado, no lo mueve.
 */
const stopLimpio = (markers, layers) => {
  const ultimaCapa = Math.max(...layers.map((L) => L.op ?? 0));
  return markers.map((m) => (m.cm === 'stop' && m.tm <= ultimaCapa
    ? { ...m, tm: Math.ceil(ultimaCapa / 10) * 10 + 30 }
    : m));
};

// ---------------------------------------------------------------- helpers

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

/** Lee un valor de una propiedad de transform, animada o no. */
const val = (prop, i, dflt) => {
  if (!prop) return dflt;
  const k = prop.k;
  if (prop.a === 0) return Array.isArray(k) ? k[i] : k;
  const s = k[0].s;
  return Array.isArray(s) ? s[i] : s;
};

/** Posición y escala de una capa en coordenadas de la comp, componiendo toda la cadena de padres. */
const worldOf = (layer, byInd) => {
  const chain = [];
  for (let cur = layer, guard = 0; cur && guard < 64; cur = byInd.get(cur.parent), guard++) {
    chain.push(cur);
  }
  let x = 0;
  let y = 0;
  let s = 1;
  for (const l of chain.reverse()) {
    const ks = l.ks;
    x += s * val(ks.p, 0, 0);
    y += s * val(ks.p, 1, 0);
    s *= val(ks.s, 0, 100) / 100;
    x -= s * val(ks.a, 0, 0);
    y -= s * val(ks.a, 1, 0);
  }
  return { x, y, s: s * 100 };
};

/** Una capa de bolo "plana" es un único path (elipse + relleno) — lottie le pone la clase al <path>,
 *  así que el fill inline de update_color() la repinta. Las que traen grupo de brillo, no. */
const isFlatBall = (layer) => {
  const sh = layer.shapes;
  if (!Array.isArray(sh) || sh.length !== 2) return false;
  return sh[0].ty === 'el' && sh[1].ty === 'fl';
};

const round = (n) => Math.round(n * 1000) / 1000;

const rel0 = (p) => p.replace(`${ROOT}/`, '');

// ---------------------------------------------------------------- carga

let doc;
try {
  doc = JSON.parse(readFileSync(SRC, 'utf8'));
} catch (e) {
  die(`No pude leer el archivo base:\n    ${SRC}\n    ${e.message}`);
}

const layers = doc.layers;
const byInd = new Map(layers.map((l) => [l.ind, l]));

// ---------------------------------------------------------------- 1. nulls de control

const central = layers.find((l) => l.ty === 3 && CENTRAL_NM.test(l.nm || ''));
if (!central) die('No encontré el null `Control Central` en el archivo base.');

const controls = new Map(); // game -> layer
const nulls = layers.filter((l) => l.ty === 3 && l.ind !== central.ind);

/** Todas las capas que cuelgan (directa o indirectamente) de un ind dado. */
const descendantsOf = (ind) => layers.filter((l) => {
  for (let cur = l, guard = 0; cur && guard < 64; cur = byInd.get(cur.parent), guard++) {
    if (cur.parent === ind) return true;
  }
  return false;
});

for (const rule of CONTROL_RULES) {
  let hit;
  if (rule.nm) {
    hit = nulls.find((n) => rule.nm.test(n.nm || '') && !controls.has(rule.game)
      && ![...controls.values()].includes(n));
  } else {
    hit = nulls.find((n) => ![...controls.values()].includes(n)
      && descendantsOf(n.ind).some((l) => rule.descendant.test(l.nm || '')));
  }
  if (!hit) die(`No encontré el null de control del juego "${rule.game}".`);
  controls.set(rule.game, hit);
}

const missing = GAMES.filter((g) => !controls.has(g));
if (missing.length) die(`Faltan nulls de control: ${missing.join(', ')}`);

// `Null 17` viene sin nombre en la entrega — normalizarlo ayuda a leer el JSON después.
controls.get('ny').nm = 'Control NY Real';

/** Devuelve el juego al que pertenece una capa, o null si es compartida (Caja, Alpha, Transition…). */
const controlInds = new Map([...controls].map(([g, l]) => [l.ind, g]));
const gameOf = (layer) => {
  for (let cur = layer, guard = 0; cur && guard < 64; cur = byInd.get(cur.parent), guard++) {
    if (controlInds.has(cur.ind)) return controlInds.get(cur.ind);
    if (cur.parent != null && controlInds.has(cur.parent)) return controlInds.get(cur.parent);
  }
  return null;
};

// ---------------------------------------------------------------- 2. rebase de Control Central
//
// El diseñador dejó Control Central en p=(928,504), a=(0,0), s=91. Con esos valores, escalar el bloque
// también lo desplaza, porque el escalado ocurre alrededor del origen y no del centro de cuadro.
//
// Se re-ancla a `a == p == centro de cuadro`, manteniendo la escala original. Así queda:
//   - `Control Central.ks.s` es la única perilla de escala global, y escala alrededor del centro
//   - la Y de cada juego se despeja con  local = 540 + (mundo − 540) / escala
//
// Antes:   world = P + S·(local − A)
// Después: world = C + S·(local' − C)
//   ⇒ local' = local + (P − C)/S + (C − A)     · las escalas de los hijos no se tocan

const CENTER = [960, 540];
const P = [val(central.ks.p, 0, 0), val(central.ks.p, 1, 0)];
const A = [val(central.ks.a, 0, 0), val(central.ks.a, 1, 0)];
const S = val(central.ks.s, 0, 100) / 100;

if (central.ks.p.a !== 0 || central.ks.s.a !== 0 || central.ks.a.a !== 0) {
  die('`Control Central` tiene transform animado; el rebase asume que es estático.');
}

const SHIFT = [
  (P[0] - CENTER[0]) / S + (CENTER[0] - A[0]),
  (P[1] - CENTER[1]) / S + (CENTER[1] - A[1]),
];

const shiftPos = (prop) => {
  if (prop.a === 0) {
    prop.k[0] = round(prop.k[0] + SHIFT[0]);
    prop.k[1] = round(prop.k[1] + SHIFT[1]);
    return;
  }
  for (const kf of prop.k) {
    for (const field of ['s', 'e']) {
      if (!Array.isArray(kf[field])) continue;
      kf[field][0] = round(kf[field][0] + SHIFT[0]);
      kf[field][1] = round(kf[field][1] + SHIFT[1]);
    }
  }
};

for (const l of layers) {
  if (l.parent === central.ind) shiftPos(l.ks.p);
}

central.ks.p.k = [CENTER[0], CENTER[1], 0];
central.ks.a.k = [CENTER[0], CENTER[1], 0];
central.ks.s.k = [round(S * 100), round(S * 100), 100];

// ---------------------------------------------------------------- 3. renombrar textos y colores

let blanked = 0;
const manifest = {
  games: {}, central: central.ind, center: CENTER, order: GAMES,
  baseScale: round(S * 100),
};
const renames = [];

for (const game of GAMES) {
  const control = controls.get(game);
  const owned = layers.filter((l) => gameOf(l) === game);

  // Textos → <juego>_bolo<N>, numerados de izquierda a derecha.
  const texts = owned.filter((l) => l.ty === 5)
    .map((l) => ({ l, x: worldOf(l, byInd).x }))
    .sort((a, b) => a.x - b.x);

  texts.forEach(({ l }, i) => {
    const cl = `${game}_bolo${i + 1}`;
    renames.push(`${(l.cl || '·').padEnd(18)} → ${cl}`);
    l.cl = cl;
    l.nm = `.${cl}`;
    // La entrega trae los números de la maqueta (75, 25, 50...). Si un juego sale al aire sin que
    // le manden valores, esos números parecen resultados reales. Los recaps viejos vienen en
    // blanco; se hace lo mismo.
    for (const kf of l.t?.d?.k || []) {
      if (kf.s) kf.s.t = '';
      blanked++;
    }
  });

  // Bolos planos → color_<juego>_bolo<N>. Los que traen grupo de brillo (Loto Real, Lotería, Tu Fecha)
  // no se pueden repintar con update_color() y se dejan con su color fijo.
  const balls = owned.filter((l) => l.ty === 4 && isFlatBall(l))
    .map((l) => ({ l, x: worldOf(l, byInd).x }))
    .sort((a, b) => a.x - b.x);

  // OJO: la clase va en el ítem de RELLENO, no en la capa. lottie le pone la clase de capa a un
  // <g> y la de relleno al <path>; update_color() (index.js:312) escribe `style.fill` en lo que
  // devuelva querySelector, y un style heredado por el <g> NO le gana al atributo `fill` que el
  // <path> hijo trae puesto. Los recaps viejos que funcionan la tienen en shapes[].cl, en el `fl`.
  // Poner las dos sería peor: el <g> va antes en el documento y querySelector se quedaría con él.
  balls.forEach(({ l }, i) => {
    const cl = `color_${game}_bolo${i + 1}`;
    const fill = (l.shapes || []).find((s) => s.ty === 'fl');
    if (!fill) {
      die(`La capa ${l.ind} (${l.nm}) de "${game}" no tiene relleno donde poner ${cl}.`);
    }
    renames.push(`${(fill.cl || '·').padEnd(18)} → ${cl}`);
    fill.cl = cl;
    l.nm = `.${cl}`;
  });

  if (balls.length && balls.length !== texts.length) {
    console.warn(`  ! ${game}: ${texts.length} textos pero ${balls.length} bolos recoloreables`);
  }

  const world = worldOf(control, byInd);
  manifest.games[game] = {
    control: control.ind,
    bolos: texts.length,
    recolorable: balls.length > 0,
    defaultY: round(world.y),
    x: round(world.x),
    layers: owned.map((l) => l.ind).sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------- 4. manzanitas

// index.js despacha la opacidad buscando la subcadena "opacidad" en la clave del payload
// (index.js:200). La entrega nueva las renombró a Manzanita_* y dejó de disparar.
let manzanitas = 0;
for (const l of layers) {
  const m = /^Manzanita_(\w+)$/.exec(l.cl || '');
  if (!m) continue;
  l.cl = `opacidad_manzanita_${m[1].toLowerCase()}`;
  l.nm = `.${l.cl}`;
  manzanitas++;
}

// ---------------------------------------------------------------- 5. track mattes en capas que no pintan
//
// La entrega trae `tt`/`tp` en tres nulls (Control Fecha, Control NY Real, Control Loterial Real).
// Un null no dibuja nada, así que enmascararlo no significa nada — pero lottie igual intenta resolver
// el matte y tira `element.setMatte is not a function` al construir el DOM, con lo cual la animación
// nunca dispara DOMLoaded y el archivo directamente no se ve. Los recaps viejos no tienen ninguno.
const NON_RENDERING = new Set([3, 6]); // 3 = null, 6 = audio
let mattesStripped = 0;
for (const l of layers) {
  if (!NON_RENDERING.has(l.ty) || l.tt == null) continue;
  delete l.tt;
  delete l.tp;
  mattesStripped++;
}

// ---------------------------------------------------------------- 5b. capa de audio embebida
//
// La entrega mete el SFX como capa de audio dentro del Lottie (ty 6). El lottie.js del proyecto no
// tiene `audioFactory` configurado, así que su AudioElement queda con un stub sin `pause()` y
// cualquier goToAndStop/pause tira `this.audio.pause is not a function`. Ningún recap viejo trae
// capas de audio: el SFX se dispara desde index.js con el <audio id="sfxOut"> y `audio_inframe`,
// que es lo que ya hace recap-uni/index.html. Se quitan.
const audioLayers = layers.filter((l) => l.ty === 6);
for (const l of audioLayers) layers.splice(layers.indexOf(l), 1);
doc.assets = doc.assets.filter((a) => !String(a.p || '').toLowerCase().endsWith('.mp3'));

// ---------------------------------------------------------------- 5c. rutas de los assets
//
// El template tiene que ser autocontenido: su carpeta `images/` al lado del JSON. El archivo de
// entrada puede traer cualquier `u` (después de deduplicar las imágenes de la entrega, las suyas
// apuntan a esta misma carpeta por un camino relativo largo), así que se normaliza siempre.
for (const a of doc.assets) {
  if (a.p) a.u = 'images/';
}

// ---------------------------------------------------------------- 6. markers

if (!doc.markers || doc.markers.length === 0) doc.markers = MARKERS;

// ---------------------------------------------------------------- 7. chequeos

// Sólo las clases a las que el payload le escribe tienen que ser únicas — index.js las resuelve con
// querySelector y se quedaría con la primera. Las decorativas (linea, FX_Bola…) se repiten a propósito.
const isBound = (cl) => /^(?:\w+_bolo\d+|color_\w+|opacidad_\w+|logo_\w+|t_resultados)$/i.test(cl);
const seen = new Map();
const claim = (cl, where) => {
  if (!cl || !isBound(cl)) return;
  if (seen.has(cl)) die(`Clase de datos duplicada "${cl}" (${seen.get(cl)} y ${where}).`);
  seen.set(cl, where);
};
for (const l of layers) {
  claim(l.cl, `capa ${l.ind}`);
  // las clases de color viven en el ítem de relleno, no en la capa
  for (const sh of l.shapes || []) claim(sh.cl, `relleno de la capa ${l.ind}`);
}

const totalBolos = GAMES.reduce((n, g) => n + manifest.games[g].bolos, 0);
const EXPECTED = { fr: 1, cr: 5, rr: 1, lp: 4, lotor: 6, ny: 3, lr: 3 };
for (const [g, n] of Object.entries(EXPECTED)) {
  if (manifest.games[g].bolos !== n) {
    die(`El juego "${g}" quedó con ${manifest.games[g].bolos} bolos, se esperaban ${n}.`);
  }
}

// ---------------------------------------------------------------- salida

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_MASTER, JSON.stringify(doc));
writeFileSync(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

// El fondo va aparte y lo corre index.js como loop externo, que lo busca como `loop.json`
// al lado del template. Viene sin markers igual que el maestro.
const fondo = JSON.parse(readFileSync(SRC_FONDO, 'utf8'));
if (!fondo.markers || fondo.markers.length === 0) {
  fondo.markers = stopLimpio(MARKERS_FONDO, fondo.layers);
}
writeFileSync(OUT_FONDO, JSON.stringify(fondo));

// La secuencia de transición vive en `images/` relativo al JSON. `recap-uni/images/` es la copia
// canónica y va versionada, así que en un clon limpio ya está y no hay nada que copiar. La copia
// sólo corre la primera vez, cuando todavía existe la carpeta original de la entrega — que después
// se dedupe contra ésta justamente para no tener el mismo material dos veces.
let copied = 'ya estaba';
if (!existsSync(OUT_IMAGES)) {
  if (!existsSync(SRC_IMAGES)) {
    die(`Falta ${rel0(OUT_IMAGES)} y tampoco está la carpeta original en\n    ${rel0(SRC_IMAGES)}`);
  }
  cpSync(SRC_IMAGES, OUT_IMAGES, { recursive: true });
  copied = 'copiada';
}

console.log(`\n  Maestro del recap construido`);
console.log(`  ${'─'.repeat(58)}`);
for (const g of GAMES) {
  const m = manifest.games[g];
  console.log(
    `  ${g.padEnd(6)} ${String(m.bolos).padStart(2)} bolos   Y=${String(m.defaultY).padStart(7)}`
    + `   ${m.recolorable ? 'color dinámico' : 'color fijo'}`,
  );
}
console.log(`  ${'─'.repeat(58)}`);
console.log(`  ${totalBolos} bolos · ${manzanitas} manzanitas · ${renames.length} clases renombradas`);
console.log(`  track mattes quitados: ${mattesStripped} · capas de audio quitadas: ${audioLayers.length}`);
console.log(`  textos de maqueta vaciados: ${blanked}`);
console.log(`  markers: ${doc.markers.map((m) => (m.cm.split('\r')[0])).join(', ')}`);
const rel = rel0;
console.log(`\n  → ${rel(OUT_MASTER)}`);
console.log(`  → ${rel(OUT_MANIFEST)}`);
console.log(`  → ${rel(OUT_FONDO)}  (fondo + markers)`);
console.log(`  → ${rel(OUT_IMAGES)}/  (${copied})\n`);
