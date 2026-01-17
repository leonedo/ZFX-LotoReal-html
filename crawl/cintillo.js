const ticker = document.getElementById('tickerText');
const container = document.querySelector('.ticker-container');
const scrollSpeed = 123; // pixels per second
// Use either a symbol or an image as the separator
// const separator = `<span style="margin: 0 20px;">|</span>`;
// OR for an image:
 const separator = `<img src=${separador} style="height: 34px; margin: 0 30px;">`;

const mensajes = [
  "📢 Initial ticker message scrolling across...",
  "✅ Update 1: Streaming will begin shortly.",
  "🚨 Alert: Network maintenance at midnight.",
  "🎥 New content available in the media library!"
];


function startTicker(messagesArray) {
  if (!Array.isArray(messagesArray) || messagesArray.length === 0) {
    console.warn("startTicker: messagesArray must be a non-empty array.");
    return;
  }

  const concatenated = messagesArray.join(separator);
  ticker.innerHTML = concatenated;

  requestAnimationFrame(() => {
    container.classList.remove('hidden');

    const containerWidth = container.offsetWidth;
    const textWidth = ticker.offsetWidth;
    const duration = (textWidth + containerWidth) / scrollSpeed;

    // Set custom properties for keyframe values
   ticker.style.setProperty('--start-x', `${containerWidth}px`);
   ticker.style.setProperty('--end-x', `-${textWidth}px`);

    ticker.style.animation = 'none'; // reset animation
    void ticker.offsetWidth;         // force reflow
    ticker.style.animation = `scroll ${duration}s linear infinite`;
  });
}

function updateTickerMessages(newMessages) {
  if (Array.isArray(newMessages) && newMessages.length > 0) {
    hideTicker();
    setTimeout(() => {
       startTicker(newMessages); // Restart with updated messages
    }, 1500);
  } else {
    console.warn("updateTickerMessages: input must be a non-empty array.");
  }
}


function hideTicker() {
  container.classList.add('hidden');
}


