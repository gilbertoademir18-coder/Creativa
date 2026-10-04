-- Listas de vídeos: Projeto → Lista ("Temporada 1", "Trailers") → Vídeo
-- ("EP01") → Cena → Shot. Genérico de propósito: nem todo projeto é série.
--
-- Só acrescenta. As cenas que já existem ficam como estão (sem vídeo), e
-- apagar lista ou vídeo nunca apaga cena: elas voltam a ser "sem vídeo".

-- AlterTable
ALTER TABLE "cena" ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "video_id" UUID;

-- CreateTable
CREATE TABLE "lista_videos" (
    "id" UUID NOT NULL,
    "projeto_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lista_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video" (
    "id" UUID NOT NULL,
    "lista_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lista_videos_projeto_id_ordem_idx" ON "lista_videos"("projeto_id", "ordem");

-- CreateIndex
CREATE INDEX "video_lista_id_ordem_idx" ON "video"("lista_id", "ordem");

-- CreateIndex
CREATE INDEX "cena_video_id_ordem_idx" ON "cena"("video_id", "ordem");

-- AddForeignKey
ALTER TABLE "cena" ADD CONSTRAINT "cena_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_videos" ADD CONSTRAINT "lista_videos_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "lista_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

