/* ===========================================================================
 * fornecedores.js — o "PROCV" do painel.
 * ---------------------------------------------------------------------------
 * Compras digita o nome do fornecedor e o CNPJ aparece sozinho. Funciona com
 * a razão social e com o apelido de corredor ("Metalúrgica Andrade" ou só
 * "Andrade"), porque ninguém digita razão social inteira às três da tarde.
 *
 * A busca é toda em memória: a base inteira é carregada uma vez no login e
 * costuma ter algumas centenas de linhas. Nada de ida ao servidor a cada tecla.
 * ======================================================================== */

'use strict';

import { estado } from './estado.js';
import { esc, soDigitos, formataCnpj } from './util.js';

const ID_DATALIST = 'lista-fornecedores';

/** Normaliza para comparar: sem acento, sem pontuação, minúsculo. */
const chave = (texto) =>
  String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* --------------------------------------------------------------- Índices */

let porNome = new Map();
let porCnpj = new Map();
let assinatura = '';

/** Reconstrói os índices quando a lista muda. Barato e idempotente. */
function indexar() {
  const atual = String(estado.fornecedores.length) + ':' + (estado.fornecedores[0]?.cnpj || '');
  if (atual === assinatura && porNome.size) return;
  assinatura = atual;

  porNome = new Map();
  porCnpj = new Map();
  estado.fornecedores.forEach((f) => {
    porCnpj.set(f.cnpj, f);
    [f.nome, f.apelido].filter(Boolean).forEach((rotulo) => {
      const k = chave(rotulo);
      if (k && !porNome.has(k)) porNome.set(k, f);
    });
  });
}

/** Acha pelo nome ou apelido exatos; se não, por prefixo, se for inequívoco. */
export function buscarPorNome(texto) {
  indexar();
  const k = chave(texto);
  if (!k) return null;

  const exato = porNome.get(k);
  if (exato) return exato;

  const candidatos = [];
  for (const [nome, f] of porNome) {
    if (nome.startsWith(k)) {
      if (!candidatos.includes(f)) candidatos.push(f);
      if (candidatos.length > 1) return null; // ambíguo: não adivinha
    }
  }
  return candidatos[0] || null;
}

export function buscarPorCnpj(valor) {
  indexar();
  return porCnpj.get(soDigitos(valor)) || null;
}

/* -------------------------------------------------------------- Datalist */

/**
 * Mantém um único <datalist> no documento, compartilhado por todos os campos
 * de fornecedor. Os navegadores cuidam do menu de sugestões sozinhos — não há
 * dropdown feito à mão para quebrar no celular.
 */
export function montarDatalist() {
  let el = document.getElementById(ID_DATALIST);
  if (!el) {
    el = document.createElement('datalist');
    el.id = ID_DATALIST;
    document.body.appendChild(el);
  }

  el.innerHTML = estado.fornecedores
    .map((f) => {
      const rotulo = f.apelido && f.apelido !== f.nome ? `${f.apelido} · ` : '';
      return `<option value="${esc(f.nome)}">${rotulo}${formataCnpj(f.cnpj)}</option>`;
    })
    .join('');

  return ID_DATALIST;
}

/* --------------------------------------------------------- Ligação dos campos */

/**
 * Liga um par de campos nome/CNPJ. Digitou o nome, o CNPJ aparece; digitou o
 * CNPJ de um fornecedor conhecido, o nome aparece.
 *
 * Nunca sobrescreve um CNPJ que a pessoa já digitou à mão, a não ser que o
 * campo esteja vazio ou que ela tenha escolhido um nome na lista — corrigir um
 * valor que o usuário acabou de escrever é a pior coisa que um campo pode
 * fazer.
 */
export function ligarAutocomplete(campoNome, campoCnpj) {
  if (!campoNome) return;

  campoNome.setAttribute('list', montarDatalist());
  campoNome.setAttribute('autocomplete', 'off');

  const preencher = ({ forcar = false } = {}) => {
    if (!campoCnpj) return;
    const f = buscarPorNome(campoNome.value);
    if (!f) return;
    if (forcar || !campoCnpj.value.trim()) {
      campoCnpj.value = formataCnpj(f.cnpj);
      campoCnpj.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Escolheu na lista: normaliza para a razão social do cadastro.
    if (forcar) campoNome.value = f.nome;
  };

  // 'change' cobre a escolha no menu do datalist e a saída do campo.
  campoNome.addEventListener('change', () => preencher({ forcar: true }));
  campoNome.addEventListener('blur', () => preencher());

  if (campoCnpj) {
    campoCnpj.addEventListener('blur', () => {
      const d = soDigitos(campoCnpj.value);
      if (d.length === 14) campoCnpj.value = formataCnpj(d);
      const f = buscarPorCnpj(d);
      if (f && !campoNome.value.trim()) campoNome.value = f.nome;
    });
  }
}

/**
 * Completa os CNPJs em branco de uma colagem em lote.
 * Usada depois do Ctrl+V na grade: o comprador cola matrícula/produto/
 * fornecedor sem CNPJ e a coluna se preenche sozinha.
 *
 * @param {Array<{nome: HTMLInputElement, cnpj: HTMLInputElement}>} pares
 * @returns {number} quantos foram preenchidos
 */
export function completarEmLote(pares) {
  let n = 0;
  pares.forEach(({ nome, cnpj }) => {
    if (!nome || !cnpj) return;
    if (!nome.value.trim() || cnpj.value.trim()) return;
    const f = buscarPorNome(nome.value);
    if (!f) return;
    cnpj.value = formataCnpj(f.cnpj);
    n++;
  });
  return n;
}
