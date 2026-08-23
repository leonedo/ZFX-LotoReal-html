// version 1.04 template index made by heine.froholdt@gmail.com

let isOn = false;
let framesMilliseconds;
let fontsLoaded = false;
let animLoaded = false;
let animElementsLength;
let markers = {}
let markersLoop = {}

//loop handling
let loopExits = false;
let loopAnimation = false;
let loopDelay = 0;
let loopExternal = false;
let loopRepeat;
let loopDuration = 0;
let loopTiming;


//update
let updateAnimation = false;
let updateDelay = 0;
let nextAnimation;
let imagesReplace = {};


let animContainer = document.getElementById('bm');
let loopContainer = document.getElementById('loop');


// `data` puede ser una ruta (lo normal) o un objeto de animación ya armado en memoria,
// que es como el recap unificado entrega su composición.
const loadAnimation = (data, container) => {
    console.log('loading ' + (typeof data === 'string' ? data : '[animationData]'))
    let source = typeof data === 'string' ? { path: data } : { animationData: data };
    return lottie.loadAnimation(Object.assign({
        container: container,
        renderer: 'svg',
        loop: false,
        autoplay: false
    }, source));
}

let anim;
let externalLoop;

//add font-face from data.json  
const addFont = (fam, path) => {
    let newFont = document.createElement('style')
    newFont.appendChild(document.createTextNode(`\
    @font-face {\
        font-family: ${fam};\
        src: url('${path}');\
    }\
    `));
    document.head.appendChild(newFont);
}


//checking if the animation is ready
// Se crea por adelantado, antes de que exista `anim`, para que los comandos de casparcg que lleguen
// temprano (play, data) queden encolados contra ella y se apliquen apenas la animación esté lista.
let resolveAnimPromise;
const animPromise = new Promise(function (resolve) {
    resolveAnimPromise = resolve;
});


const isMarker = (obj, keyItem, markerName) => {
    return new Promise((resolve, reject) => {
        let markers = obj.markers
        markers.forEach((item, index) => {
            for (let key in item) {
                if (item[key][keyItem] === markerName) {
                    resolve(true)
                } else if (item.length === key) {
                    reject(false)
                }
            }
        })
    })
}

const getMarkerValue = (obj, keyItem, defaultValue) => {
    return new Promise((resolve, reject) => {
        let markers = obj.markers
        markers.forEach((item, index) => {
            for (let key in item) {
                if (item[key].hasOwnProperty(keyItem)) {
                    resolve(item[key][keyItem])
                } else if (item.length === key) {
                    reject(defaultValue)
                }
            }
        })
    })
}



//anim ready
let configReadyDone = false;
function onConfigReady(e) {
    if (configReadyDone) return;
    configReadyDone = true;
    //setting the animation framerate
    let mainAnimation = anim.renderer.data
    framesMilliseconds = 1000 / mainAnimation.fr

    if (anim.hasOwnProperty('markers')) {
        anim.markers.forEach((item, index) => {
            markers[item.payload.name] = item;

        })
    }
    //checking for a loop in the animation
    isMarker(anim, 'name', 'loop').then((res) => {
        loopAnimation = res

        if (res) {
            loopExits = true;
            getMarkerValue(anim, 'loopDelay', 0).then((res) => {
                loopDelay = Number(res)
            })
            getMarkerValue(anim, 'loopExternal', false).then((res) => {
                loopExternal = (res === 'true')

                //handling of external loop
                if (loopExternal) {

                    externalLoop = loadAnimation('loop.json', loopContainer)
                    if (externalLoop.hasOwnProperty('markers')) {
                        externalLoop.markers.forEach((item, index) => {
                            markersLoop[item.payload.name] = item;
                
                        })
                    }
                    externalLoop.addEventListener('complete', () => {
                        if (nextAnimation !== 'stop') {
                            loopRepeat = setTimeout(() => {
                                externalLoop.goToAndPlay('loop', true);
                            }, framesMilliseconds * loopDelay)

                        } else if (isOn && nextAnimation === 'stop') {
                            externalLoop.goToAndPlay('stop', true);
                            anim.goToAndPlay('stop', true)
                            nextAnimation === 'no animation'
                            isOn = false;
                        }

                    })
                }


            })
            if(!loopExternal){
                loopDuration = markers['loop']['duration']
            } else {
                loopDuration = markersLoop['loop']['duration']
            }
          
        }
    })
    //checking for a update animation in the animation 
    isMarker(anim, 'name', 'update').then((res) => {
        updateAnimation = res
        if (res) {
            getMarkerValue(anim, 'updateDelay', 0).then((res) => {
                updateDelay = Number(res)
            })
        }
    })

    //Add fonts to style
    if (!fontsLoaded && anim.renderer.data.fonts) {
        let fonts = anim.renderer.data.fonts.list;
        for (const font in fonts) {
            let family = fonts[font].fFamily
            let fontPath = fonts[font].fPath
            if (fontPath !== '') {
                addFont(family, fontPath)
            }
        }
    }

}

