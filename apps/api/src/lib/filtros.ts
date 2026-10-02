import type { Prisma } from "../generated/prisma/client.ts";

/*
 * O filtro "do projeto X" para o que não aponta direto para projeto.
 *
 * Referência e geração pertencem a um asset ou a um shot, e é por eles que
 * chegam ao projeto: asset.projeto, ou shot.cena.projeto. "sem" pega o que
 * está solto de verdade — sem dono, ou com um dono que não tem projeto.
 */

type FiltroDono = Prisma.ReferenciaWhereInput & Prisma.GeracaoWhereInput;

export function doProjeto(projeto: string | undefined): FiltroDono | undefined {
  if (!projeto) return undefined;
  if (projeto === "sem") {
    return {
      AND: [
        { OR: [{ assetId: null }, { asset: { projetoId: null } }] },
        { OR: [{ shotId: null }, { shot: { cena: { projetoId: null } } }] },
      ],
    };
  }
  return { OR: [{ asset: { projetoId: projeto } }, { shot: { cena: { projetoId: projeto } } }] };
}

/** A quem a referência ou geração pertence: um asset, um shot, ou ninguém. */
export type Vinculo = "asset" | "shot" | "solta";

export function doVinculo(vinculo: Vinculo | undefined): FiltroDono | undefined {
  if (vinculo === "asset") return { assetId: { not: null } };
  if (vinculo === "shot") return { shotId: { not: null } };
  if (vinculo === "solta") return { assetId: null, shotId: null };
  return undefined;
}

/** O pedaço do `include` que traz o dono com o caminho até o projeto. */
export const incluirDono = {
  asset: { select: { id: true, nome: true, tipo: true, projeto: { select: { id: true, nome: true } } } },
  shot: {
    select: {
      id: true,
      nome: true,
      cena: { select: { id: true, nome: true, projeto: { select: { id: true, nome: true } } } },
    },
  },
} as const;
