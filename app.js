/*
Core app logic:
- 8 columns × 32 rows pad (256 numbers 0..255)
- User enters key string -> deterministic starting offset via SHA-256
- Encrypt: UTF-8 bytes + pad numbers (mod 256) -> base64
- Decrypt: base64 -> bytes - pad numbers (mod 256) -> UTF-8
- Pad is reused circularly but offset chosen from key; message limited to pad length
*/

const COLS = 8, ROWS = 32, LEN = COLS * ROWS;
const padGrid = document.getElementById('pad-grid');
const keyInput = document.getElementById('key');
const messageEl = document.getElementById('message');
const resultEl = document.getElementById('result');
const encryptBtn = document.getElementById('encrypt');
const decryptBtn = document.getElementById('decrypt');
const fillRandomBtn = document.getElementById('fill-random');
const clearPadBtn = document.getElementById('clear-pad');
const exportBtn = document.getElementById('export-pad');
const importBtn = document.getElementById('import-pad');

let pad = new Array(LEN).fill(0);

// 1. BUILD GRID (Do this first so the UI always appears)
function initGrid() {
  padGrid.innerHTML = ''; // Clear existing
  for (let i = 0; i < LEN; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.max = '255';
    inp.inputMode = 'numeric';
    inp.value = '0';
    inp.addEventListener('input', (e) => {
      let v = parseInt(inp.value || '0', 10);
      if (Number.isNaN(v)) v = 0;
      v = Math.max(0, Math.min(255, v));
      inp.value = String(v);
      pad[i] = v;
    });
    cell.appendChild(inp);
    padGrid.appendChild(cell);
  }
}

// 2. HELPERS
function encodeUTF8(s){ return new TextEncoder().encode(s); }
function decodeUTF8(bytes){ return new TextDecoder().decode(bytes); }
function toBase64(bytes){ return btoa(String.fromCharCode(...bytes)); }
function fromBase64(b64){ 
  const s = atob(b64); 
  const arr = new Uint8Array(s.length); 
  for(let i=0; i<s.length; i++) arr[i]=s.charCodeAt(i); 
  return arr; 
}

// 3. CORE LOGIC (Web Crypto API)
async function keyOffset(key) {
  const msgBuffer = new TextEncoder().encode(key);
  // This requires HTTPS to work
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const part = hashHex.slice(0, 8);
  const num = parseInt(part, 16);
  return num % LEN;
}

async function transform(inputBytes, key, encrypt=true){
  const offset = await keyOffset(key);
  if (inputBytes.length > LEN) throw new Error('Message too long (max 256 bytes)');
  const out = new Uint8Array(inputBytes.length);
  for (let i = 0; i < inputBytes.length; i++){
    const padVal = pad[(offset + i) % LEN] & 0xff;
    if (encrypt) out[i] = (inputBytes[i] + padVal) & 0xff;
    else out[i] = (inputBytes[i] - padVal + 256) & 0xff;
  }
  return out;
}

// 4. UI ACTIONS
encryptBtn.addEventListener('click', async () => {
  try {
    const key = keyInput.value || '';
    if (!key) { alert('Enter a key'); return; }
    const inputBytes = encodeUTF8(messageEl.value || '');
    const out = await transform(inputBytes, key, true);
    resultEl.value = toBase64(out);
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

decryptBtn.addEventListener('click', async () => {
  try {
    const key = keyInput.value || '';
    if (!key) { alert('Enter a key'); return; }
    const b64 = messageEl.value.trim();
    if (!b64) { alert('Enter base64 ciphertext'); return; }
    const bytes = fromBase64(b64);
    const out = await transform(bytes, key, false);
    resultEl.value = decodeUTF8(out);
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

function randomizePad() {
  for (let i = 0; i < LEN; i++) {
    const v = Math.floor(Math.random() * 256);
    pad[i] = v;
    if (padGrid.children[i]) {
      padGrid.children[i].querySelector('input').value = String(v);
    }
  }
}

fillRandomBtn.addEventListener('click', randomizePad);

clearPadBtn.addEventListener('click', () => {
  for (let i = 0; i < LEN; i++) {
    pad[i] = 0;
    if (padGrid.children[i]) {
      padGrid.children[i].querySelector('input').value = '0';
    }
  }
});

exportBtn.addEventListener('click', () => {
  const data = { pad };
  const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pad.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json';
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const obj = JSON.parse(txt);
      if (!Array.isArray(obj.pad) || obj.pad.length !== LEN) throw new Error('Invalid pad file');
      for (let i=0; i<LEN; i++){
        let v = parseInt(obj.pad[i]||0, 10);
        v = Math.max(0, Math.min(255, v));
        pad[i] = v;
        padGrid.children[i].querySelector('input').value = String(v);
      }
    } catch (e){
      alert('Import failed: ' + e.message);
    }
  });
  inp.click();
});

// 5. INITIALIZE
initGrid();
randomizePad();
