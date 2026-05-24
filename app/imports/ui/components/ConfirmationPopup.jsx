import { useState, useEffect, useRef} from "react";

import {
    CloseIcon, RainbowBar, DangerButton, GhostButton, TileLattice, IconChip,
    DANGER, HAIRLINE, SURFACE, BG
} from '../components/design'


function WarningIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={DANGER} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9"  x2="12"   y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}


export function ConfirmationPopup({
    isOpen = true,
    onConfirm = () =>{},
    onCancel = () =>{},
    title = "",
    message= ""
}) {

    const [visible, setVisible] = useState(false);
    const [animateOut, setAnimateOut] = useState(false);
    const didMount = useRef(false);

    useEffect(()=>{
        if (isOpen){
            setAnimateOut(false);
            setVisible(true);
        } else if (didMount.current){
            triggerClose(onCancel,false);
        }
        didMount.current = true
    }, [isOpen]);

    function triggerClose(cb, callCb = true){
        setAnimateOut(true);
        setTimeout(()=>{
            setVisible(false);
            setAnimateOut(false);
            if (callCb) cb();
        }, 280);
    }

    if (!visible) return null;

    return (
        <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ecm-title"
        className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-md"
        style={{
            background: `color-mix(in oklab, ${BG} 30%, transparent)`,
            animation: animateOut
            ? "ecm-backdrop-out 0.28s ease forwards"
            : "ecm-backdrop-in 0.22s ease forwards",
        }}
        >
            <div
                className="relative flex flex-col overflow-hidden rounded-[18px] border border-hairline bg-surface font-outfit"
                style={{
                width: 420, maxWidth: "calc(100vw - 32px)",
                boxShadow: `0 0 0 1px oklch(0.96 0 0 / 0.04),
                            0 24px 56px -8px oklch(0 0 0 / 0.65),
                            0 8px 20px -4px oklch(0 0 0 / 0.4)`,
                animation: animateOut
                    ? "ecm-card-out 0.28s cubic-bezier(0.4,0,1,1) forwards"
                    : "ecm-card-in 0.32s cubic-bezier(0.34,1.56,0.64,1) forwards",
                }}
            >
                <RainbowBar
                    className="absolute top-0 left-0 right-0 h-1"
                />

                <div className="relative overflow-hidden">
                    <TileLattice opacity={0.05} />

                    <button
                        aria-label="Close"
                        onClick={() => triggerClose(onCancel)}
                        className="absolute top-3 right-3 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-hairline bg-transparent text-fg2 cursor-pointer hover:bg-white/5 hover:text-fg transition-colors"
                    >
                        <CloseIcon />
                    </button>

                    <div className="relative z-[1] p-[26px]">

                        <IconChip color={DANGER}>
                            <WarningIcon />
                        </IconChip>

                        <h2
                        id="ecm-title"
                        className="mb-2.5 font-outfit text-[17px] font-extrabold uppercase tracking-[0.05em] text-fg"
                        >
                            {title}
                        </h2>

                        <p className="mb-[22px] text-[13.5px] leading-[1.65] text-fg2">
                            {message}
                        </p>

                        <div className="mb-5 h-px bg-hairline opacity-60 -mx-[26px]" />

                        <div className="flex gap-2.5">
                            <GhostButton onClick={() => triggerClose(onCancel)}>Stay</GhostButton>
                            <DangerButton onClick={() => triggerClose(onConfirm)}>Exit</DangerButton>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}