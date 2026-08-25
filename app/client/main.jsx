import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Splash } from '/imports/ui/pages/Splash';
import { PlayRoute } from '/imports/ui/pages/PlayRoute';
import { JoinRoom } from '/imports/ui/pages/JoinRoom';
import { PlayerLobby } from '/imports/ui/pages/PlayerLobby';
import { EndLeaderboard } from '/imports/ui/EndLeaderboard';
import { GamePage } from '/imports/ui/pages/GamePage';
import { Account } from '/imports/ui/pages/Account';
import { GlobalLeaderboard } from '/imports/ui/pages/GlobalLeaderboard';
import '/imports/ui/styles.css';

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  const root = createRoot(container);
  root.render(
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/play" element={<PlayRoute />} />
        <Route path="/play/join" element={<JoinRoom />} />
        <Route path="/play/:pin" element={<PlayerLobby />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/account" element={<Account />} />
        <Route path="/leaderboard" element={<GlobalLeaderboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
});
