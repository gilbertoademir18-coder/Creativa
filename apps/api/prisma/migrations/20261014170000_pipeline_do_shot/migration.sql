-- O pipeline de um shot: o roteiro de etapas para gerá-lo ("First frame +
-- vídeo"). Cadastro do usuário; as etapas moram no JSON, porque etapa não é
-- registro — é posição num pipeline.
CREATE TABLE "pipeline" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "etapas" JSONB NOT NULL DEFAULT '[]',
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pipeline_chave_key" ON "pipeline"("chave");

-- Qual pipeline o shot segue. Nulo (o de todos os que já existem) herda o
-- padrão do projeto, que nulo também é a geração única de sempre.
ALTER TABLE "shot" ADD COLUMN "pipeline" TEXT;
ALTER TABLE "projeto" ADD COLUMN "pipeline_padrao" TEXT;

-- Em que etapa isto foi gerado, a chave copiada no envio (como "workflow" e
-- "tipo_geracao" já são). Nula no que foi gerado antes dos pipelines: a
-- etapa desses é deduzida pelo tipo de geração, sem backfill.
ALTER TABLE "execucao" ADD COLUMN "etapa" TEXT;
ALTER TABLE "output" ADD COLUMN "etapa" TEXT;
