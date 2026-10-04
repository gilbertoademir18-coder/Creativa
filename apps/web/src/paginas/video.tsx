import { Clapperboard, FileText, Pencil, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { videosApi } from "../api.ts";
import { ModalDocumento, resumoMarkdown } from "../componentes/documento-markdown.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { ListaOrdenavel, movido } from "../componentes/ordenavel.tsx";
import { Aviso, Botao, Cabecalho, Campo, Carregando, Entrada, LinkVoltar, Secao, Vazio } from "../componentes/ui.tsx";
import { useCarregar, useVolta } from "../hooks.ts";
import type { VideoDetalhe } from "../tipos.ts";
import { ModalCena } from "./cenas.tsx";

/**
 * Um vídeo de uma lista ("EP01 — O Clube"): a sinopse em markdown e as
 * cenas em ordem. Cena criada aqui já nasce no vídeo.
 */
export function PaginaVideo() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { dados: v, erro, setDados } = useCarregar(() => videosApi.ler(id), [id]);
  const volta = useVolta();
  const [editando, setEditando] = useState(false);
  const [sinopse, setSinopse] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [novaCena, setNovaCena] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!v) return <Carregando />;
  const projeto = v.lista.projeto;
  /** Quem sai daqui para uma cena volta para cá. */
  const aqui = { para: `/videos/${v.id}`, rotulo: v.nome };

  async function moverCena(i: number, delta: -1 | 1) {
    const nova = movido(v!.cenas, i, delta);
    setDados({ ...v!, cenas: nova });
    try {
      setDados({ ...v!, cenas: await videosApi.reordenarCenas(v!.id, nova.map((c) => c.id)) });
    } catch (e) {
      setFalha((e as Error).message);
      setDados(v!);
    }
  }

  return (
    <>
      <Cabecalho
        voltar={<LinkVoltar {...(volta ?? { para: `/projetos/${projeto.id}`, rotulo: projeto.nome })} />}
        titulo={v.nome}
        subtitulo={
          <>
            <Link to={`/projetos/${projeto.id}`} className="hover:text-violet-300">
              {projeto.nome}
            </Link>
            {" › "}
            {v.lista.nome}
            {v.descricao && (
              <button type="button" onClick={() => setSinopse(true)} className="mt-2 line-clamp-2 block max-w-4xl text-left text-zinc-400 hover:text-zinc-200">
                {resumoMarkdown(v.descricao, 300)}
              </button>
            )}
          </>
        }
        acoes={
          <>
            <Botao icone={<FileText className="size-4" />} onClick={() => setSinopse(true)}>
              Sinopse
            </Botao>
            <Botao icone={<Pencil className="size-4" />} onClick={() => setEditando(true)}>
              Renomear
            </Botao>
            <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
              Excluir
            </Botao>
          </>
        }
      />
      <div className="p-8">
        <Secao
          titulo={`Cenas (${v.cenas.length})`}
          acoes={
            <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovaCena(true)}>
              Nova cena
            </Botao>
          }
        >
          {falha && <Aviso>{falha}</Aviso>}
          {v.cenas.length === 0 ? (
            <Vazio
              icone={<Clapperboard />}
              titulo="Nenhuma cena neste vídeo"
              texto="Crie aqui, ou mova uma cena que já existe: no Editar dela, escolha este vídeo."
            />
          ) : (
            <ListaOrdenavel
              itens={v.cenas}
              aoMover={moverCena}
              linha={(c) => (
                <Link to={`/cenas/${c.id}`} state={{ volta: aqui }} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
                  <span className="truncate font-medium">{c.nome}</span>
                  {(c.descricao || c.storyboard) && <span className="line-clamp-2 text-sm text-zinc-400">{c.descricao || c.storyboard}</span>}
                  <span className="text-xs text-zinc-500">
                    {c.shots.length} {c.shots.length === 1 ? "shot" : "shots"}
                  </span>
                </Link>
              )}
            />
          )}
        </Secao>
      </div>

      <ModalDocumento
        titulo={`Sinopse — ${v.nome}`}
        valor={v.descricao}
        placeholder="Sinopse, roteiro, o que acontece neste vídeo... Use # para títulos e - para listas."
        aberto={sinopse}
        aoFechar={() => setSinopse(false)}
        aoSalvar={async (texto) => {
          setDados(await videosApi.salvar(v.id, { nome: v.nome, descricao: texto }));
          setSinopse(false);
        }}
      />
      <Modal aberto={editando} titulo="Renomear vídeo" aoFechar={() => setEditando(false)}>
        {editando && (
          <FormNome
            video={v}
            aoSalvar={(novo) => {
              setEditando(false);
              setDados(novo);
            }}
          />
        )}
      </Modal>
      <ModalCena
        aberto={novaCena}
        projetoInicial={projeto.id}
        videoInicial={v.id}
        aoFechar={() => setNovaCena(false)}
        aoSalvar={(c) => navegar(`/cenas/${c.id}`, { state: { volta: aqui } })}
      />
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir vídeo"
        texto={
          <>
            O vídeo <b>{v.nome}</b> será excluído.
            {v.cenas.length > 0 && (
              <>
                {" "}
                As <b>{v.cenas.length} cena(s)</b> dele <b>não</b> são apagadas: voltam para “Cenas sem vídeo” do projeto, com os shots e outputs.
              </>
            )}
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await videosApi.apagar(v.id);
          navegar(`/projetos/${projeto.id}`);
        }}
      />
    </>
  );
}

function FormNome({ video, aoSalvar }: { video: VideoDetalhe; aoSalvar: (v: VideoDetalhe) => void }) {
  const [nome, setNome] = useState(video.nome);
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
          aoSalvar(await videosApi.salvar(video.id, { nome, descricao: video.descricao }));
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" carregando={salvando}>
          Salvar
        </Botao>
      </div>
    </form>
  );
}
