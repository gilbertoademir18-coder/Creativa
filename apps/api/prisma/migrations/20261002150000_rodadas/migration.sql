-- Rodadas: cada envio de uma geração ao ComfyUI vira uma linha em "rodada",
-- para dar para "gerar mais" na mesma geração e saber a seed de cada imagem.
--
-- A ordem importa: primeiro cria a tabela nova, depois COPIA a execução de
-- cada geração já enviada para uma rodada e liga os outputs a ela, e só
-- então tira as colunas antigas da geração. Nada se perde.

-- 1. A tabela nova, com índices e chaves.
CREATE TABLE "rodada" (
    "id" UUID NOT NULL,
    "geracao_id" UUID NOT NULL,
    "status" "status_geracao" NOT NULL DEFAULT 'NA_FILA',
    "parametros" JSONB NOT NULL,
    "grafo_enviado" JSONB NOT NULL,
    "prompt_id_comfy" TEXT,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMPTZ,
    "concluida_em" TIMESTAMPTZ,

    CONSTRAINT "rodada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rodada_geracao_id_idx" ON "rodada"("geracao_id");
CREATE INDEX "rodada_status_idx" ON "rodada"("status");

ALTER TABLE "rodada" ADD CONSTRAINT "rodada_geracao_id_fkey"
  FOREIGN KEY ("geracao_id") REFERENCES "geracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Cada geração já enviada (tudo que não é rascunho) vira uma geração com
--    uma rodada, levando a execução como ela foi: parâmetros com a seed
--    sorteada, grafo, prompt_id, erro e tempos.
INSERT INTO "rodada" ("id", "geracao_id", "status", "parametros", "grafo_enviado", "prompt_id_comfy", "erro", "criado_em", "iniciada_em", "concluida_em")
SELECT gen_random_uuid(), g."id", g."status", g."parametros", COALESCE(g."grafo_enviado", '{}'::jsonb), g."prompt_id_comfy", g."erro",
       COALESCE(g."iniciada_em", g."criado_em"), g."iniciada_em", g."concluida_em"
FROM "geracao" g
WHERE g."status" <> 'RASCUNHO';

-- 3. Os outputs passam a apontar para a rodada que os gerou. Até aqui toda
--    geração tem no máximo uma rodada, então a ligação é direta.
ALTER TABLE "output" ADD COLUMN "rodada_id" UUID;

UPDATE "output" o
SET "rodada_id" = r."id"
FROM "rodada" r
WHERE r."geracao_id" = o."geracao_id";

CREATE INDEX "output_rodada_id_idx" ON "output"("rodada_id");

ALTER TABLE "output" ADD CONSTRAINT "output_rodada_id_fkey"
  FOREIGN KEY ("rodada_id") REFERENCES "rodada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Só agora, com tudo copiado: o prompt_id passa a ser único na rodada e
--    as colunas de execução saem da geração.
DROP INDEX "geracao_prompt_id_comfy_key";
CREATE UNIQUE INDEX "rodada_prompt_id_comfy_key" ON "rodada"("prompt_id_comfy");

ALTER TABLE "geracao" DROP COLUMN "concluida_em",
DROP COLUMN "erro",
DROP COLUMN "grafo_enviado",
DROP COLUMN "iniciada_em",
DROP COLUMN "prompt_id_comfy";
