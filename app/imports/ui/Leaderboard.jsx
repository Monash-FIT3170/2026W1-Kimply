
import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { PlayersCollection } from '../api/players';
import { RoundsCollection } from '../api/rounds';
import { createLiveLeaderboardRows } from './leaderboardModels';

export const Leaderboard = ({ gameId, currentPlayerId }) => {
  const { rows, ready } = useTracker(() => {
    const playersSub = Meteor.subscribe('players', gameId);
    const roundsSub = Meteor.subscribe('rounds', gameId);

    if (!playersSub.ready() || !roundsSub.ready()) {
      return { rows: [], ready: false };
    }

    const players = PlayersCollection.find({ gameId }).fetch();
    const currentRound = RoundsCollection.findOne({ gameId, isCurrent: true });

    return {
      rows: createLiveLeaderboardRows(players, currentRound),
      ready: true,
    };
  }, [gameId]);

  return (
    <section className="w-full max-h-[80vh] rounded-2xl border border-hairline bg-[color:oklch(0.20_0.02_270_/_0.68)] p-5 text-fg shadow-xl backdrop-blur-md flex flex-col">
      <h2 className="mb-1 text-center font-outfit text-xl font-extrabold">Live Leaderboard</h2>
      <p className="mb-4 text-center font-mono text-[10px] uppercase tracking-widest text-fg3">
        Updates live during the game
      </p>
      <div className="mb-2 grid grid-cols-[1fr_52px_52px_88px] gap-2 font-mono text-[10px] uppercase tracking-wider text-fg3">
        <span>Player</span>
        <span className="text-right">Level</span>
        <span className="text-right">Lives</span>
        <span className="text-right">Status</span>
      </div>
      {!ready ? (
        <p className="py-4 text-center text-sm text-fg3">Loading players...</p>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto">
          {rows.map((player) => (
            <div
              key={player.id}
              className="grid grid-cols-[1fr_52px_52px_88px] items-center gap-2 rounded-xl border border-hairline px-3 py-3"
            >
              <span className="truncate font-outfit font-semibold">
                {player.name}
                {player.id === currentPlayerId && <span className="ml-1 text-fg3">· you</span>}
              </span>
              <span className="text-right font-mono text-sm">{player.level}</span>
              <span className="text-right font-mono text-sm">{player.lives}</span>
              <span className="text-right font-mono text-xs text-fg2">{player.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
