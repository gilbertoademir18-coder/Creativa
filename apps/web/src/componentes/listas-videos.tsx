import { ChevronDown, ChevronUp, Film, ListVideo, Pencil, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { listasApi, type ListaNova } from "../api.ts";
import type { Volta } from "../hooks.ts";
import { useCarregar } from "../hooks.ts";
import type { ListaVideos, VideoResumo } from "../tipos.ts";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { ListaOrdenavel, movido } from "./ordenavel.tsx";
import { AreaTexto, Aviso, Botao, Campo, Carregando, Entrada, Secao, Vazio } from "./ui.tsx";

/**
 * As listas de vídeos de um projeto — "Temporada 1", "Trailers",
 * "Aberturas" — cada uma com os vídeos em ordem. Genérico de propósito: um
 * projeto pode ter várias listas independentes, e nem toda é de episódios.
 */
export function SecaoListasVideos({ projetoId, volta }: { projetoId: string; volta: Volta }) {
  const { dados, erro, setDados, recarregar } = useCarregar(() => listasApi.listar(projetoId), [projetoId]);
  const [editando, setEditando] = useState<ListaVideos | "nova" | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const listas = dados ?? [];

  async function moverLista(i: number, delta: -1 | 1) {
    const nova = movido(listas, i, delta);
    setDados(nova);
    try {
      setDados(await listasApi.reordenar(projetoId, nova.map((l) => l.id)));
    } catch (e) {
      setFalha((e as Error).message);
      setDados(listas);
    }
  }

  const trocarVideos = (listaId: string, videos: VideoResumo[]) => setDados(listas.map((l) => (l.id === listaId ? { ...l, videos } : l)));

  return (
    <Secao
      titulo={`Listas de vídeos (${dados?.length ?? "…"})`}
      acoes={
        <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setEditando("nova")}>
          Adicionar lista de vídeos
        </Botao>
      }
    >
      {(erro || falha) && <Aviso>{erro ?? falha}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados?.length === 0 && (
        <Vazio
          icone={<ListVideo />}
          titulo="Nenhuma lista de vídeos"
          texto="“Temporada 1”, “Trailers”, “Aberturas”... Cada lista tem vídeos, e cada vídeo, as cenas dele."
        />
      )}
      <div className="flex flex-col gap-6">
        {listas.map((l, i) => (
          <BlocoLista
            key={l.id}
            lista={l}
            volta={volta}
            primeira={i === 0}
            ultima={i === listas.length - 1}
            aoMover={(d) => moverLista(i, d)}
            aoEditar={() => setEditando(l)}
            aoMudarVideos={(v) => trocarVideos(l.id, v)}
          />
        ))}
      </div>
      <Modal aberto={!!editando} titulo={editando === "nova" ? "Nova lista de vídeos" : "Editar lista de vídeos"} aoFechar={() => setEditando(null)}>
        {editando && (
          <FormLista
            lista={editando === "nova" ? undefined : editando}
            projetoId={projetoId}
            aoSalvar={() => {
              setEditando(null);
              recarregar();
            }}
          />
        )}
      </Modal>
    </Secao>
  );
}

