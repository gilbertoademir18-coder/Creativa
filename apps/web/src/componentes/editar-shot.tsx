import { Pencil, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { shotsApi } from "../api.ts";
import { paraCampo, titulo } from "../rotulos.ts";
import type { Cena, ShotResumo } from "../tipos.ts";
import { SeletorPipeline } from "./etapas.tsx";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { AreaTexto, Aviso, Botao, Campo, Entrada } from "./ui.tsx";

/*
 * "Editar shot" mora na barra da cena, e edita o shot aceso nela — a página do
 * shot é só o Gerador e as referências. Excluir fica aqui dentro, e não na
 * barra: a barra já tem o excluir da cena, e dois botões de excluir lado a lado
 * seria pedir para alguém apagar a coisa errada.
 */

export function BotaoEditarShot({
  cena,
  shotId,
  aoMudar,
  aberto,
  setAberto,
}: {
  cena: Cena | null;
  /** O shot aceso na barra (vem da URL). */
  shotId: string | undefined;
  aoMudar: () => void;
  /** Quem guarda o aberto é a barra: clicar de novo no shot aceso também abre. */
  aberto: boolean;
  setAberto: (aberto: boolean) => void;
}) {
  // Pelo mesmo motivo da barra: o botão nunca desmonta, então trocar de shot
  // tem de fechar o modal — senão ele ressurge sozinho ao voltar à página.
  useEffect(() => setAberto(false), [shotId]);
  // O número é a POSIÇÃO na cena, não o campo ordem: apagar um shot do meio
  // deixa buraco na ordem guardada, e a barra conta pela posição.
  const indice = cena?.shots.findIndex((s) => s.id === shotId) ?? -1;
  const shot = indice >= 0 ? cena!.shots[indice]! : null;
  const numero = indice + 1;

  return (
    <>
      <Botao icone={<Pencil className="size-4" />} disabled={!shot} onClick={() => setAberto(true)}>
        Editar shot
      </Botao>
      {shot && (
        <Modal aberto={aberto} titulo={`Editar ${titulo("Shot", shot.nome, numero)}`} aoFechar={() => setAberto(false)}>
          <FormShot
            shot={shot}
            pipelineDoProjeto={cena?.projeto?.pipelinePadrao ?? null}
            unico={(cena?.shots.length ?? 0) <= 1}
            cenaId={cena!.id}
            numero={numero}
            aoPronto={() => {
              setAberto(false);
              aoMudar();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function FormShot({
  shot,
  pipelineDoProjeto,
  unico,
  cenaId,
  numero,
  aoPronto,
}: {
  shot: ShotResumo;
  /** O padrão do projeto, para o rótulo do "herdar". */
  pipelineDoProjeto: string | null;
  unico: boolean;
  cenaId: string;
  /** A posição do shot na cena: é o que identifica quando não há nome. */
  numero: number;
  aoPronto: () => void;
}) {
  const navegar = useNavigate();
  const [nome, setNome] = useState(paraCampo(shot.nome));
  const [descricao, setDescricao] = useState(shot.descricao ?? "");
  const [pipeline, setPipeline] = useState(shot.pipeline);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  useEffect(() => {
    setNome(paraCampo(shot.nome));
    setDescricao(shot.descricao ?? "");
    setPipeline(shot.pipeline);
  }, [shot.id, shot.nome, shot.descricao, shot.pipeline]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
          await shotsApi.salvar(shot.id, { nome: nome.trim() || null, descricao: descricao || null, pipeline });
          aoPronto();
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder={`Sem nome — o número (${numero}) identifica`} />
      </Campo>
      <Campo rotulo="Descrição">
        <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} placeholder="Enquadramento, ação, câmera..." />
      </Campo>
      <Campo rotulo="Pipeline" dica="As etapas do Gerador deste shot — o primeiro quadro e o vídeo, por exemplo.">
        <SeletorPipeline valor={pipeline} aoMudar={setPipeline} heranca={{ chave: pipelineDoProjeto }} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-4">
        <Botao
          variante="perigo"
          icone={<Trash className="size-4" />}
          disabled={unico}
          title={unico ? "Toda cena precisa de pelo menos um shot" : undefined}
          onClick={() => setExcluindo(true)}
        >
          Excluir shot
        </Botao>
        <Botao type="submit" variante="primario" carregando={salvando}>
          Salvar
        </Botao>
      </div>
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir shot"
        texto={
          <>
            O shot <b>{titulo("Shot", shot.nome, numero)}</b> será excluído. Se ele tiver referências ou outputs, exclua-os antes.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await shotsApi.apagar(shot.id);
          aoPronto();
          // Sem página de cena: /cenas/<id> manda para o shot que sobrou.
          navegar(`/cenas/${cenaId}`);
        }}
      />
    </form>
  );
}
