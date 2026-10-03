-- Tipos de geração e workflows deixam de ser código e viram cadastro.
--
-- O workflow é genérico ("ferramenta": hoje só o ComfyUI): guarda o grafo
-- como a ferramenta exporta, os campos do Gerador com o alvo de cada um (nó +
-- entrada) e os nós de saída. Execuções, outputs e assistentes continuam
-- guardando as CHAVES (texto), não ids: o histórico sobrevive a um workflow
-- apagado ou mudado.
--
-- Esta migração também ESCREVE dados (autorizado pelo usuário em 2026-10-04):
-- a Placa de cenário, que era o único workflow no código, entra como primeiro
-- registro — com as mesmas chaves de antes.

-- 1. As tabelas.
-- CreateTable
CREATE TABLE "tipo_geracao" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "saida" "tipo_output" NOT NULL DEFAULT 'IMAGEM',
    "tipos_asset" "tipo_asset"[] DEFAULT ARRAY[]::"tipo_asset"[],
    "shot" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tipo_geracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo_geracao_id" UUID NOT NULL,
    "ferramenta" TEXT NOT NULL DEFAULT 'comfyui',
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "notas" TEXT,
    "origem" TEXT,
    "modelo" TEXT,
    "grafo" JSONB NOT NULL,
    "campos" JSONB NOT NULL DEFAULT '[]',
    "saidas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_geracao_chave_key" ON "tipo_geracao"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_chave_key" ON "workflow"("chave");

-- CreateIndex
CREATE INDEX "workflow_tipo_geracao_id_idx" ON "workflow"("tipo_geracao_id");

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_tipo_geracao_id_fkey" FOREIGN KEY ("tipo_geracao_id") REFERENCES "tipo_geracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 2. A Placa de cenário, que até aqui era código (geracao/workflows/placa-cenario-zimage.ts),
--    vira o primeiro tipo e o primeiro workflow cadastrados — com as MESMAS
--    chaves: os outputs já gerados e o assistente continuam ligados a eles.
--    O grafo e os campos foram gerados do código, e a montagem genérica foi
--    conferida contra o montar antigo antes de escrever isto.
INSERT INTO "tipo_geracao" ("id", "chave", "nome", "descricao", "saida", "tipos_asset", "shot", "editado_em")
VALUES (gen_random_uuid(), 'placa-cenario', 'Placa de cenário',
        'O lugar, vazio, sem pessoa nenhuma: plate de ambiente ou base para pôr personagens dentro depois.',
        'IMAGEM', ARRAY['CENARIO']::"tipo_asset"[], false, CURRENT_TIMESTAMP);

INSERT INTO "workflow" ("id", "chave", "tipo_geracao_id", "ferramenta", "nome", "descricao", "notas", "origem", "modelo", "grafo", "campos", "saidas", "editado_em")
SELECT gen_random_uuid(), 'placa-cenario-zimage', t."id", 'comfyui', 'Placa de cenário 16:9 (Z-Image Turbo)',
       'Só texto → um lugar, sem pessoa nenhuma. A saída serve de 2ª imagem do first frame com 2 referências, ou de plate de ambiente para abrir a cena.',
       '## Placa de cenario 16:9 (Z-Image Turbo)

So texto -> um lugar, **sem pessoa nenhuma**. E o modo C da skill
`first-frame-director`.

### Para que serve

Gerar o cenario que ainda nao existe em foto. A saida vira a **2a imagem** do
workflow `First frame 16-9 com 2 referencias` -- primeiro se inventa o lugar
aqui, depois se poe a pessoa dentro dele la.

Tambem serve como plate de ambiente solto, para abertura de cena.

### O prompt aqui e diferente

Sem referencia nenhuma, **o texto e tudo que existe**. Por isso o alvo da skill
para este modo e 280-450 palavras, contra 150-250 dos modos com foto.

Quatro paragrafos: o plano -> o lugar (materiais, desgaste, set dressing) ->
luz e atmosfera -> o fecho fotografico.

⚠️ **`true atmospheric perspective with visible haze between the planes` e
obrigatorio.** E a frase que mais combate o look de videogame: forca
profundidade em varios planos em vez de encenacao num plano so. Num plate de
ambiente, sem ela o fundo vira papel de parede.

Sem negacao (`no`, `not`, `without`), sem aspect ratio no texto, em ingles.

### Os numeros, e de onde vieram

Todos do template oficial `image_z_image_turbo.json`, nenhum foi chutado.

| Widget | Valor |
|---|---|
| `steps` | 8 |
| `cfg` | 1.0 |
| sampler / scheduler | `res_multistep` / `simple` |
| `shift` | 3.0 |
| resolucao | 1024x1024 no template; aqui 1280x720 para casar com o 16:9 do projeto |

