import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import type { CampoWorkflow } from "../tipos.ts";
import { AreaTexto, Campo, Entrada, Pilulas, Seletor } from "./ui.tsx";

/*
 * Os campos do Gerador. Cada workflow cadastrado descreve os seus (página
 * Workflows) e a tela monta o formulário a partir dessa descrição.
 */

/** Os valores de um workflow: o que já havia nos campos de mesmo nome, ou o padrão. */
export function valoresPara(campos: CampoWorkflow[], atuais: Record<string, unknown> = {}): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const c of campos) v[c.chave] = c.chave in atuais ? atuais[c.chave] : padraoDe(c);
  return v;
}

/** O valor inicial de um campo. Seed começa aleatória (null). */
export const padraoDe = (c: CampoWorkflow): unknown => (c.tipo === "texto" ? (c.padrao ?? "") : c.tipo === "seed" ? null : c.padrao);

/** Um campo do workflow, montado a partir da descrição que a API manda. */
export function CampoDinamico({ campo: c, valor, aoMudar }: { campo: CampoWorkflow; valor: unknown; aoMudar: (v: unknown) => void }) {
  if (c.tipo === "texto") return <CampoTexto campo={c} valor={String(valor ?? "")} aoMudar={aoMudar} />;
  if (c.tipo === "opcoes" || c.tipo === "tamanho") {
    // Pela posição: a opção pode valer um número, e o <select> só fala texto.
    const opcoes: { valor: string | number; rotulo: string }[] = c.opcoes;
    const i = Math.max(0, opcoes.findIndex((o) => o.valor === (valor ?? c.padrao)));
    return (
      <Campo rotulo={c.rotulo} dica={c.dica}>
        <Seletor value={i} onChange={(e) => aoMudar(opcoes[Number(e.target.value)]!.valor)}>
          {opcoes.map((o, n) => (
            <option key={n} value={n}>
              {o.rotulo}
            </option>
          ))}
        </Seletor>
      </Campo>
    );
  }
  if (c.tipo === "numero") {
    const n = typeof valor === "number" ? valor : c.padrao;
    return (
      <Campo rotulo={c.rotulo} dica={c.dica}>
        <Entrada
          type="number"
          value={n}
          min={c.min}
          max={c.max}
          step={c.passo ?? "any"}
          onChange={(e) => aoMudar(e.target.value === "" ? c.padrao : Number(e.target.value))}
          className="w-40 font-mono"
        />
      </Campo>
    );
  }
  // Seed: aleatória (null) ou um número fixo.
  const fixa = typeof valor === "number";
  return (
    <Campo rotulo={c.rotulo} dica="Aleatória é sorteada no envio; a de cada imagem fica gravada nela. Gerando várias, só a primeira usa a fixa.">
      <div className="flex items-center gap-3">
        <Pilulas
          valor={fixa ? "fixa" : "aleatoria"}
          aoMudar={(m) => aoMudar(m === "fixa" ? Math.floor(Math.random() * 2 ** 48) : null)}
          opcoes={[
            { valor: "aleatoria", rotulo: "Aleatória" },
            { valor: "fixa", rotulo: "Fixa" },
          ]}
        />
        {fixa && (
          <Entrada
            type="number"
            min={0}
            value={valor}
            onChange={(e) => aoMudar(e.target.value === "" ? null : Number(e.target.value))}
            className="w-56 font-mono"
          />
        )}
      </div>
    </Campo>
  );
}

function CampoTexto({
  campo: c,
  valor,
  aoMudar,
}: {
  campo: Extract<CampoWorkflow, { tipo: "texto" }>;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const palavras = valor.trim() ? valor.trim().split(/\s+/).length : 0;
  const naFaixa = c.palavras ? palavras >= c.palavras.min && palavras <= c.palavras.max : true;
  // Avisos só com texto escrito: campo vazio não precisa de sermão.
  const avisos = useMemo(
    () =>
      valor.trim()
        ? (c.avisos ?? []).filter((a) => {
            const casa = new RegExp(a.padrao, "i").test(valor);
            return a.quando === "falta" ? !casa : casa;
          })
        : [],
    [valor, c.avisos],
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-4">
        <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
          {c.rotulo}
          {c.obrigatorio && <span className="text-violet-400"> *</span>}
        </span>
        {c.palavras && (
          <span className={`text-xs tabular-nums ${palavras === 0 ? "text-zinc-500" : naFaixa ? "text-emerald-400" : "text-amber-400"}`}>
            {palavras} palavras · meta {c.palavras.min}–{c.palavras.max}
          </span>
        )}
      </div>
      <AreaTexto value={valor} onChange={(e) => aoMudar(e.target.value)} rows={c.linhas ?? 4} spellCheck={false} />
      {c.dica && <p className="text-xs leading-relaxed text-zinc-500">{c.dica}</p>}
      {avisos.map((a) => (
        <p key={a.padrao} className="flex gap-2 text-xs leading-relaxed text-amber-300">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {a.mensagem}
        </p>
      ))}
    </div>
  );
}

/** Quantas imagens pedir de uma vez (1 a 4). A GPU é uma só: elas entram na fila. */
export function SeletorQuantidade({ valor, aoMudar }: { valor: number; aoMudar: (n: number) => void }) {
  return (
    <Seletor value={valor} onChange={(e) => aoMudar(Number(e.target.value))} className="w-20" title="Quantas de uma vez">
      {[1, 2, 3, 4].map((n) => (
        <option key={n} value={n}>
          {n}×
        </option>
      ))}
    </Seletor>
  );
}
