import { useProjetoAtual } from "../componentes/barra-projeto.tsx";
import { Box, Mountain, Pencil, Plus, Shapes, Trash, User } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { assetsApi, urlArquivo } from "../api.ts";
import { EscolhaProjeto, FiltroBusca, FiltroProjeto } from "../componentes/filtros.tsx";
import { PainelGerador } from "../componentes/gerador.tsx";
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
  LinkVoltar,
  Pilulas,
  Seletor,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros, useVolta, type Volta } from "../hooks.ts";
import { rotuloTipoAsset, TIPOS_ASSET } from "../rotulos.ts";
import type { Asset, TipoAsset } from "../tipos.ts";

const ICONE_TIPO: Record<TipoAsset, typeof User> = { PERSONAGEM: User, CENARIO: Mountain, OBJETO: Box, OUTRO: Shapes };

export function PaginaAssets() {
  const [f, mudar] = useFiltros(["projeto", "tipo", "busca"] as const);
  useProjetoAtual(f.projeto);
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
        subtitulo="Personagens, cenários e objetos — cada um com o seu Gerador, os outputs e as referências."
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
          <div className={FILEIRA_ASSETS}>
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

/** `volta`: de onde se está abrindo o asset, para o "voltar" de lá trazer de volta. */
/**
 * Os cartões de asset numa fileira: todos com a mesma altura, cada um com a
 * largura que a proporção da capa pede — personagem em pé fica estreito,
 * cenário 16:9 fica largo, e a imagem aparece inteira, sem corte.
 */
export const FILEIRA_ASSETS = "flex flex-wrap items-start gap-4";

export function CartaoAsset({ a, mostrarProjeto, volta }: { a: Asset; mostrarProjeto?: boolean; volta?: Volta }) {
  const Icone = ICONE_TIPO[a.tipo];
  return (
    // w-min: o cartão tem a largura da capa (a imagem, na altura fixa, manda).
    <Link
      to={`/assets/${a.id}`}
      state={volta && { volta }}
      className="group flex w-min min-w-36 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-violet-500/60"
    >
      <div className="h-64 overflow-hidden bg-zinc-950">
        {a.capa ? (
          <img src={urlArquivo(a.capa)} alt="" loading="lazy" className="h-full w-auto max-w-none transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-48 items-center justify-center text-zinc-700">
            <Icone className="size-14" />
          </div>
        )}
      </div>
      {/* w-0 min-w-full: o texto ocupa a largura da capa sem alargar o cartão. */}
      <div className="flex w-0 min-w-full flex-col gap-1 px-3.5 py-3">
        <span className="truncate font-medium" title={a.nome}>
          {a.nome}
        </span>
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
          <Etiqueta>{rotuloTipoAsset(a.tipo)}</Etiqueta>
          <span className="shrink-0">
            {a._count.referencias} ref · {a._count.outputs} out
          </span>
        </div>
        {mostrarProjeto && <span className="truncate text-xs text-zinc-500">{a.projeto?.nome ?? "Sem projeto"}</span>}
      </div>
    </Link>
  );
}

export function PaginaAsset() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { dados: a, erro, setDados } = useCarregar(() => assetsApi.ler(id), [id]);
  useProjetoAtual(a?.projeto?.id);
  const volta = useVolta();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!a) return <Carregando />;

  return (
    <>
      <Cabecalho
        // Com projeto, quem navega é a barra do projeto.
        voltar={a.projeto ? undefined : <LinkVoltar {...(volta ?? { para: "/assets", rotulo: "Assets" })} />}
        titulo={
          <span className="flex items-center gap-3">
            {a.nome} <Etiqueta>{rotuloTipoAsset(a.tipo)}</Etiqueta>
          </span>
        }
        subtitulo={
          <>
            {!a.projeto && "Sem projeto"}
            {a.descricao && <p className={`${a.projeto ? "" : "mt-2 "}max-w-3xl whitespace-pre-wrap text-zinc-400`}>{a.descricao}</p>}
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
        <PainelGerador dono={{ assetId: a.id, shotId: null }} />
        <PainelReferencias dono={{ assetId: a.id, shotId: null }} />
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
            O asset <b>{a.nome}</b> será excluído. Se ele tiver referências ou outputs, exclua-os antes.
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
