/* ===========================================================================
 * util.js — funções pequenas usadas em toda parte. Sem estado, sem imports.
 * ======================================================================== */

'use strict';

/** Zero à esquerda: 7 -> "07". */
export const zz = (n) => String(n).padStart(2, '0');

/** Escapa texto que vai para innerHTML. Obrigatório em todo dado vindo do banco. */
export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

/** Hoje à meia-noite, hora local. */
export const hoje0 = () => {
  const a = new Date();
  return new Date(a.getFullYear(), a.getMonth(), a.getDate());
};

/** Date -> "AAAA-MM-DD" no fuso local (Date#toISOString usa UTC e erra o dia). */
export const iso = (d) => `${d.getFullYear()}-${zz(d.getMonth() + 1)}-${zz(d.getDate())}`;

/** "2026-09-10" ou "2026-09-10T..." -> "10/09". */
export const diaMes = (s) => {
  const p = String(s || '').slice(0, 10).split('-');
  return `${p[2] || '--'}/${p[1] || '--'}`;
};

/** "2026-09-10" -> "10/09/2026". */
export const dataBR = (s) => {
  const p = String(s || '').slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
};

/** Aceita 10/09/2026 ou 2026-09-10 e devolve sempre AAAA-MM-DD (ou ''). */
export function normData(valor) {
  const s = String(valor || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${zz(+m[2])}-${zz(+m[1])}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${zz(+m[2])}-${zz(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/); // dia/mês do ano corrente
  if (m) return `${new Date().getFullYear()}-${zz(+m[2])}-${zz(+m[1])}`;
  return '';
}

/** "1.234,50" -> 1234.5 ; "" -> null. */
export function normNumero(valor) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Minutos desde a meia-noite -> "14:00". */
export const hhmm = (min) => `${zz(Math.floor(min / 60))}:${zz(min % 60)}`;

/* ------------------------------------------------------------------ CNPJ */

/** Tira tudo que não é dígito. */
export const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/** 14 dígitos -> "12.345.678/0001-90". Devolve o original se não der. */
export function formataCnpj(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14) return String(valor == null ? '' : valor);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Confere os dois dígitos verificadores do CNPJ.
 * Serve para sinalizar erro de digitação na base — não para barrar cadastro,
 * porque base antiga sempre tem algum registro torto que ainda é útil.
 */
export function cnpjValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;

  // Pesos decrescentes de (tamanho-7) até 2, reiniciando em 9 ao passar de 2.
  const digito = (ate) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(d[i]) * peso;
      peso = peso > 2 ? peso - 1 : 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };

  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/** Agrupa chamadas seguidas (digitação em campo de filtro). */
export function atrasar(fn, ms = 180) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

/** "há 3 min" a partir de um Date/ISO. */
export function desde(quando) {
  if (!quando) return '';
  const seg = Math.max(0, Math.round((Date.now() - new Date(quando).getTime()) / 1000));
  if (seg < 60) return 'agora';
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}
