import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Inicio } from "./inicio.tsx";
import "./app.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <Inicio />
  </StrictMode>,
);
