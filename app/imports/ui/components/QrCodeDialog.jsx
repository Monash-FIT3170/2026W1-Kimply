import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AbilityDialog } from '../abilities/AbilityDialog.jsx';
import { CloseIcon, GhostButton } from './design';

// A scanner needs dark modules on a light ground with a quiet margin, so the code is drawn
// on white whatever the theme, never inverted to match the page.
const QR_FOREGROUND = '#0b0b14';
const QR_BACKGROUND = '#ffffff';

// The host's "show QR code" option: a button that opens the room code over a QR code of the
// invite link, in the same modal shell as the ability guide.
export function QrCodeButton({ pin, link }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Show QR code to join"
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hairline px-3 py-2 font-outfit text-[11px] font-semibold uppercase tracking-wider text-fg2 transition-colors duration-[120ms] hover:border-fg3 hover:text-fg xs:min-h-0 xs:py-1.5"
      >
        QR code
      </button>
      {open && <QrCodeDialog pin={pin} link={link} onClose={() => setOpen(false)} />}
    </>
  );
}

function QrCodeDialog({ pin, link, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <AbilityDialog
      labelledBy="qr-code-title"
      // eyebrow="Join this game"
      title="Scan to join"
      widthClass="max-w-md"
      titleClass="text-[32px] leading-tight xs:text-[36px]"
      aside={
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the QR code"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-hairline text-fg2 transition-colors duration-[120ms] hover:bg-surface2 hover:text-fg"
        >
          <CloseIcon size={14} />
        </button>
      }
      footer={
        <div className="flex">
          <GhostButton onClick={onClose}>Close · Esc</GhostButton>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto">
        <div className="flex flex-col items-center gap-1">
          <p className="font-mono text-[18px] uppercase tracking-widest text-fg3">Room code</p>
          <p className="select-all font-mono text-[48px] font-bold leading-none tracking-[0.25em] text-fg">{pin}</p>
        </div>
        {/* The quiet margin a scanner needs (4 modules) is part of the code, not padding. */}
        <div className="overflow-hidden rounded-2xl" style={{ width: 'min(72vw, 17rem)', background: QR_BACKGROUND }}>
          <QRCodeSVG
            value={link}
            size={256}
            level="M"
            marginSize={4}
            fgColor={QR_FOREGROUND}
            bgColor={QR_BACKGROUND}
            role="img"
            aria-label={`QR code that opens ${link}`}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </div>
        <p className="w-full select-all break-all text-center font-mono text-[12px] text-fg3">{link}</p>
      </div>
    </AbilityDialog>
  );
}