webcg.on('data', function (data) {
    let updateTiming = 0
    console.log('data from casparcg received')
    console.log(JSON.stringify(data, null, 2));
    for (var key in data) {
    if (key.toLowerCase().includes("color")) {
        checkandcolor(key, data[key]);
    }
    if (key.toLowerCase().includes("opacidad")) {
        checkandupdate(key, data[key]);
    }
}
    animPromise.then(resolve => {
            if (anim.currentFrame !== 0 && updateAnimation) {
                updateTiming = framesMilliseconds * (updateDelay + loopTiming)
                if (anim.isPaused && isOn) {
                    anim.goToAndPlay('update', true)
                    if (!loopExternal) {
                        clearTimeout(loopRepeat);
                    }

                } else {
                    loopAnimation = false;
                    nextAnimation = 'update'
                }
            } else if(!loopExternal && loopExits && anim.isPaused) {
                anim.goToAndPlay('loop', true)
            }

            let imageElements = animContainer.getElementsByTagName("image");
            animElementsLength = anim.renderer.elements.length;
            console.log(resolve)

            setTimeout(() => {
                for (let i = 0; i < animElementsLength; i++) {
                    var animElement = anim.renderer.elements[i];
                    if (
                        animElement.hasOwnProperty('data') && animElement.data.hasOwnProperty('cl') &&
                        data && data.hasOwnProperty(animElement.data.cl)
                    ) {
                        let cl = animElement.data.cl;
                        let newPath;

                       if (animElement.data.hasOwnProperty('refId') && animElement.data.refId.includes('image')) {
                            // Get the new path to apply
                            newPath = data[cl] ? data[cl].text || data[cl] : '';
                        
                            // Optional: determine current searchPath for tracking
                            let searchPath;
                            const refId = animElement.data.refId;
                        
                            const asset = anim.assets.find(item => item.id === refId);
                               if (asset) {
                                searchPath = imagesReplace.hasOwnProperty(refId)
                                    ? imagesReplace[refId]
                                    : `${asset.u}${asset.p}`;
                            }
                        
                            // Get the class name from animElement.data.cl or elsewhere
                               const groupClass = cl; // assuming cl = "logovisitab4", etc.
                               const group = document.querySelector(`g.${groupClass}`);
                            const image = group ? group.querySelector('image') : null;
                        
                            if (image) {
                                // Update the image href to the new path
                                image.setAttribute('href', newPath); // preferred in modern SVG
                              //  image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', newPath); // for compatibility
                        
                                   // Store the new path in the imagesReplace cache
                                imagesReplace[refId] = newPath;
                            }


                        } else {
                            try {
                                animElement.canResizeFont(true);
                                animElement.updateDocumentData({
                                    t: data[cl] ? data[cl].text || data[cl] : ''
                                }, 0);

                            } catch (err) {
                                console.log(err)
                            }
                        };
                    }
                }

            }, updateTiming);

        })
        .catch(error => console.log(error))
});


