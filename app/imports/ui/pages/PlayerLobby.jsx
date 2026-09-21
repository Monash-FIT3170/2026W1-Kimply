import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { RoomsCollection } from '/imports/api/rooms';
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

function getGameModeColor(mode) {
  const colors = {
    default: 'oklch(0.70 0.22 70)',
    easy: 'oklch(0.75 0.20 120)',
    medium: 'oklch(0.70 0.22 70)',
    hard: 'oklch(0.65 0.22 25)',
    custom: 'oklch(0.60 0.20 270)',
    battle_royale: 'oklch(0.50 0.25 340)',
  };
  return colors[mode] || 'oklch(0.60 0.20 270)';
}

function getGameModeLabel(mode) {
  if (mode === 'battle_royale') return 'Battle Royale Mode';
  return `${(mode || 'default').charAt(0).toUpperCase()}${(mode || 'default').slice(1)} Mode`;
}

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[10px] border border-hairline bg-surface xs:h-9 xs:w-9"
    >
      <BackChevron size={14} stroke={FG2} />
    </button>
  );
}

function PlayerRow({ player, isYou, onKick }) {
  const color = avatarColor(player.name);
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-xl border border-hairline bg-surface px-3.5 py-3">
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
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border-none opacity-60 transition-opacity hover:opacity-100 xs:h-8 xs:w-8 xs:opacity-40"
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

function SharePanel({ link }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex w-full flex-col items-stretch gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 xs:flex-row xs:items-center xs:gap-2 xs:px-3">
      <span className="flex-1 select-all truncate font-mono text-[11px] text-fg3">{link}</span>
      <button
        onClick={copy}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 font-outfit text-[11px] font-semibold uppercase tracking-wider transition-all xs:min-h-0 xs:py-1.5"
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

function HostView({ room, playerName, playerId, playerAccount, onBack, navigate, gameMode, customSettings }) {
  const players = room.players || [];
  const joinLink = `${window.location.origin}/play/join?code=${room.pin}`;
  const [editing, setEditing] = useState(true);
  const [gameName, setGameName] = useState('');
  const trimmedGameName = gameName.trim();
  const hasGameName = trimmedGameName.length > 0;

  const handleStart = () => {
    Meteor.call('rooms.start', room.pin, gameMode, (err) => {
      if (err) {
        console.error(err);
        return;
      }
      navigate('/game', { state: { playerName, playerId, pin: room.pin, gameMode, playerAccount } });
    });
  };

  const kickPlayer = (playerId) => {
    Meteor.call('rooms.kick', room.pin, playerId);
  };

  const saveGameName = async () => {
    await Meteor.callAsync('rooms.updateGameName', room.pin, hasGameName ? trimmedGameName : `Game${room.pin}`);
    setEditing(false);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.05} />

      <div className="relative flex shrink-0 items-center justify-between gap-3 px-6 py-4 xs:gap-4 xs:px-7 xs:py-5">
        <Wordmark />
        <BackButton onClick={onBack} />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-start gap-6 overflow-y-auto px-6 pb-8 pt-4 xs:justify-center xs:gap-7 xs:px-7 xs:pb-7 xs:pt-0">
        {/* room code panel */}
        <div className="relative flex w-full max-w-lg flex-col items-center gap-5 overflow-hidden rounded-[22px] border border-hairline bg-surface px-4 pb-6 pt-8 xs:gap-4 xs:px-6 xs:pb-5">
          {/* tile band */}
          <RainbowBar className="absolute left-0 right-0 top-0 h-1" />

          {/* Game Name */}
          <div className="flex w-full flex-col items-center gap-2 xs:w-auto xs:flex-row xs:gap-1">
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
                className="w-full max-w-[14rem] rounded-[12px] border border-hairline bg-surface px-3 py-2 text-center font-outfit text-base font-semibold text-fg outline-none placeholder:text-fg3 xs:w-48 xs:py-1"
                style={{ caretColor: PRIMARY }}
              />
            ) : (
              <div className="flex w-full flex-col items-center gap-2 xs:w-auto xs:flex-row xs:gap-1">
                <span className="font-outfit text-base font-semibold text-fg">
                  {hasGameName ? trimmedGameName : `Game${room.pin}`}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-fg2 xs:h-8 xs:w-8"
                >
                  <PencilIcon size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Game Mode Badge */}
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2"
            style={{ background: getGameModeColor(gameMode) }}
          >
            <span className="font-outfit text-sm font-semibold text-bg">
              {gameMode === 'battle_royale'
                ? 'Battle Royale Mode'
                : gameMode.charAt(0).toUpperCase() + gameMode.slice(1) + ' Mode'}
            </span>
          </div>

          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg3">Your Room Code</p>

          <div className="flex w-full justify-center gap-2 xs:gap-2.5">
            {room.pin.split('').map((ch, i) => (
              <div
                key={i}
                className="relative flex items-center justify-center rounded-xl border border-hairline font-mono font-bold text-fg"
                style={{
                  width: 'clamp(48px, 13vw, 56px)',
                  height: 'clamp(62px, 17vw, 72px)',
                  fontSize: 'clamp(32px, 9vw, 42px)',
                  background: 'oklch(0.24 0.02 270)',
                }}
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
              Players <span className="text-fg3">({players.length})</span>
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

function JoinedView({ room, playerName, playerId, playerAccount, onBack, navigate, gameMode, customSettings }) {
  const players = room.players || [];
  const selectedGameMode = room.gameMode || gameMode || 'default';

  const stillInRoom = !playerName || players.some((p) => p.name === playerName);
  useEffect(() => {
    if (!stillInRoom) navigate('/play', { replace: true, state: { kicked: true } });
  }, [stillInRoom]);

  useEffect(() => {
    if (!playerName) {
      // State lost on refresh let the reconnect popup handle it
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
      navigate('/game', {
        state: { playerName, playerId, pin: room.pin, gameMode: selectedGameMode, playerAccount },
      });
    }
  }, [room?.status]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <TileLattice opacity={0.04} />

      <div className="relative flex shrink-0 items-center justify-between gap-3 px-6 py-4 xs:gap-4 xs:px-7 xs:py-5">
        <Wordmark />
        <BackButton onClick={onBack} />
      </div>

      <div className="relative flex flex-1 flex-col items-center overflow-y-auto px-6 pb-8 pt-4 xs:px-7 xs:pt-0">
        <div className="flex w-full max-w-2xl flex-1 flex-col gap-5 xs:gap-4">
          {/* title row */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-fg3">You're in</p>
              <h1 className="font-outfit text-4xl font-extrabold leading-tight tracking-tight text-fg xs:leading-none">
                {room.gameName}
              </h1>
            </div>
            <div className="inline-flex items-center gap-2 rounded-[10px] border border-hairline bg-surface px-2.5 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-fg3">Room</span>
              <span className="font-mono text-[13px] font-bold text-fg">{room.pin}</span>
            </div>
          </div>

          {/* Game Mode Badge */}
          <div
            className="flex w-fit items-center gap-2 rounded-full px-4 py-2"
            style={{ background: getGameModeColor(selectedGameMode) }}
          >
            <span className="font-outfit text-sm font-semibold text-bg">{getGameModeLabel(selectedGameMode)}</span>
          </div>
          <div className="flex items-center justify-between">
            <p className="font-outfit text-sm font-bold uppercase tracking-widest text-fg2">
              Players <span className="text-fg3">({players.length})</span>
            </p>
            <span className="font-mono text-[11px] text-fg3">
              {players.length}/{players.length} ready
            </span>
          </div>

          {/* players grid */}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}
          >
            {players.map((p, i) => (
              <PlayerRow key={p.id || i} player={p} isYou={p.name === playerName} />
            ))}
          </div>
          <div className="mt-auto flex justify-center pt-3">
            <div
              className="inline-flex items-center gap-2 font-mono text-[12px] tracking-wide"
              style={{ color: TILE.amber }}
            >
              <span className="h-2 w-2 animate-kimply-pulse rounded-full" style={{ background: TILE.amber }} />
              Waiting for host to start the game...
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
  const playerAccount = state?.playerAccount;
  const gameStarted = useRef(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const isLoading = useSubscribe('rooms.lobby', pin);
  const room = useTracker(() => RoomsCollection.findOne({ pin }));
  const gameMode = room?.gameMode || state?.gameMode || 'default';
  const customSettings = room?.customSettings || state?.customSettings || null;

  useEffect(() => {
    if (room?.status === 'in_progress' && !gameStarted.current) {
      gameStarted.current = true;
      navigate('/game', {
        state: { playerName, playerId, pin: room.pin, gameMode, playerAccount },
      });
    }
  }, [room?.status]);

  if (!isLoading() && !room && !gameStarted.current) {
    navigate('/play', { replace: true });
    return null;
  }

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

          localStorage.removeItem('reconnectData');
          navigate('/play', { replace: true, state: { playerAccount } });
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
        <HostView
          room={room}
          playerName={playerName}
          playerId={playerId}
          playerAccount={playerAccount}
          onBack={onBack}
          navigate={navigate}
          gameMode={gameMode}
          customSettings={customSettings}
        />
      ) : (
        <JoinedView
          room={room}
          playerName={playerName}
          playerId={playerId}
          playerAccount={playerAccount}
          onBack={onBack}
          navigate={navigate}
          gameMode={gameMode}
          customSettings={customSettings}
        />
      )}
    </>
  );
}
