import { Check, Copy, MessagesSquare, Pencil, Plus, Send, Square, Trash2, X } from "lucide-react";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { conversasApi } from "../api.ts";
import { FiltroBusca } from "../componentes/filtros.tsx";
import { ConfirmarExclusao } from "../componentes/modal.tsx";
import { Aviso, Botao, Carregando } from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import type { Conversa, MensagemConversa } from "../tipos.ts";

/*
 * Conversas livres com a LLM local, como no ChatGPT: a lista à esquerda, a
 * conversa à direita. A conversa só nasce no banco com a primeira mensagem
 * — "Nova conversa" abre a tela vazia, sem deixar conversas em branco na
 * lista. O título vem sozinho (a LLM resume a primeira troca); dá para
 * renomear.
 */

export function PaginaConversas() {
  const { id } = useParams();
  const [filtros, mudarFiltro] = useFiltros(["busca"] as const);
  const lista = useCarregar(() => conversasApi.listar(filtros.busca), [filtros.busca]);

  return (
    <div className="grid h-full grid-cols-[19rem_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-zinc-800 bg-zinc-950/40">
        <div className="flex flex-col gap-3 border-b border-zinc-800 p-4">
          <Link
            to="/conversas"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-violet-600 px-3.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            <Plus className="size-4" /> Nova conversa
          </Link>
          <FiltroBusca valor={filtros.busca} aoMudar={(v) => mudarFiltro("busca", v)} dica="Buscar pelo título" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {lista.erro && <Aviso>{lista.erro}</Aviso>}
          {!lista.dados && lista.carregando && <Carregando />}
          {lista.dados?.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-zinc-500">{filtros.busca ? "Nenhuma conversa com esse título." : "Nenhuma conversa ainda."}</div>
          )}
          {lista.dados?.map((c) => (
            <ItemConversa key={c.id} conversa={c} ativa={c.id === id} aoMudar={lista.recarregar} />
          ))}
        </div>
      </aside>
      <Chat id={id ?? null} aoMudarLista={lista.recarregar} />
    </div>
  );
}

