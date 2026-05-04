import React, { useState, useRef, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useNavigate } from 'react-router-dom';

export function JoinRoom() {
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pinRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    pinRef.current?.focus();
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!pin || !name.trim()) return;

    setLoading(true);
    setError('');

    Meteor.call('rooms.join', pin.trim(), name.trim(), (err, roomId) => {
      setLoading(false);
      if (err) {
        if (err.error === 'not-found') setError('Room not found. Check your PIN.');
        else if (err.error === 'not-lobby') setError('This game has already started.');
        else if (err.error === 'name-taken') setError('That name is already taken.');
        else setError('Something went wrong. Please try again.');
        return;
      }
      navigate(`/play/${pin.trim()}`, { state: { playerName: name.trim() } });
    });
  };

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1a2a3a] rounded-2xl shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-white text-center mb-8">Join a Game</h1>

        <form onSubmit={handleJoin} className="space-y-5">
          <input
            ref={pinRef}
            type="text"
            value={pin}
            onChange={(e) => setPin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ENTER PIN"
            className="w-full text-4xl font-bold text-center text-white bg-[#0d1b2a] border-2 border-slate-600 rounded-xl px-4 py-4 placeholder-slate-600 tracking-widest focus:outline-none focus:border-blue-500 transition-colors"
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
          />

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full text-lg text-center text-white bg-[#0d1b2a] border-2 border-slate-600 rounded-xl px-4 py-3 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            maxLength={30}
            autoComplete="off"
          />

          {error && (
            <p className="text-red-400 text-sm text-center font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !pin || !name.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold text-lg py-4 rounded-xl transition-colors"
          >
            {loading ? 'Joining...' : 'Join Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
