const STORAGE_KEY = 'kimply.muted.v1';

const listeners = new Set();

let muted = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
})();

const persist = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
};

const emit = () => {
  listeners.forEach((fn) => {
    try { fn(muted); } catch { /* ignore listener errors */ }
  });
};

export const isMuted = () => muted;
export const isSoundOn = () => !muted;

export const setMuted = (value) => {
  const next = Boolean(value);
  if (muted === next) return;
  muted = next;
  persist();
  emit();
};

export const toggleMuted = () => setMuted(!muted);

export const subscribeMuted = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
