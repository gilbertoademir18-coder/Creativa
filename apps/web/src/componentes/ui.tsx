import { LoaderCircle } from "lucide-react";
import { Link } from "react-router";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/*
 * As peças visuais de todo o app. Tema escuro fixo: é uma mesa de trabalho
 * com imagem e vídeo, e fundo claro brigaria com o que está sendo gerado.
 */

type Variante = "primario" | "secundario" | "perigo" | "fantasma";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-violet-600 text-white hover:bg-violet-500 disabled:bg-violet-600/40",
  secundario: "border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800",
  perigo: "border border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-900/50",
  fantasma: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
};

const estiloBotao = (variante: Variante) =>
  `inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTES[variante]}`;

export function Botao({
  variante = "secundario",
  icone,
  carregando,
  children,
  className = "",
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icone?: ReactNode; carregando?: boolean }) {
  return (
    <button type="button" {...resto} disabled={resto.disabled || carregando} className={`${estiloBotao(variante)} ${className}`}>
      {carregando ? <LoaderCircle className="size-4 animate-spin" /> : icone}
      {children}
    </button>
  );
}

/** Um link com cara de botão — para ações que levam a outra página. */
export function BotaoLink({
  para,
  variante = "secundario",
  icone,
  children,
}: {
  para: string;
  variante?: Variante;
  icone?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link to={para} className={estiloBotao(variante)}>
      {icone}
      {children}
    </Link>
  );
}

/*
 * Campos ocupam a largura toda, a não ser que quem usa diga outra (`w-56`).
 * As duas classes juntas não funcionariam: no CSS do Tailwind ganha a que vem
 * depois na folha, não a que vem depois no atributo.
 */
const campo = (extra: string | undefined) =>
  `${extra?.match(/(^|\s)w-/) ? "" : "w-full"} rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none disabled:opacity-60 ${extra ?? ""}`;

export function Entrada(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-9 ${campo(props.className)}`} />;
}

export function AreaTexto(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`py-2 leading-relaxed ${campo(props.className)}`} />;
}

export function Seletor(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-9 ${campo(props.className)}`} />;
}

/** Um campo com rótulo em cima. */
export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{rotulo}</span>
      {children}
      {dica && <span className="text-xs text-zinc-500">{dica}</span>}
    </label>
  );
}

/** O topo de cada página: título, subtítulo e as ações à direita. */
export function Cabecalho({
  titulo,
  subtitulo,
  voltar,
  acoes,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  voltar?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-zinc-800 px-8 pt-6 pb-5">
      <div className="min-w-0">
        {voltar && <div className="mb-2 text-sm text-zinc-400">{voltar}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <div className="mt-1 text-sm text-zinc-400">{subtitulo}</div>}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </header>
  );
}

/** A faixa de filtros logo abaixo do cabeçalho. */
export function BarraFiltros({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-8 py-3">{children}</div>;
}

/** Botões de escolha única lado a lado: "Todos | Personagens | Cenários...". */
export function Pilulas<T extends string>({
  opcoes,
  valor,
  aoMudar,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => aoMudar(o.valor)}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
            o.valor === valor ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Carregando() {
  return (
    <div className="flex items-center gap-2 p-8 text-sm text-zinc-500">
      <LoaderCircle className="size-4 animate-spin" /> Carregando...
    </div>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">{children}</div>;
}

/** Lista vazia: diz o que falta e oferece a ação que resolve. */
export function Vazio({ icone, titulo, texto, acao }: { icone: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 px-6 py-16 text-center">
      <div className="text-zinc-600 [&>svg]:size-10">{icone}</div>
      <div className="font-medium text-zinc-300">{titulo}</div>
      {texto && <div className="max-w-md text-sm text-zinc-500">{texto}</div>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

/** Uma seção dentro de uma página de detalhe. */
export function Secao({ titulo, acoes, children }: { titulo: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">{titulo}</h2>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

export function Etiqueta({ children, className = "bg-zinc-800 text-zinc-300" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

/** Grade de cartões que aproveita a largura: 4 colunas em Full HD, 6+ em QHD. */
export const GRADE = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4";
