import type { DefWorkflow } from "../definicoes.ts";

/**
 * Placa de cenário 16:9 com Z-Image Turbo — só texto → um lugar, sem pessoa
 * nenhuma.
 *
 * Tradução nó a nó de `Placa de cenario 16-9 (Z-Image Turbo).json` (no
 * ComfyUI, em user/default/workflows), que por sua vez segue o template
 * oficial `image_z_image_turbo.json`. Os ids dos nós são os mesmos do
 * arquivo, para dar para comparar um com o outro.
 *
 * Fixos de propósito (a nota LEIA-ME do workflow explica cada um):
 * - steps 8, cfg 1.0, res_multistep/simple, shift 3 — do template oficial;
 * - CLIPLoader com type `lumina2`: o qwen_3_4b serve a vários modelos, e o
 *   type errado não dá erro, dá imagem ruim. Travado aqui, não tem como errar;
 * - sem negativo: com cfg 1 o ConditioningZeroOut zera o positivo e o
 *   entrega ao slot negativo — escrever negação não adianta em lugar nenhum.
 */

const TAMANHOS: Record<string, [number, number]> = {
  "1280x720": [1280, 720],
  "1920x1080": [1920, 1080],
};

export const placaCenarioZImage: DefWorkflow = {
  chave: "placa-cenario-zimage",
  tipo: "placa-cenario",
  nome: "Placa de cenário 16:9 (Z-Image Turbo)",
  descricao:
    "Só texto → um lugar, sem pessoa nenhuma. A saída serve de 2ª imagem do first frame com 2 referências, ou de plate de ambiente para abrir a cena.",
  arquivoComfy: "Placa de cenario 16-9 (Z-Image Turbo).json",
  modelo: "z_image_turbo_bf16.safetensors",
  campos: [
    {
      tipo: "texto",
      chave: "prompt",
      rotulo: "Prompt",
      linhas: 16,
      obrigatorio: true,
      palavras: { min: 280, max: 450 },
      dica:
        "Em inglês. Sem referência nenhuma, o texto é tudo que existe: 280–450 palavras em quatro parágrafos — o plano → o lugar (materiais, desgaste, set dressing) → luz e atmosfera → o fecho fotográfico. Sem negação e sem aspect ratio no texto.",
      avisos: [
        {
          quando: "falta",
          padrao: "true atmospheric perspective with visible haze between the planes",
          mensagem:
            "Falta “true atmospheric perspective with visible haze between the planes” — é a frase que mais combate o look de videogame; sem ela o fundo vira papel de parede.",
        },
        {
          quando: "tem",
          padrao: "\\b(no|not|without)\\b",
          mensagem: "Tem negação (no / not / without): com cfg 1 o negativo não existe, e negar no positivo costuma trazer a coisa para a imagem.",
        },
        {
          quando: "tem",
          padrao: "\\b\\d+\\s*:\\s*\\d+\\b|aspect ratio",
          mensagem: "Tem aspect ratio no texto — o tamanho já vem do campo Tamanho.",
        },
      ],
    },
    {
      tipo: "opcoes",
      chave: "tamanho",
      rotulo: "Tamanho",
      padrao: "1280x720",
      opcoes: [
        { valor: "1280x720", rotulo: "1280 × 720 (16:9, o do workflow)" },
        { valor: "1920x1080", rotulo: "1920 × 1080 (16:9 Full HD, mais lento)" },
      ],
    },
    { tipo: "seed", chave: "seed", rotulo: "Seed" },
  ],
  saidas: ["10"],
  montar: (v) => {
    const [largura, altura] = TAMANHOS[String(v.tamanho)] ?? TAMANHOS["1280x720"]!;
    return {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "z_image_turbo_bf16.safetensors", weight_dtype: "default" },
      },
      "2": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 3, sampling: "flow" },
        _meta: { title: "shift 3" },
      },
      "3": {
        class_type: "CLIPLoader",
        inputs: { clip_name: "qwen_3_4b.safetensors", type: "lumina2", device: "default" },
        _meta: { title: "type = lumina2 (NAO flux2)" },
      },
      "4": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
      "5": {
        class_type: "CLIPTextEncode",
        inputs: { text: String(v.prompt), clip: ["3", 0] },
        _meta: { title: "O CENARIO" },
      },
      "6": {
        class_type: "ConditioningZeroOut",
        inputs: { conditioning: ["5", 0] },
        _meta: { title: "negativo zerado - cfg 1 ignora texto" },
      },
      "7": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: largura, height: altura, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["2", 0],
          seed: Number(v.seed),
          steps: 8,
          cfg: 1,
          sampler_name: "res_multistep",
          scheduler: "simple",
          positive: ["5", 0],
          negative: ["6", 0],
          latent_image: ["7", 0],
          denoise: 1,
        },
      },
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["4", 0] } },
      "10": {
        class_type: "SaveImage",
        // Uma pasta só do Creativa dentro do output do ComfyUI: o original fica
        // lá também, mas o que vale é a cópia em D:\Creativa.
        inputs: { images: ["9", 0], filename_prefix: "creativa/placa-cenario" },
        _meta: { title: "A PLACA DE CENARIO" },
      },
    };
  },
};
