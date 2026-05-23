import { useState, useEffect, useRef } from 'react';
import {
    RainbowBar, GhostButton, TileLattice, IconChip,
    BG, HAIRLINE, ACCENT, 
} from '../components/design'

function ReconnectIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={ACCENT} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10" />
      <path d="M17 7l5-5" />
      <path d="M22 2v5h-5" />
    </svg>
  );
}

function PrimaryButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-[11px] px-4 rounded-[10px] border-none font-outfit font-extrabold text-[11px] tracking-[0.08em] uppercase cursor-pointer transition-all duration-150 hover:-translate-y-px"
      style={{
        background: ACCENT,
        color: "oklch(0.12 0.02 270)",
        boxShadow: `0 4px 16px -4px color-mix(in oklab, ${ACCENT} 40%, transparent)`,
      }}
    >
      {children}
    </button>
  );
}

export function ReconnectPopup({ isOpen, onReconnect, onDismiss, gameId }){
    const [visible, setVisible] = useState(false);
    const [animateOut, setAnimateOut] = useState(false);
    const didMount = useRef(false);

    useEffect(()=>{
        if (isOpen){
            setAnimateOut(false);
            setVisible(true);
        } else if (didMount.current){
            triggerClose(onDismiss, false);
        }
        didMount.current = true;
    }, [isOpen])

    function triggerClose(cb, callCb = true){
        setAnimateOut(true);
        setTimeout(()=>{
            setVisible(false);
            setAnimateOut(false);
            if (callCb) cb?.();
        }, 280);
    }

    if (!visible) return null;

    return (
        <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-md"
        style={{
            background: `color-mix(in oklab, ${BG} 30%, transparent)`,
            animation: animateOut ? "ecm-backdrop-out 0.28s ease forwards" : "ecm-backdrop-in 0.22s ease forwards",
        }}
        >
        <div
            className="relative flex flex-col overflow-hidden rounded-[18px] border border-hairline font-outfit w-[420px] max-w-[calc(100vw-32px)]"
            style={{
            background: BG,
            boxShadow: `0 0 0 1px oklch(0.96 0 0 / 0.04),
                        0 24px 56px -8px oklch(0 0 0 / 0.65),
                        0 8px 20px -4px oklch(0 0 0 / 0.4)`,
            animation: animateOut
                ? "ecm-card-out 0.28s cubic-bezier(0.4,0,1,1) forwards"
                : "ecm-card-in 0.32s cubic-bezier(0.34,1.56,0.64,1) forwards",
            }}
        >
            <RainbowBar />

            <div className="p-[26px]">

                <IconChip>
                    <ReconnectIcon />
                </IconChip>

                <h2 className="mb-2.5 text-[17px] font-extrabold uppercase tracking-[0.05em] text-fg">
                    Rejoin your game?
                </h2>

                <p className="mb-4 text-[13.5px] leading-[1.65] text-fg2">
                    It seems you disconnected from your last game, would you like to reconnect?
                </p>

                <div
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 mb-[22px] text-[12px] font-bold tracking-[0.06em] uppercase"
                    style={{
                    background: `color-mix(in oklab, ${ACCENT} 12%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${ACCENT} 25%, transparent)`,
                    color: ACCENT,
                    }}
                >
                    <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: ACCENT, animation: "blink 1.6s ease-in-out infinite" }}
                    />
                    Game · {gameId}
                </div>

                <div className="h-px bg-hairline opacity-60 -mx-[26px] mb-5" />

                    <div className="flex gap-2.5">
                        <GhostButton onClick={() => triggerClose(onDismiss)}>Dismiss</GhostButton>
                        <PrimaryButton onClick={() => triggerClose(onReconnect)}>Rejoin</PrimaryButton>
                    </div>
                </div>
            </div>
        </div>
    );
}