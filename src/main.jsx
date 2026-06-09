import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { registerMovementzServiceWorker } from "./lib/pushNotifications.js";
import "./styles/global.css";

registerMovementzServiceWorker().catch(() => {
  // Service worker registration can fail in local/dev browsers; in-app notifications still work.
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
