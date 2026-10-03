import { Plus, Workflow } from "lucide-react";
import { useState } from "react";
import { tiposGeracaoApi, workflowsApi } from "../api.ts";
import { EditorWorkflow } from "../componentes/editor-workflow.tsx";
import { FiltroBusca, FiltroSelecao } from "../componentes/filtros.tsx";
import { Modal } from "../componentes/modal.tsx";
import { Aviso, BarraFiltros, Botao, Cabecalho, Carregando, Etiqueta, Vazio } from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import { formatarData } from "../rotulos.ts";

/**
 * Workflows: o jeito concreto de gerar cada tipo, numa ferramenta (hoje, o
 * ComfyUI). Importa-se o grafo, escolhe-se o que vira campo no Gerador e
 * testa-se antes de salvar.
 */
export function PaginaWorkflows() {
  const [f, mudar] = useFiltros(["tipo", "busca"] as const);
  const { dados, erro, carregando, recarregar } = useCarregar(() => workflowsApi.listar({ tipo: f.tipo, busca: f.busca }), [f.tipo, f.busca]);
  const tipos = useCarregar(() => tiposGeracaoApi.listar(), []);
  /** O aberto no editor: "novo", ou o id (o detalhe, com o grafo, carrega no modal). */
  const [aberto, setAberto] = useState<string | null>(null);
  const filtrando = !!(f.tipo || f.busca);

  return (
    <>
      <Cabecalho
        titulo="Workflows"
        subtitulo="Como cada tipo de geração é feito: o grafo da ferramenta, os campos que o Gerador mostra e o que vira output."
        acoes={
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setAberto("novo")} disabled={!tipos.dados?.length}>
            Novo workflow
          </Botao>
        }
      />
      <BarraFiltros>
        <FiltroSelecao valor={f.tipo} aoMudar={(v) => mudar("tipo", v)} todos="Qualquer tipo" largura="w-64">
          {tipos.dados?.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.nome}
            </option>
          ))}
        </FiltroSelecao>
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {tipos.dados?.length === 0 && <Aviso>Crie um tipo de geração antes: todo workflow é de um tipo.</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<Workflow />}
            titulo={filtrando ? "Nenhum workflow com esses filtros" : "Nenhum workflow ainda"}
            texto={filtrando ? undefined : "No ComfyUI: Workflow → Export (API). Depois, Novo workflow e importe o arquivo."}
          />
        )}
        {!!dados?.length && (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Workflow</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Ferramenta · modelo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Campos</th>
                  <th className="px-4 py-2.5 text-right font-medium">Outputs</th>
                  <th className="px-4 py-2.5 text-right font-medium">Editado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {dados.map((w) => (
                  <tr key={w.id} onClick={() => setAberto(w.id)} className="cursor-pointer hover:bg-zinc-900/60">
                    <td className="max-w-xl px-4 py-2.5">
                      <div className="font-medium">{w.nome}</div>
                      {w.descricao && <div className="truncate text-xs text-zinc-500">{w.descricao}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Etiqueta>{w.tipoGeracao.nome}</Etiqueta>
                    </td>
                    <td className="max-w-xs px-4 py-2.5 text-zinc-400">
                      {w.ferramentaNome}
                      {w.modelo && <div className="truncate font-mono text-xs text-zinc-500">{w.modelo}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 tabular-nums">{w.qtdCampos}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 tabular-nums">{w.outputs}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 tabular-nums">{formatarData(w.editadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal aberto={!!aberto} titulo={aberto === "novo" ? "Novo workflow" : "Editar workflow"} largura="enorme" aoFechar={() => setAberto(null)}>
        {aberto && tipos.dados && (
          <CarregarEditor
            id={aberto === "novo" ? null : aberto}
            tipos={tipos.dados}
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

/** O editor, depois de carregar o workflow inteiro (com o grafo, que a lista não traz). */
function CarregarEditor({ id, tipos, aoSalvar }: { id: string | null; tipos: Parameters<typeof EditorWorkflow>[0]["tipos"]; aoSalvar: () => void }) {
  const { dados, erro } = useCarregar(() => (id ? workflowsApi.ler(id) : Promise.resolve(null)), [id]);
  if (erro) return <Aviso>{erro}</Aviso>;
  if (id && !dados) return <Carregando />;
  return <EditorWorkflow workflow={dados ?? undefined} tipos={tipos} aoSalvar={aoSalvar} />;
}
