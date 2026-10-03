/**
 * As chaves estáveis dos cadastros (tipo de geração, workflow): geradas do
 * nome na criação e nunca mais mudadas — execuções, outputs e assistentes
 * guardam a chave, então renomear não quebra o histórico.
 */

/** "Placa de cenário 16:9" → "placa-de-cenario-16-9". */
export function paraChave(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "sem-nome"
  );
}

/** A chave do nome, com -2, -3... se já existir. `existe` consulta o banco. */
export async function chaveLivre(nome: string, existe: (chave: string) => Promise<boolean>): Promise<string> {
  const base = paraChave(nome);
  for (let n = 1; ; n++) {
    const chave = n === 1 ? base : `${base}-${n}`;
    if (!(await existe(chave))) return chave;
  }
}
