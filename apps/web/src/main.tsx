import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import "./app.css";
import { Layout } from "./componentes/layout.tsx";
import { PaginaAsset, PaginaAssets } from "./paginas/assets.tsx";
import { PaginaAssistentes } from "./paginas/assistentes.tsx";
import { PaginaCena, PaginaCenas } from "./paginas/cenas.tsx";
import { PaginaOutputs } from "./paginas/outputs.tsx";
import { PaginaProjeto, PaginaProjetos } from "./paginas/projetos.tsx";
import { PaginaReferencias } from "./paginas/referencias.tsx";
import { PaginaShot } from "./paginas/shot.tsx";
import { PaginaTiposGeracao } from "./paginas/tipos-geracao.tsx";
import { PaginaVideo } from "./paginas/video.tsx";
import { PaginaWorkflows } from "./paginas/workflows.tsx";

// Os itens do menu são rotas de primeiro nível; os detalhes ficam
// debaixo de cada um. O shot tem endereço próprio (/shots/:id) — dá para
// mandar o link de um shot sem saber a cena.
const roteador = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/projetos" replace /> },
      { path: "projetos", element: <PaginaProjetos /> },
      { path: "projetos/:id", element: <PaginaProjeto /> },
      { path: "assets", element: <PaginaAssets /> },
      { path: "assets/:id", element: <PaginaAsset /> },
      { path: "referencias", element: <PaginaReferencias /> },
      { path: "cenas", element: <PaginaCenas /> },
      { path: "cenas/:id", element: <PaginaCena /> },
      { path: "shots/:id", element: <PaginaShot /> },
      { path: "videos/:id", element: <PaginaVideo /> },
      { path: "outputs", element: <PaginaOutputs /> },
      { path: "assistentes", element: <PaginaAssistentes /> },
      { path: "tipos-geracao", element: <PaginaTiposGeracao /> },
      { path: "workflows", element: <PaginaWorkflows /> },
      // Links antigos, de antes do Gerador.
      { path: "geracoes/*", element: <Navigate to="/outputs" replace /> },
      { path: "*", element: <Navigate to="/projetos" replace /> },
    ],
  },
]);

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <RouterProvider router={roteador} />
  </StrictMode>,
);
