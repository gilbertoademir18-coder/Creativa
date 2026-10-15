-- Outros arquivos do mesmo output, por nome: no render do blockout, o depth
-- da sala vazia (para gerar a placa) e os manequins recortados (para colar
-- na placa e trocar pelas personagens). Caminhos relativos, como "arquivo".
ALTER TABLE "output" ADD COLUMN "partes" JSONB;