function BlocoLista({
  lista: l,
  volta,
  primeira,
  ultima,
  aoMover,
  aoEditar,
  aoMudarVideos,
}: {
  lista: ListaVideos;
  volta: Volta;
  primeira: boolean;
  ultima: boolean;
  aoMover: (d: -1 | 1) => void;
  aoEditar: () => void;
  aoMudarVideos: (v: VideoResumo[]) => void;
}) {
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function moverVideo(i: number, delta: -1 | 1) {
    const nova = movido(l.videos, i, delta);
    aoMudarVideos(nova);
    try {
      aoMudarVideos(await listasApi.reordenarVideos(l.id, nova.map((v) => v.id)));
    } catch (e) {
      setErro((e as Error).message);
      aoMudarVideos(l.videos);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ListVideo className="size-5 shrink-0 text-violet-400" />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {l.nome} <span className="text-sm font-normal text-zinc-500">· {l.videos.length} {l.videos.length === 1 ? "vídeo" : "vídeos"}</span>
            </div>
            {l.descricao && <div className="truncate text-xs text-zinc-500">{l.descricao}</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" title="Subir a lista" disabled={primeira} onClick={() => aoMover(-1)} className="flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-20">
            <ChevronUp className="size-4" />
          </button>
          <button type="button" title="Descer a lista" disabled={ultima} onClick={() => aoMover(1)} className="flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-20">
            <ChevronDown className="size-4" />
          </button>
          <Botao variante="fantasma" icone={<Pencil className="size-4" />} onClick={aoEditar}>
            Editar
          </Botao>
          <Botao icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
            Novo vídeo
          </Botao>
        </div>
      </div>
      <div className="p-4">
        {erro && <Aviso>{erro}</Aviso>}
        {l.videos.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum vídeo nesta lista ainda.</p>
        ) : (
          <ListaOrdenavel
            itens={l.videos}
            aoMover={moverVideo}
            linha={(v) => (
              <Link to={`/videos/${v.id}`} state={{ volta }} className="flex min-w-0 items-center justify-between gap-4 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Film className="size-4 shrink-0 text-zinc-500" />
                  <span className="truncate font-medium">{v.nome}</span>
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {v._count.cenas} {v._count.cenas === 1 ? "cena" : "cenas"}
                </span>
              </Link>
            )}
          />
        )}
      </div>
      <Modal aberto={novo} titulo={`Novo vídeo em “${l.nome}”`} aoFechar={() => setNovo(false)}>
        {novo && (
          <FormVideoNovo
            listaId={l.id}
            sugestao={`Vídeo ${l.videos.length + 1}`}
            aoCriar={(v) => {
              setNovo(false);
              aoMudarVideos([...l.videos, v]);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function FormLista({ lista, projetoId, aoSalvar }: { lista?: ListaVideos; projetoId: string; aoSalvar: () => void }) {
  const [nome, setNome] = useState(lista?.nome ?? "");
  const [descricao, setDescricao] = useState(lista?.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const cenas = lista?.videos.reduce((n, v) => n + v._count.cenas, 0) ?? 0;
  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvando(true);
          setErro(null);
          const dados: ListaNova = { nome, descricao: descricao || null };
          try {
            if (lista) await listasApi.salvar(lista.id, dados);
            else await listasApi.criar(projetoId, dados);
            aoSalvar();
          } catch (er) {
            setErro((er as Error).message);
            setSalvando(false);
          }
        }}
      >
        <Campo rotulo="Nome">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="Temporada 1, Trailers, Aberturas..." />
        </Campo>
        <Campo rotulo="Descrição">
          <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-between gap-2">
          {lista ? (
            <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
              Excluir
            </Botao>
          ) : (
            <span />
          )}
          <Botao type="submit" variante="primario" carregando={salvando}>
            {lista ? "Salvar" : "Criar lista"}
          </Botao>
        </div>
      </form>

      {/* Fora do <form>: a confirmação tem o form dela, e form dentro de form enviaria o de fora. */}
      {lista && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir lista de vídeos"
          texto={
            <>
              A lista <b>{lista.nome}</b> e os {lista.videos.length} vídeo(s) dela serão excluídos.
              {cenas > 0 && (
                <>
                  {" "}
                  As <b>{cenas} cena(s)</b> deles <b>não</b> são apagadas: voltam para “Cenas sem vídeo” do projeto, com os shots e outputs.
                </>
              )}
            </>
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await listasApi.apagar(lista.id);
            aoSalvar();
          }}
        />
      )}
    </>
  );
}

/** Vídeo novo: só o nome. A sinopse se escreve depois, na página do vídeo. */
function FormVideoNovo({ listaId, sugestao, aoCriar }: { listaId: string; sugestao: string; aoCriar: (v: VideoResumo) => void }) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
          aoCriar(await listasApi.novoVideo(listaId, { nome, descricao: null }));
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome" dica="A sinopse e as cenas vêm depois, na página do vídeo.">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder={`${sugestao} — O Clube`} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" carregando={salvando}>
          Criar vídeo
        </Botao>
      </div>
    </form>
  );
}
