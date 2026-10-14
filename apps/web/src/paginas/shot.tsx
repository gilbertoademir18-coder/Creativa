import { useParams } from "react-router";
import { shotsApi } from "../api.ts";
import { useCenaAtual, useRecargaCena } from "../componentes/barra-cena.tsx";
import { useProjetoAtual } from "../componentes/barra-projeto.tsx";
import { PainelGerador } from "../componentes/gerador.tsx";
import { PainelReferencias } from "../componentes/referencias.tsx";
import { Aviso, Carregando } from "../componentes/ui.tsx";
import { useCarregar } from "../hooks.ts";

/*
 * A página do shot é o Gerador e as referências, e mais nada: o nome do shot,
 * os irmãos dele e "Editar shot" moram na barra da cena, logo acima.
 */
export function PaginaShot() {
  const { id = "" } = useParams();
  // Editar o shot pela barra tem de aparecer aqui também.
  const recarga = useRecargaCena();
  const { dados: s, erro } = useCarregar(() => shotsApi.ler(id), [id, recarga]);
  useProjetoAtual(s?.cena.projeto?.id);
  useCenaAtual(s?.cena.id);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!s) return <Carregando />;

  return (
    <>
      {/* Só a descrição: o vídeo e a cena já estão na barra, logo acima. */}
      {s.descricao && (
        <header className="border-b border-zinc-800 px-8 py-3 text-sm text-zinc-400">
          <p className="max-w-3xl whitespace-pre-wrap">{s.descricao}</p>
        </header>
      )}
      {/* key: trocar de shot pela barra recria os painéis (o Gerador começa do rascunho do shot novo). */}
      <div key={s.id} className="flex flex-col gap-10 p-8">
        <PainelGerador dono={{ assetId: null, shotId: s.id }} />
        <PainelReferencias dono={{ assetId: null, shotId: s.id }} />
      </div>
    </>
  );
}
