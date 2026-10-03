-- Assistentes de prompt: instruções em markdown (como uma skill) que a LLM
-- local segue para expandir uma ideia no prompt de um workflow. E, em cada
-- execução e output, qual assistente foi usado e a ideia de origem.
--
-- Só acrescenta: tabela nova e colunas opcionais. Nenhum dado muda.

-- AlterTable
ALTER TABLE "execucao" ADD COLUMN     "assistente" TEXT,
ADD COLUMN     "ideia" TEXT;

-- AlterTable
ALTER TABLE "output" ADD COLUMN     "assistente" TEXT,
ADD COLUMN     "ideia" TEXT;

-- CreateTable
CREATE TABLE "assistente" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "projeto_id" UUID,
    "workflows" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instrucoes" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistente_projeto_id_idx" ON "assistente"("projeto_id");

-- AddForeignKey
ALTER TABLE "assistente" ADD CONSTRAINT "assistente_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

