import React, { useEffect, useRef, useState } from 'react';
import { ABILITIES } from '../../api/abilityRules';
import { DRAFT_SECONDS } from '../../constants';
import { GhostButton } from '../components/design';
import { AbilityCard, AbilityDialog, Countdown, KeyHint } from './AbilityDialog.jsx';
import { TargetPicker } from './TargetPicker.jsx';

// Seconds left in a draft, counted from when this device first saw it. The server
// closes the draft on its own clock; this is only the readout, so clock skew between
// devices can not cut anyone's draft short.
function useDraftSeconds(draftKey) {
  const [deadline, setDeadline] = useState(() => Date.now() + DRAFT_SECONDS * 1000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setDeadline(Date.now() + DRAFT_SECONDS * 1000);
  }, [draftKey]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

// The pick-1-of-3 draft. `draft` is the player's own secret.draft, or null while the
// cards are still being dealt. `onExpire` runs once when the readout reaches zero.
export function DraftOverlay({ draft, draftKey, levelLabel, candidates, onPick, onSkip, onExpire }) {
  const seconds = useDraftSeconds(draftKey);
  const [chosen, setChosen] = useState(null); // a targeted card waiting for its target
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const open = draft?.status === 'open';

  useEffect(() => {
    setChosen(null);
    setError('');
  }, [draftKey]);

  const expired = seconds === 0;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  useEffect(() => {
    if (expired) onExpireRef.current?.();
  }, [expired]);

  const submit = (action) => {
    setPending(true);
    setError('');
    action((err) => {
      setPending(false);
      if (err) setError(err.reason || 'That did not go through. Try again.');
    });
  };

  const choose = (type) => {
    if (!open || pending) return;
    if (ABILITIES[type].targeted && ABILITIES[type].timing === 'pre') {
      setChosen(type);
      return;
    }
    submit((done) => onPick(type, null, done));
  };

  useEffect(() => {
    if (!open || chosen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!pending) submit((done) => onSkip(done));
        return;
      }
      const index = Number(event.key) - 1;
      if (draft.offered[index]) {
        event.preventDefault();
        choose(draft.offered[index]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  let body;
  let footer = null;
  let title = 'Choose an ability';

  if (!draft) {
    body = <p className="font-manrope text-[13px] text-fg2">Dealing your cards.</p>;
  } else if (!open) {
    title = draft.status === 'picked' ? 'Locked in' : 'No card this round';
    const pick = draft.pick;
    const target = pick?.targetId && candidates.find((p) => p._id === pick.targetId);
    body = (
      <p className="font-manrope text-[13px] leading-6 text-fg2">
        {pick ? `${ABILITIES[pick.type].label}${target ? ` on ${target.name}` : ''}. ` : 'You passed on this draft. '}
        The round starts when everyone has chosen or the clock runs out.
      </p>
    );
  } else if (chosen) {
    title = `${ABILITIES[chosen].label} who?`;
    body = (
      <TargetPicker
        players={candidates}
        onSelect={(targetId) => submit((done) => onPick(chosen, targetId, done))}
        onBack={() => setChosen(null)}
      />
    );
    footer = <GhostButton onClick={() => setChosen(null)}>Back · Esc</GhostButton>;
  } else {
    body = (
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-3">
        {draft.offered.map((type, index) => (
          <AbilityCard key={type} type={type} keyHint={index + 1} disabled={pending} onClick={() => choose(type)} />
        ))}
      </div>
    );
    footer = (
      <div className="flex items-center justify-between gap-3">
        <p className="font-manrope text-[13px] text-fg3">Pick one, or skip this draft.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit((done) => onSkip(done))}
          className="inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-hairline px-3.5 font-outfit text-xs font-semibold uppercase tracking-[0.1em] text-fg2 transition-colors duration-[120ms] hover:bg-surface2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skip <KeyHint>Esc</KeyHint>
        </button>
      </div>
    );
  }

  return (
    <AbilityDialog
      labelledBy="draft-title"
      eyebrow={`${levelLabel} · Ability draft`}
      title={title}
      aside={<Countdown seconds={seconds} />}
      footer={
        <>
          {error && (
            <p role="alert" className="font-manrope text-[13px] text-tile-pink">
              {error}
            </p>
          )}
          {footer}
        </>
      }
    >
      {body}
    </AbilityDialog>
  );
}
