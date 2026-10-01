-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "categoria_workflow" AS ENUM ('VIDEO', 'IMAGEM', 'AUDIO', 'ASSET');

-- CreateEnum
CREATE TYPE "status_execucao" AS ENUM ('NA_FILA', 'EXECUTANDO', 'CONCLUIDA', 'FALHOU', 'CANCELADA');

-- CreateEnum
CREATE TYPE "tipo_asset" AS ENUM ('IMAGEM', 'VIDEO', 'AUDIO', 'OUTRO');

-- CreateTable
CREATE TABLE "workflow" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" "categoria_workflow" NOT NULL,
    "grafo" JSONB NOT NULL,
    "arquivado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projeto" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "arquivado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucao" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "projeto_id" UUID,
    "status" "status_execucao" NOT NULL DEFAULT 'NA_FILA',
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "grafo_enviado" JSONB NOT NULL,
    "prompt_id" TEXT,
    "erro" TEXT,
    "criada_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMPTZ,
    "concluida_em" TIMESTAMPTZ,

    CONSTRAINT "execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" UUID NOT NULL,
    "execucao_id" UUID,
    "projeto_id" UUID,
    "tipo" "tipo_asset" NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "mime" TEXT,
    "tamanho_bytes" BIGINT,
    "largura" INTEGER,
    "altura" INTEGER,
    "duracao_seg" DECIMAL(10,3),
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "execucao_prompt_id_key" ON "execucao"("prompt_id");

-- CreateIndex
CREATE INDEX "execucao_workflow_id_idx" ON "execucao"("workflow_id");

-- CreateIndex
CREATE INDEX "execucao_projeto_id_idx" ON "execucao"("projeto_id");

-- CreateIndex
CREATE INDEX "execucao_status_idx" ON "execucao"("status");

-- CreateIndex
CREATE INDEX "asset_execucao_id_idx" ON "asset"("execucao_id");

-- CreateIndex
CREATE INDEX "asset_projeto_id_idx" ON "asset"("projeto_id");

-- AddForeignKey
ALTER TABLE "execucao" ADD CONSTRAINT "execucao_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao" ADD CONSTRAINT "execucao_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "execucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
