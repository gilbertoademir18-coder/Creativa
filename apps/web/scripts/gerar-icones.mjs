/**
 * Gera os ícones do app a partir de uma única definição em SVG.
 *
 * Rode com `npm run icons` sempre que mudar a marca. Os arquivos vão para
 * `public/` com nomes fixos, porque o ícone da bandeja (`scripts/tray.ps1`,
 * na raiz) aponta para o `icon-192.png` pelo nome.
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const PASTA = new URL("../public/", import.meta.url);

/**
 * A marca: um brilho de quatro pontas, com um menor ao lado — criação, sem
 * dizer se é vídeo, imagem ou som. O Creativa faz os três.
 */
function svg() {
  const brilho = (cx, cy, r) => {
    const c = r * 0.18;
    return `M${cx} ${cy - r} C${cx + c} ${cy - c} ${cx + c} ${cy - c} ${cx + r} ${cy}
            C${cx + c} ${cy + c} ${cx + c} ${cy + c} ${cx} ${cy + r}
            C${cx - c} ${cy + c} ${cx - c} ${cy + c} ${cx - r} ${cy}
            C${cx - c} ${cy - c} ${cx - c} ${cy - c} ${cx} ${cy - r} Z`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#db2777"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#fundo)"/>
  <path d="${brilho(232, 280, 170)}" fill="#fdf4ff"/>
  <path d="${brilho(384, 132, 70)}" fill="#fdf4ff" opacity="0.85"/>
</svg>`;
}

const ALVOS = [
  { arquivo: "icon-192.png", tamanho: 192 },
  { arquivo: "icon-512.png", tamanho: 512 },
];

await mkdir(PASTA, { recursive: true });
await writeFile(new URL("favicon.svg", PASTA), svg());
console.log("✓ favicon.svg");

for (const { arquivo, tamanho } of ALVOS) {
  const png = await sharp(Buffer.from(svg())).resize(tamanho, tamanho).png().toBuffer();
  await writeFile(new URL(arquivo, PASTA), png);
  console.log(`✓ ${arquivo} (${tamanho}×${tamanho}, ${png.length} bytes)`);
}
