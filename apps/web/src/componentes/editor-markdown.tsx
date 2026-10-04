import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  diffSourcePlugin,
  headingsPlugin,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useRef, type ClipboardEvent } from "react";

/** Tem cara de markdown: título, lista, citação, bloco de código, tabela, negrito ou link. */
const pareceMarkdown = (t: string) =>
  /^\s*(#{1,6} |[-*+] |\d+[.)] |> |```|\|.*\|)/m.test(t) || /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\)/.test(t);

/*
 * Editor de markdown visual (MDXEditor): títulos, listas e negrito aparecem
 * formatados enquanto se escreve, e o que se guarda é markdown puro. Atalhos
 * de markdown também valem: "# " vira título, "- " vira lista, "> " citação.
 * O botão de código-fonte, na ponta da barra, mostra o markdown cru.
 *
 * É pesado (~1 MB): quem usa importa com React.lazy, para ele só carregar
 * quando a janela abre.
 *
 * Colar markdown no modo visual: o editor, sozinho, cola o texto como texto
 * (os "##" ficam à vista) ou, vindo do VS Code, o HTML dele — uma <div> por
 * linha, que vira um parágrafo por linha e dobra as quebras. Aqui o colar é
 * interceptado antes e, se o texto tem cara de markdown, entra como markdown.
 * No modo código-fonte o colar segue normal.
 */
export default function EditorMarkdown({
  valor,
  aoMudar,
  placeholder,
}: {
  valor: string;
  /**
   * `normalizacao`: não foi edição, foi o editor reescrevendo o texto que
   * recebeu no formato dele (junta as linhas de um parágrafo, troca escapes).
   * Acontece ao montar, e o texto "muda" sem ninguém mexer.
   */
  aoMudar: (md: string, normalizacao: boolean) => void;
  placeholder?: string;
}) {
  const editor = useRef<MDXEditorMethods>(null);

  function colar(e: ClipboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".cm-editor")) return;
    const texto = e.clipboardData.getData("text/plain");
    if (!pareceMarkdown(texto)) return;
    e.preventDefault();
    e.stopPropagation();
    editor.current?.insertMarkdown(texto.replace(/\r\n?/g, "\n"));
  }

  return (
    <div onPasteCapture={colar}>
      <MDXEditor
        ref={editor}
        markdown={valor}
        onChange={(md, normalizacao) => aoMudar(md, normalizacao)}
        placeholder={placeholder}
        autoFocus
        className="dark-theme editor-md"
        contentEditableClassName="texto-md min-h-[55vh] px-6 py-5 outline-none"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          markdownShortcutPlugin(),
          diffSourcePlugin({ viewMode: "rich-text" }),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={["rich-text", "source"]}>
                <UndoRedo />
                <Separator />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
                <InsertTable />
                <InsertThematicBreak />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
    </div>
  );
}