### ⚠️ O `type` do CLIPLoader e `lumina2`

O `qwen_3_4b.safetensors` serve a **tres** modelos com `type` diferente:

| Modelo | `type` |
|---|---|
| **Z-Image** | **`lumina2`** |
| FLUX.2 klein | `flux2` |

Errar o type nao da erro claro -- da imagem ruim. E a armadilha deste workflow.

### ⚠️ cfg 1.0: o negativo nao existe

Nem ha um no de texto negativo aqui -- o `ConditioningZeroOut` zera o proprio
positivo e entrega isso ao slot negativo do KSampler. E o que o template oficial
faz. Escrever negacao nao adianta em lugar nenhum deste grafo.

### Modelos

`z_image_turbo_bf16` (11 GB) + `qwen_3_4b` como `lumina2` + `ae.safetensors`.

Nada a ver com o trio do Qwen Edit: alternar entre este workflow e os de first
frame **recarrega o modelo**. Gere os plates todos de uma vez.
',
       'Placa de cenario 16-9 (Z-Image Turbo).json', 'z_image_turbo_bf16.safetensors',
       '{"1":{"class_type":"UNETLoader","inputs":{"unet_name":"z_image_turbo_bf16.safetensors","weight_dtype":"default"}},"2":{"class_type":"ModelSamplingAuraFlow","inputs":{"model":["1",0],"shift":3,"sampling":"flow"},"_meta":{"title":"shift 3"}},"3":{"class_type":"CLIPLoader","inputs":{"clip_name":"qwen_3_4b.safetensors","type":"lumina2","device":"default"},"_meta":{"title":"type = lumina2 (NAO flux2)"}},"4":{"class_type":"VAELoader","inputs":{"vae_name":"ae.safetensors"}},"5":{"class_type":"CLIPTextEncode","inputs":{"text":"","clip":["3",0]},"_meta":{"title":"O CENARIO"}},"6":{"class_type":"ConditioningZeroOut","inputs":{"conditioning":["5",0]},"_meta":{"title":"negativo zerado - cfg 1 ignora texto"}},"7":{"class_type":"EmptySD3LatentImage","inputs":{"width":1280,"height":720,"batch_size":1}},"8":{"class_type":"KSampler","inputs":{"model":["2",0],"seed":0,"steps":8,"cfg":1,"sampler_name":"res_multistep","scheduler":"simple","positive":["5",0],"negative":["6",0],"latent_image":["7",0],"denoise":1}},"9":{"class_type":"VAEDecode","inputs":{"samples":["8",0],"vae":["4",0]}},"10":{"class_type":"SaveImage","inputs":{"images":["9",0],"filename_prefix":"creativa/placa-cenario"},"_meta":{"title":"A PLACA DE CENARIO"}}}'::jsonb,
       '[{"tipo":"texto","chave":"prompt","rotulo":"Prompt","dica":"Em inglês. Sem referência nenhuma, o texto é tudo que existe: 280–450 palavras em quatro parágrafos — o plano → o lugar (materiais, desgaste, set dressing) → luz e atmosfera → o fecho fotográfico. Sem negação e sem aspect ratio no texto.","alvos":[{"no":"5","entrada":"text"}],"linhas":16,"obrigatorio":true,"palavras":{"min":280,"max":450},"avisos":[{"quando":"falta","padrao":"true atmospheric perspective with visible haze between the planes","mensagem":"Falta “true atmospheric perspective with visible haze between the planes” — é a frase que mais combate o look de videogame; sem ela o fundo vira papel de parede."},{"quando":"tem","padrao":"\\b(no|not|without)\\b","mensagem":"Tem negação (no / not / without): com cfg 1 o negativo não existe, e negar no positivo costuma trazer a coisa para a imagem."},{"quando":"tem","padrao":"\\b\\d+\\s*:\\s*\\d+\\b|aspect ratio","mensagem":"Tem aspect ratio no texto — o tamanho já vem do campo Tamanho."}],"assistivel":true},{"tipo":"tamanho","chave":"tamanho","rotulo":"Tamanho","largura":[{"no":"7","entrada":"width"}],"altura":[{"no":"7","entrada":"height"}],"opcoes":[{"valor":"1280x720","rotulo":"1280 × 720 (16:9, o do workflow)","largura":1280,"altura":720},{"valor":"1920x1080","rotulo":"1920 × 1080 (16:9 Full HD, mais lento)","largura":1920,"altura":1080}],"padrao":"1280x720"},{"tipo":"seed","chave":"seed","rotulo":"Seed","alvos":[{"no":"8","entrada":"seed"}]}]'::jsonb,
       ARRAY['10']::TEXT[], CURRENT_TIMESTAMP
FROM "tipo_geracao" t WHERE t."chave" = 'placa-cenario';
