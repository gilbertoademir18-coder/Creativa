-- CreateEnum
CREATE TYPE "tipo_referencia" AS ENUM ('IMAGEM', 'TEXTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "status_geracao" AS ENUM ('RASCUNHO', 'NA_FILA', 'EXECUTANDO', 'CONCLUIDA', 'FALHOU', 'CANCELADA');

-- CreateEnum
CREATE TYPE "tipo_output" AS ENUM ('IMAGEM', 'VIDEO', 'AUDIO', 'OUTRO');

-- AlterEnum
BEGIN;
CREATE TYPE "tipo_asset_new" AS ENUM ('PERSONAGEM', 'CENARIO', 'OBJETO', 'OUTRO');
ALTER TABLE "asset" ALTER COLUMN "tipo" TYPE "tipo_asset_new" USING ("tipo"::text::"tipo_asset_new");
ALTER TYPE "tipo_asset" RENAME TO "tipo_asset_old";
ALTER TYPE "tipo_asset_new" RENAME TO "tipo_asset";
DROP TYPE "public"."tipo_asset_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "asset" DROP CONSTRAINT "asset_execucao_id_fkey";

-- DropForeignKey
ALTER TABLE "execucao" DROP CONSTRAINT "execucao_projeto_id_fkey";

-- DropForeignKey
ALTER TABLE "execucao" DROP CONSTRAINT "execucao_workflow_id_fkey";

-- DropIndex
DROP INDEX "asset_execucao_id_idx";

-- AlterTable
ALTER TABLE "asset" DROP COLUMN "altura",
DROP COLUMN "caminho",
DROP COLUMN "duracao_seg",
DROP COLUMN "execucao_id",
DROP COLUMN "favorito",
DROP COLUMN "largura",
DROP COLUMN "mime",
DROP COLUMN "nome_arquivo",
DROP COLUMN "tamanho_bytes",
ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "editado_em" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "nome" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "projeto" DROP COLUMN "arquivado";

-- AlterTable
ALTER TABLE "workflow" ALTER COLUMN "categoria" DROP NOT NULL;

-- DropTable
DROP TABLE "execucao";

-- DropEnum
DROP TYPE "status_execucao";

-- CreateTable
CREATE TABLE "cena" (
    "id" UUID NOT NULL,
    "projeto_id" UUID,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "storyboard" TEXT NOT NULL DEFAULT '',
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot" (
    "id" UUID NOT NULL,
    "cena_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referencia" (
    "id" UUID NOT NULL,
    "asset_id" UUID,
    "shot_id" UUID,
    "tipo" "tipo_referencia" NOT NULL,
    "nome" TEXT NOT NULL,
    "texto" TEXT,
    "arquivo" TEXT,
    "nome_original" TEXT,
    "mime" TEXT,
    "tamanho_bytes" BIGINT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "referencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geracao" (
    "id" UUID NOT NULL,
    "asset_id" UUID,
    "shot_id" UUID,
    "nome" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "prompt_negativo" TEXT,
    "modelo" TEXT,
    "workflow_id" UUID,
    "grafo_enviado" JSONB,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "status" "status_geracao" NOT NULL DEFAULT 'RASCUNHO',
    "prompt_id_comfy" TEXT,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,
    "iniciada_em" TIMESTAMPTZ,
    "concluida_em" TIMESTAMPTZ,

    CONSTRAINT "geracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geracao_entrada" (
    "id" UUID NOT NULL,
    "geracao_id" UUID NOT NULL,
    "referencia_id" UUID,
    "output_id" UUID,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "geracao_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "output" (
    "id" UUID NOT NULL,
    "geracao_id" UUID NOT NULL,
    "tipo" "tipo_output" NOT NULL,
    "arquivo" TEXT NOT NULL,
    "mime" TEXT,
    "tamanho_bytes" BIGINT,
    "largura" INTEGER,
    "altura" INTEGER,
    "duracao_seg" DECIMAL(10,3),
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "output_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cena_projeto_id_idx" ON "cena"("projeto_id");

-- CreateIndex
CREATE INDEX "shot_cena_id_ordem_idx" ON "shot"("cena_id", "ordem");

-- CreateIndex
CREATE INDEX "referencia_asset_id_idx" ON "referencia"("asset_id");

-- CreateIndex
CREATE INDEX "referencia_shot_id_idx" ON "referencia"("shot_id");

-- CreateIndex
CREATE INDEX "referencia_tipo_idx" ON "referencia"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "geracao_prompt_id_comfy_key" ON "geracao"("prompt_id_comfy");

-- CreateIndex
CREATE INDEX "geracao_asset_id_idx" ON "geracao"("asset_id");

-- CreateIndex
CREATE INDEX "geracao_shot_id_idx" ON "geracao"("shot_id");

-- CreateIndex
CREATE INDEX "geracao_status_idx" ON "geracao"("status");

-- CreateIndex
CREATE INDEX "geracao_entrada_referencia_id_idx" ON "geracao_entrada"("referencia_id");

-- CreateIndex
CREATE INDEX "geracao_entrada_output_id_idx" ON "geracao_entrada"("output_id");

-- CreateIndex
CREATE UNIQUE INDEX "geracao_entrada_geracao_id_referencia_id_key" ON "geracao_entrada"("geracao_id", "referencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "geracao_entrada_geracao_id_output_id_key" ON "geracao_entrada"("geracao_id", "output_id");

-- CreateIndex
CREATE INDEX "output_geracao_id_idx" ON "output"("geracao_id");

-- CreateIndex
CREATE INDEX "asset_tipo_idx" ON "asset"("tipo");

-- AddForeignKey
ALTER TABLE "cena" ADD CONSTRAINT "cena_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot" ADD CONSTRAINT "shot_cena_id_fkey" FOREIGN KEY ("cena_id") REFERENCES "cena"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referencia" ADD CONSTRAINT "referencia_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referencia" ADD CONSTRAINT "referencia_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geracao" ADD CONSTRAINT "geracao_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geracao" ADD CONSTRAINT "geracao_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geracao" ADD CONSTRAINT "geracao_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geracao_entrada" ADD CONSTRAINT "geracao_entrada_geracao_id_fkey" FOREIGN KEY ("geracao_id") REFERENCES "geracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geracao_entrada" ADD CONSTRAINT "geracao_entrada_referencia_id_fkey" FOREIGN KEY ("referencia_id") REFERENCES "referencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geracao_entrada" ADD CONSTRAINT "geracao_entrada_output_id_fkey" FOREIGN KEY ("output_id") REFERENCES "output"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "output" ADD CONSTRAINT "output_geracao_id_fkey" FOREIGN KEY ("geracao_id") REFERENCES "geracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Pertence a um asset, a um shot ou a nenhum — nunca aos dois.
ALTER TABLE "referencia" ADD CONSTRAINT "referencia_dono_unico"
  CHECK ("asset_id" IS NULL OR "shot_id" IS NULL);
ALTER TABLE "geracao" ADD CONSTRAINT "geracao_dono_unico"
  CHECK ("asset_id" IS NULL OR "shot_id" IS NULL);

-- Uma entrada é uma referência ou um output: exatamente um dos dois.
ALTER TABLE "geracao_entrada" ADD CONSTRAINT "geracao_entrada_uma_origem"
  CHECK (("referencia_id" IS NULL) <> ("output_id" IS NULL));

-- Referência de texto tem texto; as outras têm arquivo.
ALTER TABLE "referencia" ADD CONSTRAINT "referencia_conteudo"
  CHECK (("tipo" = 'TEXTO' AND "texto" IS NOT NULL) OR ("tipo" <> 'TEXTO' AND "arquivo" IS NOT NULL));
