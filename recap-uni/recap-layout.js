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
 *   - la Y de su null `Control <Juego>` si está prendido
 *   - `Control Central.ks.s`, la escala del bloque entero
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ tabla de layout
  //
  // En coordenadas de cuadro (1920x1080), que es como se ve al aire. Los valores marcados "medido"
  // salen de los archivos que entregó el diseñador para cada versión del cliente; el resto está
  // interpolado. Para retocar el gráfico, se toca acá y nada más.
  //
  //   pitch   separación entre juegos consecutivos
  //   centerY dónde queda el centro del bloque
  //   scale   escala global (Control Central)

  var LAYOUT = {
    byCount: {
      1: { pitch: 0, centerY: 537, scale: 101.8 }, // medido · Lotería Real sola
      2: { pitch: 165, centerY: 520, scale: 100 }, // interpolado
      3: { pitch: 162, centerY: 505, scale: 100 }, // interpolado
      4: { pitch: 158, centerY: 495, scale: 100 }, // medido · Versión Diurna
      5: { pitch: 148, centerY: 550, scale: 100 }, // medido · Completa noche (martes y viernes)
      6: { pitch: 130, centerY: 560, scale: 96 }, //  interpolado
      7: { pitch: 113, centerY: 569, scale: 91 }, //  medido · Posible nocturna 2026
    },

    // Lotería Real necesita un poco más de aire arriba; aparece así en las tres versiones que la traen.
    extraGapBefore: { lr: 22 },

    // El centro alrededor del cual escala Control Central (el build lo dejó anclado ahí).
    center: 540,
  };

  // Orden por defecto si el cliente no manda uno. El del payload manda siempre que venga.
  var DEFAULT_ORDER = ['fr', 'cr', 'rr', 'lp', 'lotor', 'ny', 'lr'];

  // Si no llega ni ?games= ni un payload con `juegos`, se arranca igual con todos los juegos
  // en vez de dejar el aire en negro.
  var FALLBACK_MS = 1500;

  // ------------------------------------------------------------------ helpers

  function log() {
    var args = ['[recap]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  // casparcg manda los valores como string o como { text: '...' }
  function asText(v) {
    if (v && typeof v === 'object' && 'text' in v) return v.text;
    return v;
  }

  function parseGames(raw, known) {
    var text = asText(raw);
    if (typeof text !== 'string') return null;
    var wanted = text.split(/[,;\s]+/)
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(Boolean);

    var out = [];
    wanted.forEach(function (g) {
      if (known.indexOf(g) === -1) {
        log('juego desconocido, se ignora:', g);
      } else if (out.indexOf(g) === -1) {
        out.push(g);
      }
    });
    return out.length ? out : null;
  }

  /** Interpola la fila de la tabla para una cantidad de juegos que no esté listada. */
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

    // 2. repartir las filas y centrar el bloque
    var conf = layoutFor(games.length);
    var offsets = [0];
    for (var i = 1; i < games.length; i++) {
      var extra = LAYOUT.extraGapBefore[games[i]] || 0;
      offsets.push(offsets[i - 1] + conf.pitch + extra);
    }
    var span = offsets[offsets.length - 1];
    var top = conf.centerY - span / 2;
    var scale = conf.scale / 100;

    games.forEach(function (g, idx) {
      var control = byInd[manifest.games[g].control];
      if (!control) return;
      var worldY = top + offsets[idx];
      // Control Central escala alrededor del centro de cuadro, así que la Y local del null
      // se despeja de:  mundo = centro + escala · (local − centro)
      var localY = LAYOUT.center + (worldY - LAYOUT.center) / scale;
      if (control.ks.p.a === 0) {
        control.ks.p.k[1] = localY;
      } else {
        log('el control de', g, 'tiene la posición animada; no se reacomoda');
      }
    });

    // 3. escala global
    var central = byInd[manifest.central];
    if (central) central.ks.s.k = [conf.scale, conf.scale, 100];

    log('compuesto:', games.join(' → '), '| escala', conf.scale + '%', '| paso', Math.round(conf.pitch));
    return master;
  }

  // ------------------------------------------------------------------ de dónde salen los juegos

  /**
   * Resuelve la lista de juegos activos, en este orden de prioridad:
   *   1. ?games=cr,rr,lp en la URL — se sabe al cargar, sin esperar nada
   *   2. la clave `juegos` del primer payload de casparcg
   *   3. a los FALLBACK_MS, todos los juegos
   */
  function resolveGames(known) {
    return new Promise(function (resolve) {
      var done = false;
      function settle(games, from) {
        if (done) return;
        done = true;
        log('juegos desde', from + ':', games.join(', '));
        resolve(games);
      }

      var fromUrl = parseGames(new URLSearchParams(location.search).get('games'), known);
      if (fromUrl) return settle(fromUrl, 'la URL');

      // index.js registra su propio listener de `data` después de éste, así que los valores de los
      // bolos de este mismo payload igual le llegan — no hace falta reenviarle nada.
      if (typeof webcg !== 'undefined') {
        webcg.on('data', function (data) {
          if (done || !data) return;
          var games = parseGames(data.juegos || data.games, known);
          if (games) settle(games, 'el payload');
        });
      }

      setTimeout(function () {
        settle(known.slice(), 'el fallback (no llegó la lista)');
      }, FALLBACK_MS);
    });
  }

  // ------------------------------------------------------------------ arranque

  var loaded = Promise.all([
    fetch('recap-master.json').then(function (r) { return r.json(); }),
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
      console.error('[recap] no se pudo componer el gráfico:', err);
    });
  };
}());
