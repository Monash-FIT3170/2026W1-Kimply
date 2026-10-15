import React, { useEffect, useState } from 'react';
import { ABILITIES } from '../../api/abilityRules';
import { GhostButton } from '../components/design';
import { AbilityCard, AbilityDialog } from './AbilityDialog.jsx';
import { TargetPicker } from './TargetPicker.jsx';

// The cards a player holds, played during a round. Scramble asks for a target first.
export function HandDialog({ cards, candidates, onPlay, onClose }) {
  const [chosen, setChosen] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const play = (card, targetId = null) => {
    setPending(true);
    setError('');
    onPlay(card, targetId, (err) => {
      setPending(false);
      if (err) setError(err.reason || 'That did not go through. Try again.');
    });
  };

  const choose = (card) => {
    if (pending) return;
    if (ABILITIES[card.type].targeted) {
      setChosen(card);
      return;
    }
    play(card);
  };

  useEffect(() => {
    if (chosen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const card = cards[Number(event.key) - 1];
      if (card) {
        event.preventDefault();
        choose(card);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <AbilityDialog
      labelledBy="hand-title"
      eyebrow="Your cards · The clock keeps running"
      title={chosen ? `${ABILITIES[chosen.type].label} who?` : 'Play a card'}
      footer={
        <>
          {error && (
            <p role="alert" className="font-manrope text-[13px] text-tile-pink">
              {error}
            </p>
          )}
          <div className="flex">
            <GhostButton onClick={chosen ? () => setChosen(null) : onClose}>
              {chosen ? 'Back · Esc' : 'Close · Esc'}
            </GhostButton>
          </div>
        </>
      }
    >
      {chosen ? (
        <TargetPicker
          players={candidates.filter((p) => !p.completeRound)}
          onSelect={(targetId) => play(chosen, targetId)}
          onBack={() => setChosen(null)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
          {cards.map((card, index) => (
            <AbilityCard
              key={card.id}
              type={card.type}
              keyHint={index < 9 ? index + 1 : null}
              disabled={pending}
              onClick={() => choose(card)}
            />
          ))}
        </div>
      )}
    </AbilityDialog>
  );
}
