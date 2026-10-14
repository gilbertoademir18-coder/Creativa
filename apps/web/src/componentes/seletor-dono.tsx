import { assetsApi, cenasApi, projetosApi, type DonoReferencia } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { titulo, rotuloTipoAsset } from "../rotulos.ts";
import type { Asset, Cena } from "../tipos.ts";
import { Pilulas, Seletor } from "./ui.tsx";

/**
 * A quem pertence uma referência: um asset, um shot, o projeto em si (sem
 * asset nem shot) ou ninguém (solta). Assets e shots aparecem agrupados por
 * projeto e cena, para dar para achar o "Shot 2" certo entre várias cenas.
 */
export function SeletorDono({ valor, aoMudar }: { valor: DonoReferencia; aoMudar: (d: DonoReferencia) => void }) {
  const { dados: assets } = useCarregar(() => assetsApi.listar(), []);
  const { dados: cenas } = useCarregar(() => cenasApi.listar(), []);
  const { dados: projetos } = useCarregar(() => projetosApi.listar(), []);
  const modo = valor.assetId ? "asset" : valor.shotId ? "shot" : valor.projetoId ? "projeto" : "solta";
  const nada = { assetId: null, shotId: null, projetoId: null };

  return (
    <div className="flex flex-col gap-2">
      <Pilulas
        valor={modo}
        opcoes={[
          { valor: "solta", rotulo: "Solta" },
          { valor: "projeto", rotulo: "Projeto" },
          { valor: "asset", rotulo: "Asset" },
          { valor: "shot", rotulo: "Shot" },
        ]}
        aoMudar={(m) => {
          if (m === "solta") aoMudar(nada);
          if (m === "projeto") aoMudar({ ...nada, projetoId: projetos?.[0]?.id ?? null });
          if (m === "asset") aoMudar({ ...nada, assetId: assets?.[0]?.id ?? null });
          if (m === "shot") aoMudar({ ...nada, shotId: cenas?.[0]?.shots[0]?.id ?? null });
        }}
      />
      {modo === "projeto" && (
        <Seletor value={valor.projetoId ?? ""} onChange={(e) => aoMudar({ ...nada, projetoId: e.target.value || null })}>
          {!projetos?.length && <option value="">Nenhum projeto cadastrado</option>}
          {(projetos ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Seletor>
      )}
      {modo === "asset" && (
        <Seletor value={valor.assetId ?? ""} onChange={(e) => aoMudar({ ...nada, assetId: e.target.value || null })}>
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
        <Seletor value={valor.shotId ?? ""} onChange={(e) => aoMudar({ ...nada, shotId: e.target.value || null })}>
          {!cenas?.length && <option value="">Nenhuma cena cadastrada</option>}
          {(cenas ?? []).map((c) => (
            <optgroup key={c.id} label={rotuloCena(c)}>
              {c.shots.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {titulo("Shot", s.nome, i + 1)}
                </option>
              ))}
            </optgroup>
          ))}
        </Seletor>
      )}
    </div>
  );
}

// A cena pode não ter nome: aí vale o número (a posição no vídeo).
const rotuloCena = (c: Cena) => {
  const nome = titulo("Cena", c.nome, c.ordem + 1);
  return c.projeto ? `${c.projeto.nome} › ${nome}` : nome;
};

function agrupar(itens: Asset[], chave: (a: Asset) => string): [string, Asset[]][] {
  const grupos = new Map<string, Asset[]>();
  for (const i of itens) grupos.set(chave(i), [...(grupos.get(chave(i)) ?? []), i]);
  return [...grupos.entries()];
}
