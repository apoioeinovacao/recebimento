/* ===========================================================================
 * env.js — porta de entrada da configuração
 * ---------------------------------------------------------------------------
 * O arquivo config.js (gerado a partir do .env pelo scripts/gerar-config.mjs)
 * define window.__APP_ENV. Aqui esse objeto é conferido e normalizado antes de
 * qualquer outro módulo tocar nele.
 *
 * Nenhum outro arquivo deve ler window.__APP_ENV diretamente: importe CFG.
 * ======================================================================== */

'use strict';

const PADRAO = {
  NOME: 'Recebimento',
  DESCRICAO: '',
  VERSAO: '0.0.0',
  AMBIENTE: 'producao',
  BUILD: 'dev',
  SUPABASE_URL: '',
  SUPABASE_KEY: '',
  CORTES: { semana: [840, 950], sabado: [600, 690] },
  FERIADOS: [],
  INTERVALO_SYNC: 15000,
  INTERVALO_RELOGIO: 30000,
  SESSAO_HORAS: 12,
};

const bruto = typeof window !== 'undefined' ? window.__APP_ENV : null;

/** Motivo pelo qual a configuração não serve, ou string vazia se estiver ok. */
export let problema = '';

if (!bruto) {
  problema = 'assets/js/config.js não foi carregado — o arquivo não existe ou o servidor devolveu 404.';
} else if (!bruto.SUPABASE_URL || !bruto.SUPABASE_KEY) {
  problema = 'config.js foi carregado, mas APP_SUPABASE_URL ou APP_SUPABASE_PUBLISHABLE_KEY estão vazios no .env.';
} else if (/^sb_secret_|service_role/i.test(bruto.SUPABASE_KEY)) {
  problema =
    'A chave publicada é uma chave SECRETA. Troque por sb_publishable_... no .env, ' +
    'gere o config.js de novo e revogue a chave exposta no painel do Supabase.';
}

export const configurado = problema === '';

export const CFG = Object.freeze({
  ...PADRAO,
  ...(bruto || {}),
  CORTES: Object.freeze({
    semana: Object.freeze((bruto && bruto.CORTES && bruto.CORTES.semana) || PADRAO.CORTES.semana),
    sabado: Object.freeze((bruto && bruto.CORTES && bruto.CORTES.sabado) || PADRAO.CORTES.sabado),
  }),
  FERIADOS: Object.freeze((bruto && bruto.FERIADOS) || PADRAO.FERIADOS),
});

/** Conjunto de feriados para consulta O(1). */
export const FERIADOS = new Set(CFG.FERIADOS);

/** Endereço base da API REST do Supabase. */
export const API = CFG.SUPABASE_URL ? `${CFG.SUPABASE_URL}/rest/v1/` : '';
