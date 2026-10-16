import { useCarregar } from "../hooks.ts";
import { assetsApi } from "../api.ts";
import type { Asset, Cena } from "../tipos.ts";
import { BotaoCopiar } from "./outputs.tsx";
import { Download } from "lucide-react";
import { Secao } from "./ui.tsx";

/*
 * O blockout à vista: a planta do cenário, o manequim da personagem e a
 * marcação da cena. Só leitura — quem escreve é a skill /blockout (pela API).
 * O formato mora em `apps/api/src/geracao/blockout.ts`.
 */

type Abertura = { tipo: "janela" | "porta" | "vao" };
type Cenario = {
  formato: "cenario";
  sala?: { largura: number; profundidade: number; altura: number };
  aberturas?: Abertura[];
  paineis?: { nome?: string }[];
  pecas?: unknown[];
  fileiras?: { peca: string; colunas: number; linhas: number }[];
};
type Personagem = { formato: "personagem"; altura: number; corpo: string; cabelo?: { comprimento?: string; cor?: string } };
type Marcacao = { cenario: string; personagens: { asset: string; pos: [number, number]; pose?: string }[] };

const m = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function resumoCenario(c: Cenario): string[] {
  const partes = [c.sala ? `Sala de ${m(c.sala.largura)} × ${m(c.sala.profundidade)} m, pé-direito de ${m(c.sala.altura)} m` : "Área aberta, sem paredes"];
  const conta = (t: Abertura["tipo"]) => (c.aberturas ?? []).filter((a) => a.tipo === t).length;
  const vaos = [
    conta("janela") && plural(conta("janela"), "janela", "janelas"),
    conta("porta") && plural(conta("porta"), "porta", "portas"),
    conta("vao") && plural(conta("vao"), "vão", "vãos"),
  ].filter(Boolean);
  if (vaos.length) partes.push(vaos.join(", "));
  const emFileira = (c.fileiras ?? []).reduce((s, f) => s + f.colunas * f.linhas, 0);
  const soltas = (c.pecas ?? []).length + (c.paineis ?? []).length;
  if (emFileira) partes.push(`${emFileira} peças em fileiras`);
  if (soltas) partes.push(plural(soltas, "peça solta", "peças soltas"));
  return partes;
}

function resumoPersonagem(p: Personagem): string[] {
  const corpo = { saia: "de saia", calca: "de calça", vestido: "de vestido" }[p.corpo] ?? p.corpo;
  const cabelo = { curto: "cabelo curto", medio: "cabelo médio", longo: "cabelo longo" }[p.cabelo?.comprimento ?? "curto"];
  return [`${m(p.altura)} m de altura`, corpo, cabelo ?? ""].filter(Boolean);
}

function Json({ valor }: { valor: unknown }) {
  const texto = JSON.stringify(valor, null, 2);
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/50 text-sm">
      <summary className="cursor-pointer px-3 py-2 text-zinc-400 hover:text-zinc-200">Os dados (JSON)</summary>
      <div className="relative border-t border-zinc-800">
        <BotaoCopiar texto={texto} className="absolute top-2 right-2" />
        <pre className="max-h-80 overflow-auto p-3 font-mono text-xs text-zinc-400">{texto}</pre>
      </div>
    </details>
  );
}

const SEM = "Quem escreve é a skill /blockout, a partir da placa do cenário ou da ficha da personagem na descrição do projeto.";

/** No asset de cenário ou de personagem: a planta ou o manequim. */
export function PainelBlockoutAsset({ asset }: { asset: Asset }) {
  if (asset.tipo !== "CENARIO" && asset.tipo !== "PERSONAGEM") return null;
  const b = asset.blockout as Cenario | Personagem | null;
  return (
    <Secao titulo="Blockout">
      {!b ? (
        <p className="text-sm text-zinc-500">Ainda sem {asset.tipo === "CENARIO" ? "planta" : "manequim"}. {SEM}</p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-zinc-300">
            {b.formato === "personagem" && b.cabelo?.cor && (
              <span className="inline-block size-3 rounded-full border border-zinc-600" style={{ background: b.cabelo.cor }} title="Cor do cabelo na prévia" />
            )}
            {(b.formato === "cenario" ? resumoCenario(b) : resumoPersonagem(b)).join(" · ")}
          </p>
          <Json valor={b} />
          {/* Montado na hora pelo Blender da máquina da API (leva uns segundos). */}
          <a
            href={`/api/assets/${asset.id}/blockout.blend`}
            download
            title="Monta a cena no Blender a partir destes dados e baixa o .blend — com câmera e luz. Mexer no arquivo não muda o blockout do Creativa."
            className="flex w-fit items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-violet-500/60 hover:text-white"
          >
            <Download className="size-4 text-zinc-400" /> Baixar .blend para abrir no Blender
          </a>
        </div>
      )}
    </Secao>
  );
}

/** Na cena: o cenário e quem fica onde. A câmera é de cada shot (etapa Geometria). */
export function PainelMarcacao({ cena }: { cena: Cena }) {
  const marc = cena.marcacao as Marcacao | null;
  const { dados: assets } = useCarregar(() => (marc && cena.projetoId ? assetsApi.listar({ projeto: cena.projetoId }) : Promise.resolve([])), [
    cena.projetoId,
    marc?.cenario,
  ]);
  const nome = (id: string) => assets?.find((a) => a.id === id)?.nome ?? "—";
  return (
    <Secao titulo="Marcação do blockout">
      {!marc ? (
        <p className="text-sm text-zinc-500">
          Sem marcação: o cenário e onde cada personagem fica. Ela alimenta a etapa Geometria dos shots. Quem escreve é a skill /blockout, a partir
          da descrição da cena.
        </p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-zinc-300">
            Em <b className="font-medium text-zinc-100">{nome(marc.cenario)}</b>
          </p>
          <ul className="flex flex-col gap-1 text-zinc-400">
            {marc.personagens.map((p, i) => (
              <li key={i}>
                <span className="text-zinc-200">{nome(p.asset)}</span> — {p.pose === "sentada" ? "sentada" : "em pé"}, em ({m(p.pos[0])}; {m(p.pos[1])}) m
              </li>
            ))}
          </ul>
          <Json valor={marc} />
        </div>
      )}
    </Secao>
  );
}
