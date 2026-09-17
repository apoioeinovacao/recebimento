/* ===========================================================================
 * ui.js — desenha o painel. Lê o estado, escreve no DOM, não fala com o banco.
 * ======================================================================== */

'use strict';

import { CFG } from './env.js';
import { estado } from './estado.js';
import * as sessao from './sessao.js';
import { esc, zz, hhmm, diaMes, atrasar } from './util.js';
import {
  COR, RANK, NOME_ABA, ROTULO_PERFIL, ABAS, FAIXAS, TITULO_FAIXA, NOTA_FAIXA,
  situacao, faixa, diasAte, cortesDe, ehHistorico, podeCadastrar, podeGerirUsuarios,
} from './regras.js';
import { abrirDetalhe, abrirUsuario } from './modais.js';

const $ = (id) => document.getElementById(id);

/* --------------------------------------------------------------- Relógio */

export function relogio() {
  const agora = new Date();
  $('clk').textContent = `${zz(agora.getHours())}:${zz(agora.getMinutes())}`;
  $('dt').textContent = agora.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  const [corte1, corte2] = cortesDe(agora);
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const falta = (alvo) => {
    const x = alvo - minutos;
    return x <= 0 ? null : `${Math.floor(x / 60)}h${zz(x % 60)}`;
  };

  let texto = `Corte de hoje: <b>${hhmm(corte1)}</b> começa a atrasar · <b>${hhmm(corte2)}</b> conta como atrasado.`;
  const f1 = falta(corte1);
  const f2 = falta(corte2);
  if (f1) texto += ` Faltam <b>${f1}</b> para o primeiro corte.`;
  else if (f2) texto += ` Faltam <b>${f2}</b> para o segundo corte.`;
  else texto += ' Os dois cortes já passaram.';
  if (agora.getDay() === 6) texto += ' (sábado: janela reduzida)';

  $('cut').innerHTML = texto;
}

/* ------------------------------------------------------------- Cabeçalho */

export function cabecalho() {
  $('app-titulo').textContent = CFG.NOME;
  $('roleline').textContent = NOME_ABA[estado.aba] || '';
  $('who-mat').textContent = sessao.matricula() || '—';
  const s = sessao.sessao();
  $('who-perf').textContent =
    (s && s.nome ? `${s.nome} · ` : '') + (ROTULO_PERFIL[sessao.perfil()] || '—');
}

export function abas() {
  const permitidas = ABAS[sessao.perfil()] || ABAS.operador;
  document.querySelectorAll('#tabs button[data-r]').forEach((b) => {
    b.hidden = !permitidas.includes(b.dataset.r);
    b.setAttribute('aria-pressed', String(b.dataset.r === estado.aba));
  });

  // O botão de ação muda de dono conforme a aba.
  const add = $('btn-add');
  if (estado.aba === 'usuarios' && podeGerirUsuarios(sessao.perfil())) {
    add.hidden = false;
    add.textContent = 'Novo usuário';
  } else if (estado.aba === 'compras' && podeCadastrar(sessao.perfil())) {
    add.hidden = false;
    add.textContent = 'Inserir programação';
  } else {
    add.hidden = true;
  }

  $('btn-exp').hidden = estado.aba === 'usuarios';
}

export function sincronismo() {
  const el = $('sync');
  el.textContent = estado.sync.texto || '';
  el.className = `sync ${estado.sync.estilo || ''}`.trim();
}

/* --------------------------------------------------------------- Filtros */

