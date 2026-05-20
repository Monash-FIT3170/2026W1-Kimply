import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { RoomsCollection } from '/imports/api/rooms';
import { ConfirmationPopup } from '../components/ConfirmationPopup';
import {
  PRIMARY, TILE, HAIRLINE, FG2,
  TileLattice, Wordmark, Avatar, avatarColor, ReadyChip, CopyIcon, BackChevron, PencilIcon, RainbowBar,
} from '../components/design';

const MAX_PLAYERS = 8;

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 rounded-[10px] bg-surface border border-hairline inline-flex items-center justify-center cursor-pointer"
    >
      <BackChevron size={14} stroke={FG2} />
    </button>
  );
}

function PlayerRow({ player, isYou, onKick }) {
  const color = avatarColor(player.name);
  return (
    <div className="flex items-center gap-3 bg-surface border border-hairline rounded-xl px-3.5 py-2.5">
      <Avatar letter={player.name[0]?.toUpperCase()} color={color} size={32} />
      <div className="flex-1 min-w-0">
        <div className="font-outfit font-semibold text-sm text-fg truncate">
          {player.name}
          {isYou && <span className="text-fg3 font-medium ml-1.5">· you</span>}
        </div>
        <div className="font-mono text-[9px] text-fg3 uppercase tracking-widest">Player</div>
      </div>
      {onKick ? (
        <button
          onClick={onKick}
          title={`Kick ${player.name}`}
          className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer border-none opacity-40 hover:opacity-100 transition-opacity"
          style={{ background: 'color-mix(in oklab, oklch(0.65 0.19 20) 15%, transparent)', color: 'oklch(0.65 0.19 20)' }}
        >
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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
    <div className="flex items-center gap-3 border border-dashed border-hairline rounded-xl px-3.5 py-2.5">
      <div className="w-8 h-8 rounded-full border border-dashed border-hairline shrink-0" />
      <span className="font-outfit font-medium text-[13px] text-fg3">Empty slot</span>
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
    <div className="w-full flex items-center gap-2 bg-surface border border-hairline rounded-xl px-3 py-2">
      <span className="flex-1 font-mono text-[11px] text-fg3 truncate select-all">{link}</span>
      <button
        onClick={copy}
        className="shrink-0 inline-flex items-center gap-1.5 font-outfit font-semibold text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-lg border cursor-pointer transition-all"
        style={{
          background: copied ? `color-mix(in oklab, ${PRIMARY} 16%, transparent)` : 'transparent',
          color: copied ? PRIMARY : 'oklch(0.72 0.01 270)',
          borderColor: copied ? `color-mix(in oklab, ${PRIMARY} 40%, transparent)` : 'oklch(0.32 0.02 270)',
        }}
      >
        {copied ? (
          <>
            <svg width={11} height={11} viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

function HostView({ room, playerName, onBack }) {
  const players = room.players || [];
  const joinLink = `${window.location.origin}/play/join?code=${room.pin}`;
  const [editing, setEditing] = useState(true);
  const [gameName, setGameName] = useState('');
  const trimmedGameName = gameName.trim()
  const hasGameName = trimmedGameName.length > 0;

  const kickPlayer = (playerId) => {
    Meteor.call('rooms.kick', room.pin, playerId);
  };

  const saveGameName = async() =>{
    await Meteor.callAsync("rooms.updateGameName", room.pin, hasGameName ? trimmedGameName : `Game${room.pin}`)
    setEditing(false);
  };

  return (
    <div className="relative w-full h-full bg-bg text-fg overflow-hidden flex flex-col">
      <TileLattice opacity={0.05} />

      <div className="relative flex justify-between items-center px-7 py-5 shrink-0">
        <Wordmark />
        <BackButton onClick={onBack} />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center gap-7 px-7 pb-7 overflow-y-auto">
        {/* room code panel */}
        <div
          className="w-full max-w-lg bg-surface border border-hairline rounded-[22px] flex flex-col items-center gap-4 pt-8 pb-5 px-6 relative overflow-hidden"
        >
          {/* tile band */}
          <RainbowBar
            className="absolute top-0 left-0 right-0 h-1"
          />

          {/* Game Name */}
          <div className='flex items-center gap-1'>
            <p className="font-mono height-[32px] text-[11px] text-fg3 uppercase tracking-[0.16em] text-center leading-none whitespace-nowrap shrink-0">Game Name: </p>

            {editing ? (
              <input
                autoFocus
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                onBlur={() => saveGameName()}
                onKeyDown={(e) => e.key === 'Enter' && saveGameName()}
                placeholder={`Game${room.pin}`}
                maxLength={30}
                className="w-48 bg-surface border border-hairline rounded-[12px] px-3 py-1 font-outfit font-semibold text-base text-fg outline-none placeholder:text-fg3 text-center"
                style={{ caretColor: PRIMARY }}
              />
            ) : (
              <div className='flex items-center gap-1'> 
                <span className="font-outfit font-semibold text-base text-fg">{hasGameName ? trimmedGameName : `Game${room.pin}`}</span>
                <button
                  onClick={() => setEditing(true)}
                  className="w-8 h-8 rounded-lg bg-transparent border-none text-fg2 cursor-pointer inline-flex items-center justify-center"
                >
                  <PencilIcon size={14} />
                </button>
              </div>
            )}
          </div>


          <p className="font-mono text-[11px] text-fg3 uppercase tracking-[0.18em]">Your Room Code</p>

          <div className="flex gap-2.5">
            {room.pin.split('').map((ch, i) => (
              <div
                key={i}
                className="relative flex items-center justify-center font-mono font-bold text-fg rounded-xl border border-hairline"
                style={{ width:56, height:72, fontSize:42, background:'oklch(0.24 0.02 270)' }}
              >
                {ch}
                <div
                  className="absolute bottom-1.5 rounded-sm"
                  style={{
                    left:'25%', right:'25%', height:2.5,
                    background: [TILE.pink, TILE.amber, TILE.teal, TILE.violet, PRIMARY][i % 5],
                  }}
                />
              </div>
            ))}
          </div>

          <div className="w-full mt-1">
            <p className="font-mono text-[10px] text-fg3 uppercase tracking-widest mb-1.5">Invite link</p>
            <SharePanel link={joinLink} />
          </div>
        </div>

        {/* players */}
        <div className="w-full max-w-lg flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-outfit font-bold text-[13px] text-fg2 uppercase tracking-widest">
              Players <span className="text-fg3">({players.length}/{MAX_PLAYERS})</span>
            </p>
            <div className="inline-flex items-center gap-1.5 font-mono text-[11px]" style={{ color: TILE.amber }}>
              <span className="w-1.5 h-1.5 rounded-full animate-kimply-pulse" style={{ background: TILE.amber }} />
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
      </div>
    </div>
  );
}

function JoinedView({ room, playerName, onBack, navigate }) {
  const players = room.players || [];
  const emptySlots = Math.max(0, MAX_PLAYERS - players.length);

  const stillInRoom = players.some(p => p.name === playerName);
  useEffect(() => {
    if (!stillInRoom) {
      localStorage.removeItem('reconnectData');
      navigate('/play', { replace: true, state: { kicked: true } });
    }
  }, [stillInRoom]);
  const progress = (players.length / MAX_PLAYERS) * 100;

  return (
    <div className="relative w-full h-full bg-bg text-fg overflow-hidden flex flex-col">
      <TileLattice opacity={0.04} />

      <div className="relative flex justify-between items-center px-7 py-5 shrink-0">
        <Wordmark />
        <BackButton onClick={onBack} />
      </div>

      <div className="relative flex-1 flex flex-col items-center px-7 pb-6 overflow-y-auto">
        <div className="w-full max-w-2xl flex flex-col gap-4 flex-1">
          {/* title row */}
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <p className="font-mono text-[11px] text-fg3 uppercase tracking-[0.18em] mb-1">You're in</p>
              <h1 className="font-outfit font-extrabold text-4xl text-fg tracking-tight leading-none">{room.gameName}</h1>
            </div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] bg-surface border border-hairline">
              <span className="font-mono text-[10px] text-fg3 uppercase tracking-widest">Room</span>
              <span className="font-mono font-bold text-[13px] text-fg">{room.pin}</span>
            </div>
          </div>

          {/* players header */}
          <div className="flex items-center justify-between">
            <p className="font-outfit font-bold text-sm text-fg2 uppercase tracking-widest">
              Players <span className="text-fg3">({players.length}/{MAX_PLAYERS})</span>
            </p>
            <span className="font-mono text-[11px] text-fg3">{players.length}/{players.length} ready</span>
          </div>

          {/* progress bar */}
          <div className="h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width:`${progress}%`, background:`linear-gradient(90deg, ${TILE.pink}, ${TILE.amber}, ${TILE.teal}, ${TILE.violet})` }}
            />
          </div>

          {/* players grid */}
          <div className="grid gap-2.5" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {players.map((p, i) => (
              <PlayerRow key={p.id || i} player={p} isYou={p.name === playerName} />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => <EmptySlot key={`e${i}`} />)}
          </div>

          <div className="mt-auto flex justify-center pt-3">
            <div className="inline-flex items-center gap-2 font-mono text-[12px] tracking-wide" style={{ color: TILE.amber }}>
              <span className="w-2 h-2 rounded-full animate-kimply-pulse" style={{ background: TILE.amber }} />
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
  const [showExitPopup, setShowExitPopup] = useState(false);

  const isLoading = useSubscribe('rooms.lobby', pin);
  const room = useTracker(() => RoomsCollection.findOne({ pin }));

  useEffect(()=>{
    if (room === undefined && !isLoading){
      navigate('/play', {replace: true});
    }
  }, [room]);


  if (!room) {
    return (
      <div className="w-full h-full bg-bg flex items-center justify-center">
        <div className="w-8 h-8 rounded-full animate-kimply-pulse" style={{ background: PRIMARY }} />
      </div>
    );
  }

  const onBack = () => setShowExitPopup(true);


  return (
    <>
      <ConfirmationPopup
        isOpen = {showExitPopup}
        onConfirm ={() => {
          setShowExitPopup(false);
          Meteor.call('rooms.disconnect', pin, playerId) 

          // removing session storage of reconnect data
          localStorage.removeItem('reconnectData');
          navigate('/play', {replace: true});

        }}
        onCancel = {() =>{
          setShowExitPopup(false);
        }}
        title='Leave Game'
        message= { isHost ? 'Are you sure you want to disconnect from the game, this will terminate the game sesssion.' :'Are you sure you want to disconnect from the game?'}
      />

      { isHost? (
        <HostView room={room} playerName={playerName} onBack={onBack} />
      ) : (
        <JoinedView room={room} playerName={playerName} onBack={onBack} navigate={navigate} />
      )}
    </>
  )


}
