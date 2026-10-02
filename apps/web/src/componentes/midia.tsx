import { FileText, Film, ImageIcon } from "lucide-react";
import { urlArquivo } from "../api.ts";
import type { TipoReferencia } from "../tipos.ts";

/**
 * A miniatura de uma referência ou output: a imagem, o primeiro quadro do
 * vídeo, ou o começo do texto. Preenche o quadro que a contém.
 */
export function Miniatura({
  tipo,
  arquivo,
  texto,
  ajuste = "cover",
}: {
  tipo: TipoReferencia | "AUDIO" | "OUTRO";
  arquivo: string | null;
  texto?: string | null;
  ajuste?: "cover" | "contain";
}) {
  const classe = `size-full ${ajuste === "cover" ? "object-cover" : "object-contain"}`;
  if (tipo === "IMAGEM" && arquivo) {
    return <img src={urlArquivo(arquivo)} alt="" loading="lazy" className={classe} />;
  }
  if (tipo === "VIDEO" && arquivo) {
    // `#t=0.1` faz o navegador mostrar um quadro em vez de um retângulo preto.
    return <video src={`${urlArquivo(arquivo)}#t=0.1`} preload="metadata" muted className={classe} />;
  }
  if (tipo === "TEXTO") {
    return (
      <div className="size-full overflow-hidden bg-zinc-900 p-3 text-left text-xs leading-relaxed whitespace-pre-wrap text-zinc-400">
        {texto?.slice(0, 400)}
      </div>
    );
  }
  return (
    <div className="flex size-full items-center justify-center bg-zinc-900 text-zinc-600">
      {tipo === "VIDEO" ? <Film className="size-8" /> : <ImageIcon className="size-8" />}
    </div>
  );
}

export const ICONE_TIPO_REFERENCIA = { IMAGEM: ImageIcon, VIDEO: Film, TEXTO: FileText };
