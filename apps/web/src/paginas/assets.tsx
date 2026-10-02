import { ArrowLeft, Box, Mountain, Pencil, Plus, Shapes, Trash, User } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { assetsApi, urlArquivo } from "../api.ts";
import { EscolhaProjeto, FiltroBusca, FiltroProjeto } from "../componentes/filtros.tsx";
import { PainelGeracoes } from "../componentes/geracoes.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { PainelReferencias } from "../componentes/referencias.tsx";
import {
  AreaTexto,
  Aviso,
  BarraFiltros,
  Botao,
  Cabecalho,
  Campo,
  Carregando,
  Entrada,
  Etiqueta,
  GRADE,
  Pilulas,
  Seletor,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import { rotuloTipoAsset, TIPOS_ASSET } from "../rotulos.ts";
import type { Asset, TipoAsset } from "../tipos.ts";

const ICONE_TIPO: Record<TipoAsset, typeof User> = { PERSONAGEM: User, CENARIO: Mountain, OBJETO: Box, OUTRO: Shapes };

export function PaginaAssets() {
  const [f, mudar] = useFiltros(["projeto", "tipo", "busca"] as const);
  const { dados, erro, carregando, recarregar } = useCarregar(
    () => assetsApi.listar({ projeto: f.projeto, tipo: f.tipo as TipoAsset | "", busca: f.busca }),
    [f.projeto, f.tipo, f.busca],
  );
  const [novo, setNovo] = useState(false);
  const filtrando = !!(f.projeto || f.tipo || f.busca);

  return (
    <>
      <Cabecalho
        titulo="Assets"
        subtitulo="Personagens, cenários e objetos — com as referências e as gerações de cada um."
        acoes={
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
            Novo asset
          </Botao>
        }
      />
      <BarraFiltros>
        <FiltroProjeto valor={f.projeto} aoMudar={(v) => mudar("projeto", v)} />
        <Pilulas
          valor={f.tipo}
          aoMudar={(v) => mudar("tipo", v)}
          opcoes={[{ valor: "", rotulo: "Todos" }, ...TIPOS_ASSET.map((t) => ({ valor: t.valor, rotulo: t.plural }))]}
        />
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<Shapes />}
            titulo={filtrando ? "Nenhum asset com esses filtros" : "Nenhum asset ainda"}
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
            {dados.map((a) => (
              // Filtrando por projeto, repetir o nome dele em todo cartão é ruído.
              <CartaoAsset key={a.id} a={a} mostrarProjeto={!f.projeto} />
            ))}
          </div>
        )}
      </div>
      <ModalAsset
        aberto={novo}
        // Filtrando por um projeto ou tipo, o asset novo já nasce nele.
        projetoInicial={f.projeto && f.projeto !== "sem" ? f.projeto : ""}
        tipoInicial={(f.tipo as TipoAsset) || undefined}
        aoFechar={() => setNovo(false)}
        aoSalvar={() => {
          setNovo(false);
          recarregar();
        }}
      />
    </>
  );
}

