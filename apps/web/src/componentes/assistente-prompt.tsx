import { Eye, Square, TriangleAlert, Undo2, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { AssistenteDisponivel, EstadoLlm, PreviaAssistente } from "../tipos.ts";
import { Modal } from "./modal.tsx";
import type { GrupoOpcoes } from "../opcoes-ideia.ts";
import { AreaTexto, Aviso, Botao, Campo, Carregando, Etiqueta, Seletor } from "./ui.tsx";

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
  pendente,
  opcoes,
  escolhas,
  aoMudarEscolhas,
  podeDesfazer,
  aviso,
  erro,
  aoExpandir,
  aoParar,
  aoDesfazer,
  aoPrevia,
}: {
  estado: EstadoLlm | null;
  expandindo: boolean;
  /** O texto da pessoa: o assistente lê daqui e escreve no prompt, embaixo. */
  ideia: string;
  aoMudarIdeia: (texto: string) => void;
  /** O prompt atual já saiu desta mesma ideia: expandir agora dá outra versão. */
  deNovo: boolean;
  /**
   * A ideia ainda não virou o prompt que está embaixo: "mudou" (o prompt é de
   * uma ideia anterior) ou "nova" (nunca expandida, ou o prompt foi escrito à mão).
   */
  pendente: "mudou" | "nova" | null;
  /** As opções da ideia do assistente: uma fileira de pílulas por grupo, uma escolha em cada. */
  opcoes: GrupoOpcoes[] | null;
  escolhas: Record<string, string>;
  aoMudarEscolhas: (e: Record<string, string>) => void;
  podeDesfazer: boolean;
  aviso: string | null;
  erro: string | null;
  aoExpandir: () => void;
  aoParar: () => void;
  aoDesfazer: () => void;
  /** Busca o que a expansão mandaria à LLM (sem chamar a LLM). */
  aoPrevia: () => Promise<PreviaAssistente>;
}) {
  const [vendoPrevia, setVendoPrevia] = useState(false);
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
        <AreaTexto
          value={ideia}
          onChange={(e) => aoMudarIdeia(e.target.value)}
          rows={3}
          disabled={expandindo}
          className={pendente && !expandindo ? "ring-1 ring-amber-500/70" : undefined}
        />
      </Campo>
      {!!opcoes?.length && (
        <div className="flex flex-col gap-1.5">
          {opcoes.map((g) => (
            <div key={g.grupo} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-xs text-zinc-400">{g.grupo}</span>
              {g.opcoes.map((o) => {
                const marcada = escolhas[g.grupo] === o.rotulo;
                return (
                  <button
                    key={o.rotulo}
                    type="button"
                    disabled={expandindo}
                    title={o.dica ? `A LLM recebe: ${o.dica}` : undefined}
                    onClick={() => {
                      // Uma por grupo; clicar na marcada desmarca.
                      const novas = { ...escolhas };
                      if (marcada) delete novas[g.grupo];
                      else novas[g.grupo] = o.rotulo;
                      aoMudarEscolhas(novas);
                    }}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-60 ${
                      marcada ? "border-violet-500 bg-violet-600 text-white" : "border-zinc-700 text-zinc-300 hover:border-violet-500/60 hover:text-zinc-100"
                    }`}
                  >
                    {o.rotulo}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {pendente && !expandindo && (
        <p className="-mt-1 flex items-center gap-1.5 text-xs text-amber-300">
          <TriangleAlert className="size-3.5 shrink-0" />
          {pendente === "mudou"
            ? "A ideia ou as escolhas mudaram — o prompt embaixo ainda é o de antes. Expanda para atualizar."
            : "Esta ideia ainda não virou prompt — o que está embaixo não saiu dela. Expanda para usar a ideia."}
        </p>
      )}
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
              className={pendente ? "ring-2 ring-amber-400/80 ring-offset-1 ring-offset-zinc-950" : undefined}
            >
              {deNovo ? "Expandir de novo" : "Expandir com o assistente"}
            </Botao>
            {podeDesfazer && (
              <Botao variante="fantasma" icone={<Undo2 className="size-4" />} onClick={aoDesfazer} title="Volta o prompt de antes da última expansão">
                Desfazer
              </Botao>
            )}
            <Botao
              variante="fantasma"
              icone={<Eye className="size-4" />}
              onClick={() => setVendoPrevia(true)}
              disabled={!ideia.trim()}
              title="Mostra as instruções e o contexto que a LLM recebe com esta ideia — sem chamar a LLM"
              className="ml-auto"
            >
              Ver o que vai para a LLM
            </Botao>
          </>
        )}
      </div>
      <Modal aberto={vendoPrevia} titulo="O que vai para a LLM" largura="enorme" aoFechar={() => setVendoPrevia(false)}>
        <JanelaPrevia buscar={aoPrevia} />
      </Modal>
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

/**
 * A prévia de uma expansão: um resumo do que entrou (seções da descrição,
 * fichas de personagem, o que veio do asset ou do shot) e os dois textos
 * exatos — as instruções e o pedido. Só existe enquanto a janela está aberta:
 * cada abertura busca de novo, com a ideia e a descrição de agora.
 */
function JanelaPrevia({ buscar }: { buscar: () => Promise<PreviaAssistente> }) {
  const [previa, setPrevia] = useState<PreviaAssistente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    buscar()
      .then((p) => vivo && setPrevia(p))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
    // Uma busca por abertura: a janela desmonta ao fechar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (erro) return <Aviso>{erro}</Aviso>;
  if (!previa) return <Carregando />;
  const { resumo: r } = previa;
  const lista = (itens: string[], vazio: string) =>
    itens.length ? (
      <div className="flex flex-wrap gap-1.5">
        {itens.map((i) => (
          <Etiqueta key={i}>{i}</Etiqueta>
        ))}
      </div>
    ) : (
      <span className="text-sm text-zinc-500">{vazio}</span>
    );
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[10rem_1fr] items-start gap-x-4 gap-y-2.5 text-sm">
        <span className="text-zinc-500">Assistente</span>
        <span className="text-zinc-200">{r.assistente}</span>
        <span className="text-zinc-500">Workflow</span>
        <span className="text-zinc-200">{r.workflow}</span>
        <span className="text-zinc-500">Da descrição do projeto</span>
        {lista(r.secoes, r.projeto ? "nada (a descrição está vazia?)" : "sem projeto")}
        <span className="text-zinc-500">Personagens</span>
        {lista(r.personagens, "nenhuma ficha — ninguém da descrição foi citado na ideia nem no asset/shot")}
        <span className="text-zinc-500">Do asset ou do shot</span>
        {lista(r.dono, "nada")}
      </div>
      <TextoPrevia titulo="Instruções (o assistente + o que o Creativa sabe do workflow)" texto={previa.sistema} />
      <TextoPrevia titulo="Pedido (a ideia e o contexto)" texto={previa.usuario} />
    </div>
  );
}

function TextoPrevia({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold text-zinc-300">
        {titulo}
        <span className="text-xs font-normal text-zinc-500 tabular-nums">{texto.length.toLocaleString("pt-BR")} caracteres</span>
      </h3>
      <pre className="max-h-[50vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300">
        {texto}
      </pre>
    </section>
  );
}
