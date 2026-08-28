import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Splash } from '/imports/ui/pages/Splash';
import { PlayRoute } from '/imports/ui/pages/PlayRoute';
import { JoinRoom } from '/imports/ui/pages/JoinRoom';
import { GameModeSelector } from '/imports/ui/pages/GameModeSelector';
import { CustomGameSettings } from '/imports/ui/pages/CustomGameSettings';
import { PlayerLobby } from '/imports/ui/pages/PlayerLobby';
import { EndLeaderboard } from '/imports/ui/EndLeaderboard';
import { GamePage } from '/imports/ui/pages/GamePage';
import { Account } from '/imports/ui/pages/Account';
import { SoundToggle } from '/imports/ui/components/SoundToggle';
import '/imports/ui/styles.css';

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  const root = createRoot(container);
  root.render(
    <BrowserRouter>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/play" element={<PlayRoute />} />
        <Route path="/play/join" element={<JoinRoom />} />
        <Route path="/play/modes/:pin" element={<GameModeSelector />} />
        <Route path="/play/custom/:pin" element={<CustomGameSettings />} />
        <Route path="/play/:pin" element={<PlayerLobby />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
});
