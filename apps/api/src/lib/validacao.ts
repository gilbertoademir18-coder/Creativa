import { z } from "zod";

/**
 * As peças de validação que todas as rotas usam.
 *
 * Moram aqui porque a mensagem de erro é a que aparece na tela: se cada rota
 * escrevesse a sua, o app falaria de jeitos diferentes conforme a parte em que
 * você estivesse.
 */

/** Um erro que já sabe o status HTTP — o error handler do server.ts o respeita. */
export class ErroHttp extends Error {
  constructor(
    public statusCode: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export const naoEncontrado = (mensagem: string) => new ErroHttp(404, mensagem);

/** Valida e devolve os dados, ou lança 400 com a primeira falha. */
export function validar<T extends z.ZodType>(esquema: T, dados: unknown): z.output<T> {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroHttp(400, primeiroErro(r.error));
  return r.data;
}

/** A primeira falha de uma validação, no formato que a tela mostra. */
export function primeiroErro(erro: z.ZodError | undefined): string {
  const problema = erro?.issues[0];
  if (!problema) return "Requisição inválida.";
  const campo = problema.path.join(".");
  return campo ? `${campo}: ${problema.message}` : problema.message;
}

export const Uuid = z.uuid("id inválido");

export const Nome = z.string().trim().min(1, "não pode ficar vazio").max(120, "no máximo 120 caracteres");

/** Texto opcional: vazio vira null, para o banco não guardar "" e null misturados. */
export const TextoOpcional = (max = 5000) =>
  z
    .string()
    .trim()
    .max(max, `no máximo ${max} caracteres`)
    .nullish()
    .transform((t) => t || null);

/** Id opcional vindo de formulário: "" e ausente viram null. */
export const UuidOpcional = z
  .union([Uuid, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

/**
 * O filtro de projeto das listagens: ausente = todos, "sem" = os soltos,
 * um id = os daquele projeto.
 */
export const FiltroProjeto = z
  .union([Uuid, z.literal("sem"), z.literal("")])
  .optional()
  .transform((v) => v || undefined);

/** Busca por nome, sem diferenciar maiúsculas. */
export const Busca = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => v || undefined);

export const contem = (busca: string | undefined) =>
  busca ? { contains: busca, mode: "insensitive" as const } : undefined;
