import { useProjetoAtual } from "../componentes/barra-projeto.tsx";
import { Clapperboard, Film, Plus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { cenasApi, listasApi } from "../api.ts";
import { EscolhaProjeto, FiltroBusca, FiltroProjeto } from "../componentes/filtros.tsx";
import { Modal } from "../componentes/modal.tsx";
import {
  AreaTexto,
  Aviso,
  BarraFiltros,
  Botao,
  Cabecalho,
  Campo,
  Carregando,
  Entrada,
  GRADE,
  Seletor,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros, type Volta } from "../hooks.ts";
import { titulo } from "../rotulos.ts";
import type { Cena } from "../tipos.ts";

/**
 * `/cenas/<id>` não é mais uma página: a cena virou a barra fixa dos shots.
 * Entrar numa cena é abrir o shot em que se estava trabalhando — o de
 * `editadoEm` mais recente, que o rascunho do Gerador mantém em dia sozinho.
 * Empata (cena recém-criada, nenhum tocado)? Vale o primeiro da ordem.
 */
export function IrParaCena() {
  const { id = "" } = useParams();
  const { dados: cena, erro } = useCarregar(() => cenasApi.ler(id), [id]);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!cena) return <Carregando />;

  const ultimo = [...cena.shots].sort(
    (a, b) => Date.parse(b.editadoEm) - Date.parse(a.editadoEm) || a.ordem - b.ordem,
  )[0];

  // Toda cena nasce com um shot; sem nenhum, só resta a lista.
  return <Navigate to={ultimo ? `/shots/${ultimo.id}` : "/cenas"} replace />;
}

export function PaginaCenas() {
  const [f, mudar] = useFiltros(["projeto", "busca"] as const);
  useProjetoAtual(f.projeto);
  const { dados, erro, carregando } = useCarregar(() => cenasApi.listar({ projeto: f.projeto, busca: f.busca }), [f.projeto, f.busca]);
  const [nova, setNova] = useState(false);
  const navegar = useNavigate();
  const filtrando = !!(f.projeto || f.busca);

  return (
    <>
      <Cabecalho
        titulo="Cenas"
        subtitulo="Cada cena tem um storyboard e uma sequência de shots."
        acoes={
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNova(true)}>
            Nova cena
          </Botao>
        }
      />
      <BarraFiltros>
        <FiltroProjeto valor={f.projeto} aoMudar={(v) => mudar("projeto", v)} />
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<Clapperboard />}
            titulo={filtrando ? "Nenhuma cena com esses filtros" : "Nenhuma cena ainda"}
            texto="“Cena da ponte”, “cena da dança”... Toda cena nasce com um shot."
            acao={
              !filtrando && (
                <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNova(true)}>
                  Criar a primeira
                </Botao>
              )
            }
          />
        )}
        {!!dados?.length && (
          <div className={GRADE}>
            {dados.map((c) => (
              <CartaoCena key={c.id} c={c} mostrarProjeto={!f.projeto} />
            ))}
          </div>
        )}
      </div>
      <ModalCena
        aberto={nova}
        projetoInicial={f.projeto && f.projeto !== "sem" ? f.projeto : ""}
        aoFechar={() => setNova(false)}
        aoSalvar={(c) => navegar(`/cenas/${c.id}`)}
      />
    </>
  );
}

