import { assetsApi, cenasApi, type Dono } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { rotuloTipoAsset } from "../rotulos.ts";
import type { Asset, Cena } from "../tipos.ts";
import { Pilulas, Seletor } from "./ui.tsx";

/**
 * A quem pertence uma referência ou geração: um asset, um shot, ou ninguém
 * (solta). Assets e shots aparecem agrupados por projeto e cena, para dar
 * para achar o "Shot 2" certo entre várias cenas.
 */
export function SeletorDono({ valor, aoMudar }: { valor: Dono; aoMudar: (d: Dono) => void }) {
  const { dados: assets } = useCarregar(() => assetsApi.listar(), []);
  const { dados: cenas } = useCarregar(() => cenasApi.listar(), []);
  const modo = valor.assetId ? "asset" : valor.shotId ? "shot" : "solta";

  return (
    <div className="flex flex-col gap-2">
      <Pilulas
        valor={modo}
        opcoes={[
          { valor: "solta", rotulo: "Solta" },
          { valor: "asset", rotulo: "Asset" },
          { valor: "shot", rotulo: "Shot" },
        ]}
        aoMudar={(m) => {
          if (m === "solta") aoMudar({ assetId: null, shotId: null });
          if (m === "asset") aoMudar({ assetId: assets?.[0]?.id ?? null, shotId: null });
          if (m === "shot") aoMudar({ assetId: null, shotId: cenas?.[0]?.shots[0]?.id ?? null });
        }}
      />
      {modo === "asset" && (
        <Seletor value={valor.assetId ?? ""} onChange={(e) => aoMudar({ assetId: e.target.value || null, shotId: null })}>
          {!assets?.length && <option value="">Nenhum asset cadastrado</option>}
          {agrupar(assets ?? [], (a) => a.projeto?.nome ?? "Sem projeto").map(([grupo, itens]) => (
            <optgroup key={grupo} label={grupo}>
              {itens.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} ({rotuloTipoAsset(a.tipo)})
                </option>
              ))}
            </optgroup>
          ))}
        </Seletor>
      )}
      {modo === "shot" && (
        <Seletor value={valor.shotId ?? ""} onChange={(e) => aoMudar({ assetId: null, shotId: e.target.value || null })}>
          {!cenas?.length && <option value="">Nenhuma cena cadastrada</option>}
          {(cenas ?? []).map((c) => (
            <optgroup key={c.id} label={rotuloCena(c)}>
              {c.shots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </Seletor>
      )}
    </div>
  );
}

const rotuloCena = (c: Cena) => (c.projeto ? `${c.projeto.nome} › ${c.nome}` : c.nome);

function agrupar(itens: Asset[], chave: (a: Asset) => string): [string, Asset[]][] {
  const grupos = new Map<string, Asset[]>();
  for (const i of itens) grupos.set(chave(i), [...(grupos.get(chave(i)) ?? []), i]);
  return [...grupos.entries()];
}
