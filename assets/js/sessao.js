/* ===========================================================================
 * sessao.js — quem está usando o painel neste aparelho.
 * ---------------------------------------------------------------------------
 * O token é emitido pelo banco no login e guardado aqui. Ele não carrega
 * permissão nenhuma por si: a cada chamada o Postgres confere o token, lê o
 * perfil na tabela usuarios e decide. Adulterar o que está gravado no aparelho
 * muda o que a tela mostra, não o que o banco aceita.
 *
 * localStorage (e não sessionStorage) porque o operador fecha e reabre o app
 * várias vezes num turno, e refazer login a cada vez é atrito na doca.
 * ======================================================================== */

'use strict';

import { DB } from './db.js';

const CHAVE = 'recebimento:sessao:v1';

let atual = null;

function ler() {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return null;
    const s = JSON.parse(cru);
    if (!s || !s.token || !s.matricula) return null;
    if (s.expira_em && new Date(s.expira_em) <= new Date()) return null;
    return s;
  } catch {
    return null; // modo privado, storage bloqueado ou JSON corrompido
  }
}

function gravar(s) {
  try {
    if (s) localStorage.setItem(CHAVE, JSON.stringify(s));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem storage: a sessão vale só enquanto a aba estiver aberta */
  }
}

/** Restaura a sessão gravada, se ainda estiver na validade. */
export function restaurar() {
  atual = ler();
  return atual;
}

export const sessao = () => atual;
export const token = () => (atual ? atual.token : null);
export const perfil = () => (atual ? atual.perfil : null);
export const matricula = () => (atual ? atual.matricula : '');
export const ativa = () => atual !== null;

/** true enquanto a senha padrão não for trocada. Bloqueia todo o resto. */
export const precisaTrocarSenha = () => !!(atual && atual.precisa_trocar);

/**
 * Faz login no banco.
 * @returns {{ok: true, sessao: object}} ou {{ok: false, motivo: string}}
 */
export async function entrar(matriculaDigitada, senha) {
  const mat = String(matriculaDigitada || '').replace(/\D/g, '');
  if (mat.length < 4) return { ok: false, motivo: 'Informe a matrícula completa.' };
  if (!senha) return { ok: false, motivo: 'Informe a senha.' };

  const r = await DB.login(mat, senha);
  if (!r || !r.ok) return { ok: false, motivo: (r && r.motivo) || 'Não foi possível entrar.' };

  atual = {
    token: r.token,
    matricula: r.matricula,
    nome: r.nome || '',
    perfil: r.perfil || 'operador',
    precisa_trocar: !!r.precisa_trocar,
    expira_em: r.expira_em,
  };
  gravar(atual);
  return { ok: true, sessao: atual };
}

/** Marca a senha como trocada, sem refazer login. */
export function senhaTrocada() {
  if (!atual) return;
  atual.precisa_trocar = false;
  gravar(atual);
}

/** Encerra a sessão. Avisa o banco quando dá, mas sempre limpa o aparelho. */
export async function sair() {
  const t = token();
  atual = null;
  gravar(null);
  if (t) {
    try { await DB.logout(t); } catch { /* offline: a sessão vence sozinha no banco */ }
  }
}

/** Descarta a sessão local sem chamar o banco (usado quando ele diz que expirou). */
export function descartar() {
  atual = null;
  gravar(null);
}
