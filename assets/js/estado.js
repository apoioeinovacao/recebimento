/* ===========================================================================
 * estado.js — o que a tela está mostrando agora.
 * ---------------------------------------------------------------------------
 * Objeto único e observável. Quem muda dados chama notificar(); quem desenha
 * se inscreve em aoMudar(). Evita que os módulos de tela e de dados precisem
 * se importar uns aos outros.
 * ======================================================================== */

'use strict';

export const estado = {
  /** Linhas vindas do banco (ou do cache do aparelho). */
  dados: [],
  /** Usuários cadastrados. Só é preenchido para o perfil master. */
  usuarios: [],
  /** Aba corrente: compras | almox | fiscal | hist. */
  aba: 'almox',
  /** Filtros da aba corrente. */
  filtro: {},
  /** Assinatura do último payload — evita redesenhar sem mudança. */
  assinatura: '',
  /** true quando o que está na tela veio do cache, não do banco. */
  doCache: false,
  /** Instante da última leitura bem-sucedida. */
  lidoEm: null,
  /** Mensagem do indicador de sincronismo. */
  sync: { texto: '', estilo: '' },
};

const ouvintes = new Set();

/** Registra quem deve redesenhar quando o estado mudar. */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function notificar(motivo = '') {
  ouvintes.forEach((fn) => {
    try { fn(motivo); } catch (e) { console.error('[estado] ouvinte falhou', e); }
  });
}

export function limpar() {
  estado.dados = [];
  estado.usuarios = [];
  estado.filtro = {};
  estado.assinatura = '';
  estado.doCache = false;
  estado.lidoEm = null;
  estado.sync = { texto: '', estilo: '' };
}
