import { Plus, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { consulta, geracoesApi, urlArquivo } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { formatarData, statusGeracao, tituloGeracao } from "../rotulos.ts";
import type { Geracao, StatusGeracao } from "../tipos.ts";
import { DescricaoDono } from "./referencias.tsx";
import { Aviso, Botao, BotaoLink, Carregando, Etiqueta, Secao, Vazio } from "./ui.tsx";

export function EtiquetaStatus({ status }: { status: StatusGeracao }) {
  const s = statusGeracao(status);
  return <Etiqueta className={s.cor}>{s.rotulo}</Etiqueta>;
}

/**
 * Gerações em tabela: é uma lista para ler (prompt, tipo, status, data),
 * com a primeira imagem gerada de miniatura.
 */
export function TabelaGeracoes({
  geracoes,
  mostrarDono,
  aoAbrir,
  selecionada,
}: {
  geracoes: Geracao[];
  mostrarDono?: boolean;
  /** Abrir no lugar (embutida) em vez de ir para /geracoes/:id. */
  aoAbrir?: (id: string) => void;
  selecionada?: string | null;
}) {
  const navegar = useNavigate();
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-xs tracking-wide text-zinc-500 uppercase">
          <tr>
            <th className="px-4 py-2.5 font-medium">Geração</th>
            {mostrarDono && <th className="px-4 py-2.5 font-medium">Pertence a</th>}
            <th className="px-4 py-2.5 font-medium">Tipo</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Outputs</th>
            <th className="px-4 py-2.5 text-right font-medium">Criada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {geracoes.map((g) => (
            <tr
              key={g.id}
              onClick={() => (aoAbrir ? aoAbrir(g.id) : navegar(`/geracoes/${g.id}`))}
              className={`cursor-pointer ${g.id === selecionada ? "bg-violet-600/10 hover:bg-violet-600/15" : "hover:bg-zinc-900/60"}`}
            >
              <td className="max-w-xl px-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-zinc-900">
                    {g.capa && <img src={urlArquivo(g.capa)} alt="" loading="lazy" className="size-full object-cover" />}
                  </div>
                  <span className="truncate">{tituloGeracao(g)}</span>
                </div>
              </td>
              {mostrarDono && (
                <td className="px-4 py-2 text-zinc-400" onClick={(e) => e.stopPropagation()}>
                  <DescricaoDono r={g} />
                </td>
              )}
              <td className="px-4 py-2 text-zinc-400">{g.tipoNome}</td>
              <td className="px-4 py-2">
                <EtiquetaStatus status={g.status} />
              </td>
              <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{g._count.outputs}</td>
              <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{formatarData(g.criadoEm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * O bloco de gerações de um asset ou shot. Com `aoAbrir`, clicar numa
 * geração (ou em "Nova geração") abre ela no lugar, na própria página.
 * `versao`: quem embute muda o número para a lista recarregar.
 */
export function PainelGeracoes({
  asset,
  shot,
  aoAbrir,
  selecionada,
  versao = 0,
}: {
  asset?: string;
  shot?: string;
  aoAbrir?: (id: string | "nova") => void;
  selecionada?: string | null;
  versao?: number;
}) {
  const { dados, erro, carregando } = useCarregar(() => geracoesApi.listar({ asset, shot }), [asset, shot, versao]);
  const nova = `/geracoes/nova${consulta({ asset, shot })}`;
  return (
    <Secao
      titulo={`Gerações${dados ? ` (${dados.length})` : ""}`}
      acoes={
        aoAbrir ? (
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => aoAbrir("nova")}>
            Nova geração
          </Botao>
        ) : (
          <BotaoLink para={nova} variante="primario" icone={<Plus className="size-4" />}>
            Nova geração
          </BotaoLink>
        )
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      {carregando && !dados && <Carregando />}
      {dados?.length === 0 && (
        <Vazio icone={<Sparkles />} titulo="Nenhuma geração ainda" texto="Uma geração junta prompt, referências, workflow e modelo." />
      )}
      {!!dados?.length && <TabelaGeracoes geracoes={dados} aoAbrir={aoAbrir} selecionada={selecionada} />}
    </Secao>
  );
}
