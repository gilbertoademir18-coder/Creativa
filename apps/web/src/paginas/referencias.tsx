import { FileText, Images } from "lucide-react";
import { useState } from "react";
import { referenciasApi } from "../api.ts";
import { FiltroBusca, FiltroProjeto } from "../componentes/filtros.tsx";
import { CartaoReferencia, ModalReferencia, ModalTexto, ZonaUpload } from "../componentes/referencias.tsx";
import { Aviso, BarraFiltros, Botao, Cabecalho, Carregando, GRADE, Pilulas, Vazio } from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import { TIPOS_REFERENCIA } from "../rotulos.ts";
import type { Referencia, TipoReferencia, Vinculo } from "../tipos.ts";

const SOLTA = { assetId: null, shotId: null };

export function PaginaReferencias() {
  const [f, mudar] = useFiltros(["projeto", "tipo", "vinculo", "busca"] as const);
  const { dados, erro, carregando, recarregar } = useCarregar(
    () =>
      referenciasApi.listar({
        projeto: f.projeto,
        tipo: f.tipo as TipoReferencia | "",
        vinculo: f.vinculo as Vinculo | "",
        busca: f.busca,
      }),
    [f.projeto, f.tipo, f.vinculo, f.busca],
  );
  const [aberta, setAberta] = useState<Referencia | null>(null);
  const [novoTexto, setNovoTexto] = useState(false);

  return (
    <>
      <Cabecalho
        titulo="Referências"
        subtitulo="Imagens, vídeos e textos externos. Envie aqui para guardar soltas, ou dentro de um asset ou shot."
        acoes={
          <Botao icone={<FileText className="size-4" />} onClick={() => setNovoTexto(true)}>
            Nova referência de texto
          </Botao>
        }
      />
      <BarraFiltros>
        <FiltroProjeto valor={f.projeto} aoMudar={(v) => mudar("projeto", v)} />
        <Pilulas
          valor={f.tipo}
          aoMudar={(v) => mudar("tipo", v)}
          opcoes={[{ valor: "", rotulo: "Todos" }, ...TIPOS_REFERENCIA.map((t) => ({ valor: t.valor, rotulo: t.plural }))]}
        />
        <Pilulas
          valor={f.vinculo}
          aoMudar={(v) => mudar("vinculo", v)}
          opcoes={[
            { valor: "", rotulo: "Qualquer vínculo" },
            { valor: "asset", rotulo: "De assets" },
            { valor: "shot", rotulo: "De shots" },
            { valor: "solta", rotulo: "Soltas" },
          ]}
        />
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} />
      </BarraFiltros>
      <div className="flex flex-col gap-6 p-8">
        <ZonaUpload dono={SOLTA} aoEnviar={() => recarregar()} />
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && <Vazio icone={<Images />} titulo="Nenhuma referência com esses filtros" />}
        {!!dados?.length && (
          <div className={GRADE}>
            {dados.map((r) => (
              <CartaoReferencia key={r.id} r={r} mostrarDono aoClicar={() => setAberta(r)} />
            ))}
          </div>
        )}
      </div>
      <ModalReferencia
        referencia={aberta}
        aoFechar={() => setAberta(null)}
        aoMudar={() => {
          setAberta(null);
          recarregar();
        }}
      />
      <ModalTexto
        aberto={novoTexto}
        dono={SOLTA}
        aoFechar={() => setNovoTexto(false)}
        aoCriar={() => {
          setNovoTexto(false);
          recarregar();
        }}
      />
    </>
  );
}
