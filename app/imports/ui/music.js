let audioEl = null;
let currentSrc = null;
let wantsToPlay = false;
let unlockArmed = false;

const armUnlock = () => {
  if (unlockArmed) return;
  unlockArmed = true;
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    unlockArmed = false;
    if (wantsToPlay && audioEl) audioEl.play().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
};

const tryPlay = () => {
  if (!audioEl) return;
  const p = audioEl.play();
  if (p && typeof p.catch === 'function') p.catch(armUnlock);
};

export const playMusic = (src, { volume = 0.35 } = {}) => {
  if (typeof window === 'undefined') return;
  wantsToPlay = true;
  if (currentSrc !== src) {
    if (audioEl) audioEl.pause();
    audioEl = new Audio(src);
    audioEl.loop = true;
    audioEl.preload = 'auto';
    currentSrc = src;
  }
  audioEl.volume = volume;
  if (audioEl.paused) tryPlay();
};

export const stopMusic = () => {
  wantsToPlay = false;
  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
};
