-- Referência do projeto em si (moodboard, inspiração), sem asset nem shot.
-- A de um asset ou shot chega ao projeto por eles, então só a solta usa a
-- coluna (o CHECK garante).
--
-- Só acrescenta: coluna opcional, vazia nas referências que existem.
-- AlterTable
ALTER TABLE "referencia" ADD COLUMN     "projeto_id" UUID;

-- CreateIndex
CREATE INDEX "referencia_projeto_id_idx" ON "referencia"("projeto_id");

-- AddForeignKey
ALTER TABLE "referencia" ADD CONSTRAINT "referencia_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- O projeto só na referência sem asset e sem shot.
ALTER TABLE "referencia" ADD CONSTRAINT "referencia_projeto_so_solta" CHECK ("projeto_id" IS NULL OR ("asset_id" IS NULL AND "shot_id" IS NULL));
