import { useEffect, useRef, useState } from "react";
import { geracoesApi, type Dono } from "../api.ts";
import { useGeracaoAberta } from "../hooks.ts";
import { GeracaoCarregada } from "../paginas/geracoes.tsx";
import { PainelGeracoes } from "./geracoes.tsx";

/**
 * As gerações de um asset ou shot, abertas na própria página: o bloco da
 * geração aberta (`Aberta`) e, logo embaixo, a lista (`Lista`).
 *
 * Ao entrar na página, a geração mais recente já abre sozinha — ou o
 * formulário de "Nova geração", se ainda não houver nenhuma. Trocar é
 * clicar em outra na lista.
 */
export function useGeracaoNoLugar(dono: Dono) {
  const [aberta, abrir] = useGeracaoAberta();
  // A lista recarrega quando a geração aberta muda (salvou, gerou, terminou).
  const [versao, setVersao] = useState(0);
  const bloco = useRef<HTMLDivElement>(null);
  /** Só rola até o bloco quando a pessoa abriu pela lista — não na abertura automática. */
  const rolar = useRef(false);
  const chaveDono = dono.assetId ?? dono.shotId ?? "";
  const autoAbriuPara = useRef<string | null>(null);

  /**
   * Abre a geração mais recente, ou "Nova geração" se não houver nenhuma.
   * `replace`: não cria um passo a mais no histórico (o voltar sai da
   * página, como esperado).
   */
  const abrirMaisRecente = async (ehVivo: () => boolean = () => true) => {
    const lista = await geracoesApi.listar({ asset: dono.assetId ?? undefined, shot: dono.shotId ?? undefined }).catch(() => null);
    if (lista && ehVivo()) abrir(lista[0]?.id ?? "nova", true);
  };

  // Entrou na página sem geração aberta: abre uma.
  useEffect(() => {
    if (autoAbriuPara.current === chaveDono) return;
    autoAbriuPara.current = chaveDono;
    if (aberta) return;
    let vivo = true;
    abrirMaisRecente(() => vivo);
    return () => {
      vivo = false;
    };
  }, [chaveDono]);

  useEffect(() => {
    if (aberta && rolar.current) bloco.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    rolar.current = false;
  }, [aberta]);

  const abrirPelaLista = (id: string) => {
    rolar.current = true;
    abrir(id);
  };

  const Aberta = () =>
    aberta ? (
      <div ref={bloco} className="scroll-mt-6">
        <GeracaoCarregada
          id={aberta === "nova" ? null : aberta}
          donoInicial={dono}
          abrir={(id, substituir) => abrir(id, substituir)}
          aoExcluir={() => {
            // Excluiu a aberta: abre a próxima mais recente (ou "Nova geração").
            abrirMaisRecente();
            setVersao((v) => v + 1);
          }}
          embutida={{ aoAlterar: () => setVersao((v) => v + 1) }}
        />
      </div>
    ) : null;

  const Lista = () => (
    <PainelGeracoes
      asset={dono.assetId ?? undefined}
      shot={dono.shotId ?? undefined}
      aoAbrir={abrirPelaLista}
      selecionada={aberta}
      versao={versao}
    />
  );

  return { Aberta, Lista };
}
