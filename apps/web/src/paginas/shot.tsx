import { ArrowLeft, Pencil, Trash } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { shotsApi } from "../api.ts";
import { useGeracaoNoLugar } from "../componentes/geracao-no-lugar.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { PainelReferencias } from "../componentes/referencias.tsx";
import { AreaTexto, Aviso, Botao, Cabecalho, Campo, Carregando, Entrada } from "../componentes/ui.tsx";
import { useCarregar } from "../hooks.ts";
import type { ShotDetalhe } from "../tipos.ts";

export function PaginaShot() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { dados: s, erro, setDados } = useCarregar(() => shotsApi.ler(id), [id]);
  // A geração aberta aparece aqui mesmo, num bloco acima da lista de gerações.
  const geracoes = useGeracaoNoLugar({ assetId: null, shotId: id });
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!s) return <Carregando />;
  const unico = s.cena.shots.length <= 1;

  return (
    <>
      <Cabecalho
        voltar={
          <Link to={`/cenas/${s.cena.id}`} className="inline-flex items-center gap-1.5 hover:text-zinc-100">
            <ArrowLeft className="size-4" /> {s.cena.projeto ? `${s.cena.projeto.nome} › ` : ""}
            {s.cena.nome}
          </Link>
        }
        titulo={s.nome}
        subtitulo={s.descricao && <p className="max-w-3xl whitespace-pre-wrap">{s.descricao}</p>}
        acoes={
          <>
            <Botao icone={<Pencil className="size-4" />} onClick={() => setEditando(true)}>
              Editar
            </Botao>
            <Botao
              variante="perigo"
              icone={<Trash className="size-4" />}
              disabled={unico}
              title={unico ? "Toda cena precisa de pelo menos um shot" : undefined}
              onClick={() => setExcluindo(true)}
            >
              Excluir
            </Botao>
          </>
        }
      />
      {/* Pular de shot em shot da mesma cena, sem voltar para ela. */}
      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-8 py-2">
        {s.cena.shots.map((x, i) => (
          <Link
            key={x.id}
            to={`/shots/${x.id}`}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${
              x.id === s.id ? "bg-violet-600/15 font-medium text-violet-200" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            }`}
          >
            {i + 1}. {x.nome}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col gap-10 p-8">
        {geracoes.Aberta()}
        {geracoes.Lista()}
        <PainelReferencias dono={{ assetId: null, shotId: s.id }} />
      </div>
      <Modal aberto={editando} titulo="Editar shot" aoFechar={() => setEditando(false)}>
        <FormShot
          shot={s}
          aoSalvar={(novo) => {
            setEditando(false);
            setDados({
              ...s,
              ...novo,
              cena: { ...s.cena, shots: s.cena.shots.map((x) => (x.id === s.id ? { ...x, nome: novo.nome } : x)) },
            });
          }}
        />
      </Modal>
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir shot"
        texto={
          <>
            O shot <b>{s.nome}</b> será excluído. Se ele tiver referências ou gerações, exclua-as antes.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await shotsApi.apagar(s.id);
          navegar(`/cenas/${s.cena.id}`);
        }}
      />
    </>
  );
}

function FormShot({ shot, aoSalvar }: { shot: ShotDetalhe; aoSalvar: (s: { nome: string; descricao: string | null }) => void }) {
  const [nome, setNome] = useState(shot.nome);
  const [descricao, setDescricao] = useState(shot.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
          aoSalvar(await shotsApi.salvar(shot.id, { nome, descricao: descricao || null }));
        } catch (er) {
          setErro((er as Error).message);
          setSalvando(false);
        }
      }}
    >
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required />
      </Campo>
      <Campo rotulo="Descrição">
        <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} placeholder="Enquadramento, ação, câmera..." />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" carregando={salvando}>
          Salvar
        </Botao>
      </div>
    </form>
  );
}
