import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * Carrega algo da API e recarrega quando as dependências mudam.
 *
 * Resposta que chega fora de ordem (o filtro mudou duas vezes rápido) é
 * descartada: só vale a do pedido mais recente.
 */
export function useCarregar<T>(buscar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const pedido = useRef(0);

  const recarregar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const r = await buscar();
      if (meu === pedido.current) {
        setDados(r);
        setErro(null);
      }
    } catch (e) {
      if (meu === pedido.current) setErro((e as Error).message);
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, deps);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { dados, erro, carregando, recarregar, setDados };
}

/**
 * Os filtros de uma página moram na URL (`/assets?projeto=X&tipo=PERSONAGEM`):
 * dá para voltar com o navegador, recarregar e mandar o endereço de um
 * filtro pronto — é o que os links "ver assets do projeto" usam.
 */
export function useFiltros<K extends string>(chaves: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const valores = Object.fromEntries(chaves.map((k) => [k, params.get(k) ?? ""])) as Record<K, string>;
  const mudar = (k: K, v: string) =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        if (v) novo.set(k, v);
        else novo.delete(k);
        return novo;
      },
      { replace: true },
    );
  return [valores, mudar] as const;
}
