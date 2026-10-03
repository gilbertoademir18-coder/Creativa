import { Square, Undo2, WandSparkles } from "lucide-react";
import { Link } from "react-router";
import type { AssistenteDisponivel, EstadoLlm } from "../tipos.ts";
import { Aviso, Botao, Campo, Seletor } from "./ui.tsx";

/*
 * O assistente de prompt no Gerador: a escolha (logo abaixo do workflow) e a
 * barra embaixo do campo do prompt — escreve-se a ideia, "Expandir" e a LLM
 * local reescreve o campo com o prompt completo.
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
      : (atual?.descricao ?? "Escreva a ideia no prompt e o assistente a expande no prompt completo, do jeito deste workflow.");
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
  aviso,
  erro,
  aoExpandir,
  aoExpandirDeNovo,
  aoParar,
  aoDesfazer,
}: {
  estado: EstadoLlm | null;
  expandindo: boolean;
  /** A ideia de onde saiu o prompt atual — null se quem escreveu foi a pessoa. */
  ideia: string | null;
  aviso: string | null;
  erro: string | null;
  aoExpandir: () => void;
  aoExpandirDeNovo: () => void;
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
    <div className="flex flex-col gap-2 rounded-lg border border-violet-500/20 bg-violet-950/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {expandindo ? (
          <>
            <Botao variante="primario" carregando>
              Escrevendo...
            </Botao>
            <Botao icone={<Square className="size-3.5" />} onClick={aoParar}>
              Parar
            </Botao>
          </>
        ) : (
          <>
            <Botao variante="primario" icone={<WandSparkles className="size-4" />} onClick={aoExpandir} disabled={!!problema}>
              Expandir com o assistente
            </Botao>
            {ideia !== null && (
              <>
                <Botao icone={<WandSparkles className="size-4" />} onClick={aoExpandirDeNovo} disabled={!!problema} title="Outra versão, a partir da mesma ideia">
                  Expandir de novo
                </Botao>
                <Botao variante="fantasma" icone={<Undo2 className="size-4" />} onClick={aoDesfazer} title="Volta o campo para a ideia">
                  Desfazer
                </Botao>
              </>
            )}
          </>
        )}
      </div>
      {ideia !== null && !expandindo && (
        <p className="line-clamp-2 text-xs text-zinc-400" title={ideia}>
          <span className="text-zinc-500">Ideia:</span> {ideia}
        </p>
      )}
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
