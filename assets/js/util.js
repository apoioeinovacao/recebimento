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
