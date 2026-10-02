import { ArrowLeft, Clapperboard, FolderKanban, Pencil, Plus, Shapes, Trash } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { assetsApi, cenasApi, projetosApi } from "../api.ts";
import { FiltroBusca } from "../componentes/filtros.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import {
  AreaTexto,
  Aviso,
  BarraFiltros,
  Botao,
  BotaoLink,
  Cabecalho,
  Campo,
  Carregando,
  Entrada,
  GRADE,
  Secao,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import type { Projeto } from "../tipos.ts";
import { CartaoAsset, ModalAsset } from "./assets.tsx";
import { CartaoCena, ModalCena } from "./cenas.tsx";

export function PaginaProjetos() {
  const [f, mudar] = useFiltros(["busca"] as const);
  const { dados, erro, carregando, recarregar } = useCarregar(() => projetosApi.listar({ busca: f.busca }), [f.busca]);
  const [novo, setNovo] = useState(false);

  return (
    <>
      <Cabecalho
        titulo="Projetos"
        subtitulo="Cada projeto junta os assets e as cenas de um trabalho."
        acoes={
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
            Novo projeto
          </Botao>
        }
      />
      <BarraFiltros>
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<FolderKanban />}
            titulo={f.busca ? "Nenhum projeto com esse nome" : "Nenhum projeto ainda"}
            texto="Um projeto é um trabalho: “Poker de Camila”, “Anime Katsuragi”..."
            acao={
              !f.busca && (
                <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
                  Criar o primeiro
                </Botao>
              )
            }
          />
        )}
        {!!dados?.length && (
          <div className={GRADE}>
            {dados.map((p) => (
              <CartaoProjeto key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
      <ModalProjeto
        aberto={novo}
        aoFechar={() => setNovo(false)}
        aoSalvar={() => {
          setNovo(false);
          recarregar();
        }}
      />
    </>
  );
}

function CartaoProjeto({ p }: { p: Projeto }) {
  return (
    <Link
      to={`/projetos/${p.id}`}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-violet-500/60"
    >
      <div className="flex items-center gap-2.5">
        <FolderKanban className="size-5 text-violet-400" />
        <span className="truncate font-medium">{p.nome}</span>
      </div>
      {p.descricao && <p className="line-clamp-2 text-sm text-zinc-400">{p.descricao}</p>}
      <div className="mt-auto flex gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Shapes className="size-3.5" /> {p._count.assets} assets
        </span>
        <span className="flex items-center gap-1.5">
          <Clapperboard className="size-3.5" /> {p._count.cenas} cenas
        </span>
      </div>
    </Link>
  );
}

export function PaginaProjeto() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const projeto = useCarregar(() => projetosApi.ler(id), [id]);
  const assets = useCarregar(() => assetsApi.listar({ projeto: id }), [id]);
  const cenas = useCarregar(() => cenasApi.listar({ projeto: id }), [id]);
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [novoAsset, setNovoAsset] = useState(false);
  const [novaCena, setNovaCena] = useState(false);

  if (projeto.erro) return <div className="p-8"><Aviso>{projeto.erro}</Aviso></div>;
  if (!projeto.dados) return <Carregando />;
  const p = projeto.dados;

  return (
    <>
      <Cabecalho
        voltar={
          <Link to="/projetos" className="inline-flex items-center gap-1.5 hover:text-zinc-100">
            <ArrowLeft className="size-4" /> Projetos
          </Link>
        }
        titulo={p.nome}
        subtitulo={p.descricao}
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
      <div className="flex flex-col gap-10 p-8">
        <Secao
          titulo={`Assets (${assets.dados?.length ?? "…"})`}
          acoes={
            <>
              <BotaoLink para={`/assets?projeto=${p.id}`}>Ver na lista de assets</BotaoLink>
              <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovoAsset(true)}>
                Novo asset
              </Botao>
            </>
          }
        >
          {assets.dados?.length === 0 && <Vazio icone={<Shapes />} titulo="Nenhum asset neste projeto" />}
          {!!assets.dados?.length && (
            <div className={GRADE}>
              {assets.dados.map((a) => (
                <CartaoAsset key={a.id} a={a} />
              ))}
            </div>
          )}
        </Secao>
        <Secao
          titulo={`Cenas (${cenas.dados?.length ?? "…"})`}
          acoes={
            <>
              <BotaoLink para={`/cenas?projeto=${p.id}`}>Ver na lista de cenas</BotaoLink>
              <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovaCena(true)}>
                Nova cena
              </Botao>
            </>
          }
        >
          {cenas.dados?.length === 0 && <Vazio icone={<Clapperboard />} titulo="Nenhuma cena neste projeto" />}
          {!!cenas.dados?.length && (
            <div className={GRADE}>
              {cenas.dados.map((c) => (
                <CartaoCena key={c.id} c={c} />
              ))}
            </div>
          )}
        </Secao>
      </div>
      <ModalProjeto
        aberto={editando}
        projeto={p}
        aoFechar={() => setEditando(false)}
        aoSalvar={(novo) => {
          setEditando(false);
          projeto.setDados(novo);
        }}
      />
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir projeto"
        exigirDigitar="EXCLUIR"
        texto={
          <>
            O projeto <b>{p.nome}</b> será excluído. Os assets e as cenas dele <b>não</b> são apagados: ficam soltos,
            sem projeto.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await projetosApi.apagar(p.id);
          navegar("/projetos");
        }}
      />
      <ModalAsset
        aberto={novoAsset}
        projetoInicial={p.id}
        aoFechar={() => setNovoAsset(false)}
        aoSalvar={(a) => navegar(`/assets/${a.id}`)}
      />
      <ModalCena
        aberto={novaCena}
        projetoInicial={p.id}
        aoFechar={() => setNovaCena(false)}
        aoSalvar={(c) => navegar(`/cenas/${c.id}`)}
      />
    </>
  );
}

export function ModalProjeto({
  aberto,
  projeto,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  projeto?: Projeto;
  aoFechar: () => void;
  aoSalvar: (p: Projeto) => void;
}) {
  return (
    <Modal aberto={aberto} titulo={projeto ? "Editar projeto" : "Novo projeto"} aoFechar={aoFechar}>
      <FormProjeto projeto={projeto} aoSalvar={aoSalvar} />
    </Modal>
  );
}

function FormProjeto({ projeto, aoSalvar }: { projeto?: Projeto; aoSalvar: (p: Projeto) => void }) {
  const [nome, setNome] = useState(projeto?.nome ?? "");
  const [descricao, setDescricao] = useState(projeto?.descricao ?? "");
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
          const dados = { nome, descricao: descricao || null };
          aoSalvar(projeto ? await projetosApi.salvar(projeto.id, dados) : await projetosApi.criar(dados));
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="Poker de Camila" />
      </Campo>
      <Campo rotulo="Descrição">
        <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" carregando={salvando}>
          {projeto ? "Salvar" : "Criar projeto"}
        </Botao>
      </div>
    </form>
  );
}
