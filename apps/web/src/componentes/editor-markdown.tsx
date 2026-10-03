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
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

/*
 * Editor de markdown visual (MDXEditor): títulos, listas e negrito aparecem
 * formatados enquanto se escreve, e o que se guarda é markdown puro. Atalhos
 * de markdown também valem: "# " vira título, "- " vira lista, "> " citação.
 * O botão de código-fonte, na ponta da barra, mostra o markdown cru.
 *
 * É pesado (~1 MB): quem usa importa com React.lazy, para ele só carregar
 * quando a janela abre.
 */
export default function EditorMarkdown({
  valor,
  aoMudar,
  placeholder,
}: {
  valor: string;
  aoMudar: (md: string) => void;
  placeholder?: string;
}) {
  return (
    <MDXEditor
      markdown={valor}
      onChange={(md) => aoMudar(md)}
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
  );
}
