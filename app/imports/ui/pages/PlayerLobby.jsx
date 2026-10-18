import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { RoomsCollection } from '/imports/api/rooms';
import { AbilitiesChip, AbilitiesSwitch, AbilityGuideButton } from '../abilities/LobbyAbilities.jsx';
import { ConfirmationPopup } from '../components/ConfirmationPopup';
import { QrCodeButton } from '../components/QrCodeDialog';
import { inviteLink } from '../roomCode';
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

function getGameModeName(mode) {
  if (mode === 'battle_royale') return 'Battle Royale';
  return `${(mode || 'default').charAt(0).toUpperCase()}${(mode || 'default').slice(1)}`;
}

function getGameModeLabel(mode) {
  return `${getGameModeName(mode)} Mode`;
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
    // Fixed height so rows with a kick button match the host's own row. The kick button's
    // touch target already carries its own space, so those rows need less right padding.
    // Your own row is tinted like the leaderboards do, since in a narrow grid card the
    // "· you" suffix can truncate away. It gives way before the name does.
    <div
      className={`flex h-[52px] shrink-0 items-center gap-3 rounded-xl border border-hairline bg-surface pl-3.5 xs:h-12 ${
        onKick ? 'pr-1 xs:pr-2' : 'pr-3.5'
      }`}
      style={
        isYou
          ? {
              background: `color-mix(in oklab, ${PRIMARY} 10%, oklch(0.20 0.02 270))`,
              borderColor: `color-mix(in oklab, ${PRIMARY} 48%, transparent)`,
            }
          : undefined
      }
    >
      <Avatar letter={player.name[0]?.toUpperCase()} color={color} size={28} />
      <div className="flex min-w-0 flex-1 items-baseline font-outfit text-sm font-semibold text-fg">
        <span className="max-w-full shrink-0 truncate">{player.name}</span>
        {isYou && <span className="ml-1.5 min-w-0 truncate font-medium text-fg3">· you</span>}
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

// `pin`, when given, adds the host's "QR code" button beside Copy.
function SharePanel({ link, pin = null }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-surface py-1.5 pl-3 pr-1.5">
      <span className="min-w-0 flex-1 select-all truncate font-mono text-[11px] text-fg3">{link}</span>
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
      {pin && <QrCodeButton pin={pin} link={link} />}
    </div>
  );
}

