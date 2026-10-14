import {
  BookOpen,
  Camera,
  Cat,
  Clapperboard,
  Drama,
  Film,
  FolderKanban,
  Gamepad2,
  Ghost,
  Heart,
  Music,
  Palette,
  Rocket,
  Sparkles,
  Sword,
  Tv,
  type LucideIcon,
} from "lucide-react";

/*
 * Os ícones que um projeto pode vestir — no menu lateral e no cartão.
 *
 * Um catálogo fixo, e não "qualquer ícone do lucide": o banco guarda só a
 * chave, e importar a biblioteca inteira para resolver um nome em tempo de
 * execução custaria caro por um enfeite. Chave que não esteja aqui (de um
 * catálogo antigo, por exemplo) cai no padrão, sem quebrar nada.
 */

export const ICONES_PROJETO: { chave: string; rotulo: string; icone: LucideIcon }[] = [
  { chave: "pasta", rotulo: "Pasta", icone: FolderKanban },
  { chave: "claquete", rotulo: "Claquete", icone: Clapperboard },
  { chave: "filme", rotulo: "Filme", icone: Film },
  { chave: "tv", rotulo: "TV", icone: Tv },
  { chave: "camera", rotulo: "Câmera", icone: Camera },
  { chave: "teatro", rotulo: "Teatro", icone: Drama },
  { chave: "brilho", rotulo: "Brilho", icone: Sparkles },
  { chave: "coracao", rotulo: "Coração", icone: Heart },
  { chave: "fantasma", rotulo: "Fantasma", icone: Ghost },
  { chave: "gato", rotulo: "Gato", icone: Cat },
  { chave: "foguete", rotulo: "Foguete", icone: Rocket },
  { chave: "espada", rotulo: "Espada", icone: Sword },
  { chave: "jogo", rotulo: "Jogo", icone: Gamepad2 },
  { chave: "musica", rotulo: "Música", icone: Music },
  { chave: "paleta", rotulo: "Paleta", icone: Palette },
  { chave: "livro", rotulo: "Livro", icone: BookOpen },
];

/** O ícone de um projeto, com o padrão para quem não escolheu (ou escolheu um que sumiu). */
export function iconeDoProjeto(chave: string | null | undefined): LucideIcon {
  return ICONES_PROJETO.find((i) => i.chave === chave)?.icone ?? FolderKanban;
}

/** A escolha do ícone, no "Editar projeto": uma grade de botões. */
export function EscolhaIcone({ valor, aoMudar }: { valor: string | null; aoMudar: (chave: string) => void }) {
  const atual = valor ?? "pasta";
  return (
    <div className="flex flex-wrap gap-1.5">
      {ICONES_PROJETO.map(({ chave, rotulo, icone: Icone }) => {
        const escolhido = chave === atual;
        return (
          <button
            key={chave}
            type="button"
            onClick={() => aoMudar(chave)}
            title={rotulo}
            aria-label={rotulo}
            aria-pressed={escolhido}
            className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
              escolhido
                ? "border-violet-500 bg-violet-600/20 text-violet-200"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
            }`}
          >
            <Icone className="size-4.5" />
          </button>
        );
      })}
    </div>
  );
}
