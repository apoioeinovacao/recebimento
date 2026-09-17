/* ===========================================================================
 * exportar.js — CSV do que está na tela (mesma aba, mesmos filtros).
 * ---------------------------------------------------------------------------
 * Separador ";" e BOM UTF-8 porque o destino é o Excel em português.
 * ======================================================================== */

'use strict';

import { estado } from './estado.js';
import { visiveis } from './ui.js';
import { situacao } from './regras.js';
import { iso, dataBR } from './util.js';

const CABECALHO = [
  'Codigo', 'Produto', 'Fornecedor', 'CNPJ', 'Volume', 'DataEntrega',
  'OrdemCompra', 'Unidade', 'Situacao', 'Status', 'Descarga',
  'Observacoes', 'AlteradoPor', 'AlteradoEm',
];

/**
 * Neutraliza fórmula em célula de CSV. Sem isto, um fornecedor cadastrado como
 * "=cmd|..." vira execução quando alguém abre o arquivo no Excel.
 */
function celula(valor) {
  let s = valor == null ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportarCSV() {
  const agora = new Date();

  const linhas = visiveis().map((it) => [
    it.codigo, it.produto, it.fornecedor, it.cnpj, it.volume,
    dataBR(it.data_entrega), it.ordem_compra, it.unidade,
    situacao(it, agora), it.status_entrega, it.descarga, it.observacoes,
    it.alterado_por,
    it.alterado_em ? new Date(it.alterado_em).toLocaleString('pt-BR') : '',
  ]);

  const csv = '﻿' + [CABECALHO, ...linhas]
    .map((r) => r.map(celula).join(';'))
    .join('\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `recebimento-${estado.aba}-${iso(agora)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return linhas.length;
}
