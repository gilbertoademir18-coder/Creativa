import { Film, FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { listasApi, videosApi } from "../api.ts";
import { useProjetoAtual } from "../componentes/barra-projeto.tsx";
import { EscolhaProjeto, FiltroBusca, FiltroProjeto } from "../componentes/filtros.tsx";
import { Modal } from "../componentes/modal.tsx";
import {
  Aviso,
  BarraFiltros,
  Botao,
  BotaoLink,
  Cabecalho,
  Campo,
  Carregando,
  Entrada,
  GRADE,
  Seletor,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros, type Volta } from "../hooks.ts";
import type { VideoNaLista } from "../tipos.ts";

/*
 * A lista de vídeos de todos os projetos — o paralelo de Cenas e Assets no
 * menu e na barra do projeto. Vídeo é agrupador: quem tem storyboard é a
 * cena. Aqui se acha e se abre um vídeo; o que ele tem dentro é a página dele.
 */
export function PaginaVideos() {
  const [f, mudar] = useFiltros(["projeto", "busca"] as const);
  useProjetoAtual(f.projeto);
  const { dados, erro, carregando, recarregar } = useCarregar(
    () => videosApi.listar({ projeto: f.projeto, busca: f.busca }),
    [f.projeto, f.busca],
  );
  const [novo, setNovo] = useState(false);
  const filtrando = !!(f.projeto || f.busca);

  return (
    <>
      <Cabecalho
        titulo="Vídeos"
        subtitulo="Cada vídeo é uma sequência de cenas, dentro de uma lista do projeto."
        acoes={
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
            Novo vídeo
          </Botao>
        }
      />
      <BarraFiltros>
        {/* Vídeo sempre tem projeto: sem a opção "Sem projeto", que não acharia nada. */}
        <FiltroProjeto valor={f.projeto} aoMudar={(v) => mudar("projeto", v)} permitirSem={false} />
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<Film />}
            titulo={filtrando ? "Nenhum vídeo com esses filtros" : "Nenhum vídeo ainda"}
            texto="“EP01”, “Trailer”... Todo vídeo entra numa lista do projeto (“Temporada 1”, “Trailers”)."
            acao={
              !filtrando && (
                <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
                  Criar o primeiro
                </Botao>
              )
            }
          />
        )}
        {!!dados?.length && (
          <div className={GRADE}>
            {dados.map((v) => (
              <CartaoVideo key={v.id} v={v} mostrarProjeto={!f.projeto} />
            ))}
          </div>
        )}
      </div>
      <ModalNovoVideo
        aberto={novo}
        projetoInicial={f.projeto}
        aoFechar={() => setNovo(false)}
        aoCriar={(id) => {
          setNovo(false);
          recarregar();
          return id;
        }}
      />
    </>
  );
}

/** `volta`: de onde se está abrindo o vídeo, para o "voltar" de lá trazer de volta. */
export function CartaoVideo({ v, mostrarProjeto, volta }: { v: VideoNaLista; mostrarProjeto?: boolean; volta?: Volta }) {
  return (
    <Link
      to={`/videos/${v.id}`}
      state={volta && { volta }}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-violet-500/60"
    >
      <div className="flex items-center gap-2.5">
        <Film className="size-5 shrink-0 text-violet-400" />
        <span className="truncate font-medium">{v.nome}</span>
      </div>
      <span className="flex items-center gap-1.5 truncate text-xs text-violet-300/80">
        <FolderKanban className="size-3.5 shrink-0" /> {v.lista.nome}
      </span>
      {v.descricao && <p className="line-clamp-3 text-sm whitespace-pre-wrap text-zinc-400">{v.descricao}</p>}
      <div className="mt-auto flex justify-between gap-2 text-xs text-zinc-500">
        <span className="truncate">{mostrarProjeto ? v.lista.projeto.nome : ""}</span>
        <span className="shrink-0">
          {v._count.cenas} {v._count.cenas === 1 ? "cena" : "cenas"}
        </span>
      </div>
    </Link>
  );
}

/**
 * Vídeo novo: escolhe-se o projeto e a lista dele, porque vídeo sempre entra
 * numa lista. Projeto sem lista nenhuma não dá para escolher — a lista se cria
 * na página do projeto.
 */
function ModalNovoVideo({
  aberto,
  projetoInicial,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  projetoInicial: string;
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  return (
    <Modal aberto={aberto} titulo="Novo vídeo" aoFechar={aoFechar}>
      <FormVideo projetoInicial={projetoInicial} aoCriar={aoCriar} />
    </Modal>
  );
}

function FormVideo({ projetoInicial, aoCriar }: { projetoInicial: string; aoCriar: (id: string) => void }) {
  const navegar = useNavigate();
  const [projetoId, setProjetoId] = useState(projetoInicial === "sem" ? "" : projetoInicial);
  const [listaId, setListaId] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { dados: listas } = useCarregar(
    () => (projetoId ? listasApi.listar(projetoId) : Promise.resolve([])),
    [projetoId],
  );
  const semListas = !!projetoId && listas?.length === 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
          const v = await listasApi.novoVideo(listaId, { nome, descricao: null });
          aoCriar(v.id);
          navegar(`/videos/${v.id}`);
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Projeto">
        <EscolhaProjeto
          valor={projetoId}
          aoMudar={(p) => {
            setProjetoId(p);
            setListaId(""); // lista é de um projeto: trocou o projeto, a escolha cai
          }}
        />
      </Campo>
      <Campo rotulo="Lista" dica="Onde o vídeo entra: “Temporada 1”, “Trailers”.">
        <Seletor value={listaId} onChange={(e) => setListaId(e.target.value)} disabled={!projetoId} required>
          <option value="">{projetoId ? "Escolha a lista" : "Escolha o projeto primeiro"}</option>
          {listas?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </Seletor>
      </Campo>
      {semListas && (
        <Aviso>
          Este projeto ainda não tem nenhuma lista de vídeos. Crie uma na página do projeto — é lá que elas moram.
        </Aviso>
      )}
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="EP01 — O Clube" />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        {semListas && projetoId && (
          <BotaoLink para={`/projetos/${projetoId}`}>Ir ao projeto</BotaoLink>
        )}
        <Botao type="submit" variante="primario" carregando={salvando} disabled={!listaId || !nome.trim()}>
          Criar vídeo
        </Botao>
      </div>
    </form>
  );
}
