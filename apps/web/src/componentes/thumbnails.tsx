import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/*
 * Ocultar as thumbnails — como o olho que esconde o saldo nos apps de banco.
 *
 * O que some é o conteúdo gerado: as imagens e os vídeos servidos de
 * `/api/arquivos/`. O resto da tela (nomes, prompts, o ícone do app) fica —
 * é só o visual que pesa numa tela compartilhada.
 *
 * A escolha é desta máquina, não do projeto: mora no `localStorage`, não no
 * banco. E quem esconde é uma regra de CSS presa a um atributo no `<html>`:
 * assim pega toda imagem de conteúdo, inclusive a que alguém acrescentar
 * depois, sem precisar passar por componente nenhum.
 */

const CHAVE = "creativa:thumbs-ocultas";

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    // Navegador com armazenamento bloqueado: segue à vista, como sempre foi.
    return false;
  }
}

export function BotaoThumbnails() {
  const [ocultas, setOcultas] = useState(lerPreferencia);

  // O atributo no <html> é o que liga a regra do app.css.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-thumbs-ocultas", ocultas);
    try {
      localStorage.setItem(CHAVE, ocultas ? "1" : "0");
    } catch {
      // Sem onde guardar: vale só nesta sessão.
    }
  }, [ocultas]);

  const alternar = useCallback(() => setOcultas((o) => !o), []);
  const Icone = ocultas ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={ocultas}
      title={ocultas ? "Mostrar as imagens" : "Ocultar as imagens (nomes e prompts ficam)"}
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
        ocultas
          ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
          : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      }`}
    >
      <Icone className="size-3.5" />
      {ocultas ? "Ocultas" : "Imagens"}
    </button>
  );
}
