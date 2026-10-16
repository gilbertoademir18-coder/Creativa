-- As opções da ideia de cada assistente: grupos de escolha (Câmera, Plano,
-- Luz...) que o Gerador mostra como pílulas embaixo da ideia.
ALTER TABLE "assistente" ADD COLUMN "opcoes" JSONB;