export function CartaoAsset({ a, mostrarProjeto }: { a: Asset; mostrarProjeto?: boolean }) {
  const Icone = ICONE_TIPO[a.tipo];
  return (
    <Link
      to={`/assets/${a.id}`}
      className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-violet-500/60"
    >
      <div className="aspect-square overflow-hidden bg-zinc-950">
        {a.capa ? (
          <img src={urlArquivo(a.capa)} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="flex size-full items-center justify-center text-zinc-700">
            <Icone className="size-14" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{a.nome}</span>
          <Etiqueta>{rotuloTipoAsset(a.tipo)}</Etiqueta>
        </div>
        <div className="flex justify-between gap-2 text-xs text-zinc-500">
          <span className="truncate">{mostrarProjeto ? (a.projeto?.nome ?? "Sem projeto") : ""}</span>
          <span className="shrink-0">
            {a._count.referencias} ref · {a._count.geracoes} ger
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PaginaAsset() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { dados: a, erro, setDados } = useCarregar(() => assetsApi.ler(id), [id]);
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!a) return <Carregando />;

  return (
    <>
      <Cabecalho
        voltar={
          <Link to={a.projeto ? `/assets?projeto=${a.projeto.id}` : "/assets"} className="inline-flex items-center gap-1.5 hover:text-zinc-100">
            <ArrowLeft className="size-4" /> Assets{a.projeto ? ` de ${a.projeto.nome}` : ""}
          </Link>
        }
        titulo={
          <span className="flex items-center gap-3">
            {a.nome} <Etiqueta>{rotuloTipoAsset(a.tipo)}</Etiqueta>
          </span>
        }
        subtitulo={
          <>
            {a.projeto ? (
              <Link to={`/projetos/${a.projeto.id}`} className="hover:text-violet-300">
                {a.projeto.nome}
              </Link>
            ) : (
              "Sem projeto"
            )}
            {a.descricao && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-zinc-400">{a.descricao}</p>}
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
      <div className="flex flex-col gap-10 p-8">
        <PainelReferencias dono={{ assetId: a.id, shotId: null }} />
        <PainelGeracoes asset={a.id} />
      </div>
      <ModalAsset
        aberto={editando}
        asset={a}
        aoFechar={() => setEditando(false)}
        aoSalvar={(novo) => {
          setEditando(false);
          setDados({ ...a, ...novo });
        }}
      />
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir asset"
        texto={
          <>
            O asset <b>{a.nome}</b> será excluído. Se ele tiver referências ou gerações, exclua-as antes.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await assetsApi.apagar(a.id);
          navegar("/assets");
        }}
      />
    </>
  );
}

export function ModalAsset({
  aberto,
  asset,
  projetoInicial = "",
  tipoInicial,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  asset?: Asset;
  projetoInicial?: string;
  tipoInicial?: TipoAsset;
  aoFechar: () => void;
  aoSalvar: (a: Asset) => void;
}) {
  return (
    <Modal aberto={aberto} titulo={asset ? "Editar asset" : "Novo asset"} aoFechar={aoFechar}>
      <FormAsset asset={asset} projetoInicial={projetoInicial} tipoInicial={tipoInicial} aoSalvar={aoSalvar} />
    </Modal>
  );
}

function FormAsset({
  asset,
  projetoInicial,
  tipoInicial,
  aoSalvar,
}: {
  asset?: Asset;
  projetoInicial: string;
  tipoInicial?: TipoAsset;
  aoSalvar: (a: Asset) => void;
}) {
  const [nome, setNome] = useState(asset?.nome ?? "");
  const [tipo, setTipo] = useState<TipoAsset>(asset?.tipo ?? tipoInicial ?? "PERSONAGEM");
  const [projetoId, setProjetoId] = useState(asset ? (asset.projetoId ?? "") : projetoInicial);
  const [descricao, setDescricao] = useState(asset?.descricao ?? "");
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
          const dados = { nome, tipo, projetoId: projetoId || null, descricao: descricao || null };
          aoSalvar(asset ? await assetsApi.salvar(asset.id, dados) : await assetsApi.criar(dados));
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="Camila" />
      </Campo>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Tipo">
          <Seletor value={tipo} onChange={(e) => setTipo(e.target.value as TipoAsset)}>
            {TIPOS_ASSET.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </Seletor>
        </Campo>
        <Campo rotulo="Projeto">
          <EscolhaProjeto valor={projetoId} aoMudar={setProjetoId} />
        </Campo>
      </div>
      <Campo rotulo="Descrição">
        <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} placeholder="Aparência, personalidade, detalhes que importam na geração..." />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" carregando={salvando}>
          {asset ? "Salvar" : "Criar asset"}
        </Botao>
      </div>
    </form>
  );
}
