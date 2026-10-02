-- DropForeignKey
ALTER TABLE "geracao" DROP CONSTRAINT "geracao_workflow_id_fkey";

-- AlterTable
ALTER TABLE "geracao" DROP COLUMN "prompt_negativo",
DROP COLUMN "workflow_id",
ADD COLUMN     "tipo" TEXT NOT NULL,
ADD COLUMN     "workflow" TEXT NOT NULL;

-- DropTable
DROP TABLE "workflow";

-- DropEnum
DROP TYPE "categoria_workflow";

-- CreateIndex
CREATE INDEX "geracao_tipo_idx" ON "geracao"("tipo");