function valoresDe(campo) {
  const vistos = new Set();
  estado.dados.forEach((d) => {
    const v = String(d[campo] || '').trim();
    if (v) vistos.add(v);
  });
  return [...vistos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const LAYOUT_FILTROS = {
  almox:  [['sel', 'unidade', 'Unidade'], ['sel', 'fornecedor', 'Fornecedor'], ['txt', 'produto', 'Produto'], ['txt', 'ordem_compra', 'OC']],
  fiscal: [['sel', 'fornecedor', 'Fornecedor'], ['txt', 'cnpj', 'CNPJ'], ['txt', 'ordem_compra', 'OC'], ['sel', 'unidade', 'Unidade']],
  hist:   [['sel', 'unidade', 'Unidade'], ['sel', 'fornecedor', 'Fornecedor'], ['txt', 'produto', 'Produto'], ['txt', 'ordem_compra', 'OC']],
};

const PERIODOS = { tudo: 'Tudo', hoje: 'Hoje', semana: 'Esta semana' };

/** Aba para a qual a barra atual foi montada — evita remontar à toa. */
let barraMontadaPara = null;

/**
 * A barra só é remontada quando a aba muda. Nas demais pinturas, apenas as
 * listas dos selects são atualizadas: remontar a cada sincronização de 15s
 * apagaria o que o usuário está digitando no filtro.
 */
export function filtros() {
  const caixa = $('filters');

  if (estado.aba === 'compras' || estado.aba === 'usuarios') {
    caixa.className = '';
    caixa.innerHTML = '';
    barraMontadaPara = estado.aba;
    return;
  }

  if (barraMontadaPara === estado.aba && caixa.querySelector('[data-f]')) {
    atualizarOpcoes(caixa);
    return;
  }

  const partes = (LAYOUT_FILTROS[estado.aba] || []).map(([tipo, campo, rotulo]) => {
    if (tipo === 'sel') {
      const opcoes = valoresDe(campo)
        .map((v) => `<option${estado.filtro[campo] === v ? ' selected' : ''}>${esc(v)}</option>`)
        .join('');
      return `<label for="f-${campo}">${rotulo}</label>
              <select id="f-${campo}" data-f="${campo}"><option value="">Todos</option>${opcoes}</select>`;
    }
    return `<label for="f-${campo}">${rotulo}</label>
            <input id="f-${campo}" data-f="${campo}" type="text" placeholder="filtrar" value="${esc(estado.filtro[campo] || '')}">`;
  });

  if (estado.aba !== 'hist') {
    const chips = Object.entries(PERIODOS)
      .map(([k, r]) => `<button type="button" data-p="${k}" aria-pressed="${(estado.filtro.periodo || 'tudo') === k}">${r}</button>`)
      .join('');
    partes.push(`<span class="chips">${chips}</span>`);
  }

  caixa.className = 'filters';
  caixa.innerHTML = partes.join('');

  const aplicar = (el) => {
    estado.filtro[el.dataset.f] = el.value;
    quadro();
  };
  const aplicarAtrasado = atrasar(aplicar, 200);

  caixa.querySelectorAll('[data-f]').forEach((el) => {
    if (el.tagName === 'SELECT') el.addEventListener('change', () => aplicar(el));
    else el.addEventListener('input', () => aplicarAtrasado(el));
  });
  caixa.querySelectorAll('[data-p]').forEach((b) => {
    b.addEventListener('click', () => {
      estado.filtro.periodo = b.dataset.p;
      caixa.querySelectorAll('[data-p]').forEach((x) =>
        x.setAttribute('aria-pressed', String(x.dataset.p === estado.filtro.periodo)));
      quadro();
    });
  });

  barraMontadaPara = estado.aba;
}

/** Recarrega as listas de unidade/fornecedor sem mexer no que está focado. */
function atualizarOpcoes(caixa) {
  caixa.querySelectorAll('select[data-f]').forEach((sel) => {
    if (document.activeElement === sel) return;      // não puxa o tapete de quem está escolhendo
    const campo = sel.dataset.f;
    const valores = valoresDe(campo);
    const atuais = [...sel.options].slice(1).map((o) => o.value);
    if (atuais.length === valores.length && atuais.every((v, i) => v === valores[i])) return;

    const escolhido = estado.filtro[campo] || '';
    sel.innerHTML = `<option value="">Todos</option>` +
      valores.map((v) => `<option${v === escolhido ? ' selected' : ''}>${esc(v)}</option>`).join('');

    // O valor filtrado sumiu da base (item excluído ou renomeado): solta o filtro.
    if (escolhido && !valores.includes(escolhido)) delete estado.filtro[campo];
  });
}

function passa(item) {
  const contem = (campo) => {
    const alvo = estado.filtro[campo];
    return !alvo || String(item[campo] || '').toLowerCase().includes(alvo.toLowerCase());
  };
  if (!['unidade', 'fornecedor', 'produto', 'ordem_compra', 'cnpj'].every(contem)) return false;

  const periodo = estado.filtro.periodo || 'tudo';
  if (periodo === 'tudo' || estado.aba === 'hist') return true;

  const dias = diasAte(item);
  if (periodo === 'hoje') return dias <= 0;
  if (periodo === 'semana') return dias <= 7;
  return true;
}

/** Lista visível na aba corrente, já filtrada. Usada também na exportação. */
export function visiveis() {
  const base = estado.aba === 'hist' ? estado.dados.filter(ehHistorico) : estado.dados;
  return base.filter(passa);
}

/* ---------------------------------------------------------------- Quadro */

function linhaClicavel() {
  if (estado.aba === 'almox') return true;                    // baixa da doca
  if (estado.aba === 'compras') return podeCadastrar(sessao.perfil());
  return false;                                               // fiscal e histórico: leitura
}

function linha(item, agora, clicavel) {
  const sit = situacao(item, agora);
  const [texto, fundo] = COR[sit] || COR.CANCELADO;

  const meta = [
    esc(item.fornecedor || ''),
    item.ordem_compra ? `OC ${esc(item.ordem_compra)}` : '',
    item.cnpj ? esc(item.cnpj) : '',
  ].filter(Boolean).join(' <span>·</span> ');

  return `<div class="row${clicavel ? ' click' : ''}" data-id="${item.id}"
       style="border-left-color:${texto}"${clicavel ? ' tabindex="0" role="button"' : ''}>
    <span class="pill" style="color:${texto};background:${fundo}">${sit}</span>
    <div>
      <div class="prod">${esc(item.produto || item.codigo || '—')}</div>
      <div class="meta">${meta}</div>
      ${item.observacoes ? `<div class="obs">${esc(item.observacoes)}</div>` : ''}
    </div>
    ${item.unidade ? `<span class="unid">${esc(item.unidade)}</span>` : '<span></span>'}
    <span class="when" style="color:${texto}">${diaMes(item.data_entrega)}</span>
    ${item.descarga === 'SIM' ? '<span class="tag">Descarregado</span>' : '<span></span>'}
  </div>`;
}

function bloco(titulo, nota, itens, agora, clicavel) {
  return `<div class="lane">
    <div class="lane-head">
      <h2>${titulo}</h2><span class="n">${itens.length}</span>
      ${nota ? `<span class="note">${nota}</span>` : ''}
    </div>
    ${itens.map((i) => linha(i, agora, clicavel)).join('')}
  </div>`;
}

/* ------------------------------------------------------ Quadro: usuários */

const CORES_PERFIL = {
  master:   ['#FFB020', '#3A2A0A'],
  compras:  ['#56A8FF', '#0D2A4C'],
  operador: ['#3DD68C', '#0C3326'],
};

function linhaUsuario(u, eu) {
  const [texto, fundo] = CORES_PERFIL[u.perfil] || CORES_PERFIL.operador;
  const marcas = [
    !u.ativo ? '<span class="pill" style="color:#7A8CA3;background:#16283F">INATIVO</span>' : '',
    u.precisa_trocar_senha ? '<span class="tag" style="color:#FFB020;border-color:#7A5A14">Senha padrão</span>' : '',
    u.matricula === eu ? '<span class="tag">Você</span>' : '',
  ].filter(Boolean).join(' ');

  const detalhe = [
    u.senha_alterada_em ? `senha trocada em ${new Date(u.senha_alterada_em).toLocaleDateString('pt-BR')}` : 'nunca trocou a senha',
    u.ultimo_acesso ? `último acesso ${new Date(u.ultimo_acesso).toLocaleString('pt-BR')}` : 'nunca acessou',
  ].join(' <span>·</span> ');

  return `<div class="row click" data-mat="${esc(u.matricula)}" tabindex="0" role="button"
       style="border-left-color:${texto}${u.ativo ? '' : ';opacity:.55'}">
    <span class="pill" style="color:${texto};background:${fundo}">${esc(u.perfil)}</span>
    <div>
      <div class="prod">${esc(u.nome || '(sem nome)')}</div>
      <div class="meta">${detalhe}</div>
    </div>
    <span class="unid">${esc(u.matricula)}</span>
    <span class="when" style="color:${texto};font-size:0"></span>
    <span>${marcas}</span>
  </div>`;
}

function quadroUsuarios() {
  const eu = sessao.matricula();
  const lista = estado.usuarios;

  if (!lista.length) {
    $('board').innerHTML = '<div class="empty">Carregando usuários…</div>';
    return;
  }

  const grupos = [
    ['Master', lista.filter((u) => u.perfil === 'master'), 'acesso total, inclusive a esta tela'],
    ['Compras', lista.filter((u) => u.perfil === 'compras'), 'lançam e editam programação'],
    ['Operadores', lista.filter((u) => u.perfil === 'operador'), 'dão baixa na doca'],
  ];

  const pendentes = lista.filter((u) => u.precisa_trocar_senha && u.ativo).length;
  const aviso = pendentes
    ? `<div class="empty" style="padding:18px 0 0">${pendentes} usuário(s) ainda estão com a senha padrão.
       Enquanto não trocarem, o sistema recusa qualquer operação da conta.</div>`
    : '';

  $('board').innerHTML = aviso + grupos
    .filter(([, itens]) => itens.length)
    .map(([titulo, itens, nota]) => `<div class="lane">
        <div class="lane-head"><h2>${titulo}</h2><span class="n">${itens.length}</span>
          <span class="note">${nota}</span></div>
        ${itens.map((u) => linhaUsuario(u, eu)).join('')}
      </div>`)
    .join('');

  document.querySelectorAll('#board .row.click').forEach((el) => {
    const abrir = () => abrirUsuario(el.dataset.mat);
    el.addEventListener('click', abrir);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  });
}

/* --------------------------------------------------- Quadro: programação */

export function quadro() {
  if (estado.aba === 'usuarios') { quadroUsuarios(); return; }

  const agora = new Date();
  const alvo = $('board');
  const clicavel = linhaClicavel();
  const lista = visiveis();

  if (estado.aba === 'hist') {
    const ordenada = [...lista].sort((a, b) =>
      String(b.data_entrega).localeCompare(String(a.data_entrega)));
    alvo.innerHTML = ordenada.length
      ? bloco('Histórico', 'encerrados e vencidos', ordenada, agora, false)
      : '<div class="empty">Nada no histórico ainda.</div>';
    ligarLinhas();
    return;
  }

  if (!lista.length) {
    alvo.innerHTML = `<div class="empty">${
      estado.dados.length
        ? 'Nenhum item com esses filtros.'
        : 'Nenhuma programação lançada. Vá em Compras e clique em “Inserir programação”.'
    }</div>`;
    return;
  }

  const grupos = Object.fromEntries(FAIXAS.map((f) => [f, []]));
  lista.forEach((i) => grupos[faixa(i)].push(i));

  alvo.innerHTML = FAIXAS
    .filter((f) => grupos[f].length)
    .map((f) => {
      grupos[f].sort((a, b) =>
        (RANK[situacao(a, agora)] - RANK[situacao(b, agora)]) ||
        String(a.data_entrega).localeCompare(String(b.data_entrega)));
      return bloco(TITULO_FAIXA[f], NOTA_FAIXA[f], grupos[f], agora, clicavel);
    })
    .join('');

  ligarLinhas();
}

function ligarLinhas() {
  document.querySelectorAll('#board .row.click').forEach((el) => {
    const abrir = () => abrirDetalhe(Number(el.dataset.id));
    el.addEventListener('click', abrir);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  });
}

/* ------------------------------------------------------------ Repintura */

/**
 * Redesenha o painel inteiro. Pode ser chamada à vontade: a barra de filtros
 * só é remontada quando a aba muda, e o quadro é um innerHTML único.
 */
export function pintar() {
  relogio();
  cabecalho();
  abas();
  sincronismo();
  filtros();
  quadro();
}
