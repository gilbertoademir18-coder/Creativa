import { Square, Undo2, WandSparkles } from "lucide-react";
import { Link } from "react-router";
import type { AssistenteDisponivel, EstadoLlm } from "../tipos.ts";
import { AreaTexto, Aviso, Botao, Campo, Seletor } from "./ui.tsx";

/*
 * O assistente de prompt no Gerador: a escolha (logo abaixo do workflow) e a
 * caixa da ideia em cima do campo do prompt — escreve-se a ideia, "Expandir"
 * e a LLM local escreve o prompt completo no campo. A ideia não se apaga.
 */

export function SeletorAssistente({
  lista,
  valor,
  aoMudar,
  desabilitado,
}: {
  lista: AssistenteDisponivel[] | null;
  valor: string;
  aoMudar: (id: string) => void;
  desabilitado?: boolean;
}) {
  const atual = lista?.find((a) => a.id === valor);
  const dica =
    lista && lista.length === 0
      ? undefined
      : (atual?.descricao ?? "Escreva sua ideia e o assistente escreve o prompt completo, do jeito deste workflow.");
  return (
    <Campo rotulo="Assistente de prompt" dica={dica}>
      {lista && lista.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nenhum assistente para este workflow.{" "}
          <Link to="/assistentes" className="text-violet-300 hover:underline">
            Criar um em Assistentes
          </Link>
        </p>
      ) : (
        <Seletor value={valor} onChange={(e) => aoMudar(e.target.value)} disabled={desabilitado || !lista}>
          <option value="">Nenhum — escrevo o prompt eu mesmo</option>
          {lista?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
              {a.projeto ? ` · ${a.projeto.nome}` : ""}
            </option>
          ))}
        </Seletor>
      )}
    </Campo>
  );
}

export function BarraAssistente({
  estado,
  expandindo,
  ideia,
  aoMudarIdeia,
  deNovo,
  podeDesfazer,
  aviso,
  erro,
  aoExpandir,
  aoParar,
  aoDesfazer,
}: {
  estado: EstadoLlm | null;
  expandindo: boolean;
  /** O texto da pessoa: o assistente lê daqui e escreve no prompt, embaixo. */
  ideia: string;
  aoMudarIdeia: (texto: string) => void;
  /** O prompt atual já saiu desta mesma ideia: expandir agora dá outra versão. */
  deNovo: boolean;
  podeDesfazer: boolean;
  aviso: string | null;
  erro: string | null;
  aoExpandir: () => void;
  aoParar: () => void;
  aoDesfazer: () => void;
}) {
  // A LLM fora do ar não é erro do Creativa: diz o que fazer.
  const problema = !estado
    ? null
    : !estado.noAr
      ? "O Ollama (a LLM local) não está no ar. Abra o Ollama pelo menu Iniciar — ele fica na bandeja."
      : !estado.modeloBaixado
        ? `O modelo ${estado.modelo} não foi baixado. Rode no terminal: ollama pull ${estado.modelo}`
        : null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-violet-500/20 bg-violet-950/20 p-3">
      <Campo rotulo="Sua ideia" dica="Em poucas palavras, em português. O assistente escreve o prompt no campo abaixo; a ideia fica aqui para você ajustar e expandir de novo.">
        <AreaTexto value={ideia} onChange={(e) => aoMudarIdeia(e.target.value)} rows={3} disabled={expandindo} />
      </Campo>
      <div className="flex flex-wrap items-center gap-2">
        {expandindo ? (
          <>
            <Botao variante="primario" carregando>
              Escrevendo o prompt...
            </Botao>
            <Botao icone={<Square className="size-3.5" />} onClick={aoParar}>
              Parar
            </Botao>
          </>
        ) : (
          <>
            <Botao
              variante="primario"
              icone={<WandSparkles className="size-4" />}
              onClick={aoExpandir}
              disabled={!!problema || !ideia.trim()}
              title={deNovo ? "Outra versão do prompt, a partir da mesma ideia" : undefined}
            >
              {deNovo ? "Expandir de novo" : "Expandir com o assistente"}
            </Botao>
            {podeDesfazer && (
              <Botao variante="fantasma" icone={<Undo2 className="size-4" />} onClick={aoDesfazer} title="Volta o prompt de antes da última expansão">
                Desfazer
              </Botao>
            )}
          </>
        )}
      </div>
      {problema && <p className="text-xs text-amber-300">{problema}</p>}
      {aviso && expandindo && <p className="text-xs text-amber-300/90">{aviso}</p>}
      {erro && <Aviso>{erro}</Aviso>}
    </div>
  );
}

/**
 * O texto da LLM, sem o que ela às vezes põe em volta mesmo pedindo para
 * não pôr: bloco de código, aspas, um "Prompt:" no começo.
 */
export function limparTextoLlm(texto: string): string {
  return texto
    .trim()
    .replace(/^```[a-z]*\s*\n?|\n?```$/gi, "")
    .replace(/^(prompt|here is the prompt|aqui está o prompt)\s*:\s*/i, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
}
