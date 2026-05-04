import React from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useSubscribe, useTracker } from 'meteor/react-meteor-data';
import { RoomsCollection } from '/imports/api/rooms';

export function PlayerLobby() {
  const { pin } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const playerName = state?.playerName || '';

  const isLoading = useSubscribe('rooms.lobby', pin);
  const room = useTracker(() => RoomsCollection.findOne({ pin }));

  if (!isLoading() && !room) {
    navigate('/play', { replace: true });
    return null;
  }

  const players = room?.players || [];

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {playerName && (
          <div className="flex justify-center">
            <span className="inline-block bg-blue-600 text-white text-xl font-bold px-6 py-3 rounded-full shadow-lg">
              {playerName}
            </span>
          </div>
        )}

        <div className="bg-[#1a2a3a] rounded-2xl shadow-2xl p-8 text-center">
          <div className="flex justify-center mb-5">
            <span className="block w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
          </div>
          <p className="text-white text-2xl font-semibold">Waiting for host to start...</p>
          <p className="text-slate-400 mt-2 text-sm">
            PIN: <span className="text-white font-bold tracking-widest">{pin}</span>
          </p>
        </div>

        <div className="bg-[#1a2a3a] rounded-2xl shadow-2xl p-6 text-center">
          {isLoading() ? (
            <p className="text-slate-400 text-lg">Loading players...</p>
          ) : (
            <>
              <p className="text-5xl font-bold text-white">{players.length}</p>
              <p className="text-slate-400 mt-1">
                {players.length === 1 ? 'player' : 'players'} joined
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
