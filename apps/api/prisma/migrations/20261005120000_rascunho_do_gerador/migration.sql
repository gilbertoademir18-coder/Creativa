-- Rascunho do Gerador: cada asset e cada shot guarda onde o Gerador parou
-- (tipo, workflow, valores, assistente e ideia). O Gerador abre de onde
-- parou e vai salvando sozinho; a skill de workflows deixa nele um exemplo
-- pronto para o assistente expandir.
--
-- Só acrescenta, colunas vazias: nada do que existe muda.

-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "rascunho_gerador" JSONB;

-- AlterTable
ALTER TABLE "shot" ADD COLUMN     "rascunho_gerador" JSONB;
