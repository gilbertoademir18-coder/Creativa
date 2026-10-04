import { Clapperboard, Film, Pencil, Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { cenasApi, listasApi } from "../api.ts";
import { EscolhaProjeto, FiltroBusca, FiltroProjeto } from "../componentes/filtros.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { ListaOrdenavel, movido } from "../componentes/ordenavel.tsx";
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
  LinkVoltar,
  Secao,
  Seletor,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros, useVolta, type Volta } from "../hooks.ts";
import type { Cena, ShotResumo } from "../tipos.ts";

export function PaginaCenas() {
  const [f, mudar] = useFiltros(["projeto", "busca"] as const);
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
        <span className="truncate font-medium">{c.nome}</span>
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

export function PaginaCena() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { dados: c, erro, setDados } = useCarregar(() => cenasApi.ler(id), [id]);
  const volta = useVolta();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!c) return <Carregando />;

  return (
    <>
      <Cabecalho
        voltar={
          <LinkVoltar
            {...(volta ??
              (c.video
                ? { para: `/videos/${c.video.id}`, rotulo: c.video.nome }
                : {
                    para: c.projeto ? `/cenas?projeto=${c.projeto.id}` : "/cenas",
                    rotulo: `Cenas${c.projeto ? ` de ${c.projeto.nome}` : ""}`,
                  }))}
          />
        }
        titulo={c.nome}
        subtitulo={
          <>
            {c.projeto ? (
              <Link to={`/projetos/${c.projeto.id}`} className="hover:text-violet-300">
                {c.projeto.nome}
              </Link>
            ) : (
              "Sem projeto"
            )}
            {c.video && (
              <>
                {" › "}
                {c.video.lista.nome}
                {" › "}
                <Link to={`/videos/${c.video.id}`} className="hover:text-violet-300">
                  {c.video.nome}
                </Link>
              </>
            )}
            {c.descricao && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-zinc-400">{c.descricao}</p>}
          </>
        }
        acoes={
          <>
            <Botao icone={<Pencil className="size-4" />} onClick={() => setEditando(true)}>
              Editar
            </Botao>
            <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
              Excluir
            </Botao>
          </>
        }
      />
      <div className="grid grid-cols-[1fr_30rem] gap-8 p-8">
        <Storyboard cena={c} aoSalvar={setDados} />
        <Shots cena={c} aoMudar={(shots) => setDados({ ...c, shots })} />
      </div>
      <ModalCena
        aberto={editando}
        cena={c}
        aoFechar={() => setEditando(false)}
        aoSalvar={(nova) => {
          setEditando(false);
          setDados(nova);
        }}
      />
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir cena"
        texto={
          <>
            A cena <b>{c.nome}</b> e os shots dela serão excluídos. Se algum shot tiver referências ou gerações, exclua-as
            antes.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await cenasApi.apagar(c.id);
          navegar(c.video ? `/videos/${c.video.id}` : "/cenas");
        }}
      />
    </>
  );
}

/** Storyboard em texto livre, com "Salvar" que só acende quando há mudança. */
function Storyboard({ cena, aoSalvar }: { cena: Cena; aoSalvar: (c: Cena) => void }) {
  const [texto, setTexto] = useState(cena.storyboard);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setTexto(cena.storyboard), [cena.storyboard]);
  const mudou = texto !== cena.storyboard;

  return (
    <Secao
      titulo="Storyboard"
      acoes={
        <Botao
          variante="primario"
          disabled={!mudou}
          carregando={salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            try {
              aoSalvar(
                await cenasApi.salvar(cena.id, {
                  nome: cena.nome,
                  projetoId: cena.projetoId,
                  videoId: cena.videoId,
                  descricao: cena.descricao,
                  storyboard: texto,
                }),
              );
            } catch (e) {
              setErro((e as Error).message);
            } finally {
              setSalvando(false);
            }
          }}
        >
          {mudou ? "Salvar storyboard" : "Salvo"}
        </Botao>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      <AreaTexto
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={"Roteiro, planos, intenção da cena...\n\nShot 1 — plano aberto da ponte ao entardecer\nShot 2 — close na mão de Camila"}
        className="min-h-[60vh] font-mono text-[13px]"
      />
    </Secao>
  );
}

/** A sequência de shots: abrir, reordenar e criar. */
function Shots({ cena, aoMudar }: { cena: Cena; aoMudar: (s: ShotResumo[]) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const shots = cena.shots;

  async function mover(i: number, delta: -1 | 1) {
    const nova = movido(shots, i, delta);
    aoMudar(nova); // otimista: a lista mexe na hora
    try {
      aoMudar(await cenasApi.reordenar(cena.id, nova.map((x) => x.id)));
    } catch (e) {
      setErro((e as Error).message);
      aoMudar(shots);
    }
  }

  return (
    <Secao
      titulo={`Shots (${shots.length})`}
      acoes={
        <Botao
          variante="primario"
          icone={<Plus className="size-4" />}
          carregando={criando}
          onClick={async () => {
            setCriando(true);
            setErro(null);
            try {
              const novo = await cenasApi.novoShot(cena.id);
              aoMudar([...shots, { ...novo, _count: { referencias: 0, outputs: 0 } }]);
            } catch (e) {
              setErro((e as Error).message);
            } finally {
              setCriando(false);
            }
          }}
        >
          Novo shot
        </Botao>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      <ListaOrdenavel
        itens={shots}
        aoMover={mover}
        linha={(s) => (
          <Link to={`/shots/${s.id}`} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
            <span className="truncate font-medium">{s.nome}</span>
            {s.descricao && <span className="line-clamp-2 text-sm text-zinc-400">{s.descricao}</span>}
            <span className="text-xs text-zinc-500">
              {s._count.referencias} referências · {s._count.outputs} outputs
            </span>
          </Link>
        )}
      />
    </Secao>
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
            nome,
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
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="Cena da ponte" />
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
