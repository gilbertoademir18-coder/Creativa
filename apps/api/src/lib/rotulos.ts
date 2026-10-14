/**
 * Como chamar uma cena ou um shot que não tem nome.
 *
 * Cena e shot nascem sem nome: o número (a posição) identifica, e nome é para
 * quando merecem um. Onde a tela tem a lista inteira, o número sai do índice;
 * aqui — fila, escolha de imagem — há só um registro solto, então vale a
 * `ordem` guardada.
 *
 * Ressalva: `ordem` só é igual à posição enquanto não houver buraco. Apagar um
 * shot do meio deixa 0 e 2, e este rótulo diria "Shot 3" para o que a barra
 * mostra como 2. É um rótulo informativo, não um identificador — quem manda na
 * numeração que a pessoa vê é a lista ordenada.
 */

export const nomeDaCena = (c: { nome: string | null; ordem: number }) => c.nome ?? `Cena ${c.ordem + 1}`;

export const nomeDoShot = (s: { nome: string | null; ordem: number }) => s.nome ?? `Shot ${s.ordem + 1}`;

/** O caminho até um shot, para rótulos: "A fuga › 2", "Cena 3 › Shot 1". */
export const caminhoDoShot = (s: { nome: string | null; ordem: number; cena: { nome: string | null; ordem: number } }) =>
  `${nomeDaCena(s.cena)} › ${nomeDoShot(s)}`;
