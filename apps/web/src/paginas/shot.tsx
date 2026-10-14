import { useAvisarCena, useCenaAtual } from "../componentes/barra-cena.tsx";
import { useProjetoAtual } from "../componentes/barra-projeto.tsx";
import { Film, Pencil, Trash } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { shotsApi } from "../api.ts";
import { PainelGerador } from "../componentes/gerador.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { PainelReferencias } from "../componentes/referencias.tsx";
import { AreaTexto, Aviso, Botao, Campo, Carregando, Entrada } from "../componentes/ui.tsx";
import { useCarregar } from "../hooks.ts";
import type { ShotDetalhe } from "../tipos.ts";

export function PaginaShot() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { dados: s, erro, setDados } = useCarregar(() => shotsApi.ler(id), [id]);
  useProjetoAtual(s?.cena.projeto?.id);
  useCenaAtual(s?.cena.id);
  const avisarCena = useAvisarCena();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!s) return <Carregando />;
  const unico = s.cena.shots.length <= 1;

  return (
    <>
      {/*
        Sem título: o nome do shot já está aceso na barra da cena, logo acima,
        e repeti-lo só empurrava o Gerador para baixo. Fica a faixa com o que a
        barra não diz — o vídeo e a descrição — e as ações do shot.
      */}
      <header className="flex items-center justify-between gap-6 border-b border-zinc-800 px-8 py-3">
        <div className="min-w-0 text-sm text-zinc-400">
          {s.cena.video && (
            <span className="flex items-center gap-1.5 truncate">
              <Film className="size-3.5 shrink-0" />
              {s.cena.video.nome}
            </span>
          )}
          {s.descricao && <p className={`${s.cena.video ? "mt-1 " : ""}max-w-3xl whitespace-pre-wrap`}>{s.descricao}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
        </div>
      </header>
      {/* key: trocar de shot pela barra recria os painéis (o Gerador começa do rascunho do shot novo). */}
      <div key={s.id} className="flex flex-col gap-10 p-8">
        <PainelGerador dono={{ assetId: null, shotId: s.id }} />
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
            avisarCena(); // o nome novo tem de aparecer na barra da cena
          }}
        />
      </Modal>
      <ConfirmarExclusao
        aberto={excluindo}
        titulo="Excluir shot"
        texto={
          <>
            O shot <b>{s.nome}</b> será excluído. Se ele tiver referências ou outputs, exclua-os antes.
          </>
        }
        aoFechar={() => setExcluindo(false)}
        aoConfirmar={async () => {
          await shotsApi.apagar(s.id);
          avisarCena();
          // Sem página de cena: /cenas/<id> manda para o shot que sobrou.
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
