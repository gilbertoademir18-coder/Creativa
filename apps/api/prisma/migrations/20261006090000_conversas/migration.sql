-- Conversas livres com a LLM local (página Conversas), como um chat.
--
-- Só acrescenta: tabelas novas. Nenhum dado muda.
-- CreateEnum
CREATE TYPE "papel_mensagem" AS ENUM ('USUARIO', 'ASSISTENTE');

-- CreateTable
CREATE TABLE "conversa" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem_conversa" (
    "id" UUID NOT NULL,
    "conversa_id" UUID NOT NULL,
    "papel" "papel_mensagem" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "modelo" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_conversa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversa_editado_em_idx" ON "conversa"("editado_em");

-- CreateIndex
CREATE INDEX "mensagem_conversa_conversa_id_criado_em_idx" ON "mensagem_conversa"("conversa_id", "criado_em");

-- AddForeignKey
ALTER TABLE "mensagem_conversa" ADD CONSTRAINT "mensagem_conversa_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

