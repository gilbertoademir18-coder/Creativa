import { FileText, Images, Trash, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { referenciasApi, urlArquivo, type Dono } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { formatarBytes, formatarData, TIPOS_REFERENCIA } from "../rotulos.ts";
import type { Referencia } from "../tipos.ts";
import { ICONE_TIPO_REFERENCIA, Miniatura } from "./midia.tsx";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { SeletorDono } from "./seletor-dono.tsx";
import { AreaTexto, Aviso, Botao, Campo, Carregando, Entrada, GRADE, Secao, Vazio } from "./ui.tsx";

/** De onde uma referência é: "Asset Camila", "Cena da ponte › Shot 2", ou solta. */
export function DescricaoDono({ r }: { r: Pick<Referencia, "asset" | "shot"> }) {
  if (r.asset) {
    return (
      <Link to={`/assets/${r.asset.id}`} className="hover:text-violet-300">
        {r.asset.nome}
      </Link>
    );
  }
  if (r.shot) {
    return (
      <Link to={`/shots/${r.shot.id}`} className="hover:text-violet-300">
        {r.shot.cena.nome} › {r.shot.nome}
      </Link>
    );
  }
  return <span className="text-zinc-600">Solta</span>;
}

export function CartaoReferencia({
  r,
  mostrarDono,
  aoClicar,
}: {
  r: Referencia;
  mostrarDono?: boolean;
  aoClicar: () => void;
}) {
  const Icone = ICONE_TIPO_REFERENCIA[r.tipo];
  return (
    <div className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
      <button type="button" onClick={aoClicar} className="block aspect-[4/3] w-full overflow-hidden bg-black">
        <Miniatura tipo={r.tipo} arquivo={r.arquivo} texto={r.texto} />
      </button>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm">
          <Icone className="size-3.5 shrink-0 text-zinc-500" />
          <span className="truncate">{r.nome}</span>
        </div>
        {mostrarDono && (
          <div className="truncate text-xs text-zinc-500">
            <DescricaoDono r={r} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Arraste arquivos aqui ou clique para escolher. Imagem, vídeo, .txt e .md;
 * cada arquivo vira uma referência do dono indicado.
 */
export function ZonaUpload({ dono, aoEnviar }: { dono: Dono; aoEnviar: (novas: Referencia[]) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return;
    setEnviando(true);
    setErro(null);
    try {
      aoEnviar(await referenciasApi.enviar([...lista], dono));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          enviar(e.dataTransfer.files);
        }}
        disabled={enviando}
        className={`flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-6 text-sm transition-colors ${
          sobre ? "border-violet-500 bg-violet-500/10 text-violet-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        }`}
      >
        <Upload className={`size-5 ${enviando ? "animate-bounce" : ""}`} />
        {enviando ? "Enviando..." : "Arraste imagens, vídeos ou textos aqui — ou clique para escolher"}
      </button>
      <input
        ref={entrada}
        type="file"
        multiple
        accept="image/*,video/*,.txt,.md,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => enviar(e.target.files)}
      />
      {erro && <Aviso>{erro}</Aviso>}
    </div>
  );
}

/** Nova referência de texto, digitada na hora. */
export function ModalTexto({
  aberto,
  dono,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  dono: Dono;
  aoFechar: () => void;
  aoCriar: (r: Referencia) => void;
}) {
  return (
    <Modal aberto={aberto} titulo="Nova referência de texto" largura="larga" aoFechar={aoFechar}>
      <FormTexto dono={dono} aoCriar={aoCriar} />
    </Modal>
  );
}

function FormTexto({ dono, aoCriar }: { dono: Dono; aoCriar: (r: Referencia) => void }) {
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
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
          aoCriar(await referenciasApi.criarTexto({ ...dono, nome, texto }));
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required />
      </Campo>
      <Campo rotulo="Texto">
        <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={14} required />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" carregando={salvando}>
          Criar referência
        </Botao>
      </div>
    </form>
  );
}

/** A referência aberta: prévia grande à esquerda, edição à direita. */
export function ModalReferencia({
  referencia,
  aoFechar,
  aoMudar,
}: {
  referencia: Referencia | null;
  aoFechar: () => void;
  /** Chamado após salvar (com a nova) ou excluir (com null). */
  aoMudar: (r: Referencia | null) => void;
}) {
  return (
    <Modal aberto={!!referencia} titulo={referencia?.nome ?? ""} largura="enorme" aoFechar={aoFechar}>
      {referencia && <DetalheReferencia referencia={referencia} aoMudar={aoMudar} />}
    </Modal>
  );
}

function DetalheReferencia({ referencia: r, aoMudar }: { referencia: Referencia; aoMudar: (r: Referencia | null) => void }) {
  const [nome, setNome] = useState(r.nome);
  const [texto, setTexto] = useState(r.texto ?? "");
  const [dono, setDono] = useState<Dono>({ assetId: r.assetId, shotId: r.shotId });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const rotuloTipo = TIPOS_REFERENCIA.find((t) => t.valor === r.tipo)?.rotulo;

  return (
    <div className="grid grid-cols-[1fr_22rem] gap-6">
      <div className="flex max-h-[70vh] min-h-[50vh] items-center justify-center overflow-hidden rounded-xl bg-black">
        {r.tipo === "IMAGEM" && r.arquivo && <img src={urlArquivo(r.arquivo)} alt={r.nome} className="max-h-[70vh] object-contain" />}
        {r.tipo === "VIDEO" && r.arquivo && <video src={urlArquivo(r.arquivo)} controls className="max-h-[70vh]" />}
        {r.tipo === "TEXTO" && (
          <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} className="h-[70vh] resize-none rounded-xl border-0" />
        )}
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvando(true);
          setErro(null);
          try {
            aoMudar(await referenciasApi.salvar(r.id, { ...dono, nome, ...(r.tipo === "TEXTO" ? { texto } : {}) }));
          } catch (er) {
            setErro((er as Error).message);
          } finally {
            setSalvando(false);
          }
        }}
      >
        <Campo rotulo="Nome">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>
        <Campo rotulo="Pertence a">
          <SeletorDono valor={dono} aoMudar={setDono} />
        </Campo>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-400">
          <dt className="text-zinc-500">Tipo</dt>
          <dd>{rotuloTipo}</dd>
          {r.nomeOriginal && (
            <>
              <dt className="text-zinc-500">Arquivo</dt>
              <dd className="truncate">{r.nomeOriginal}</dd>
            </>
          )}
          {r.tamanhoBytes !== null && (
            <>
              <dt className="text-zinc-500">Tamanho</dt>
              <dd>{formatarBytes(r.tamanhoBytes)}</dd>
            </>
          )}
          <dt className="text-zinc-500">Enviada em</dt>
          <dd>{formatarData(r.criadoEm)}</dd>
        </dl>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="mt-auto flex justify-between gap-2">
          <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
            Excluir
          </Botao>
          <Botao type="submit" variante="primario" carregando={salvando}>
            Salvar
          </Botao>
        </div>
      </form>
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir referência"
        texto={
          <>
            A referência <b>{r.nome}</b> e o arquivo dela serão apagados. Referência usada em alguma geração não pode
            ser excluída.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await referenciasApi.apagar(r.id);
          aoMudar(null);
        }}
      />
    </div>
  );
}

