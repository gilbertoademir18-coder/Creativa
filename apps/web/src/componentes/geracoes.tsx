import { Plus, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { consulta, geracoesApi } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { formatarData, statusGeracao, tituloGeracao } from "../rotulos.ts";
import type { Geracao, GeracaoResumo, StatusGeracao } from "../tipos.ts";
import { DescricaoDono } from "./referencias.tsx";
import { Aviso, BotaoLink, Carregando, Etiqueta, Secao, Vazio } from "./ui.tsx";

export function EtiquetaStatus({ status }: { status: StatusGeracao }) {
  const s = statusGeracao(status);
  return <Etiqueta className={s.cor}>{s.rotulo}</Etiqueta>;
}

/**
 * Gerações em tabela: é uma lista para ler (prompt, status, data), não uma
 * galeria — a galeria é a dos outputs.
 */
export function TabelaGeracoes({ geracoes, mostrarDono }: { geracoes: (Geracao | GeracaoResumo)[]; mostrarDono?: boolean }) {
  const navegar = useNavigate();
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-xs tracking-wide text-zinc-500 uppercase">
          <tr>
            <th className="px-4 py-2.5 font-medium">Geração</th>
            {mostrarDono && <th className="px-4 py-2.5 font-medium">Pertence a</th>}
            <th className="px-4 py-2.5 font-medium">Status</th>
            {mostrarDono && <th className="px-4 py-2.5 font-medium">Workflow</th>}
            <th className="px-4 py-2.5 text-right font-medium">Outputs</th>
            <th className="px-4 py-2.5 text-right font-medium">Criada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {geracoes.map((g) => (
            <tr key={g.id} onClick={() => navegar(`/geracoes/${g.id}`)} className="cursor-pointer hover:bg-zinc-900/60">
              <td className="max-w-xl truncate px-4 py-3">{tituloGeracao(g)}</td>
              {mostrarDono && "asset" in g && (
                <td className="px-4 py-3 text-zinc-400" onClick={(e) => e.stopPropagation()}>
                  <DescricaoDono r={g} />
                </td>
              )}
              <td className="px-4 py-3">
                <EtiquetaStatus status={g.status} />
              </td>
              {mostrarDono && "workflow" in g && <td className="px-4 py-3 text-zinc-400">{g.workflow?.nome ?? "—"}</td>}
              <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">{g._count.outputs}</td>
              <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{formatarData(g.criadoEm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** O bloco de gerações de um asset ou shot. */
export function PainelGeracoes({ asset, shot }: { asset?: string; shot?: string }) {
  const { dados, erro, carregando } = useCarregar(() => geracoesApi.listar({ asset, shot }), [asset, shot]);
  const nova = `/geracoes/nova${consulta({ asset, shot })}`;
  return (
    <Secao
      titulo={`Gerações${dados ? ` (${dados.length})` : ""}`}
      acoes={
        <BotaoLink para={nova} variante="primario" icone={<Plus className="size-4" />}>
          Nova geração
        </BotaoLink>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      {carregando && !dados && <Carregando />}
      {dados?.length === 0 && (
        <Vazio icone={<Sparkles />} titulo="Nenhuma geração ainda" texto="Uma geração junta prompt, referências, workflow e modelo." />
      )}
      {!!dados?.length && <TabelaGeracoes geracoes={dados} />}
    </Secao>
  );
}
