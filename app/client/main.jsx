import { createRoot } from "react-dom/client";
import { Meteor } from "meteor/meteor";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Splash } from "/imports/ui/Splash";
import { PlayRoute } from "/imports/ui/PlayRoute";
import { JoinRoom } from "/imports/ui/JoinRoom";
import { PlayerLobby } from "/imports/ui/PlayerLobby";
import "/imports/ui/styles.css";

Meteor.startup(() => {
  const container = document.getElementById("react-target");
  const root = createRoot(container);
  root.render(
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Splash />} />
        <Route path="/play"      element={<PlayRoute />} />
        <Route path="/play/join" element={<JoinRoom />} />
        <Route path="/play/:pin" element={<PlayerLobby />} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
});