/**
 * O bloco de referências de um asset ou shot: upload, texto e a grade.
 */
export function PainelReferencias({ dono }: { dono: Dono }) {
  const filtro = dono.assetId ? { asset: dono.assetId } : { shot: dono.shotId ?? undefined };
  const { dados, erro, carregando, recarregar } = useCarregar(() => referenciasApi.listar(filtro), [dono.assetId, dono.shotId]);
  const [aberta, setAberta] = useState<Referencia | null>(null);
  const [novoTexto, setNovoTexto] = useState(false);

  return (
    <Secao
      titulo={`Referências${dados ? ` (${dados.length})` : ""}`}
      acoes={
        <Botao icone={<FileText className="size-4" />} onClick={() => setNovoTexto(true)}>
          Texto
        </Botao>
      }
    >
      <ZonaUpload dono={dono} aoEnviar={() => recarregar()} />
      {erro && <Aviso>{erro}</Aviso>}
      {carregando && !dados && <Carregando />}
      {dados?.length === 0 && (
        <Vazio icone={<Images />} titulo="Nenhuma referência ainda" texto="Imagens, vídeos e textos que guiam as gerações." />
      )}
      {!!dados?.length && (
        <div className={GRADE}>
          {dados.map((r) => (
            <CartaoReferencia key={r.id} r={r} aoClicar={() => setAberta(r)} />
          ))}
        </div>
      )}
      <ModalReferencia
        referencia={aberta}
        aoFechar={() => setAberta(null)}
        aoMudar={() => {
          setAberta(null);
          recarregar();
        }}
      />
      <ModalTexto
        aberto={novoTexto}
        dono={dono}
        aoFechar={() => setNovoTexto(false)}
        aoCriar={() => {
          setNovoTexto(false);
          recarregar();
        }}
      />
    </Secao>
  );
}
