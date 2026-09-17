/* ===========================================================================
 * cache.js — a última programação lida fica guardada no aparelho.
 * ---------------------------------------------------------------------------
 * Por que existe: na doca o sinal cai. Sem isto, o operador abre o app e vê
 * uma tela vazia justamente quando o caminhão está encostando.
 *
 * O que ele NÃO faz: guardar alteração pendente. Baixa feita offline não é
 * aceita — a tela avisa em vez de fingir que salvou. Fila de envio com
 * resolução de conflito é assunto de uma próxima etapa.
 *
 * O service worker cuida do app (HTML/CSS/JS); este módulo cuida dos dados,
 * porque respostas de POST/RPC não entram no Cache Storage.
 * ======================================================================== */

'use strict';

const PREFIXO = 'recebimento:dados:v1:';
const VALIDADE_MS = 72 * 60 * 60 * 1000; // 3 dias — passou disso, é ruído

const chave = (matricula) => PREFIXO + (matricula || 'anon');

/** Guarda o retorno do banco junto com o instante da leitura. */
export function guardar(matricula, dados) {
  try {
    localStorage.setItem(chave(matricula), JSON.stringify({ em: Date.now(), dados }));
  } catch (e) {
    // Cota estourada: joga fora o que for de outras matrículas e tenta uma vez.
    try {
      limparOutros(matricula);
      localStorage.setItem(chave(matricula), JSON.stringify({ em: Date.now(), dados }));
    } catch { /* desiste em silêncio: cache é conforto, não requisito */ }
  }
}

/** @returns {{em: number, dados: Array}|null} */
export function recuperar(matricula) {
  try {
    const cru = localStorage.getItem(chave(matricula));
    if (!cru) return null;
    const pacote = JSON.parse(cru);
    if (!pacote || !Array.isArray(pacote.dados)) return null;
    if (Date.now() - pacote.em > VALIDADE_MS) {
      localStorage.removeItem(chave(matricula));
      return null;
    }
    return pacote;
  } catch {
    return null;
  }
}

export function descartar(matricula) {
  try { localStorage.removeItem(chave(matricula)); } catch { /* ignora */ }
}

function limparOutros(matricula) {
  const manter = chave(matricula);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIXO) && k !== manter) localStorage.removeItem(k);
  }
}
