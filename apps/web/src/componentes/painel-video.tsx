import { Clapperboard, Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { videosApi } from "../api.ts";
import { caminhoDaCena } from "../caminhos.ts";
import { titulo } from "../rotulos.ts";
import { ModalCena } from "../paginas/cenas.tsx";
import type { Cena, VideoDetalhe } from "../tipos.ts";
import { ModalDocumento } from "./documento-markdown.tsx";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { ListaOrdenavel, movido } from "./ordenavel.tsx";
import { Aviso, Botao, Campo, Entrada, Secao, Vazio } from "./ui.tsx";

/*
 * O painel do vídeo, aberto pela barra — o que sobrou no lugar da página do
 * vídeo, que saiu pelo mesmo motivo da página da cena: entrar nela só para
 * depois clicar numa cena era um pulo a mais. Aqui mora o que não é "abrir uma
 * cena": sinopse, ordem das cenas, nome e excluir.
 */

/** Quem abre é o nome do vídeo na barra — não há botão próprio. */
export function ModalPainelVideo({
  video,
  aberto,
  aoFechar,
  aoMudar,
}: {
  video: VideoDetalhe | null;
  aberto: boolean;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  if (!video) return null;
  return (
    <Modal aberto={aberto} titulo={`Vídeo: ${video.nome}`} largura="enorme" aoFechar={aoFechar}>
      <PainelVideo video={video} aoMudar={aoMudar} aoFechar={aoFechar} />
    </Modal>
  );
}

function PainelVideo({ video, aoMudar, aoFechar }: { video: VideoDetalhe; aoMudar: () => void; aoFechar: () => void }) {
  const navegar = useNavigate();
  const [excluindo, setExcluindo] = useState(false);
  const [comCenas, setComCenas] = useState(false);

  // O que seria apagado junto. Referência e output barram a exclusão da cena
  // (Restrict no banco), então a opção fica fora de alcance se houver algum.
  const shots = video.cenas.flatMap((c) => c.shots);
  const presos = video.cenas.filter((c) => c.shots.some((s) => s._count.referencias > 0 || s._count.outputs > 0));
  const travado = presos.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-[1fr_24rem] gap-8">
        <Cenas video={video} aoMudar={aoMudar} aoFechar={aoFechar} />
        <div className="flex flex-col gap-8">
          <Identidade video={video} aoMudar={aoMudar} />
          <Sinopse video={video} aoMudar={aoMudar} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-5">
        <p className="text-sm text-zinc-500">
          Excluir o vídeo <b>não</b> apaga as cenas: elas voltam para “Cenas sem vídeo” do projeto.
        </p>
        <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
          Excluir vídeo
        </Botao>
      </div>
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir vídeo"
        // Apagar as cenas junto leva trabalho, não só o agrupador: pede a palavra.
        exigirDigitar={comCenas ? "excluir" : undefined}
        rotuloConfirmar={comCenas ? "Excluir vídeo e cenas" : "Excluir vídeo"}
        texto={
          <div className="flex flex-col gap-4">
            <p>
              O vídeo <b>{video.nome}</b> será excluído.
            </p>
            {video.cenas.length > 0 && (
              <>
                <label
                  className={`flex gap-3 rounded-lg border p-3 ${
                    travado
                      ? "cursor-not-allowed border-zinc-800 opacity-60"
                      : "cursor-pointer border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={comCenas}
                    disabled={travado}
                    onChange={(e) => setComCenas(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-red-500"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="font-medium text-zinc-200">
                      Excluir também as {video.cenas.length} cena(s) e {shots.length} shot(s)
                    </span>
                    <span className="text-sm text-zinc-400">
                      {travado
                        ? `Não dá: ${presos.map((c) => `“${titulo("Cena", c.nome, video.cenas.indexOf(c) + 1)}”`).join(", ")} ${presos.length === 1 ? "tem" : "têm"} shots com referências ou outputs. Exclua-os antes.`
                        : "Sem isso, as cenas voltam para “Cenas sem vídeo” do projeto."}
                    </span>
                  </span>
                </label>
                {!comCenas && !travado && (
                  <p className="text-sm text-zinc-500">
                    As cenas <b>não</b> serão apagadas: ficam no projeto, sem vídeo.
                  </p>
                )}
              </>
            )}
          </div>
        }
        aoFechar={() => {
          setExcluindo(false);
          setComCenas(false); // a escolha não sobrevive a um "cancelar"
        }}
        aoConfirmar={async () => {
          await videosApi.apagar(video.id, comCenas);
          navegar(`/projetos/${video.lista.projeto.id}`);
        }}
      />
    </div>
  );
}

/** O nome do vídeo. A lista em que ele está fica como contexto, só de leitura. */
function Identidade({ video, aoMudar }: { video: VideoDetalhe; aoMudar: () => void }) {
  const [nome, setNome] = useState(video.nome);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setNome(video.nome), [video.nome]);
  const mudou = nome !== video.nome;

  return (
    <Secao
      titulo="O vídeo"
      acoes={
        <Botao
          variante="primario"
          disabled={!mudou || !nome.trim()}
          carregando={salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            try {
              await videosApi.salvar(video.id, { nome, descricao: video.descricao });
              aoMudar();
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
        <Campo rotulo="Lista" dica="Para mover o vídeo de lista, use a página do projeto.">
          <Entrada value={video.lista.nome} disabled readOnly />
        </Campo>
      </div>
    </Secao>
  );
}

/** A sinopse é markdown longo: abre no editor de documento, como antes. */
function Sinopse({ video, aoMudar }: { video: VideoDetalhe; aoMudar: () => void }) {
  const [aberta, setAberta] = useState(false);
  return (
    <Secao
      titulo="Sinopse"
      acoes={<Botao onClick={() => setAberta(true)}>{video.descricao ? "Abrir" : "Escrever"}</Botao>}
    >
      <p className="line-clamp-6 text-sm whitespace-pre-wrap text-zinc-400">
        {video.descricao || "Sem sinopse. Roteiro, o que acontece neste vídeo..."}
      </p>
      <ModalDocumento
        titulo={`Sinopse — ${video.nome}`}
        valor={video.descricao}
        placeholder="Sinopse, roteiro, o que acontece neste vídeo... Use # para títulos e - para listas."
        aberto={aberta}
        aoFechar={() => setAberta(false)}
        aoSalvar={async (texto) => {
          await videosApi.salvar(video.id, { nome: video.nome, descricao: texto });
          aoMudar();
          setAberta(false);
        }}
      />
    </Secao>
  );
}

/** A ordem das cenas: o único lugar em que ela se muda. A barra só navega. */
function Cenas({ video, aoMudar, aoFechar }: { video: VideoDetalhe; aoMudar: () => void; aoFechar: () => void }) {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [cenas, setCenas] = useState<Cena[]>(video.cenas);
  useEffect(() => setCenas(video.cenas), [video.cenas]);

  async function mover(i: number, delta: -1 | 1) {
    const ordem = movido(cenas, i, delta);
    setCenas(ordem); // otimista: a lista mexe na hora
    try {
      setCenas(await videosApi.reordenarCenas(video.id, ordem.map((c) => c.id)));
      aoMudar();
    } catch (e) {
      setErro((e as Error).message);
      setCenas(video.cenas);
    }
  }

  return (
    <Secao
      titulo={`Cenas (${cenas.length})`}
      acoes={
        <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNova(true)}>
          Nova cena
        </Botao>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}
      {cenas.length === 0 ? (
        <Vazio
          icone={<Clapperboard />}
          titulo="Nenhuma cena neste vídeo"
          texto="Crie aqui, ou mova uma cena que já existe: no painel dela, escolha este vídeo."
        />
      ) : (
        <ListaOrdenavel
          itens={cenas}
          aoMover={mover}
          linha={(c, i) => (
            <Link to={caminhoDaCena(c)} onClick={aoFechar} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
              <span className={`truncate ${c.nome ? "font-medium" : "text-zinc-500 italic"}`}>{c.nome ?? "sem nome"}</span>
              {(c.descricao || c.storyboard) && (
                <span className="line-clamp-2 text-sm text-zinc-400">{c.descricao || c.storyboard}</span>
              )}
              <span className="text-xs text-zinc-500">
                {c.shots.length} {c.shots.length === 1 ? "shot" : "shots"}
              </span>
            </Link>
          )}
        />
      )}
      <ModalCena
        aberto={nova}
        projetoInicial={video.lista.projeto.id}
        videoInicial={video.id}
        aoFechar={() => setNova(false)}
        aoSalvar={(c) => {
          aoMudar();
          aoFechar();
          navegar(caminhoDaCena(c));
        }}
      />
    </Secao>
  );
}