//what to do everytime main animation is done playing
function onComplete() {

    if (loopAnimation && isOn && !loopExternal) {
        loopRepeat = setTimeout(() => {
            anim.goToAndPlay('loop', true);
        }, framesMilliseconds * loopDelay)

    } else if (nextAnimation === 'stop' && isOn && !loopExternal) {
        anim.goToAndPlay(nextAnimation, true)
        isOn = false

    } else if (isOn && nextAnimation !== 'no animation' && !loopExternal) {
        anim.goToAndPlay(nextAnimation, true)
        if (loopExits && !loopExternal) {
            loopAnimation = true;

        }

        nextAnimation = 'no animation'
    }
}


//Custom methods

function update_color(campo,color){
    var fill_color = `.${campo}`
    document.querySelector(fill_color).style.setProperty("fill", color);
}

function update_opacidad(campo,value){
    var fill = `.${campo}`
    document.querySelector(fill).style.setProperty("opacity", value);
}

function normalizeValue(v) {
    return (typeof v === "object" && v !== null && "text" in v) ? v.text : v;
} 

// Se reintenta porque la capa puede no estar todavía en el DOM cuando llega el dato. Pero si el
// payload trae claves de un juego apagado, esa capa NO va a existir nunca (lottie ni la renderiza
// cuando tiene hd:true), y sin tope el reintento seguía cada 100ms para siempre. Con un gráfico que
// queda horas al aire eso es CPU quemada de gratis.
const CHECK_RETRIES = 30; // 3 segundos

function checkandcolor(item, colorData, tries) {
    const color = normalizeValue(colorData);
    if (itemExists(item)) {
        update_color(item, color);
    } else if ((tries || 0) < CHECK_RETRIES) {
        setTimeout(() => checkandcolor(item, colorData, (tries || 0) + 1), 100);
    }
}

function checkandupdate(item, valueData, tries) {
    const value = normalizeValue(valueData);
    if (itemExists(item)) {
        update_opacidad(item, value);
    } else if ((tries || 0) < CHECK_RETRIES) {
        setTimeout(() => checkandupdate(item, valueData, (tries || 0) + 1), 100);
    }
}
function itemExists(item) {
    var fill = `.${item}`
   //return document.querySelector(item).style !== false;
   return document.querySelector(fill) !== null;
}



//casparcg control

webcg.on('entrada1', function () {
    console.log('bola1')
    if (!anim) return;
    anim.goToAndPlay('bola1', true);
});

webcg.on('entrada2', function () {
    console.log('bola2')
    if (!anim) return;
    anim.goToAndPlay('bola2', true);
});

webcg.on('entrada3', function () {
    console.log('bola3')
    if (!anim) return;
    anim.goToAndPlay('bola3', true);
});

webcg.on('entrada4', function () {
    console.log('bola4')
    if (!anim) return;
    anim.goToAndPlay('bola4', true);
});

webcg.on('entrada5', function () {
    console.log('bola5')
    if (!anim) return;
    anim.goToAndPlay('bola5', true);
});

webcg.on('entrada6', function () {
    console.log('bola6')
    if (!anim) return;
    anim.goToAndPlay('bola6', true);
});


webcg.on('startclock', function () {
   if (!anim) return;
   startClock();
});

webcg.on('stopclock', function () {
    if (!anim) return;
    stopClock();
});

webcg.on('play', function () {
    animPromise.then((resolve) => {
        console.log('play')
        anim.goToAndPlay('play', true);
        if (loopExits && loopExternal) {
            externalLoop.goToAndPlay('play', true);
        }
        isOn = true;
         nextAnimation = 'no animation';
    });

});

webcg.on('stop', function () {
    console.log('stop')
    clearTimeout(loopRepeat);
    loopAnimation = false;
    nextAnimation = 'stop'

    if (!anim) return;

    //if (anim.isPaused) {
        if (!loopExternal) {
            anim.goToAndPlay('stop', true)
            isOn = false
        }

        if (loopExits && loopExternal) {
            externalLoop.goToAndPlay('stop', true);
            anim.goToAndPlay('stop', true)
            isOn = false
        }
   // }

});

