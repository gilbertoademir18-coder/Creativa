-- Versões da descrição do projeto: cada vez que ela é salva (pela tela ou
-- pela skill do Claude), entra uma versão nova em "versao_descricao", e
-- "projeto.descricao" continua sendo a atual. Versões nunca se editam nem se
-- apagam; restaurar é salvar o texto antigo como versão nova.
--
-- Só acrescenta. A descrição que já existe vira a versão 1 (copiada, não
-- movida: "projeto.descricao" fica como está).

-- CreateEnum
CREATE TYPE "origem_versao" AS ENUM ('TELA', 'CLAUDE');

-- AlterTable
ALTER TABLE "projeto" ADD COLUMN     "descricao_versao" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "versao_descricao" (
    "id" UUID NOT NULL,
    "projeto_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "texto" TEXT,
    "origem" "origem_versao" NOT NULL DEFAULT 'TELA',
    "nota" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versao_descricao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versao_descricao_projeto_id_numero_key" ON "versao_descricao"("projeto_id", "numero");

-- AddForeignKey
ALTER TABLE "versao_descricao" ADD CONSTRAINT "versao_descricao_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A descrição de hoje vira a versão 1, com a data da última edição do projeto.
INSERT INTO "versao_descricao" ("id", "projeto_id", "numero", "texto", "origem", "nota", "criado_em")
SELECT gen_random_uuid(), "id", 1, "descricao", 'TELA', 'Descrição de antes do histórico', "editado_em"
FROM "projeto"
WHERE "descricao" IS NOT NULL AND btrim("descricao") <> '';

UPDATE "projeto" SET "descricao_versao" = 1
WHERE "descricao" IS NOT NULL AND btrim("descricao") <> '';

-- Confere: todo projeto com descrição tem a versão 1, igual à atual.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "projeto" p
    WHERE p."descricao" IS NOT NULL AND btrim(p."descricao") <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "versao_descricao" v
        WHERE v."projeto_id" = p."id" AND v."numero" = 1 AND v."texto" = p."descricao"
      )
  ) THEN
    RAISE EXCEPTION 'faltou copiar a descrição de algum projeto para a versão 1';
  END IF;
END $$;
