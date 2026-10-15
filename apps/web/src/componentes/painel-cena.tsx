import { Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { cenasApi, listasApi } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { comNumero, paraCampo, titulo } from "../rotulos.ts";
import type { Cena, ShotResumo } from "../tipos.ts";
import { ModalDocumento } from "./documento-markdown.tsx";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { ListaOrdenavel, movido } from "./ordenavel.tsx";
import { PainelMarcacao } from "./blockout.tsx";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Secao, Seletor } from "./ui.tsx";

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
  numero,
}: {
  cena: Cena | null;
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: (c: Cena) => void;
  aoMudarShots: () => void;
  /** É a única cena do vídeo? Então não dá para excluir. */
  unica: boolean;
  /** A posição da cena no vídeo: é o que identifica quando não há nome. */
  numero: number;
}) {
  if (!cena) return null;
  // comNumero e não titulo(): este já devolve "Cena 2", e daria "Cena: Cena 2".
  return (
    <Modal aberto={aberto} titulo={`Cena: ${comNumero(cena.nome, numero)}`} largura="enorme" aoFechar={aoFechar}>
      <PainelCena cena={cena} aoSalvar={aoSalvar} aoMudarShots={aoMudarShots} aoFechar={aoFechar} unica={unica} numero={numero} />
    </Modal>
  );
}

function PainelCena({
  cena,
  aoSalvar,
  aoMudarShots,
  aoFechar,
  unica,
  numero,
}: {
  cena: Cena;
  aoSalvar: (c: Cena) => void;
  aoMudarShots: () => void;
  aoFechar: () => void;
  unica: boolean;
  numero: number;
}) {
  const navegar = useNavigate();
  const [excluindo, setExcluindo] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      {/* Mesma planta do painel do vídeo: a lista do que vem dentro à esquerda,
          em destaque; identidade e documento longo na coluna estreita. */}
      <div className="grid grid-cols-[1fr_24rem] gap-8">
        <Shots cena={cena} aoSalvar={aoSalvar} aoMudarShots={aoMudarShots} aoFechar={aoFechar} />
        <div className="flex flex-col gap-8">
          <Identidade cena={cena} aoSalvar={aoSalvar} aoMudarVideo={aoMudarShots} numero={numero} />
          <Storyboard cena={cena} aoSalvar={aoSalvar} numero={numero} />
          <PainelMarcacao cena={cena} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-5">
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
            A cena <b>{titulo("Cena", cena.nome, numero)}</b> e os shots dela serão excluídos. Se algum shot tiver referências ou gerações,
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

/** Nome, descrição curta e em que vídeo do projeto a cena entra. */
function Identidade({
  cena,
  aoSalvar,
  aoMudarVideo,
  numero,
}: {
  cena: Cena;
  aoSalvar: (c: Cena) => void;
  /** Trocar de vídeo muda a barra inteira: ela tem de recarregar. */
  aoMudarVideo: () => void;
  numero: number;
}) {
  const [nome, setNome] = useState(paraCampo(cena.nome));
  const [descricao, setDescricao] = useState(cena.descricao ?? "");
  const [videoId, setVideoId] = useState(cena.videoId ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setNome(paraCampo(cena.nome));
    setDescricao(cena.descricao ?? "");
    setVideoId(cena.videoId ?? "");
  }, [cena.nome, cena.descricao, cena.videoId]);

  // Os vídeos entre os quais dá para mover: os do projeto da cena. Cena sem
  // projeto não tem a que vídeo pertencer — vídeo é sempre de uma lista de um.
  const { dados: listas } = useCarregar(
    () => (cena.projetoId ? listasApi.listar(cena.projetoId) : Promise.resolve([])),
    [cena.projetoId],
  );
  const comVideos = (listas ?? []).filter((l) => l.videos.length > 0);
  const mudou =
    nome !== paraCampo(cena.nome) || descricao !== (cena.descricao ?? "") || videoId !== (cena.videoId ?? "");

  return (
    <Secao
      titulo="A cena"
      acoes={
        <Botao
          variante="primario"
          disabled={!mudou}
          carregando={salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            try {
              const trocouDeVideo = videoId !== (cena.videoId ?? "");
              aoSalvar(
                await cenasApi.salvar(cena.id, {
                  nome: nome.trim() || null,
                  projetoId: cena.projetoId,
                  videoId: videoId || null,
                  descricao: descricao || null,
                  storyboard: cena.storyboard,
                }),
              );
              if (trocouDeVideo) aoMudarVideo();
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
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`Sem nome — o número (${numero}) identifica`} />
        </Campo>
        <Campo
          rotulo="Vídeo"
          dica={
            !cena.projetoId
              ? "A cena não está num projeto, e vídeo é sempre de um."
              : comVideos.length === 0
                ? "Este projeto ainda não tem vídeo nenhum. Crie um em Vídeos."
                : "Sem vídeo, a cena fica em “Cenas sem vídeo” do projeto."
          }
        >
          <Seletor
            value={videoId}
            disabled={!cena.projetoId || comVideos.length === 0}
            onChange={(e) => setVideoId(e.target.value)}
          >
            <option value="">— Sem vídeo —</option>
            {comVideos.map((l) => (
              <optgroup key={l.id} label={l.nome}>
                {l.videos.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    {i + 1}. {v.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </Seletor>
        </Campo>
        <Campo rotulo="Descrição">
          <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} className="min-h-24" />
        </Campo>
      </div>
    </Secao>
  );
}

/**
 * O storyboard abre no editor de documento, como a sinopse do vídeo: texto
 * longo merece a tela inteira, e aqui fica só o começo dele.
 */
function Storyboard({ cena, aoSalvar, numero }: { cena: Cena; aoSalvar: (c: Cena) => void; numero: number }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Secao
      titulo="Storyboard"
      acoes={<Botao onClick={() => setAberto(true)}>{cena.storyboard ? "Abrir" : "Escrever"}</Botao>}
    >
      <p className="line-clamp-6 text-sm whitespace-pre-wrap text-zinc-400">
        {cena.storyboard || "Sem storyboard. Roteiro, planos, intenção da cena..."}
      </p>
      <ModalDocumento
        titulo={`Storyboard — ${titulo("Cena", cena.nome, numero)}`}
        valor={cena.storyboard || null}
        placeholder={"Roteiro, planos, intenção da cena...\n\nShot 1 — plano aberto da ponte ao entardecer\nShot 2 — close na mão de Camila"}
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoSalvar={async (texto) => {
          aoSalvar(
            await cenasApi.salvar(cena.id, {
              nome: cena.nome,
              projetoId: cena.projetoId,
              videoId: cena.videoId,
              descricao: cena.descricao,
              storyboard: texto ?? "",
            }),
          );
          setAberto(false);
        }}
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
        linha={(s, i) => (
          <Link to={`/shots/${s.id}`} onClick={aoFechar} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
            <span className={`truncate ${s.nome ? "font-medium" : "text-zinc-500 italic"}`}>{s.nome ?? "sem nome"}</span>
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
