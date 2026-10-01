import { useEffect, useState } from "react";

type Estado = { noAr: boolean; versao?: string | null } | null;

/** Pergunta à API, a cada 5 segundos, se uma dependência está no ar. */
function useEstado(rota: string): Estado {
  const [estado, setEstado] = useState<Estado>(null);

  useEffect(() => {
    let vivo = true;
    async function consultar() {
      try {
        const r = await fetch(rota);
        if (vivo) setEstado(await r.json());
      } catch {
        if (vivo) setEstado({ noAr: false });
      }
    }
    consultar();
    const id = setInterval(consultar, 5000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [rota]);

  return estado;
}

function Selo({ estado, nome, foraDoAr }: { estado: Estado; nome: string; foraDoAr: string }) {
  return (
    <p className="flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm">
      <span
        className={`size-2.5 rounded-full ${
          estado === null ? "bg-zinc-500" : estado.noAr ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      {estado === null
        ? `Consultando ${nome}...`
        : estado.noAr
          ? `${nome} no ar${estado.versao ? ` (v${estado.versao})` : ""}`
          : `${nome} fora do ar — ${foraDoAr}`}
    </p>
  );
}

/** Tela inicial provisória: por enquanto só diz se as dependências estão ao alcance. */
export function Inicio() {
  const comfy = useEstado("/api/comfyui/estado");
  const banco = useEstado("/api/banco/estado");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-6 text-center">
      <img src="/favicon.svg" alt="" className="size-20 rounded-2xl" />
      <h1 className="text-4xl font-semibold tracking-tight">Creativa</h1>
      <p className="text-zinc-400">Vídeos, imagens, sons e assets com IA, pelos seus workflows do ComfyUI.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Selo estado={comfy} nome="ComfyUI" foraDoAr="inicie pelo ícone da bandeja" />
        <Selo estado={banco} nome="Banco" foraDoAr="veja o log pelo ícone da bandeja" />
      </div>
    </main>
  );
}
