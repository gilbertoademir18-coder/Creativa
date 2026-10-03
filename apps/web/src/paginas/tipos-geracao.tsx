import { Layers, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { tiposGeracaoApi, type TipoGeracaoNovo } from "../api.ts";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { AreaTexto, Aviso, Botao, Cabecalho, Campo, Carregando, Entrada, Etiqueta, Pilulas, Vazio } from "../componentes/ui.tsx";
import { useCarregar } from "../hooks.ts";
import { TIPOS_ASSET } from "../rotulos.ts";
import type { SaidaGeracao, TipoAsset, TipoGeracao } from "../tipos.ts";

export const SAIDAS: { valor: SaidaGeracao; rotulo: string }[] = [
  { valor: "IMAGEM", rotulo: "Imagem" },
  { valor: "VIDEO", rotulo: "Vídeo" },
  { valor: "AUDIO", rotulo: "Áudio" },
];

/**
 * Tipos de geração: para que serve uma geração ("Placa de cenário",
 * "Character sheet") e em que Gerador ela aparece — no de quais tipos de
 * asset, e no dos shots. Cada tipo tem um ou mais workflows.
 */
export function PaginaTiposGeracao() {
  const { dados, erro, carregando, recarregar } = useCarregar(() => tiposGeracaoApi.listar(), []);
  const [aberto, setAberto] = useState<TipoGeracao | "novo" | null>(null);

  return (
    <>
      <Cabecalho
        titulo="Tipos de geração"
        subtitulo="Para que serve cada geração e em que Gerador ela aparece. Os workflows de cada tipo ficam em Workflows."
        acoes={
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setAberto("novo")}>
            Novo tipo
          </Botao>
        }
      />
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<Layers />}
            titulo="Nenhum tipo de geração ainda"
            acao={
              <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setAberto("novo")}>
                Criar o primeiro
              </Botao>
            }
          />
        )}
        {!!dados?.length && (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Aparece em</th>
                  <th className="px-4 py-2.5 font-medium">Saída</th>
                  <th className="px-4 py-2.5 text-right font-medium">Workflows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {dados.map((t) => (
                  <tr key={t.id} onClick={() => setAberto(t)} className="cursor-pointer hover:bg-zinc-900/60">
                    <td className="max-w-xl px-4 py-2.5">
                      <div className="font-medium">{t.nome}</div>
                      {t.descricao && <div className="truncate text-xs text-zinc-500">{t.descricao}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <ApareceEm t={t} />
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{SAIDAS.find((s) => s.valor === t.saida)?.rotulo}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/workflows?tipo=${t.chave}`} className="text-zinc-400 hover:text-violet-300">
                        {t._count.workflows}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal aberto={!!aberto} titulo={aberto === "novo" ? "Novo tipo de geração" : "Editar tipo de geração"} aoFechar={() => setAberto(null)}>
        {aberto && (
          <FormTipo
            tipo={aberto === "novo" ? undefined : aberto}
            aoSalvar={() => {
              setAberto(null);
              recarregar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function ApareceEm({ t }: { t: TipoGeracao }) {
  const onde = [...TIPOS_ASSET.filter((a) => t.tiposAsset.includes(a.valor)).map((a) => a.plural), ...(t.shot ? ["Shots"] : [])];
  if (!onde.length) return <span className="text-amber-300/80">Nenhum Gerador</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {onde.map((o) => (
        <Etiqueta key={o}>{o}</Etiqueta>
      ))}
    </div>
  );
}

function FormTipo({ tipo, aoSalvar }: { tipo?: TipoGeracao; aoSalvar: () => void }) {
  const [nome, setNome] = useState(tipo?.nome ?? "");
  const [descricao, setDescricao] = useState(tipo?.descricao ?? "");
  const [saida, setSaida] = useState<SaidaGeracao>(tipo?.saida ?? "IMAGEM");
  const [tiposAsset, setTiposAsset] = useState<TipoAsset[]>(tipo?.tiposAsset ?? []);
  const [shot, setShot] = useState(tipo?.shot ?? false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const alternar = (a: TipoAsset) => setTiposAsset((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]));

  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvando(true);
          setErro(null);
          const dados: TipoGeracaoNovo = { nome, descricao: descricao || null, saida, tiposAsset, shot };
          try {
            if (tipo) await tiposGeracaoApi.salvar(tipo.id, dados);
            else await tiposGeracaoApi.criar(dados);
            aoSalvar();
          } catch (er) {
            setErro((er as Error).message);
            setSalvando(false);
          }
        }}
      >
        <Campo rotulo="Nome" dica={tipo ? `Chave: ${tipo.chave} — não muda, os outputs guardam ela.` : "A chave nasce do nome e não muda depois."}>
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="Character sheet" />
        </Campo>
        <Campo rotulo="Descrição" dica="Aparece no Gerador, embaixo da escolha do tipo.">
          <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
        </Campo>
        <Campo rotulo="Saída">
          <Pilulas valor={saida} aoMudar={(v) => setSaida(v as SaidaGeracao)} opcoes={SAIDAS} />
        </Campo>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Aparece no Gerador de</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {TIPOS_ASSET.map((a) => (
              <label key={a.valor} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={tiposAsset.includes(a.valor)} onChange={() => alternar(a.valor)} className="size-4 accent-violet-500" />
                {a.plural}
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={shot} onChange={() => setShot(!shot)} className="size-4 accent-violet-500" />
              Shots
            </label>
          </div>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-between gap-2">
          {tipo ? (
            <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
              Excluir
            </Botao>
          ) : (
            <span />
          )}
          <Botao type="submit" variante="primario" carregando={salvando}>
            {tipo ? "Salvar" : "Criar tipo"}
          </Botao>
        </div>
      </form>

      {/* Fora do <form>: a confirmação tem o form dela, e form dentro de form enviaria o de fora. */}
      {tipo && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir tipo de geração"
          texto={
            <>
              O tipo <b>{tipo.nome}</b> será excluído. Os outputs já gerados com ele continuam, com a chave gravada.
            </>
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await tiposGeracaoApi.apagar(tipo.id);
            aoSalvar();
          }}
        />
      )}
    </>
  );
}
