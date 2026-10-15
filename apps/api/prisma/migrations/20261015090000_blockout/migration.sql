-- O blockout: o modelo 3D simples de um asset (planta do cenário, manequim
-- da personagem) e a marcação da cena (quem fica onde). São dados que o
-- Blender lê para montar a cena — JSON, não arquivo .blend.
ALTER TABLE "asset" ADD COLUMN "blockout" JSONB;
ALTER TABLE "cena" ADD COLUMN "marcacao" JSONB;

-- A imagem para olhar, quando o arquivo do output é dado e não figura: no
-- render do blockout, o arquivo é o depth e a prévia é o render colorido.
ALTER TABLE "output" ADD COLUMN "previa" TEXT;
