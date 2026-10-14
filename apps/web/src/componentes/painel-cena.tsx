import { Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { cenasApi } from "../api.ts";
import type { Cena, ShotResumo } from "../tipos.ts";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { ListaOrdenavel, movido } from "./ordenavel.tsx";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Secao } from "./ui.tsx";

/*
 * O painel da cena, aberto pela barra da cena — é o que sobrou no lugar da
 * página de cena, que saiu por não valer uma tela inteira. Aqui mora tudo o
 * que não é "abrir um shot": storyboard, ordem dos shots, nome, descrição e
 * excluir a cena.
 */

/** Quem abre é o nome da cena na barra — não há botão próprio. */
export function ModalPainelCena({
  cena,
  aberto,
  aoFechar,
  aoSalvar,
  aoMudarShots,
  unica,
}: {
  cena: Cena | null;
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: (c: Cena) => void;
  aoMudarShots: () => void;
  /** É a única cena do vídeo? Então não dá para excluir. */
  unica: boolean;
}) {
  if (!cena) return null;
  return (
    <Modal aberto={aberto} titulo={cena.nome} largura="enorme" aoFechar={aoFechar}>
      <PainelCena cena={cena} aoSalvar={aoSalvar} aoMudarShots={aoMudarShots} aoFechar={aoFechar} unica={unica} />
    </Modal>
  );
}

function PainelCena({
  cena,
  aoSalvar,
  aoMudarShots,
  aoFechar,
  unica,
}: {
  cena: Cena;
  aoSalvar: (c: Cena) => void;
  aoMudarShots: () => void;
  aoFechar: () => void;
  unica: boolean;
}) {
  const navegar = useNavigate();
  const [excluindo, setExcluindo] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-[1fr_24rem] gap-8">
        <Storyboard cena={cena} aoSalvar={aoSalvar} />
        <div className="flex flex-col gap-8">
          <Identidade cena={cena} aoSalvar={aoSalvar} />
          <Shots cena={cena} aoSalvar={aoSalvar} aoMudarShots={aoMudarShots} aoFechar={aoFechar} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800 pt-5">
        <p className="text-sm text-zinc-500">
          {unica
            ? "Esta é a única cena do vídeo, e todo vídeo precisa de pelo menos uma. Crie outra antes de excluir esta."
            : "Excluir a cena leva os shots dela. Shot com referência ou geração barra a exclusão."}
        </p>
        <Botao
          variante="perigo"
          icone={<Trash className="size-4" />}
          disabled={unica}
          title={unica ? "Todo vídeo precisa de pelo menos uma cena" : undefined}
          onClick={() => setExcluindo(true)}
        >
          Excluir cena
        </Botao>
      </div>
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir cena"
        texto={
          <>
            A cena <b>{cena.nome}</b> e os shots dela serão excluídos. Se algum shot tiver referências ou gerações,
            exclua-as antes.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await cenasApi.apagar(cena.id);
          navegar(cena.video ? `/videos/${cena.video.id}` : "/cenas");
        }}
      />
    </div>
  );
}

/** Nome e descrição curta da cena. */
function Identidade({ cena, aoSalvar }: { cena: Cena; aoSalvar: (c: Cena) => void }) {
  const [nome, setNome] = useState(cena.nome);
  const [descricao, setDescricao] = useState(cena.descricao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setNome(cena.nome);
    setDescricao(cena.descricao ?? "");
  }, [cena.nome, cena.descricao]);
  const mudou = nome !== cena.nome || descricao !== (cena.descricao ?? "");

  return (
    <Secao
      titulo="A cena"
      acoes={
        <Botao
          variante="primario"
          disabled={!mudou || !nome.trim()}
          carregando={salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            try {
              aoSalvar(
                await cenasApi.salvar(cena.id, {
                  nome,
                  projetoId: cena.projetoId,
                  videoId: cena.videoId,
                  descricao: descricao || null,
                  storyboard: cena.storyboard,
                }),
              );
            } catch (e) {
              setErro((e as Error).message);
            } finally {
              setSalvando(false);
            }
          }}
        >
          {mudou ? "Salvar" : "Salvo"}
        </Botao>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Descrição">
          <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} className="min-h-24" />
        </Campo>
      </div>
    </Secao>
  );
}

/** Storyboard em texto livre, com "Salvar" que só acende quando há mudança. */
function Storyboard({ cena, aoSalvar }: { cena: Cena; aoSalvar: (c: Cena) => void }) {
  const [texto, setTexto] = useState(cena.storyboard);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setTexto(cena.storyboard), [cena.storyboard]);
  const mudou = texto !== cena.storyboard;

  return (
    <Secao
      titulo="Storyboard"
      acoes={
        <Botao
          variante="primario"
          disabled={!mudou}
          carregando={salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            try {
              aoSalvar(
                await cenasApi.salvar(cena.id, {
                  nome: cena.nome,
                  projetoId: cena.projetoId,
                  videoId: cena.videoId,
                  descricao: cena.descricao,
                  storyboard: texto,
                }),
              );
            } catch (e) {
              setErro((e as Error).message);
            } finally {
              setSalvando(false);
            }
          }}
        >
          {mudou ? "Salvar storyboard" : "Salvo"}
        </Botao>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      <AreaTexto
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={"Roteiro, planos, intenção da cena...\n\nShot 1 — plano aberto da ponte ao entardecer\nShot 2 — close na mão de Camila"}
        className="min-h-[48vh] font-mono text-[13px]"
      />
    </Secao>
  );
}

/** A ordem dos shots: o único lugar em que ela se muda. A barra só navega. */
function Shots({
  cena,
  aoSalvar,
  aoMudarShots,
  aoFechar,
}: {
  cena: Cena;
  aoSalvar: (c: Cena) => void;
  aoMudarShots: () => void;
  aoFechar: () => void;
}) {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const shots = cena.shots;

  function trocarShots(novos: ShotResumo[]) {
    aoSalvar({ ...cena, shots: novos });
  }

  async function mover(i: number, delta: -1 | 1) {
    const nova = movido(shots, i, delta);
    trocarShots(nova); // otimista: a lista mexe na hora
    try {
      trocarShots(await cenasApi.reordenar(cena.id, nova.map((x) => x.id)));
      aoMudarShots();
    } catch (e) {
      setErro((e as Error).message);
      trocarShots(shots);
    }
  }

  return (
    <Secao
      titulo={`Shots (${shots.length})`}
      acoes={
        <Botao
          variante="primario"
          icone={<Plus className="size-4" />}
          carregando={criando}
          onClick={async () => {
            setCriando(true);
            setErro(null);
            try {
              const novo = await cenasApi.novoShot(cena.id);
              aoMudarShots();
              aoFechar();
              navegar(`/shots/${novo.id}`);
            } catch (e) {
              setErro((e as Error).message);
            } finally {
              setCriando(false);
            }
          }}
        >
          Novo shot
        </Botao>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      <ListaOrdenavel
        itens={shots}
        aoMover={mover}
        linha={(s) => (
          <Link to={`/shots/${s.id}`} onClick={aoFechar} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
            <span className="truncate font-medium">{s.nome}</span>
            {s.descricao && <span className="line-clamp-2 text-sm text-zinc-400">{s.descricao}</span>}
            <span className="text-xs text-zinc-500">
              {s._count.referencias} referências · {s._count.outputs} outputs
            </span>
          </Link>
        )}
      />
    </Secao>
  );
}
