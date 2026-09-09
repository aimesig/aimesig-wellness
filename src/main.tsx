import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";
import logo from "./assets/aimesig-favicon.png";

// Use the AimeSig logo as the browser tab favicon.
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/png";
favicon.href = logo;
document.head.appendChild(favicon);
document.title = "AimeSig Wellness";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);