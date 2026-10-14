-- Cena e shot podem ficar sem nome: o número (a posição) já identifica.
-- Nome vira coisa de quando a cena merece um ("A fuga"), posto à mão.
-- Só afrouxa a restrição: nenhum nome existente é tocado.
ALTER TABLE "cena" ALTER COLUMN "nome" DROP NOT NULL;
ALTER TABLE "shot" ALTER COLUMN "nome" DROP NOT NULL;
