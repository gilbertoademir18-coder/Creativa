-- Posição do projeto na página de projetos.
--
-- Todos nascem em 0 de propósito: a listagem desempata por editadoEm, então a
-- ordem de antes continua valendo até alguém arrastar o primeiro. Nenhuma
-- linha é reescrita aqui.
ALTER TABLE "projeto" ADD COLUMN "ordem" INTEGER NOT NULL DEFAULT 0;
