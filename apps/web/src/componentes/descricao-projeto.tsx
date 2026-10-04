import { BookOpen } from "lucide-react";
import { useState } from "react";
import { projetosApi } from "../api.ts";
import type { Projeto } from "../tipos.ts";
import { ModalDocumento } from "./documento-markdown.tsx";
import { Botao } from "./ui.tsx";

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
 * "Descrição do projeto" nas páginas de dentro de um projeto (asset, vídeo,
 * cena, shot). Busca o projeto ao clicar: a descrição pode ter mudado (pela
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
