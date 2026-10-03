-- O Gerador: "geração" deixa de ser cadastro. Gera-se de dentro do asset ou
-- do shot, e cada output passa a guardar tudo o que foi usado para gerá-lo.
--
--   geracao, geracao_entrada → somem
--   rodada                   → execucao (a fila), presa direto ao asset/shot
--   output                   → preso direto ao asset/shot, com os metadados
--
-- A ordem importa: primeiro cria o que é novo e COPIA tudo (dono, tipo,
-- workflow, modelo, parâmetros com a seed, grafo enviado) para a execução e
-- para cada output; só então apaga as tabelas antigas. Nada se perde. Os
-- arquivos em disco não são tocados.

-- 1. A fila: cada rodada vira uma execução, com o mesmo id, levando o dono,
--    o tipo, o workflow e o modelo da geração dela.
CREATE TYPE "status_execucao" AS ENUM ('NA_FILA', 'EXECUTANDO', 'CONCLUIDA', 'FALHOU', 'CANCELADA');

CREATE TABLE "execucao" (
    "id" UUID NOT NULL,
    "asset_id" UUID,
    "shot_id" UUID,
    "tipo" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "modelo" TEXT,
    "status" "status_execucao" NOT NULL DEFAULT 'NA_FILA',
    "parametros" JSONB NOT NULL,
    "grafo_enviado" JSONB NOT NULL,
    "prompt_id_comfy" TEXT,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMPTZ,
    "concluida_em" TIMESTAMPTZ,

    CONSTRAINT "execucao_pkey" PRIMARY KEY ("id")
);

INSERT INTO "execucao" ("id", "asset_id", "shot_id", "tipo", "workflow", "modelo", "status", "parametros", "grafo_enviado",
                        "prompt_id_comfy", "erro", "criado_em", "iniciada_em", "concluida_em")
SELECT r."id", g."asset_id", g."shot_id", g."tipo", g."workflow", g."modelo", r."status"::text::"status_execucao",
       r."parametros", r."grafo_enviado", r."prompt_id_comfy", r."erro", r."criado_em", r."iniciada_em", r."concluida_em"
FROM "rodada" r
JOIN "geracao" g ON g."id" = r."geracao_id";

-- 2. Os outputs ganham o dono e os metadados. Os parâmetros, a seed e o
--    grafo vêm da rodada que os gerou (é ela que tem a seed sorteada); se
--    algum não tiver rodada, vale o que a geração guardava.
ALTER TABLE "output"
ADD COLUMN "asset_id" UUID,
ADD COLUMN "shot_id" UUID,
ADD COLUMN "execucao_id" UUID,
ADD COLUMN "tipo_geracao" TEXT,
ADD COLUMN "workflow" TEXT,
ADD COLUMN "modelo" TEXT,
ADD COLUMN "prompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN "seed" BIGINT,
ADD COLUMN "parametros" JSONB,
ADD COLUMN "grafo_enviado" JSONB;

UPDATE "output" o
SET "asset_id" = g."asset_id",
    "shot_id" = g."shot_id",
    "tipo_geracao" = g."tipo",
    "workflow" = g."workflow",
    "modelo" = g."modelo",
    "parametros" = g."parametros",
    "grafo_enviado" = '{}'::jsonb,
    "prompt" = g."prompt"
FROM "geracao" g
WHERE g."id" = o."geracao_id";

UPDATE "output" o
SET "execucao_id" = r."id",
    "parametros" = r."parametros",
    "grafo_enviado" = r."grafo_enviado",
    "prompt" = COALESCE(r."parametros" ->> 'prompt', o."prompt"),
    "seed" = CASE WHEN jsonb_typeof(r."parametros" -> 'seed') = 'number' THEN (r."parametros" ->> 'seed')::bigint END
FROM "rodada" r
WHERE r."id" = o."rodada_id";

-- Conferência: se algum output ficou sem os metadados, a migração para aqui
-- (e nada é apagado) em vez de seguir com dado faltando.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "output" WHERE "tipo_geracao" IS NULL OR "parametros" IS NULL) THEN
    RAISE EXCEPTION 'Há outputs sem metadados copiados — migração interrompida, nada foi apagado.';
  END IF;
END $$;

ALTER TABLE "output"
ALTER COLUMN "tipo_geracao" SET NOT NULL,
ALTER COLUMN "workflow" SET NOT NULL,
ALTER COLUMN "parametros" SET NOT NULL,
ALTER COLUMN "grafo_enviado" SET NOT NULL;

-- 3. Só agora, com tudo copiado: sai o que era da geração.
ALTER TABLE "output" DROP CONSTRAINT "output_geracao_id_fkey";
ALTER TABLE "output" DROP CONSTRAINT "output_rodada_id_fkey";
DROP INDEX "output_geracao_id_idx";
DROP INDEX "output_rodada_id_idx";
ALTER TABLE "output" DROP COLUMN "geracao_id", DROP COLUMN "rodada_id";

DROP TABLE "geracao_entrada";
DROP TABLE "rodada";
DROP TABLE "geracao";
DROP TYPE "status_geracao";

-- 4. Índices, chaves e as regras do dono: exatamente um, asset ou shot.
CREATE UNIQUE INDEX "execucao_prompt_id_comfy_key" ON "execucao"("prompt_id_comfy");
CREATE INDEX "execucao_asset_id_idx" ON "execucao"("asset_id");
CREATE INDEX "execucao_shot_id_idx" ON "execucao"("shot_id");
CREATE INDEX "execucao_status_idx" ON "execucao"("status");
CREATE INDEX "output_asset_id_idx" ON "output"("asset_id");
CREATE INDEX "output_shot_id_idx" ON "output"("shot_id");
CREATE INDEX "output_execucao_id_idx" ON "output"("execucao_id");
CREATE INDEX "output_tipo_geracao_idx" ON "output"("tipo_geracao");

ALTER TABLE "execucao" ADD CONSTRAINT "execucao_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "execucao" ADD CONSTRAINT "execucao_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "output" ADD CONSTRAINT "output_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "output" ADD CONSTRAINT "output_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "output" ADD CONSTRAINT "output_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "execucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "execucao" ADD CONSTRAINT "execucao_um_dono" CHECK (("asset_id" IS NULL) <> ("shot_id" IS NULL));
ALTER TABLE "output" ADD CONSTRAINT "output_um_dono" CHECK (("asset_id" IS NULL) <> ("shot_id" IS NULL));
