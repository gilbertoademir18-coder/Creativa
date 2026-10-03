import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { outputsApi } from "../api.ts";
import { FiltroBusca, FiltroProjeto, FiltroSelecao } from "../componentes/filtros.tsx";
import { CartaoOutput, GRADE_OUTPUTS, VisorOutputs } from "../componentes/outputs.tsx";
import { Aviso, BarraFiltros, Cabecalho, Carregando, Pilulas, Vazio } from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import type { Vinculo } from "../tipos.ts";

/**
 * Todos os outputs, de todos os assets e shots. Gerar é dentro do asset ou
 * do shot (o Gerador); aqui é para ver, comparar e achar — e "Usar estas
 * configurações" leva ao Gerador do dono com tudo preenchido.
 */
export function PaginaOutputs() {
  const [f, mudar] = useFiltros(["projeto", "tipo", "vinculo", "favoritos", "busca"] as const);
  const { dados, erro, carregando, recarregar } = useCarregar(
    () =>
      outputsApi.listar({
        projeto: f.projeto,
        tipo: f.tipo,
        vinculo: f.vinculo as Vinculo | "",
        favoritos: f.favoritos,
        busca: f.busca,
      }),
    [f.projeto, f.tipo, f.vinculo, f.favoritos, f.busca],
  );
  const tipos = useCarregar(() => outputsApi.tipos(), []);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const navegar = useNavigate();
  const filtrando = !!(f.projeto || f.tipo || f.vinculo || f.favoritos || f.busca);

  return (
    <>
      <Cabecalho
        titulo="Outputs"
        subtitulo="Tudo o que foi gerado. Para gerar, abra o asset ou o shot — o Gerador fica lá."
      />
      <BarraFiltros>
        <FiltroProjeto valor={f.projeto} aoMudar={(v) => mudar("projeto", v)} />
        <FiltroSelecao valor={f.tipo} aoMudar={(v) => mudar("tipo", v)} todos="Qualquer tipo" largura="w-56">
          {tipos.dados?.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.nome}
            </option>
          ))}
        </FiltroSelecao>
        <Pilulas
          valor={f.vinculo}
          aoMudar={(v) => mudar("vinculo", v)}
          opcoes={[
            { valor: "", rotulo: "Todos" },
            { valor: "asset", rotulo: "De assets" },
            { valor: "shot", rotulo: "De shots" },
          ]}
        />
        <Pilulas
          valor={f.favoritos}
          aoMudar={(v) => mudar("favoritos", v)}
          opcoes={[
            { valor: "", rotulo: "Todos" },
            { valor: "1", rotulo: "★ Favoritos" },
          ]}
        />
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} dica="Buscar no prompt" />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<Sparkles />}
            titulo={filtrando ? "Nenhum output com esses filtros" : "Nenhum output ainda"}
            texto={filtrando ? undefined : "Abra um asset ou shot e use o Gerador."}
          />
        )}
        {!!dados?.length && (
          <div className={GRADE_OUTPUTS}>
            {dados.map((o) => (
              <CartaoOutput
                key={o.id}
                o={o}
                mostrarDono
                aoAbrir={() => setAbertoId(o.id)}
                aoFavoritar={async () => {
                  await outputsApi.favoritar(o.id, !o.favorito);
                  recarregar();
                }}
              />
            ))}
          </div>
        )}
      </div>
      <VisorOutputs
        outputs={dados ?? []}
        abertoId={abertoId}
        aoMudar={setAbertoId}
        aoFechar={() => setAbertoId(null)}
        aoAlterar={recarregar}
        mostrarDono
        aoUsar={(o) => navegar(`${o.assetId ? `/assets/${o.assetId}` : `/shots/${o.shotId}`}?usar=${o.id}`)}
      />
    </>
  );
}
