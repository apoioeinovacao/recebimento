/* ===========================================================================
 * regras.js — as regras de negócio do recebimento, isoladas da tela.
 * ---------------------------------------------------------------------------
 * Aqui mora tudo que responde "esse item está atrasado?". Nada de DOM, nada de
 * fetch: só entrada e saída. É o pedaço que vale a pena testar e o único lugar
 * onde os horários de corte e os feriados são interpretados.
 * ======================================================================== */

'use strict';

import { CFG, FERIADOS } from './env.js';
import { iso, hoje0 } from './util.js';

/* ---------------------------------------------------------------- Domínio */

export const STATUS = ['PENDENTE', 'FINALIZADO', 'ENTREGA PARCIAL', 'CANCELADO'];

/** [cor do texto, cor do fundo] por situação. */
export const COR = {
  'ATRASADO':        ['#FF5A5A', '#3B1218'],
  'ATRASANDO':       ['#FFB020', '#3A2A0A'],
  'DENTRO DO PRAZO': ['#3DD68C', '#0C3326'],
  'FINALIZADO':      ['#56A8FF', '#0D2A4C'],
  'ENTREGA PARCIAL': ['#B79BFF', '#241E44'],
  'CANCELADO':       ['#7A8CA3', '#16283F'],
};

/** Ordem dentro de cada faixa: o que dói primeiro aparece primeiro. */
export const RANK = {
  'ATRASADO': 1, 'FINALIZADO': 2, 'ATRASANDO': 3,
  'DENTRO DO PRAZO': 4, 'ENTREGA PARCIAL': 5, 'CANCELADO': 6,
};

export const NOME_ABA = {
  compras: 'Compras', almox: 'Almoxarifado', fiscal: 'Fiscal',
  hist: 'Histórico', usuarios: 'Usuários e acessos',
};

export const PERFIS = [
  ['operador', 'Operador', 'Dá baixa na doca. Não edita cadastro nem vê Compras.'],
  ['compras',  'Compras',  'Lança e edita programação. Vê todas as abas.'],
  ['master',   'Master',   'Tudo, mais o cadastro de usuários.'],
];

export const ROTULO_PERFIL = {
  master:   'Acesso total',
  compras:  'Perfil Compras',
  operador: 'Almoxarifado / Consulta',
};

/** Abas visíveis por perfil. Espelha o que o banco permite, não o substitui. */
export const ABAS = {
  master:   ['compras', 'almox', 'fiscal', 'hist', 'usuarios'],
  compras:  ['compras', 'almox', 'fiscal', 'hist'],
  operador: ['almox', 'fiscal', 'hist'],
};

/** Colunas editáveis no cadastro e na grade de inserção, nesta ordem. */
export const CAMPOS = [
  ['codigo', 'Código'],
  ['produto', 'Produto'],
  ['fornecedor', 'Fornecedor'],
  ['cnpj', 'CNPJ'],
  ['volume', 'Volume'],
  ['data_entrega', 'Data de entrega'],
  ['ordem_compra', 'OC'],
  ['unidade', 'Unidade'],
];

/* ---------------------------------------------------- Calendário e cortes */

/** Cortes do dia, em minutos desde a meia-noite. Sábado tem janela curta. */
export const cortesDe = (data) => (data.getDay() === 6 ? CFG.CORTES.sabado : CFG.CORTES.semana);

/**
 * Data em que a entrega realmente pode acontecer: empurra domingo e feriado
 * para o próximo dia útil. Fornecedor que marca entrega num feriado não está
 * atrasado no feriado — está atrasado no dia seguinte.
 */
export function dataPrevista(valor) {
  const p = String(valor || '').slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || !p[0]) return hoje0();
  const dt = new Date(p[0], p[1] - 1, p[2]);
  let guarda = 0;
  while ((dt.getDay() === 0 || FERIADOS.has(iso(dt))) && guarda++ < 30) {
    dt.setDate(dt.getDate() + 1);
  }
  return dt;
}

/** Dias corridos entre hoje e a data prevista. Negativo = venceu. */
export const diasAte = (item) =>
  Math.round((dataPrevista(item.data_entrega) - hoje0()) / 86400000);

/* ------------------------------------------------------------- Situação */

/**
 * Situação exibida na tarja.
 * Status manual (FINALIZADO, PARCIAL, CANCELADO) manda; PENDENTE é calculado
 * pela data e, no dia da entrega, pelos dois cortes de horário.
 */
export function situacao(item, agora = new Date()) {
  if (item.status_entrega && item.status_entrega !== 'PENDENTE') return item.status_entrega;

  const prevista = dataPrevista(item.data_entrega);
  const h = hoje0();
  if (prevista > h) return 'DENTRO DO PRAZO';
  if (prevista < h) return 'ATRASADO';

  const [corte1, corte2] = cortesDe(prevista);
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  if (minutos < corte1) return 'DENTRO DO PRAZO';
  return minutos < corte2 ? 'ATRASANDO' : 'ATRASADO';
}

/** Faixa do quadro em que o item entra. */
export function faixa(item) {
  if (item.status_entrega && item.status_entrega !== 'PENDENTE') return 'encerrados';
  const dias = diasAte(item);
  if (dias < 0) return 'atrasados';
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanha';
  if (dias <= 7) return 'semana';
  return 'adiante';
}

export const FAIXAS = ['atrasados', 'hoje', 'amanha', 'semana', 'adiante', 'encerrados'];

export const TITULO_FAIXA = {
  atrasados: 'Atrasados', hoje: 'Hoje', amanha: 'Amanhã',
  semana: 'Esta semana', adiante: 'Mais adiante', encerrados: 'Encerrados',
};

export const NOTA_FAIXA = {
  atrasados: 'não chegaram na data prevista',
  hoje: 'janela de recebimento aberta',
  amanha: '',
  semana: 'próximos 7 dias',
  adiante: '',
  encerrados: 'finalizados, parciais e cancelados',
};

/** Um item pertence ao histórico quando já foi encerrado ou já venceu. */
export const ehHistorico = (item) =>
  (item.status_entrega && item.status_entrega !== 'PENDENTE') ||
  dataPrevista(item.data_entrega) < hoje0();

/* ------------------------------------------------------------ Permissões */
/* Espelho do que o banco impõe nas funções SECURITY DEFINER. Serve para não
 * mostrar botão que vai dar erro — não é o controle de segurança. Quem barra
 * de verdade é o Postgres. */

export const podeCadastrar = (perfil) => perfil === 'master' || perfil === 'compras';

export const podeGerirUsuarios = (perfil) => perfil === 'master';

export const podeEditarNaAba = (perfil, aba) =>
  perfil === 'master' || (perfil === 'compras' && aba === 'compras');

export const podeDarBaixa = (perfil, aba) => aba === 'almox' || podeEditarNaAba(perfil, aba);
