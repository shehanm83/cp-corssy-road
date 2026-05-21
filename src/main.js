import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);

const titleOverlay = document.getElementById('title-overlay');
const characterOverlay = document.getElementById('character-overlay');
const gameOverOverlay = document.getElementById('gameover-overlay');
const hud = document.getElementById('hud');

function showTitle() {
  titleOverlay.classList.remove('hidden');
  characterOverlay.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  hud.classList.add('hidden');
  renderHomePanel();
}
function showCharacter() {
  titleOverlay.classList.add('hidden');
  characterOverlay.classList.remove('hidden');
  renderCharacterGrid();
}
function startGame() {
  titleOverlay.classList.add('hidden');
  characterOverlay.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  game.start();
}

// Home → picker → game. Post-mortem retries (RE-OPEN TICKET) skip the picker
// since the user just picked; HOME (OUT OF OFFICE) returns to the home flow.
document.getElementById('newgame-btn').addEventListener('click', showCharacter);
document.getElementById('begin-btn').addEventListener('click', startGame);
document.getElementById('character-back').addEventListener('click', showTitle);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('home-btn').addEventListener('click', showTitle);

function renderHomePanel() {
  // Home screen intentionally does NOT show the current colleague — that's only
  // revealed in the picker once the user clicks NEW GAME.
  document.getElementById('home-best').textContent  = String(game.world?.bestScore ?? 0);
  document.getElementById('home-runs').textContent  = String(game.totalRuns ?? 0);
  document.getElementById('home-coins').textContent = String(game.faces?.totalCoins() ?? 0);
}

function renderCharacterGrid() {
  const grid = document.getElementById('character-grid');
  grid.innerHTML = '';
  const reg = game.faces;
  if (!reg) return;
  for (const face of reg.faces) {
    const card = document.createElement('div');
    const unlocked = reg.isUnlocked(face.id);
    card.className = 'face-card' + (unlocked ? '' : ' locked') + (face.id === reg.currentId ? ' selected' : '');

    // Render face into a thumbnail canvas.
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    if (unlocked) {
      ctx.imageSmoothingEnabled = false;
      const src = face.texture.baseTexture?.resource?.source;
      // PIXI v7 may wrap a JPG/PNG as HTMLImageElement, ImageBitmap, or canvas.
      // For file-backed faces we just fall back to loading a fresh <img>.
      if (src && (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap)) {
        ctx.drawImage(src, 0, 0, 64, 64);
      } else if (src instanceof HTMLCanvasElement || src instanceof HTMLImageElement) {
        ctx.drawImage(src, 0, 0, 64, 64);
      } else if (face.file) {
        // Async: place a 1px placeholder and replace once the JPG loads.
        ctx.fillStyle = '#1a1a3a'; ctx.fillRect(0, 0, 64, 64);
        const img = new Image();
        img.onload = () => { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, 64, 64); };
        img.src = `/faces/${face.file}`;
      } else {
        ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 64, 64);
      }
    } else {
      // Silhouette
      ctx.fillStyle = '#1a1a3a';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#5566aa';
      ctx.fillRect(20, 16, 24, 22);
      ctx.fillRect(14, 38, 36, 22);
      const need = reg.coinUnlockThreshold;
      const have = reg.coinsFor(face.id);
      ctx.fillStyle = '#ffe44a';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`${have}/${need}`, 12, 60);
    }
    card.appendChild(c);

    const label = document.createElement('div');
    label.className = 'name';
    label.textContent = unlocked ? face.name : '???';
    card.appendChild(label);

    if (!unlocked) {
      const lock = document.createElement('div');
      lock.className = 'lock';
      lock.textContent = 'LOCK';
      card.appendChild(lock);
    }

    if (unlocked) {
      card.addEventListener('click', () => {
        reg.select(face.id);
        game.applyCurrentFace();
        renderCharacterGrid();
      });
    }
    grid.appendChild(card);
  }
}

// Mute toggle button in HUD
const muteBtn = document.getElementById('mute-btn');
muteBtn.textContent = '🔊';
muteBtn.addEventListener('click', () => {
  game.audio.ensureContext();
  const muted = game.audio.toggleMute();
  muteBtn.textContent = muted ? '🔇' : '🔊';
});
// Reflect persisted mute state on load
if (game.audio.isMuted()) muteBtn.textContent = '🔇';

window.__game = game;

(async () => {
  await game.init();
  game.applyCurrentFace();
  renderHomePanel();
})();
