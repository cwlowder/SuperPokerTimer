import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./i18n";
import "./styles.css";
import { LocalSettingsProvider } from "./context/LocalSettingsContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LocalSettingsProvider>
        <App />
      </LocalSettingsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
