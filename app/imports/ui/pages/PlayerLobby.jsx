import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { RoomsCollection } from '/imports/api/rooms';
import {
  CUSTOM_SETTING_LIMITS,
  DEFAULT_GAME_MODE,
  GAME_MODE_OPTIONS,
  GAME_MODES,
  gameModeLabel,
  normalizeCustomSettings,
  resolveGameSettings,
} from '/imports/api/gameModes';
import { ConfirmationPopup } from '../components/ConfirmationPopup';
import {
  PRIMARY,
  TILE,
  HAIRLINE,
  FG2,
  TileLattice,
  Wordmark,
  Avatar,
  avatarColor,
  ReadyChip,
  CopyIcon,
  BackChevron,
  PencilIcon,
  RainbowBar,
} from '../components/design';

const MAX_PLAYERS = 8;

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-hairline bg-surface"
    >
      <BackChevron size={14} stroke={FG2} />
    </button>
  );
}

function PlayerRow({ player, isYou, onKick }) {
  const color = avatarColor(player.name);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface px-3.5 py-2.5">
      <Avatar letter={player.name[0]?.toUpperCase()} color={color} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-outfit text-sm font-semibold text-fg">
          {player.name}
          {isYou && <span className="ml-1.5 font-medium text-fg3">· you</span>}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-fg3">Player</div>
      </div>
      {onKick ? (
        <button
          onClick={onKick}
          title={`Kick ${player.name}`}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-none opacity-40 transition-opacity hover:opacity-100"
          style={{
            background: 'color-mix(in oklab, oklch(0.65 0.19 20) 15%, transparent)',
            color: 'oklch(0.65 0.19 20)',
          }}
        >
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <ReadyChip ready />
      )}
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-hairline px-3.5 py-2.5">
      <div className="h-8 w-8 shrink-0 rounded-full border border-dashed border-hairline" />
      <span className="font-outfit text-[13px] font-medium text-fg3">Empty slot</span>
    </div>
  );
}

