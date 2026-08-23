/**
 * Recap unificado — decide qué juegos se ven, dónde y a qué tamaño.
 *
 * Compone el gráfico mutando el JSON del maestro ANTES de que lottie lo construya, y recién ahí le
 * avisa a index.js que puede arrancar (vía window.RECAP_BOOT). Así no hay que tocar el SVG ya armado
 * ni pelearse con los track mattes: todo el contenido cuelga de un único alfa global y las posiciones
 * son estáticas, así que reacomodar antes de cargar es determinista.
 *
 * Tres cosas se tocan por juego:
 *   - `hd: true` en sus capas si está apagado (lottie ni las renderiza)
 *   - la posición de su null `Control <Juego>` si está prendido
 *   - `Control Central.ks.s`, la escala del bloque entero
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ tabla de layout
  //
  // Las cuatro combinaciones que el cliente usa en el aire llevan las posiciones EXACTAS que dejó el
  // diseñador en sus archivos, medidas de la Y de mundo de cada null `Control`. Cualquier otra
  // combinación se calcula. Para retocar el gráfico se toca acá y nada más.
  //
  // El set se identifica por sus juegos ordenados, no por el orden en que los pida el operador, así
  // que "cr,rr,lp,lotor,lr" y "lr,cr,rr,lp,lotor" caen los dos en la fila exacta; lo único que cambia
  // es a qué fila va cada juego.

  var LAYOUT = {
    // set ordenado alfabéticamente -> { scale, rows: [Y de cada juego, de arriba hacia abajo] }
    exact: {
      'lr': { scale: 101.8, rows: [537.24] },                                    // Lotería Real sola
      'fr,lp,lr,ny': { scale: 100, rows: [257.87, 411.45, 561.03, 731.61] },      // Diurna
      'cr,lotor,lp,lr,rr': { scale: 100, rows: [253.62, 388.88, 535.96, 675.39, 845.61] }, // Completa noche
      'cr,fr,lotor,lp,lr,ny,rr': {                                               // Nocturna 2026
        scale: 91,
        rows: [229.06, 336.78, 447.09, 566.38, 670.50, 785.71, 909.83],
      },
    },

    // Para las combinaciones que no están arriba. `pitch` es la separación entre juegos SIN contar
    // el respiro extra: los valores salen de despejarlo de los archivos medidos, (span − extra)/(n−1).
    byCount: {
      1: { pitch: 0, centerY: 537.24, scale: 101.8 },
      2: { pitch: 158, centerY: 520, scale: 100 },
      3: { pitch: 154, centerY: 505, scale: 100 },
      4: { pitch: 150.58, centerY: 494.74, scale: 100 },   // derivado de Diurna
      5: { pitch: 142.50, centerY: 549.62, scale: 100 },   // derivado de Completa noche
      6: { pitch: 126, centerY: 560, scale: 95 },
      7: { pitch: 109.80, centerY: 569.44, scale: 91 },    // derivado de Nocturna 2026
    },

    // Lotería Real respira un poco más arriba; está así en las tres versiones que la incluyen.
    extraGapBefore: { lr: 22 },

    // Centro alrededor del cual escala Control Central (el build lo dejó anclado ahí).
    center: 540,
  };

  // Orden por defecto si el cliente no manda uno. El del payload manda siempre que venga.
  var DEFAULT_ORDER = ['fr', 'cr', 'rr', 'lp', 'lotor', 'ny', 'lr'];

  // Último recurso: si no llega ni ?games=, ni un payload, ni un play, se arranca igual con todos
  // los juegos en vez de dejar el aire en negro. Los bolos salen vacíos, no con valores de maqueta.
  // Es holgado a propósito: lo que normalmente cierra la decisión es el play, no este reloj.
  var FALLBACK_MS = 8000;

  var MASTER = 'recap-master.json';

  // ------------------------------------------------------------------ helpers

  function log() {
    var args = ['[recap]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  // casparcg manda los valores como string, como { text: '...' } o, por JSON, como array
  function asText(v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'text' in v) return v.text;
    if (Array.isArray(v)) return v.join(',');
    if (typeof v === 'number') return String(v);
    return v;
  }

  function parseGames(raw, known) {
    var text = asText(raw);
    if (typeof text !== 'string') return null;
    var wanted = text.split(/[,;\s]+/)
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(Boolean);
    if (!wanted.length) return null;

    var out = [];
    var unknown = [];
    wanted.forEach(function (g) {
      if (known.indexOf(g) === -1) unknown.push(g);
      else if (out.indexOf(g) === -1) out.push(g);
    });
    if (unknown.length) log('juego(s) desconocido(s), se ignoran:', unknown.join(', '));
    if (!out.length) {
      log('la lista de juegos no tenía ninguno válido:', JSON.stringify(text));
      return null;
    }
    return out;
  }

  /** Interpola la fila de `byCount` para una cantidad que no esté listada. */
  function layoutFor(n) {
    var table = LAYOUT.byCount;
    if (table[n]) return table[n];
    var counts = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
    var lo = counts[0];
    var hi = counts[counts.length - 1];
    if (n <= lo) return table[lo];
    if (n >= hi) return table[hi];
    for (var i = 0; i < counts.length - 1; i++) {
      if (n > counts[i] && n < counts[i + 1]) {
        var a = table[counts[i]];
        var b = table[counts[i + 1]];
        var t = (n - counts[i]) / (counts[i + 1] - counts[i]);
        return {
          pitch: a.pitch + (b.pitch - a.pitch) * t,
          centerY: a.centerY + (b.centerY - a.centerY) * t,
          scale: a.scale + (b.scale - a.scale) * t,
        };
      }
    }
    return table[hi];
  }

  /** Y de cada fila (en coordenadas de cuadro) y escala del bloque, para el set pedido. */
  function planFor(games) {
    var key = games.slice().sort().join(',');
    var exact = LAYOUT.exact[key];
    if (exact && exact.rows.length === games.length) {
      return { rows: exact.rows.slice(), scale: exact.scale, source: 'medido' };
    }
    var conf = layoutFor(games.length);
    var offsets = [0];
    for (var i = 1; i < games.length; i++) {
      offsets.push(offsets[i - 1] + conf.pitch + (LAYOUT.extraGapBefore[games[i]] || 0));
    }
    var top = conf.centerY - offsets[offsets.length - 1] / 2;
    return {
      rows: offsets.map(function (o) { return top + o; }),
      scale: conf.scale,
      source: 'calculado',
    };
  }

  // ------------------------------------------------------------------ composición

  function compose(master, manifest, games) {
    var byInd = {};
    master.layers.forEach(function (l) { byInd[l.ind] = l; });

    // 1. prender y apagar. Los nulls no se tocan: no pintan nada y sí llevan la transformación
    //    de los hijos, así que esconderlos no aporta y puede confundir a lottie.
    Object.keys(manifest.games).forEach(function (g) {
      var hidden = games.indexOf(g) === -1;
      manifest.games[g].layers.forEach(function (ind) {
        var layer = byInd[ind];
        if (layer && layer.ty !== 3) layer.hd = hidden;
      });
    });

    // 2. repartir las filas
    var plan = planFor(games);
    var scale = plan.scale / 100;
    var C = LAYOUT.center;

    games.forEach(function (g, idx) {
      var info = manifest.games[g];
      if (!info) return;
      var control = byInd[info.control];
      if (!control) return;
      if (control.ks.p.a !== 0) {
        log('el control de', g, 'tiene la posición animada; no se reacomoda');
        return;
      }
      // Control Central escala alrededor del centro de cuadro, así que la posición local del null
      // se despeja de:  mundo = centro + escala · (local − centro)
      control.ks.p.k[1] = C + (plan.rows[idx] - C) / scale;
      // La X también la arrastra la escala, y el diseñador la dejó fija en todas sus versiones
      // (Tu Fecha en 577.75 con escala 100 y 580.16 con 91: 2.4px). Se compensa para que la X de
      // mundo sea siempre la del maestro, sin importar a cuánto quede el bloque.
      control.ks.p.k[0] = 960 + (info.x - 960) / scale;
    });

    // 3. escala global
    var central = byInd[manifest.central];
    if (central) {
      if (central.ks.s.a !== 0) log('Control Central tiene la escala animada; no se reescala');
      else central.ks.s.k = [plan.scale, plan.scale, 100];
    }

    log('compuesto:', games.join(' → '), '| escala', plan.scale + '%', '| layout', plan.source);
    return master;
  }

  // ------------------------------------------------------------------ de dónde salen los juegos

  // El listener de `data` se registra ACÁ, al evaluar el módulo, y no adentro de una promesa.
  // index.js registra el suyo apenas se evalúa, un instante después, y casparcg manda el payload
  // en cuanto la página termina de cargar — mucho antes de que resuelva el fetch del maestro
  // (821 KB). Si se esperara a eso, el payload llegaría antes que el listener y la lista de juegos
  // se perdería. Se guarda el primer payload y `resolveGames()` lo consulta cuando esté listo.
  var pending = null;    // primer payload recibido
  var playAsked = false; // llegó un play
  var onPayload = null;  // aviso para resolveGames() si ya está esperando
  var onPlay = null;

  if (typeof webcg !== 'undefined') {
    webcg.on('data', function (data) {
      if (!data || pending) return;
      pending = data;
      if (onPayload) onPayload(data);
    });
    // El play es lo que de verdad cierra la decisión: mientras nadie mande a reproducir se puede
    // seguir esperando la lista de juegos, y así un flujo que precarga el template y manda los
    // datos más tarde no queda condenado al fallback por un reloj.
    // index.js encola su propio play contra animPromise, que resuelve después de este boot.
    webcg.on('play', function () {
      playAsked = true;
      if (onPlay) onPlay();
    });
  }

  /**
   * Resuelve la lista de juegos activos, en este orden de prioridad:
   *   1. ?games=cr,rr,lp en la URL — se sabe al cargar, sin esperar nada
   *   2. la clave `juegos` del primer payload de casparcg (aunque haya llegado antes que esto)
   *   3. a los FALLBACK_MS, todos los juegos
   */
  function resolveGames(known) {
    return new Promise(function (resolve) {
      var done = false;
      function settle(games, from) {
        if (done) return;
        done = true;
        onPayload = null;
        onPlay = null;
        log('juegos desde', from + ':', games.join(', '));
        resolve(games);
      }

      var fromUrl = parseGames(new URLSearchParams(location.search).get('games'), known);
      if (fromUrl) return settle(fromUrl, 'la URL');

      function tryPayload(data) {
        var games = parseGames(data.juegos || data.games, known);
        if (games) settle(games, 'el payload');
      }

      if (pending) tryPayload(pending);
      if (done) return;

      function giveUp(from) {
        // Si llegó un payload pero sin `juegos` usable, igual se sale con todos.
        settle(known.slice(), from);
      }

      if (playAsked) return giveUp('el play (sin lista de juegos)');

      onPayload = tryPayload;
      onPlay = function () { giveUp('el play (sin lista de juegos)'); };
      setTimeout(function () {
        giveUp('el fallback (no llegó ni la lista ni un play)');
      }, FALLBACK_MS);
    });
  }

  // ------------------------------------------------------------------ arranque

  var loaded = Promise.all([
    fetch(MASTER).then(function (r) { return r.json(); }),
    fetch('recap-manifest.json').then(function (r) { return r.json(); }),
  ]);

  window.RECAP_BOOT = function (boot) {
    loaded.then(function (res) {
      var master = res[0];
      var manifest = res[1];
      var known = manifest.order || DEFAULT_ORDER;

      return resolveGames(known).then(function (games) {
        // Se respeta el orden que mandó el cliente, tal cual viene.
        boot(compose(master, manifest, games));
      });
    }).catch(function (err) {
      // Si algo falla acá y no se arranca nada, `anim` nunca existe, animPromise nunca resuelve y
      // el aire queda en negro sin ninguna señal. Mejor salir con los 7 juegos sin componer.
      console.error('[recap] no se pudo componer el gráfico, se sale sin composición:', err);
      try {
        boot(MASTER);
      } catch (e) {
        console.error('[recap] tampoco se pudo cargar el maestro por ruta:', e);
      }
    });
  };
}());