webcg.on('playAnimation', function (animationName) {
    console.log('playAnimation ' + animationName)
    if (!anim) return;
    anim.goToAndPlay(animationName, true);
});


webcg.on('update', function () {
    if (!loopExternal) {
        clearTimeout(loopRepeat);
    }

    if (!anim || anim.isPaused || loopExternal) {
        loopTiming = 0

    } else if (isOn) {
        loopTiming = loopDuration - Math.round(anim.currentFrame)

    }
});


let sfxPlayed = false; // prevent it from playing multiple times


function onEnterFrame(e) {
    const currentFrame = e.currentTime;

    // Play sound only if audio_inframe exists and is valid
    if (
        typeof audio_inframe === 'number' &&
        !Number.isNaN(audio_inframe) &&
        currentFrame >= audio_inframe &&
        !sfxPlayed
    ) {
        const audio = document.getElementById('sfxOut');
        if (audio) {
            audio.volume = 1.0;
            audio.currentTime = 0;
            audio.play();
            sfxPlayed = true;
        }
    }
}



// clock and date formatters
const ENABLE_CLOCK = window.ENABLE_CLOCK === true;
let clockInterval = null;
let clockEnabled = false;


const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
});

const dateFormatter = new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});

function updateLottieText(className, text) {
    for (let i = 0; i < anim.renderer.elements.length; i++) {
        const el = anim.renderer.elements[i];

        if (
            el.data &&
            el.data.cl === className &&
            typeof el.updateDocumentData === 'function'
        ) {
            try {
                el.canResizeFont(true);
                el.updateDocumentData({ t: text }, 0);
            } catch (e) {
                console.log('[Clock] Failed to update', className, e);
            }
            return;
        }
    }
}

function updateClock() {
    const now = new Date();
    updateLottieText('time', timeFormatter.format(now));
    updateLottieText('date', dateFormatter.format(now));
}

function startClock() {
    if (clockEnabled) return;

    clockEnabled = true;
    updateClock();
    clockInterval = setInterval(updateClock, 10 * 1000);
}

function stopClock() {
    clockEnabled = false;

    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }

    // Clear text (hide)
    updateLottieText('time', '');
    updateLottieText('date', '');
}


animPromise.then(() => {
    if (!ENABLE_CLOCK) {
        return;
    }
    startClock();

});


// Arranque de la animación principal.
//
// Se hace acá abajo, en una función, porque hay templates que no saben qué cargar hasta que llegan los
// datos de casparcg: el recap unificado necesita la lista de juegos activos para componer el gráfico
// antes de crear la animación. Esos templates definen `window.RECAP_BOOT` y llaman a `boot()` cuando
// están listos; el resto arranca de una, igual que siempre.
function bootAnimation(source) {
    anim = loadAnimation(source, animContainer);
    anim.addEventListener('config_ready', onConfigReady);
    anim.addEventListener('complete', onComplete);
    anim.addEventListener('enterFrame', onEnterFrame);
    anim.addEventListener('DOMLoaded', function () {
        animLoaded = true;
        resolveAnimPromise('Animation ready to play');
    });

    // Cuando se carga por ruta, lottie va por XHR y estos eventos llegan después de registrarlos.
    // Cuando se carga con un objeto ya armado en memoria, en cambio, configura de forma SÍNCRONA
    // dentro de loadAnimation() y los eventos ya pasaron. Se cubren los dos casos.
    if (anim.renderer && anim.renderer.data) onConfigReady();
    if (anim.isLoaded) {
        animLoaded = true;
        resolveAnimPromise('Animation ready to play');
    }
    return anim;
}

if (typeof window.RECAP_BOOT === 'function') {
    window.RECAP_BOOT(bootAnimation);
} else {
    bootAnimation(data_file);
}