function SharePanel({ link }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2">
      <span className="flex-1 select-all truncate font-mono text-[11px] text-fg3">{link}</span>
      <button
        onClick={copy}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 font-outfit text-[11px] font-semibold uppercase tracking-wider transition-all"
        style={{
          background: copied ? `color-mix(in oklab, ${PRIMARY} 16%, transparent)` : 'transparent',
          color: copied ? PRIMARY : 'oklch(0.72 0.01 270)',
          borderColor: copied ? `color-mix(in oklab, ${PRIMARY} 40%, transparent)` : 'oklch(0.32 0.02 270)',
        }}
      >
        {copied ? (
          <>
            <svg width={11} height={11} viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8l4 4 6-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Copied
          </>
        ) : (
          <>
            <CopyIcon size={11} />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

function ModeBadge({ gameMode, customSettings }) {
  const settings = resolveGameSettings(gameMode || DEFAULT_GAME_MODE, customSettings);

  return (
    <div className="inline-flex items-center gap-2 rounded-[10px] border border-hairline bg-surface px-2.5 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg3">Mode</span>
      <span className="font-mono text-[13px] font-bold text-fg">{gameModeLabel(settings.gameMode)}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg3">
        {settings.lives} {settings.lives === 1 ? 'life' : 'lives'} · start {settings.startingLength}
      </span>
    </div>
  );
}

function ModeSelector({ selectedMode, onSelect }) {
  const selected = selectedMode || DEFAULT_GAME_MODE;
  const colors = [TILE.teal, PRIMARY, TILE.pink, TILE.violet, TILE.amber];

  return (
    <div className="grid w-full gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))' }}>
      {GAME_MODE_OPTIONS.map((option, index) => {
        const active = option.value === selected;
        const color = colors[index % colors.length];

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className="flex min-h-[62px] cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 text-left transition-all"
            style={{
              background: active ? `color-mix(in oklab, ${color} 18%, transparent)` : 'oklch(0.20 0.02 270)',
              borderColor: active ? `color-mix(in oklab, ${color} 70%, transparent)` : HAIRLINE,
              boxShadow: active ? `0 8px 26px -16px color-mix(in oklab, ${color} 80%, transparent)` : 'none',
            }}
          >
            <span className="font-outfit text-[13px] font-extrabold uppercase tracking-[0.12em] text-fg">
              {option.label}
            </span>
            <span
              className="mt-1 font-mono text-[9px] uppercase tracking-widest"
              style={{ color: active ? color : FG2 }}
            >
              {option.detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CustomSettingControl({ label, value, min, max, onChange }) {
  return (
    <label className="bg-bg/40 flex flex-col gap-2 rounded-lg border border-hairline px-3 py-2.5">
      <span className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg3">{label}</span>
        <span className="font-outfit text-sm font-extrabold text-fg">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
        style={{ accentColor: PRIMARY }}
      />
    </label>
  );
}

function CustomSettingsPanel({ settings, onChange }) {
  const customSettings = normalizeCustomSettings(settings);

  const updateSetting = (key, value) => {
    onChange({
      ...customSettings,
      [key]: value,
    });
  };

  return (
    <div className="mt-3 grid w-full gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      <CustomSettingControl
        label="Start Length"
        value={customSettings.startingLength}
        min={CUSTOM_SETTING_LIMITS.startingLength.min}
        max={CUSTOM_SETTING_LIMITS.startingLength.max}
        onChange={(value) => updateSetting('startingLength', value)}
      />
      <CustomSettingControl
        label="Lives"
        value={customSettings.lives}
        min={CUSTOM_SETTING_LIMITS.lives.min}
        max={CUSTOM_SETTING_LIMITS.lives.max}
        onChange={(value) => updateSetting('lives', value)}
      />
      <CustomSettingControl
        label="Growth"
        value={customSettings.sequenceGrowth}
        min={CUSTOM_SETTING_LIMITS.sequenceGrowth.min}
        max={CUSTOM_SETTING_LIMITS.sequenceGrowth.max}
        onChange={(value) => updateSetting('sequenceGrowth', value)}
      />
    </div>
  );
}

function HostView({ room, playerName, onBack, navigate }) {
  const players = room.players || [];
  const joinLink = `${window.location.origin}/play/join?code=${room.pin}`;
  const [editing, setEditing] = useState(true);
  const [gameName, setGameName] = useState('');
  const trimmedGameName = gameName.trim();
  const hasGameName = trimmedGameName.length > 0;
  const selectedMode = room.gameMode || DEFAULT_GAME_MODE;
  const customSettings = normalizeCustomSettings(room.customSettings);

  const handleStart = () => {
    Meteor.call('rooms.start', room.pin, (err) => {
      if (err) {
        console.error(err);
        return;
      }
      navigate('/game', { state: { playerName, pin: room.pin } });
    });
  };

  const kickPlayer = (playerId) => {
    Meteor.call('rooms.kick', room.pin, playerId);
  };

  const saveGameName = async () => {
    await Meteor.callAsync('rooms.updateGameName', room.pin, hasGameName ? trimmedGameName : `Game${room.pin}`);
    setEditing(false);
  };

  const updateGameMode = (gameMode) => {
    if (gameMode === selectedMode) return;
    Meteor.call('rooms.updateGameMode', room.pin, gameMode, (err) => {
      if (err) console.error(err);
    });
  };

  const updateCustomSettings = (settings) => {
    Meteor.call('rooms.updateCustomSettings', room.pin, settings, (err) => {
      if (err) console.error(err);
    });
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      <div className="relative flex shrink-0 items-center justify-between px-7 py-5">
        <Wordmark />
        <BackButton onClick={onBack} />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-7 pb-7">
        {/* room code panel */}
        <div className="relative flex w-full max-w-lg flex-col items-center gap-4 overflow-hidden rounded-[22px] border border-hairline bg-surface px-6 pb-5 pt-8">
          {/* tile band */}
          <RainbowBar className="absolute left-0 right-0 top-0 h-1" />

          {/* Game Name */}
          <div className="flex items-center gap-1">
            <p className="height-[32px] shrink-0 whitespace-nowrap text-center font-mono text-[11px] uppercase leading-none tracking-[0.16em] text-fg3">
              Game Name:{' '}
            </p>

            {editing ? (
              <input
                autoFocus
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                onBlur={() => saveGameName()}
                onKeyDown={(e) => e.key === 'Enter' && saveGameName()}
                placeholder={`Game${room.pin}`}
                maxLength={30}
                className="w-48 rounded-[12px] border border-hairline bg-surface px-3 py-1 text-center font-outfit text-base font-semibold text-fg outline-none placeholder:text-fg3"
                style={{ caretColor: PRIMARY }}
              />
            ) : (
              <div className="flex items-center gap-1">
                <span className="font-outfit text-base font-semibold text-fg">
                  {hasGameName ? trimmedGameName : `Game${room.pin}`}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-fg2"
                >
                  <PencilIcon size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="w-full">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg3">Game Mode</p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-fg3">
                {gameModeLabel(selectedMode)}
              </span>
            </div>
            <ModeSelector selectedMode={selectedMode} onSelect={updateGameMode} />
            {selectedMode === GAME_MODES.CUSTOM && (
              <CustomSettingsPanel settings={customSettings} onChange={updateCustomSettings} />
            )}
          </div>

          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg3">Your Room Code</p>

          <div className="flex gap-2.5">
            {room.pin.split('').map((ch, i) => (
              <div
                key={i}
                className="relative flex items-center justify-center rounded-xl border border-hairline font-mono font-bold text-fg"
                style={{ width: 56, height: 72, fontSize: 42, background: 'oklch(0.24 0.02 270)' }}
              >
                {ch}
                <div
                  className="absolute bottom-1.5 rounded-sm"
                  style={{
                    left: '25%',
                    right: '25%',
                    height: 2.5,
                    background: [TILE.pink, TILE.amber, TILE.teal, TILE.violet, PRIMARY][i % 5],
                  }}
                />
              </div>
            ))}
          </div>

          <div className="mt-1 w-full">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-fg3">Invite link</p>
            <SharePanel link={joinLink} />
          </div>
        </div>

        {/* players */}
        <div className="flex w-full max-w-lg flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-outfit text-[13px] font-bold uppercase tracking-widest text-fg2">
              Players{' '}
              <span className="text-fg3">
                ({players.length}/{MAX_PLAYERS})
              </span>
            </p>
            <div className="inline-flex items-center gap-1.5 font-mono text-[11px]" style={{ color: TILE.amber }}>
              <span className="h-1.5 w-1.5 animate-kimply-pulse rounded-full" style={{ background: TILE.amber }} />
              Waiting for players
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {players.map((p, i) => (
              <PlayerRow
                key={p.id || i}
                player={p}
                isYou={p.name === playerName}
                onKick={p.name !== playerName ? () => kickPlayer(p.id) : null}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={players.length < 1}
          className="w-full max-w-lg rounded-xl px-7 py-4 font-outfit text-sm font-extrabold uppercase tracking-[0.14em] transition-all"
          style={{
            background: players.length >= 1 ? PRIMARY : `color-mix(in oklab, ${PRIMARY} 30%, oklch(0.14 0.02 270))`,
            color: 'oklch(0.14 0.02 270)',
            cursor: players.length >= 1 ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow:
              players.length >= 1 ? `0 12px 40px -10px color-mix(in oklab, ${PRIMARY} 70%, transparent)` : 'none',
          }}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}

function JoinedView({ room, playerName, onBack, navigate, initialGameMode, initialCustomSettings }) {
  const players = room.players || [];
  const emptySlots = Math.max(0, MAX_PLAYERS - players.length);

  const stillInRoom = !playerName || players.some((p) => p.name === playerName);
  useEffect(() => {
    if (!stillInRoom) navigate('/play', { replace: true, state: { kicked: true } });
  }, [stillInRoom]);

  useEffect(() => {
    if (!playerName) {
      // State lost on refresh — let the reconnect popup handle it
      navigate('/play', { replace: true });
      return;
    }
    if (!stillInRoom) {
      localStorage.removeItem('reconnectData');
      navigate('/play', { replace: true, state: { kicked: true } });
    }
  }, [stillInRoom, playerName]);

  useEffect(() => {
    if (room?.status === 'in_progress') {
      navigate('/game', { state: { playerName, pin: room.pin } });
    }
  }, [room?.status]);

  const progress = (players.length / MAX_PLAYERS) * 100;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.04} />

      <div className="relative flex shrink-0 items-center justify-between px-7 py-5">
        <Wordmark />
        <BackButton onClick={onBack} />
      </div>

      <div className="relative flex flex-1 flex-col items-center overflow-y-auto px-7 pb-6">
        <div className="flex w-full max-w-2xl flex-1 flex-col gap-4">
          {/* title row */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-fg3">You're in</p>
              <h1 className="font-outfit text-4xl font-extrabold leading-none tracking-tight text-fg">
                {room.gameName}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <ModeBadge
                gameMode={room.gameMode || initialGameMode}
                customSettings={room.customSettings || initialCustomSettings}
              />
              <div className="inline-flex items-center gap-2 rounded-[10px] border border-hairline bg-surface px-2.5 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-fg3">Room</span>
                <span className="font-mono text-[13px] font-bold text-fg">{room.pin}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="font-outfit text-sm font-bold uppercase tracking-widest text-fg2">
              Players{' '}
              <span className="text-fg3">
                ({players.length}/{MAX_PLAYERS})
              </span>
            </p>
            <span className="font-mono text-[11px] text-fg3">
              {players.length}/{players.length} ready
            </span>
          </div>

          {/* progress bar */}
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${TILE.pink}, ${TILE.amber}, ${TILE.teal}, ${TILE.violet})`,
              }}
            />
          </div>

          {/* players grid */}
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {players.map((p, i) => (
              <PlayerRow key={p.id || i} player={p} isYou={p.name === playerName} />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <EmptySlot key={`e${i}`} />
            ))}
          </div>
          <div className="mt-auto flex justify-center pt-3">
            <div
              className="inline-flex items-center gap-2 font-mono text-[12px] tracking-wide"
              style={{ color: TILE.amber }}
            >
              <span className="h-2 w-2 animate-kimply-pulse rounded-full" style={{ background: TILE.amber }} />
              Waiting for host to start the game…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerLobby() {
  const { pin } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const playerName = state?.playerName || '';
  const playerId = state?.playerId || '';
  const isHost = state?.isHost === true;
  const gameStarted = useRef(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const isLoading = useSubscribe('rooms.lobby', pin);
  const room = useTracker(() => RoomsCollection.findOne({ pin }));

  useEffect(() => {
    if (room?.status === 'in_progress' && !gameStarted.current) {
      gameStarted.current = true;
      navigate('/game', { state: { playerName, pin: room.pin } });
    }
  }, [room?.status]);

  if (!isLoading() && !room && !gameStarted.current) {
    navigate('/play', { replace: true });
    return null;
  }
  useEffect(() => {
    if (room === undefined && !isLoading) {
      navigate('/play', { replace: true });
    }
  }, [room]);

  if (!room) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-kimply-pulse rounded-full" style={{ background: PRIMARY }} />
      </div>
    );
  }

  const onBack = () => setShowExitPopup(true);

  return (
    <>
      <ConfirmationPopup
        isOpen={showExitPopup}
        onConfirm={() => {
          setShowExitPopup(false);
          Meteor.call('rooms.disconnect', pin, playerId);

          // removing session storage of reconnect data
          localStorage.removeItem('reconnectData');
          navigate('/play', { replace: true });
        }}
        onCancel={() => {
          setShowExitPopup(false);
        }}
        title="Leave Game"
        message={
          isHost
            ? 'Are you sure you want to disconnect from the game, this will terminate the game sesssion.'
            : 'Are you sure you want to disconnect from the game?'
        }
      />

      {isHost ? (
        <HostView room={room} playerName={playerName} onBack={onBack} navigate={navigate} />
      ) : (
        <JoinedView
          room={room}
          playerName={playerName}
          onBack={onBack}
          navigate={navigate}
          initialGameMode={state?.gameMode}
          initialCustomSettings={state?.customSettings}
        />
      )}
    </>
  );
}