function HostView({ room, playerName, playerId, onBack, navigate, gameMode, customSettings }) {
  const players = room.players || [];
  const joinLink = inviteLink(window.location.origin, room.pin);
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
      navigate('/game', { state: { playerName, playerId, pin: room.pin, gameMode } });
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

      {/* The room panel and Start button keep their size; only the player list scrolls, so a
          full lobby never squashes the room code. Auto margins centre the group when it fits;
          justify-center would push the top out of reach once it overflows. The outer scroll is
          a fallback for screens too short to fit the panel plus a minimum list height.
          From lg up it becomes a full-screen grid: panel and Start in a left column, and the
          players filling the rest of the screen. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-4 pb-6 pt-2 xs:gap-5 xs:px-7 lg:grid lg:grid-cols-[26rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:items-start lg:gap-x-10 lg:gap-y-5 lg:px-10 lg:pb-10">
        {/* room code panel */}
        <div className="relative mt-auto flex w-full max-w-lg shrink-0 flex-col items-center gap-4 overflow-hidden rounded-[22px] border border-hairline bg-surface px-4 pb-5 pt-6 xs:px-6 lg:col-start-1 lg:row-start-1 lg:mt-0">
          {/* tile band */}
          <RainbowBar className="absolute left-0 right-0 top-0 h-1" />

          {/* Game Name */}
          <div className="flex min-h-11 w-full min-w-0 items-center justify-center gap-2 xs:min-h-8 xs:gap-1">
            <p className="shrink-0 whitespace-nowrap font-mono text-[11px] uppercase leading-none tracking-[0.16em] text-fg3">
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
                className="w-40 min-w-0 rounded-[12px] border border-hairline bg-surface px-3 py-1.5 text-center font-outfit text-base font-semibold text-fg outline-none placeholder:text-fg3 xs:w-48 xs:py-1"
                style={{ caretColor: PRIMARY }}
              />
            ) : (
              <div className="flex min-w-0 items-center gap-1">
                <span className="truncate font-outfit text-base font-semibold text-fg">
                  {hasGameName ? trimmedGameName : `Game${room.pin}`}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  aria-label="Rename game"
                  className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-fg2 xs:h-8 xs:w-8"
                >
                  <PencilIcon size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Game mode and abilities share a row */}
          <div className="flex flex-wrap items-start justify-center gap-2">
            <div
              className="flex min-h-11 items-center rounded-full px-4"
              style={{ background: getGameModeColor(gameMode) }}
            >
              <span className="whitespace-nowrap font-outfit text-sm font-semibold text-bg">
                {getGameModeName(gameMode)}
              </span>
            </div>
            <AbilitiesSwitch pin={room.pin} enabled={room.abilitiesEnabled === true} />
            {room.abilitiesEnabled === true && (
              <AbilityGuideButton gameMode={gameMode} startingLives={room.customSettings?.startingLives} />
            )}
          </div>

          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg3">Your Room Code</p>

          <div className="flex w-full justify-center gap-2 xs:gap-2.5">
            {room.pin.split('').map((ch, i) => (
              <div
                key={i}
                className="relative flex items-center justify-center rounded-xl border border-hairline font-mono font-bold text-fg"
                style={{
                  width: 'clamp(40px, 12vw, 48px)',
                  height: 'clamp(52px, 15vw, 60px)',
                  fontSize: 'clamp(28px, 8vw, 34px)',
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

          <div className="w-full">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-fg3">Invite link</p>
            <SharePanel link={joinLink} pin={room.pin} />
          </div>
        </div>

        {/* players */}
        {/* min-h is the heading plus one row: the list gives up space before the panel does,
            but never disappears entirely */}
        <div className="flex min-h-[4.75rem] w-full max-w-lg flex-col gap-3 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:h-full lg:max-w-none">
          <div className="flex shrink-0 items-center justify-between">
            <p className="font-outfit text-[13px] font-bold uppercase tracking-widest text-fg2">
              Players <span className="text-fg3">({players.length})</span>
            </p>
            <div className="inline-flex items-center gap-1.5 font-mono text-[11px]" style={{ color: TILE.amber }}>
              <span className="h-1.5 w-1.5 animate-kimply-pulse rounded-full" style={{ background: TILE.amber }} />
              Waiting for players
            </div>
          </div>
          <div className="-mr-1.5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1.5 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] lg:content-start lg:gap-3">
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
          className="mb-auto w-full max-w-lg shrink-0 rounded-xl px-7 py-4 font-outfit text-sm font-extrabold uppercase tracking-[0.14em] transition-all lg:col-start-1 lg:row-start-2 lg:mb-0"
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

function JoinedView({ room, playerName, playerId, onBack, navigate, gameMode, customSettings }) {
  const players = room.players || [];
  const joinLink = inviteLink(window.location.origin, room.pin);
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
        state: { playerName, playerId, pin: room.pin, gameMode: selectedGameMode },
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

      {/* The title, mode and waiting line stay put and only the player grid scrolls, so a
          big lobby never pushes them away. From lg up the view uses the full width. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-8 pt-4 xs:px-7 xs:pt-0 lg:px-10">
        <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-5 xs:gap-4 lg:max-w-none">
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
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex w-fit items-center gap-2 rounded-full px-4 py-2"
              style={{ background: getGameModeColor(selectedGameMode) }}
            >
              <span className="font-outfit text-sm font-semibold text-bg">{getGameModeLabel(selectedGameMode)}</span>
            </div>
            <AbilitiesChip enabled={room.abilitiesEnabled === true} />
            {room.abilitiesEnabled === true && (
              <AbilityGuideButton gameMode={selectedGameMode} startingLives={room.customSettings?.startingLives} slim />
            )}
          </div>
          {/* Anyone already in can bring friends in, not just the host. */}
          <div className="w-full max-w-md">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-fg3">Invite link</p>
            <SharePanel link={joinLink} />
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
            className="-mr-1.5 grid min-h-12 shrink content-start gap-3 overflow-y-auto pr-1.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))' }}
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
        state: { playerName, playerId, pin: room.pin, gameMode },
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
        <HostView
          room={room}
          playerName={playerName}
          playerId={playerId}
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
          onBack={onBack}
          navigate={navigate}
          gameMode={gameMode}
          customSettings={customSettings}
        />
      )}
    </>
  );
}