function ItemConversa({ conversa, ativa, aoMudar }: { conversa: Conversa; ativa: boolean; aoMudar: () => void }) {
  const navegar = useNavigate();
  const [renomeando, setRenomeando] = useState(false);
  const [titulo, setTitulo] = useState(conversa.titulo);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    const t = titulo.trim();
    if (!t || t === conversa.titulo) {
      setTitulo(conversa.titulo);
      setRenomeando(false);
      return;
    }
    try {
      await conversasApi.renomear(conversa.id, t);
      setRenomeando(false);
      setErro(null);
      aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  if (renomeando)
    return (
      <div className="px-1 py-1">
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvar();
              if (e.key === "Escape") {
                setTitulo(conversa.titulo);
                setRenomeando(false);
              }
            }}
            maxLength={120}
            className="h-8 min-w-0 flex-1 rounded-md border border-violet-500 bg-zinc-900 px-2 text-sm focus:outline-none"
          />
          <BotaoIcone rotulo="Salvar" aoClicar={salvar}>
            <Check className="size-4" />
          </BotaoIcone>
          <BotaoIcone
            rotulo="Cancelar"
            aoClicar={() => {
              setTitulo(conversa.titulo);
              setRenomeando(false);
            }}
          >
            <X className="size-4" />
          </BotaoIcone>
        </div>
        {erro && <div className="mt-1 px-1 text-xs text-red-400">{erro}</div>}
      </div>
    );

  return (
    <div
      className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${ativa ? "bg-violet-600/15 text-violet-100" : "text-zinc-300 hover:bg-zinc-900"}`}
    >
      <Link to={`/conversas/${conversa.id}`} className="min-w-0 flex-1 px-3 py-2">
        <div className="truncate text-sm">{conversa.titulo}</div>
        <div className="text-xs text-zinc-500">{quando(conversa.editadoEm)}</div>
      </Link>
      <div className={`flex shrink-0 gap-0.5 ${ativa ? "" : "opacity-0 group-hover:opacity-100"}`}>
        <BotaoIcone rotulo="Renomear" aoClicar={() => setRenomeando(true)}>
          <Pencil className="size-3.5" />
        </BotaoIcone>
        <BotaoIcone rotulo="Excluir" aoClicar={() => setExcluindo(true)}>
          <Trash2 className="size-3.5" />
        </BotaoIcone>
      </div>
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir conversa"
        texto={
          <>
            A conversa <strong>{conversa.titulo}</strong> e todas as mensagens dela serão apagadas. Não dá para desfazer.
          </>
        }
        aoConfirmar={async () => {
          await conversasApi.excluir(conversa.id);
          setExcluindo(false);
          if (ativa) navegar("/conversas", { replace: true });
          aoMudar();
        }}
        aoFechar={() => setExcluindo(false)}
      />
    </div>
  );
}

function BotaoIcone({ rotulo, aoClicar, children }: { rotulo: string; aoClicar: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      onClick={aoClicar}
      className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

/** "agora", "14:32", "ontem", "12/09". */
function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const dias = Math.floor((new Date(hoje.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (dias === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dias === 1) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() === hoje.getFullYear() ? undefined : "2-digit" });
}

type Mensagem = Pick<MensagemConversa, "id" | "papel" | "conteudo">;

/**
 * A conversa aberta (ou a tela vazia de uma nova). Enquanto a resposta
 * chega, o texto vai aparecendo; "Parar" interrompe, e o que já veio fica
 * gravado.
 */
function Chat({ id, aoMudarLista }: { id: string | null; aoMudarLista: () => void }) {
  const navegar = useNavigate();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [respondendo, setRespondendo] = useState(false);
  const [comfyOcupado, setComfyOcupado] = useState(false);
  const parar = useRef<AbortController | null>(null);
  // A conversa que acabou de nascer pelo envio: ao trocar a URL para ela,
  // não recarrega (a resposta ainda está chegando).
  const recemCriada = useRef<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const colado = useRef(true);
  const caixa = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setErro(null);
    if (!id) {
      parar.current?.abort();
      setMensagens([]);
      caixa.current?.focus();
      return;
    }
    if (recemCriada.current === id) {
      recemCriada.current = null;
      return;
    }
    parar.current?.abort();
    let vivo = true;
    setCarregando(true);
    conversasApi
      .ler(id)
      .then((c) => vivo && setMensagens(c.mensagens))
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => {
        if (!vivo) return;
        setCarregando(false);
        colado.current = true;
        caixa.current?.focus();
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  // Desce junto com o texto que chega — a não ser que a pessoa tenha subido para ler.
  useEffect(() => {
    const r = rolagem.current;
    if (r && colado.current) r.scrollTop = r.scrollHeight;
  }, [mensagens]);

  // A caixa cresce com o texto, até um limite.
  useEffect(() => {
    const c = caixa.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 240)}px`;
  }, [texto]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || respondendo) return;
    setErro(null);
    setRespondendo(true);
    setComfyOcupado(false);
    colado.current = true;
    const controle = new AbortController();
    parar.current = controle;
    const pergunta = `pergunta-${Date.now()}`;
    const temp = `resposta-${Date.now()}`;
    let comecou = false;
    setTexto("");
    setMensagens((ms) => [...ms, { id: pergunta, papel: "USUARIO", conteudo: t }, { id: temp, papel: "ASSISTENTE", conteudo: "" }]);
    try {
      await conversasApi.enviar(
        id,
        t,
        {
          aoComecar: (ocupado, conversaId) => {
            comecou = true;
            setComfyOcupado(ocupado);
            // Conversa nova: a URL passa a ser a dela, sem recarregar (a resposta ainda está chegando).
            if (!id && conversaId) {
              recemCriada.current = conversaId;
              navegar(`/conversas/${conversaId}`, { replace: true });
              aoMudarLista();
            }
          },
          aoPedaco: (p) => setMensagens((ms) => ms.map((m) => (m.id === temp ? { ...m, conteudo: m.conteudo + p } : m))),
        },
        controle.signal,
      );
    } catch (e) {
      if (!controle.signal.aborted) setErro((e as Error).message);
      // Recusada antes de começar: nada foi gravado. A pergunta volta para a caixa.
      if (!comecou) {
        setTexto(t);
        setMensagens((ms) => ms.filter((m) => m.id !== pergunta && m.id !== temp));
      }
    } finally {
      setRespondendo(false);
      parar.current = null;
      setMensagens((ms) => ms.filter((m) => m.id !== temp || m.conteudo));
      // O título de uma conversa nova chega junto com o fim da resposta.
      aoMudarLista();
      caixa.current?.focus();
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div
        ref={rolagem}
        onScroll={(e) => {
          const r = e.currentTarget;
          colado.current = r.scrollHeight - r.scrollTop - r.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8">
          {carregando && <Carregando />}
          {!carregando && !mensagens.length && (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <MessagesSquare className="size-10 text-zinc-600" />
              <div className="text-lg font-medium text-zinc-300">Sobre o que vamos conversar?</div>
              <div className="max-w-md text-sm text-zinc-500">
                A conversa roda na LLM local (Ollama), nesta máquina. Se o ComfyUI estiver parado, ela tira os modelos dele da placa para responder mais rápido.
              </div>
            </div>
          )}
          {mensagens.map((m) =>
            m.papel === "USUARIO" ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-violet-600/20 px-4 py-2.5 whitespace-pre-wrap text-zinc-100">
                {m.conteudo}
              </div>
            ) : (
              <RespostaLlm key={m.id} texto={m.conteudo} escrevendo={respondendo && m.id.startsWith("resposta-")} />
            ),
          )}
        </div>
      </div>
      <div className="border-t border-zinc-800 bg-zinc-950/40">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-8 py-4">
          {erro && <Aviso>{erro}</Aviso>}
          {respondendo && comfyOcupado && (
            <div className="text-xs text-amber-300/80">O ComfyUI está gerando: a LLM divide a placa com ele e responde mais devagar.</div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-violet-500">
            <textarea
              ref={caixa}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={1}
              placeholder="Escreva uma mensagem (Enter envia, Shift+Enter pula linha)"
              className="max-h-60 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-zinc-500 focus:outline-none"
            />
            {respondendo ? (
              <Botao variante="secundario" icone={<Square className="size-3.5" />} onClick={() => parar.current?.abort()}>
                Parar
              </Botao>
            ) : (
              <Botao variante="primario" icone={<Send className="size-4" />} onClick={enviar} disabled={!texto.trim()}>
                Enviar
              </Botao>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A resposta da LLM em markdown. O HTML cru que vier no texto sai escapado (padrão do micromark). */
function RespostaLlm({ texto, escrevendo }: { texto: string; escrevendo: boolean }) {
  const html = useMemo(() => micromark(texto, { extensions: [gfm()], htmlExtensions: [gfmHtml()] }), [texto]);
  const [copiado, setCopiado] = useState(false);

  if (!texto && escrevendo)
    return (
      <div className="flex gap-1 py-2">
        {[0, 150, 300].map((atraso) => (
          <span key={atraso} className="size-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: `${atraso}ms` }} />
        ))}
      </div>
    );

  return (
    <div className="group flex flex-col gap-1">
      <div className="texto-md" dangerouslySetInnerHTML={{ __html: html }} />
      {!escrevendo && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  );
}
