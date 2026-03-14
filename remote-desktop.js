#!/usr/bin/env node

/**
 * LetterBlack Remote Desktop Server
 * Live screen stream + mouse/keyboard control via browser
 * Access at: http://localhost:9999
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import screenshot from 'screenshot-desktop';
import { mouse, keyboard, Point, Button, Key } from '@nut-tree-fork/nut-js';

mouse.config.mouseSpeed = 2000;
keyboard.config.autoDelayMs = 0;

const app = express();
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

let clients = new Set();
let streaming = false;
let streamInterval = null;

// Serve the UI
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
<title>LetterBlack Remote Desktop</title>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #111; color: #fff; font-family: monospace; overflow: hidden; }
#toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #1a1a1a; border-bottom: 1px solid #333; }
#toolbar h1 { font-size: 14px; color: #4af; }
#status { font-size: 12px; color: #888; }
#fps-label { font-size: 12px; color: #888; }
#fps { width: 60px; }
#coords { font-size: 12px; color: #4af; margin-left: auto; }
#screen-wrap { position: relative; width: 100vw; height: calc(100vh - 42px); display: flex; align-items: center; justify-content: center; overflow: hidden; }
#screen { max-width: 100%; max-height: 100%; cursor: crosshair; display: block; }
#overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
.click-flash { position: absolute; width: 20px; height: 20px; border-radius: 50%; background: rgba(255,80,80,0.6); transform: translate(-50%, -50%); animation: flash 0.4s ease-out forwards; }
@keyframes flash { to { transform: translate(-50%, -50%) scale(2.5); opacity: 0; } }
button { background: #2a2a2a; color: #fff; border: 1px solid #444; padding: 4px 10px; cursor: pointer; border-radius: 3px; font-size: 12px; }
button:hover { background: #3a3a3a; }
button.active { background: #4af; color: #000; }
</style>
</head>
<body>
<div id="toolbar">
  <h1>🖥 LetterBlack Remote</h1>
  <button id="btn-stream">▶ Start Stream</button>
  <span id="fps-label">FPS:</span>
  <input id="fps" type="range" min="1" max="10" value="3">
  <span id="fps-val">3</span>
  <button id="btn-click-mode" class="active">🖱 Click</button>
  <button id="btn-type">⌨ Type</button>
  <span id="status">Disconnected</span>
  <span id="coords">x:0 y:0</span>
</div>
<div id="screen-wrap">
  <img id="screen" src="" alt="Screen">
  <div id="overlay"></div>
</div>

<script>
const ws = new WebSocket('ws://' + location.host);
const img = document.getElementById('screen');
const status = document.getElementById('status');
const coords = document.getElementById('coords');
const overlay = document.getElementById('overlay');
const fpsSlider = document.getElementById('fps');
const fpsVal = document.getElementById('fps-val');
let streaming = false;
let streamTimer = null;
let clickMode = true;
let scaleX = 1, scaleY = 1;
let screenW = 1920, screenH = 1080;

ws.onopen = () => { status.textContent = 'Connected'; status.style.color = '#4f4'; };
ws.onclose = () => { status.textContent = 'Disconnected'; status.style.color = '#f44'; };
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'frame') {
    img.src = 'data:image/jpeg;base64,' + msg.data;
    screenW = msg.w || 1920;
    screenH = msg.h || 1080;
  }
  if (msg.type === 'info') status.textContent = msg.text;
};

fpsSlider.oninput = () => {
  fpsVal.textContent = fpsSlider.value;
  if (streaming) restartStream();
};

document.getElementById('btn-stream').onclick = function() {
  streaming = !streaming;
  this.textContent = streaming ? '⏹ Stop Stream' : '▶ Start Stream';
  this.classList.toggle('active', streaming);
  if (streaming) startStream(); else stopStream();
};

function startStream() {
  const delay = Math.round(1000 / parseInt(fpsSlider.value));
  streamTimer = setInterval(() => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ action: 'screenshot' }));
  }, delay);
}
function stopStream() { clearInterval(streamTimer); }
function restartStream() { stopStream(); if (streaming) startStream(); }

// Get actual render scale
function getScale() {
  const rect = img.getBoundingClientRect();
  if (!rect.width || !img.naturalWidth) return { sx: 1, sy: 1, ox: 0, oy: 0 };
  return {
    sx: screenW / rect.width,
    sy: screenH / rect.height,
    ox: rect.left,
    oy: rect.top
  };
}

img.onmousemove = (e) => {
  const s = getScale();
  const x = Math.round((e.clientX - s.ox) * s.sx);
  const y = Math.round((e.clientY - s.oy) * s.sy);
  coords.textContent = 'x:' + x + ' y:' + y;
};

img.onclick = (e) => {
  if (!clickMode) return;
  const s = getScale();
  const x = Math.round((e.clientX - s.ox) * s.sx);
  const y = Math.round((e.clientY - s.oy) * s.sy);
  ws.send(JSON.stringify({ action: 'click', x, y, button: e.button === 2 ? 'right' : 'left' }));
  // Visual flash
  const dot = document.createElement('div');
  dot.className = 'click-flash';
  dot.style.left = e.clientX + 'px';
  dot.style.top = (e.clientY - 42) + 'px';
  overlay.appendChild(dot);
  setTimeout(() => dot.remove(), 500);
};

img.ondblclick = (e) => {
  const s = getScale();
  const x = Math.round((e.clientX - s.ox) * s.sx);
  const y = Math.round((e.clientY - s.oy) * s.sy);
  ws.send(JSON.stringify({ action: 'click', x, y, button: 'left', double: true }));
};

img.oncontextmenu = (e) => {
  e.preventDefault();
  const s = getScale();
  const x = Math.round((e.clientX - s.ox) * s.sx);
  const y = Math.round((e.clientY - s.oy) * s.sy);
  ws.send(JSON.stringify({ action: 'click', x, y, button: 'right' }));
};

img.onwheel = (e) => {
  e.preventDefault();
  const s = getScale();
  const x = Math.round((e.clientX - s.ox) * s.sx);
  const y = Math.round((e.clientY - s.oy) * s.sy);
  ws.send(JSON.stringify({ action: 'scroll', x, y, direction: e.deltaY > 0 ? 'down' : 'up', amount: 3 }));
};

document.getElementById('btn-type').onclick = () => {
  const text = prompt('Type text to send:');
  if (text) ws.send(JSON.stringify({ action: 'type', text }));
};

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const keyMap = {
    'Enter': 'Return', 'Escape': 'Escape', 'Tab': 'Tab',
    'Backspace': 'Backspace', 'Delete': 'Delete',
    'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'F5': 'F5', 'F12': 'F12'
  };
  if (keyMap[e.key]) {
    e.preventDefault();
    let key = keyMap[e.key];
    if (e.ctrlKey) key = 'Control+' + key;
    if (e.altKey) key = 'Alt+' + key;
    ws.send(JSON.stringify({ action: 'key', key }));
  }
});
</script>
</body>
</html>`);
});

// WebSocket handler
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Client connected');

    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.action === 'screenshot') {
                const buf = await screenshot();
                // Get image dimensions (assume 1920x1080, or detect via sharp if needed)
                const base64 = buf.toString('base64');
                // Convert to JPEG for smaller size
                ws.send(JSON.stringify({
                    type: 'frame',
                    data: base64,
                    w: 1920,
                    h: 1080
                }));
            }

            if (msg.action === 'click') {
                await mouse.move([new Point(msg.x, msg.y)]);
                const btn = msg.button === 'right' ? Button.RIGHT : Button.LEFT;
                if (msg.double) {
                    await mouse.doubleClick(btn);
                } else {
                    await mouse.click(btn);
                }
            }

            if (msg.action === 'scroll') {
                await mouse.move([new Point(msg.x, msg.y)]);
                const amount = msg.amount || 3;
                for (let i = 0; i < amount; i++) {
                    if (msg.direction === 'up') await mouse.scrollUp(1);
                    else await mouse.scrollDown(1);
                }
            }

            if (msg.action === 'type') {
                await keyboard.type(msg.text);
            }

            if (msg.action === 'key') {
                const keyStr = msg.key;
                if (keyStr.includes('+')) {
                    const parts = keyStr.split('+');
                    const mods = parts.slice(0, -1).map(k => Key[k] || Key[k.toUpperCase()]).filter(Boolean);
                    const mainKey = Key[parts[parts.length - 1]] || Key[parts[parts.length - 1].toUpperCase()];
                    if (mainKey) {
                        await keyboard.pressKey(...mods, mainKey);
                        await keyboard.releaseKey(...mods, mainKey);
                    }
                } else {
                    const k = Key[keyStr] || Key[keyStr.toUpperCase()];
                    if (k) {
                        await keyboard.pressKey(k);
                        await keyboard.releaseKey(k);
                    }
                }
            }

        } catch (err) {
            console.error('WS error:', err.message);
        }
    });

    ws.on('close', () => clients.delete(ws));
});

const PORT = 9999;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n✅ LetterBlack Remote Desktop running at http://localhost:${PORT}\n`);
});
