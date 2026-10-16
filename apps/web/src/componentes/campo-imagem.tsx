import { ExternalLink, Eye, ImagePlus, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { geradorApi, urlArquivo, type Dono } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import type { CampoWorkflow, ImagemDisponivel, RefImagem } from "../tipos.ts";
import { Miniatura } from "./midia.tsx";
import { Modal } from "./modal.tsx";
import { BotaoSeta } from "./outputs.tsx";
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
  irmaos,
}: {
  campo: Extract<CampoWorkflow, { tipo: "imagem" }>;
  valor: unknown;
  aoMudar: (v: RefImagem | null) => void;
  /** De quem é o Gerador. null: o "Testar" do cadastro, que vê as imagens de todos os projetos. */
  dono: Dono | null;
  /** Os campos de imagem do formulário (este incluso): o "Ver" passa de um para outro. */
  irmaos?: { campo: CampoWorkflow; valor: unknown }[];
}) {
  const imagens = useCarregar(() => geradorApi.imagens(dono), [dono?.assetId, dono?.shotId]);
  const [escolhendo, setEscolhendo] = useState(false);
  /** A chave do campo que o "Ver" está mostrando (null: fechado). */
  const [vendo, setVendo] = useState<string | null>(null);
  const ref = valor && typeof valor === "object" ? (valor as RefImagem) : null;
  const atual = ref ? imagens.dados?.find((i) => mesma(ref, i)) : undefined;

  // Os campos com imagem, na ordem do formulário: é por eles que as setas passam.
  // A lista de imagens é a mesma para todos os campos, então este resolve os vizinhos.
  const comImagem = (irmaos ?? [{ campo: c, valor }]).flatMap(({ campo, valor: v }) => {
    const r = v && typeof v === "object" ? (v as RefImagem) : null;
    const img = r ? imagens.dados?.find((i) => mesma(r, i)) : undefined;
    return img ? [{ chave: campo.chave, rotulo: campo.rotulo, img }] : [];
  });
  const i = comImagem.findIndex((x) => x.chave === vendo);
  const mostrado = i >= 0 ? comImagem[i] : undefined;
  const ir = (delta: number) => {
    const proximo = comImagem[i + delta];
    if (proximo) setVendo(proximo.chave);
  };
  useEffect(() => {
    if (!mostrado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") ir(-1);
      if (e.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  return (
    <Campo
      rotulo={c.opcional ? `${c.rotulo} (opcional)` : c.rotulo}
      dica={c.dica ?? "Uma imagem do projeto: referência ou output. Vai para o ComfyUI ao gerar."}
    >
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
              <Botao variante="fantasma" icone={<Eye className="size-4" />} onClick={() => setVendo(c.chave)}>
                Ver
              </Botao>
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
      {mostrado && (
        <Modal
          aberto
          titulo={mostrado.rotulo}
          largura="enorme"
          aoFechar={() => setVendo(null)}
          rodape={
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-zinc-400">
                {comImagem.length > 1 && (
                  <span className="mr-3 tabular-nums">
                    <b className="text-zinc-300">{i + 1}</b> de {comImagem.length} · ← →
                  </span>
                )}
                <span className="text-zinc-200">{mostrado.img.nome}</span> · {mostrado.img.origem === "referencia" ? "Referência" : "Output"} de{" "}
                {mostrado.img.dono.nome}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <a
                  href={urlArquivo(mostrado.img.arquivo)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-violet-300 hover:underline"
                >
                  <ExternalLink className="size-4" /> Tamanho real numa aba nova
                </a>
                <Botao onClick={() => setVendo(null)}>Fechar</Botao>
              </div>
            </div>
          }
        >
          <div className="relative flex min-h-[50vh] items-center justify-center rounded-lg bg-zinc-950">
            <img key={mostrado.chave} src={urlArquivo(mostrado.img.arquivo)} alt={mostrado.img.nome} className="max-h-[75vh] object-contain" />
            {i > 0 && <BotaoSeta lado="esquerda" rotulo="Imagem do campo anterior" onClick={() => ir(-1)} />}
            {i < comImagem.length - 1 && <BotaoSeta lado="direita" rotulo="Imagem do próximo campo" onClick={() => ir(1)} />}
          </div>
        </Modal>
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
              {/* Mesma altura para todas, largura pela proporção: a imagem aparece inteira (como nos cartões de asset). */}
              <div className="flex flex-wrap items-start gap-3">
                {g.itens.map((i) => (
                  <button
                    key={`${i.origem}-${i.id}`}
                    type="button"
                    onClick={() => aoEscolher(i)}
                    className={`group flex w-min min-w-28 flex-col overflow-hidden rounded-lg border bg-zinc-900 text-left ${mesma(atual, i) ? "border-violet-500 ring-1 ring-violet-500" : "border-zinc-800 hover:border-violet-500/60"}`}
                  >
                    <div className="relative h-44 bg-zinc-950">
                      <img src={urlArquivo(i.arquivo)} alt="" loading="lazy" className="h-full w-auto max-w-none" />
                      {i.favorito && <Star className="absolute top-1.5 right-1.5 size-4 fill-amber-400 text-amber-400" />}
                    </div>
                    {/* w-0 min-w-full: o texto ocupa a largura da imagem sem alargar o cartão. */}
                    <div className="flex w-0 min-w-full flex-col px-2 py-1.5 text-xs">
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
