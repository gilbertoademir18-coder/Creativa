import { BookOpen } from "lucide-react";
import { useState } from "react";
import { projetosApi } from "../api.ts";
import type { Projeto } from "../tipos.ts";
import { ModalDocumento } from "./documento-markdown.tsx";
import { Botao } from "./ui.tsx";

/** Os títulos `##` do modelo (docs/descricao-de-projeto.md), como a API os reconhece. */
const DO_MODELO = ["Premissa", "Formato", "Público-alvo", "Tom", "Estilo visual", "Mundo", "Personagens", "Recorrentes", "Som", "Evitar", "Referências"];

/** "## **Público-alvo**" → "publico-alvo": o mesmo que a API faz com o título (`paraChave`). */
const chave = (t: string) =>
  t
    .replace(/[*_\\]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const CHAVES_DO_MODELO = new Set(DO_MODELO.map(chave));

/**
 * Seção fora do modelo também vai para os assistentes — sempre, em toda
 * geração —, mas vale avisar: muitas vezes o assunto cabe numa seção do
 * modelo (o uniforme no Mundo), onde fica junto do resto.
 */
export function avisosDaDescricao(md: string): string[] {
  const fora = md
    .split(/\r?\n/)
    .map((l) => /^##(?!#)\s+(.*?)\s*#*\s*$/.exec(l)?.[1])
    .filter((t): t is string => !!t && !CHAVES_DO_MODELO.has(chave(t)))
    .map((t) => t.replace(/[*_\\]/g, "").trim());
  return fora.map(
    (t) =>
      `A seção “${t}” não é do modelo: ela vai para os assistentes de prompt em toda geração (cortada em 2.500 caracteres). Se o assunto cabe numa seção do modelo — ${DO_MODELO.join(", ")} —, prefira pôr lá.`,
  );
}

/**
 * A janela da descrição do projeto: o editor com o painel de versões. Salvar
 * cria uma versão nova (a API recusa se outra entrou depois que abriu).
 */
export function ModalDescricaoProjeto({
  projeto: p,
  aberto,
  aoFechar,
  aoSalvar,
}: {
  projeto: Projeto;
  aberto: boolean;
  aoFechar: () => void;
  /** Recebe o projeto já com a versão nova. */
  aoSalvar: (p: Projeto) => void;
}) {
  return (
    <ModalDocumento
      titulo={`Descrição — ${p.nome}`}
      valor={p.descricao}
      placeholder="Escreva sobre o projeto: história, personagens, tom, estética, referências... Use # para títulos e - para listas."
      aberto={aberto}
      avisos={avisosDaDescricao}
      historico={{
        atual: p.descricaoVersao,
        listar: () => projetosApi.versoesDescricao(p.id),
        ler: async (numero) => (await projetosApi.versaoDescricao(p.id, numero)).texto,
      }}
      aoFechar={aoFechar}
      aoSalvar={async (texto, nota) => aoSalvar(await projetosApi.salvarDescricao(p.id, texto, p.descricaoVersao, nota))}
    />
  );
}

/**
 * "Descrição do projeto" na barra do projeto (`barra-projeto.tsx`), em toda
 * página de dentro de um projeto. Busca o projeto ao clicar: a descrição pode ter mudado (pela
 * skill do Claude, por exemplo) depois que a página abriu. Sem projeto, não
 * aparece.
 */
export function BotaoDescricaoProjeto({ projeto }: { projeto: { id: string } | null | undefined }) {
  const [aberto, setAberto] = useState<Projeto | null>(null);
  const [carregando, setCarregando] = useState(false);
  if (!projeto) return null;

  async function abrir() {
    setCarregando(true);
    try {
      setAberto(await projetosApi.ler(projeto!.id));
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <Botao icone={<BookOpen className="size-4" />} carregando={carregando} onClick={abrir}>
        Descrição do projeto
      </Botao>
      {aberto && <ModalDescricaoProjeto projeto={aberto} aberto aoFechar={() => setAberto(null)} aoSalvar={() => setAberto(null)} />}
    </>
  );
}
