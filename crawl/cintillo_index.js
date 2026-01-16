// version 1.04 template index made by heine.froholdt@gmail.com
// modificado por leon para logos sin fuentes

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
let loopDuration;
let loopTiming;


//update
let updateAnimation = false;
let updateDelay = 30;
let nextAnimation;
let imagesReplace = {};


let animContainer = document.getElementById('bm');
let loopContainer = document.getElementById('loop');


const loadAnimation = (data, container) => {
    console.log('loading ' + data)
    return lottie.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        path: data
    });
}

let anim = loadAnimation(json_file, animContainer)
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
const makeAnimPromise = () => {
    return new Promise(function (resolve, reject) {
        if (animLoaded) {
            resolve('Animation ready to play')
        } else {
            anim.addEventListener('DOMLoaded', function (e) {
                animLoaded = true;
                resolve('Animation ready to play')
            });
        }
    })
};


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
anim.addEventListener('config_ready', function (e) {
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
    if (!fontsLoaded) {
        let fonts = anim.renderer.data.fonts.list;
        for (const font in fonts) {
            let family = fonts[font].fFamily
            let fontPath = fonts[font].fPath
            if (fontPath !== '') {
                addFont(family, fontPath)
            }
        }
    }

});

const animPromise = makeAnimPromise()

webcg.on('data', function (data) {
    let updateTiming = 100
    console.log('data from casparcg received')
    animPromise.then(resolve => {
            if (anim.currentFrame !== 0 && updateAnimation) {
                updateTiming = 100
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

            console.log(resolve)

            setTimeout(() => {
                messagesArray = data["mensajes"]
                updateTickerMessages(messagesArray)

            }, updateTiming);

        })
        .catch(error => console.log(error))
});


//what to do everytime main animation is done playing
anim.addEventListener('complete', () => {

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
})


//casparcg control
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
    anim.goToAndPlay('stop', true)
    hideTicker()
    isOn = false
        
    

});

webcg.on('playAnimation', function (animationName) {
    console.log('playAnimation ' + animationName)
    anim.goToAndPlay(animationName, true);
});

webcg.on('update', function () {
    if (!loopExternal) {
        clearTimeout(loopRepeat);
    }

    if (anim.isPaused || loopExternal) {
        loopTiming = 0

    } else if (isOn) {
        loopTiming = loopDuration - Math.round(anim.currentFrame)

    }
});
