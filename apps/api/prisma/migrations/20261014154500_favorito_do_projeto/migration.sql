-- Projeto favorito: só destaque na página, sem mexer na ordem — quem ordena é
-- o arrastar. Todos nascem em false; nenhuma linha é reescrita.
ALTER TABLE "projeto" ADD COLUMN "favorito" BOOLEAN NOT NULL DEFAULT false;
