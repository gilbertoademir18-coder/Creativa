-- Conversa pode ser de um projeto: a LLM recebe a descrição dele.
--
-- Só acrescenta: coluna opcional, vazia nas conversas que existem.
-- AlterTable
ALTER TABLE "conversa" ADD COLUMN     "projeto_id" UUID;

-- CreateIndex
CREATE INDEX "conversa_projeto_id_idx" ON "conversa"("projeto_id");

-- AddForeignKey
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

