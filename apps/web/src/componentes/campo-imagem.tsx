import { ImagePlus, Star, X } from "lucide-react";
import { useState } from "react";
import { geradorApi, type Dono } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import type { CampoWorkflow, ImagemDisponivel, RefImagem } from "../tipos.ts";
import { Miniatura } from "./midia.tsx";
import { Modal } from "./modal.tsx";
import { Aviso, Botao, Campo, Carregando, Pilulas, Vazio } from "./ui.tsx";

/*
 * O campo de imagem do Gerador: escolhe uma referência ou um output de
 * imagem do projeto (as do próprio asset ou shot primeiro). O Creativa envia
 * a imagem ao ComfyUI na hora de gerar.
 */

type Filtro = "todas" | "referencia" | "output";

const mesma = (a: RefImagem | null, b: RefImagem) => !!a && a.origem === b.origem && a.id === b.id;

export function CampoImagem({
  campo: c,
  valor,
  aoMudar,
  dono,
}: {
  campo: Extract<CampoWorkflow, { tipo: "imagem" }>;
  valor: unknown;
  aoMudar: (v: RefImagem | null) => void;
  /** De quem é o Gerador. null: o "Testar" do cadastro, que vê as imagens de todos os projetos. */
  dono: Dono | null;
}) {
  const imagens = useCarregar(() => geradorApi.imagens(dono), [dono?.assetId, dono?.shotId]);
  const [escolhendo, setEscolhendo] = useState(false);
  const ref = valor && typeof valor === "object" ? (valor as RefImagem) : null;
  const atual = ref ? imagens.dados?.find((i) => mesma(ref, i)) : undefined;

  return (
    <Campo rotulo={c.rotulo} dica={c.dica ?? "Uma imagem do projeto: referência ou output. Vai para o ComfyUI ao gerar."}>
      {ref && imagens.dados && !atual && <Aviso>A imagem escolhida não existe mais, ou não é deste projeto. Escolha outra.</Aviso>}
      {atual ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEscolhendo(true)}
            className="size-24 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 hover:border-violet-500"
            title="Trocar a imagem"
          >
            <Miniatura tipo="IMAGEM" arquivo={atual.arquivo} />
          </button>
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="truncate text-zinc-200" title={atual.nome}>
              {atual.nome}
            </span>
            <span className="truncate text-xs text-zinc-500">
              {atual.origem === "referencia" ? "Referência" : "Output"} · {atual.dono.nome}
            </span>
            <div className="flex gap-2">
              <Botao variante="fantasma" onClick={() => setEscolhendo(true)}>
                Trocar
              </Botao>
              <Botao variante="fantasma" icone={<X className="size-4" />} onClick={() => aoMudar(null)}>
                Tirar
              </Botao>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEscolhendo(true)}
          className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-violet-500 hover:text-zinc-200"
        >
          <ImagePlus className="size-5" /> Escolher imagem
        </button>
      )}
      <EscolherImagem
        titulo={`Escolher imagem — ${c.rotulo}`}
        aberto={escolhendo}
        lista={imagens.dados}
        erro={imagens.erro}
        atual={ref}
        semDono={!dono}
        aoFechar={() => setEscolhendo(false)}
        aoEscolher={(i) => {
          aoMudar({ origem: i.origem, id: i.id });
          setEscolhendo(false);
        }}
      />
    </Campo>
  );
}

function EscolherImagem({
  titulo,
  aberto,
  lista,
  erro,
  atual,
  semDono,
  aoFechar,
  aoEscolher,
}: {
  titulo: string;
  aberto: boolean;
  lista: ImagemDisponivel[] | null;
  erro: string | null;
  atual: RefImagem | null;
  semDono: boolean;
  aoFechar: () => void;
  aoEscolher: (i: ImagemDisponivel) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const visiveis = (lista ?? []).filter((i) => filtro === "todas" || i.origem === filtro);
  const grupos = semDono
    ? [{ titulo: "Todas as imagens do Creativa", itens: visiveis }]
    : [
        { titulo: "Deste asset ou shot", itens: visiveis.filter((i) => i.doDono) },
        { titulo: "Do resto do projeto", itens: visiveis.filter((i) => !i.doDono) },
      ];

  return (
    <Modal aberto={aberto} titulo={titulo} largura="enorme" aoFechar={aoFechar}>
      <div className="flex flex-col gap-5">
        <Pilulas
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: "todas", rotulo: "Todas" },
            { valor: "referencia", rotulo: "Referências" },
            { valor: "output", rotulo: "Outputs" },
          ]}
        />
        {erro && <Aviso>{erro}</Aviso>}
        {!lista && !erro && <Carregando />}
        {lista && visiveis.length === 0 && (
          <Vazio
            icone={<ImagePlus />}
            titulo="Nenhuma imagem aqui"
            texto="Envie uma referência de imagem a um asset ou shot do projeto, ou gere uma imagem — elas aparecem aqui."
          />
        )}
        {grupos
          .filter((g) => g.itens.length)
          .map((g) => (
            <section key={g.titulo} className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                {g.titulo} ({g.itens.length})
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {g.itens.map((i) => (
                  <button
                    key={`${i.origem}-${i.id}`}
                    type="button"
                    onClick={() => aoEscolher(i)}
                    className={`group flex flex-col overflow-hidden rounded-lg border bg-zinc-900 text-left ${mesma(atual, i) ? "border-violet-500 ring-1 ring-violet-500" : "border-zinc-800 hover:border-violet-500/60"}`}
                  >
                    <div className="relative aspect-square bg-zinc-950">
                      <Miniatura tipo="IMAGEM" arquivo={i.arquivo} />
                      {i.favorito && <Star className="absolute top-1.5 right-1.5 size-4 fill-amber-400 text-amber-400" />}
                    </div>
                    <div className="flex flex-col px-2 py-1.5 text-xs">
                      <span className="truncate text-zinc-300" title={i.nome}>
                        {i.nome}
                      </span>
                      <span className="truncate text-zinc-500">
                        {i.origem === "referencia" ? "Ref." : "Output"} · {i.dono.nome}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
      </div>
    </Modal>
  );
}
