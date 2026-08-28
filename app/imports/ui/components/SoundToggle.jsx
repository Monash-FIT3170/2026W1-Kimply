import { useEffect, useState } from 'react';
import { isMuted, subscribeMuted, toggleMuted } from '../audio';
import { playClick } from '../feedback';

const iconStyle = { display: 'block' };

const SpeakerOn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={iconStyle}>
    <path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor" />
    <path d="M16 8a5 5 0 010 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M18.5 5.5a9 9 0 010 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
);

const SpeakerOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={iconStyle}>
    <path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor" />
    <path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export function SoundToggle() {
  const [muted, setMuted] = useState(() => isMuted());

  useEffect(() => subscribeMuted(setMuted), []);

  const handleClick = () => {
    if (!muted) {
      // Fire the click while sound is still on so the user hears it confirm.
      playClick();
      toggleMuted();
    } else {
      toggleMuted();
      playClick();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      title={muted ? 'Unmute' : 'Mute'}
      style={{
        position: 'fixed',
        bottom: 14,
        right: 14,
        zIndex: 60,
        width: 38,
        height: 38,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(20, 8, 45, 0.55)',
        color: muted ? '#ff6b6b' : '#e6e6ff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'color 0.2s ease, background 0.2s ease',
      }}
    >
      {muted ? <SpeakerOff /> : <SpeakerOn />}
    </button>
  );
}
