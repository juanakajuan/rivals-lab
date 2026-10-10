import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { openAppData } from "./appData";
import "./app.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The React root element is missing.");
}

const data = await openAppData();
createRoot(rootElement).render(
  <StrictMode>
    <App data={data} />
  </StrictMode>,
);
