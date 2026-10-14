import type { Cena } from "./tipos.ts";

/**
 * Para onde levar quem abre uma cena.
 *
 * Cena não tem página: abrir uma é abrir o shot em que se estava trabalhando.
 * `/cenas/<id>` faz isso, mas custa um salto — carrega a cena só para
 * redirecionar, e a tela pisca duas vezes. Quem **já tem** a cena com os shots
 * (a barra, o painel do vídeo) usa isto e vai direto ao destino.
 */

/** O shot de `editadoEm` mais recente — o rascunho do Gerador o mantém em dia. */
export function ultimoShot(cena: Pick<Cena, "shots">) {
  return [...cena.shots].sort((a, b) => Date.parse(b.editadoEm) - Date.parse(a.editadoEm) || a.ordem - b.ordem)[0];
}

/** O endereço de uma cena: o shot direto quando dá, senão o desvio por `/cenas`. */
export function caminhoDaCena(cena: Pick<Cena, "id" | "shots">): string {
  const shot = ultimoShot(cena);
  return shot ? `/shots/${shot.id}` : `/cenas/${cena.id}`;
}