/** `volta`: de onde se está abrindo a cena, para o "voltar" de lá trazer de volta. */
export function CartaoCena({ c, mostrarProjeto, volta }: { c: Cena; mostrarProjeto?: boolean; volta?: Volta }) {
  return (
    <Link
      to={`/cenas/${c.id}`}
      state={volta && { volta }}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-violet-500/60"
    >
      <div className="flex items-center gap-2.5">
        <Clapperboard className="size-5 shrink-0 text-violet-400" />
        <span className={`truncate ${c.nome ? "font-medium" : "text-zinc-400 italic"}`}>{titulo("Cena", c.nome, c.ordem + 1)}</span>
      </div>
      {c.video && (
        <span className="flex items-center gap-1.5 truncate text-xs text-violet-300/80">
          <Film className="size-3.5 shrink-0" /> {c.video.lista.nome} › {c.video.nome}
        </span>
      )}
      {(c.descricao || c.storyboard) && (
        <p className="line-clamp-3 text-sm whitespace-pre-wrap text-zinc-400">{c.descricao || c.storyboard}</p>
      )}
      <div className="mt-auto flex justify-between gap-2 text-xs text-zinc-500">
        <span className="truncate">{mostrarProjeto ? (c.projeto?.nome ?? "Sem projeto") : ""}</span>
        <span className="shrink-0">
          {c.shots.length} {c.shots.length === 1 ? "shot" : "shots"}
        </span>
      </div>
    </Link>
  );
}

export function ModalCena({
  aberto,
  cena,
  projetoInicial = "",
  videoInicial = "",
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  cena?: Cena;
  projetoInicial?: string;
  /** Criando de dentro de um vídeo: a cena já nasce nele. */
  videoInicial?: string;
  aoFechar: () => void;
  aoSalvar: (c: Cena) => void;
}) {
  return (
    <Modal aberto={aberto} titulo={cena ? "Editar cena" : "Nova cena"} aoFechar={aoFechar}>
      <FormCena cena={cena} projetoInicial={projetoInicial} videoInicial={videoInicial} aoSalvar={aoSalvar} />
    </Modal>
  );
}

function FormCena({
  cena,
  projetoInicial,
  videoInicial,
  aoSalvar,
}: {
  cena?: Cena;
  projetoInicial: string;
  videoInicial: string;
  aoSalvar: (c: Cena) => void;
}) {
  const [nome, setNome] = useState(cena?.nome ?? "");
  const [projetoId, setProjetoId] = useState(cena ? (cena.projetoId ?? "") : projetoInicial);
  const [videoId, setVideoId] = useState(cena ? (cena.videoId ?? "") : videoInicial);
  // Os vídeos que dá para escolher: os das listas do projeto escolhido.
  const listas = useCarregar(() => (projetoId ? listasApi.listar(projetoId) : Promise.resolve([])), [projetoId]);
  const [descricao, setDescricao] = useState(cena?.descricao ?? "");
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
          const dados = {
            nome: nome.trim() || null,
            projetoId: projetoId || null,
            videoId: videoId || null,
            descricao: descricao || null,
            storyboard: cena?.storyboard ?? "",
          };
          aoSalvar(cena ? await cenasApi.salvar(cena.id, dados) : await cenasApi.criar(dados));
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome" dica="Opcional: sem nome, a cena se identifica pelo número.">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Cena da ponte" />
      </Campo>
      <Campo rotulo="Projeto">
        <EscolhaProjeto
          valor={projetoId}
          aoMudar={(p) => {
            setProjetoId(p);
            // Vídeo é de um projeto: trocou o projeto, a cena sai do vídeo.
            setVideoId("");
          }}
        />
      </Campo>
      {projetoId && !!listas.dados?.some((l) => l.videos.length) && (
        <Campo rotulo="Vídeo" dica="Opcional. Sem vídeo, a cena fica em “Cenas sem vídeo” do projeto.">
          <Seletor value={videoId} onChange={(e) => setVideoId(e.target.value)}>
            <option value="">— Sem vídeo —</option>
            {listas.dados.map((l) =>
              l.videos.length ? (
                <optgroup key={l.id} label={l.nome}>
                  {l.videos.map((v, i) => (
                    <option key={v.id} value={v.id}>
                      {i + 1}. {v.nome}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </Seletor>
        </Campo>
      )}
      <Campo rotulo="Descrição">
        <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} />
      </Campo>
      {!cena && <p className="text-xs text-zinc-500">A cena nasce com o “Shot 1”.</p>}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" carregando={salvando}>
          {cena ? "Salvar" : "Criar cena"}
        </Botao>
      </div>
    </form>
  );
}
