/* ===========================================================================
 * modais.js — as duas folhas do painel: detalhe do item e grade de inserção.
 * ======================================================================== */

'use strict';

import { estado } from './estado.js';
import * as sessao from './sessao.js';
import * as dados from './dados.js';
import { DB } from './db.js';
import { esc, normData, normNumero, soDigitos, formataCnpj, cnpjValido } from './util.js';
import {
  CAMPOS, COR, STATUS, PERFIS, podeEditarNaAba, statusPermitidos, podeCancelar,
} from './regras.js';
import { ligarAutocomplete, completarEmLote } from './fornecedores.js';

/** Posição das colunas que conversam entre si na grade de inserção. */
const COL_FORNECEDOR = CAMPOS.findIndex(([k]) => k === 'fornecedor');
const COL_CNPJ = CAMPOS.findIndex(([k]) => k === 'cnpj');

/* ----------------------------------------------------------- Infra comum */

/**
 * @param {{largo?: boolean, fixa?: boolean}} opcoes
 *   fixa = não fecha por Esc nem por clique fora (troca de senha obrigatória).
 */
function abrirFolha(html, { largo = false, fixa = false } = {}) {
  const folha = document.createElement('div');
  folha.className = 'sheet';
  folha.innerHTML = `<div class="card${largo ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(folha);

  const fechar = () => {
    folha.remove();
    document.removeEventListener('keydown', aoTeclar);
  };
  const aoTeclar = (e) => { if (e.key === 'Escape' && !fixa) fechar(); };

  document.addEventListener('keydown', aoTeclar);
  if (!fixa) folha.addEventListener('click', (e) => { if (e.target === folha) fechar(); });

  return { folha, fechar, $: (sel) => folha.querySelector(sel) };
}

function aviso(el, texto, ruim = false) {
  el.className = `status${ruim ? ' bad' : ''}`;
  el.textContent = texto;
}

/** Trava os botões enquanto a gravação está em voo. */
function travar(folha, travado) {
  folha.querySelectorAll('.acts button, .gridbar button').forEach((b) => { b.disabled = travado; });
}

/* --------------------------------------------------- 1. Detalhe do item */

export function abrirDetalhe(id) {
  const item = dados.item(id);
  if (!item) return;

  const perfil = sessao.perfil();
  const cadastroLiberado = podeEditarNaAba(perfil, estado.aba);
  const statusAtual = item.status_entrega || 'PENDENTE';

  const camposCadastro = !cadastroLiberado ? '' : `
    <label class="full">Dados da programação</label>
    <div class="fields">
      ${CAMPOS.map(([chave, rotulo]) => {
        const valor = chave === 'data_entrega'
          ? String(item.data_entrega || '').slice(0, 10)
          : (item[chave] == null ? '' : item[chave]);
        const tipo = chave === 'data_entrega' ? 'date' : chave === 'volume' ? 'number' : 'text';
        return `<div${chave === 'produto' ? ' class="full"' : ''}>
          <label for="f-${chave}">${rotulo}</label>
          <input id="f-${chave}" type="${tipo}"${tipo === 'number' ? ' step="any"' : ''} value="${esc(valor)}">
        </div>`;
      }).join('')}
    </div>`;

  const cabecalho = [
    esc(item.fornecedor || ''),
    item.ordem_compra ? `OC ${esc(item.ordem_compra)}` : '',
    item.unidade ? esc(item.unidade) : '',
  ].filter(Boolean).join(' · ');

  // Item já cancelado e perfil que não cancela: o status vira informação fixa.
  // Ele ainda registra descarga e observação — se o caminhão apareceu mesmo
  // depois do cancelamento, isso precisa ficar escrito em algum lugar.
  const statusTravado = statusAtual === 'CANCELADO' && !podeCancelar(perfil);
  const opcoesStatus = statusPermitidos(perfil);

  const blocoStatus = statusTravado
    ? `<label>Status da entrega</label>
       <div class="opts">
         <button type="button" disabled
           style="background:${COR.CANCELADO[1]};color:${COR.CANCELADO[0]};border-color:transparent;opacity:1">CANCELADO</button>
       </div>
       <div class="hint" style="margin-top:8px">
         Cancelado pelo Compras. Se o material chegou mesmo assim, registre a
         descarga e escreva nas observações — depois avise o comprador.
       </div>`
    : `<label>Status da entrega</label>
       <div class="opts" id="op-st">${opcoesStatus.map((o) => `<button type="button" data-v="${o}">${o}</button>`).join('')}</div>`;

  const { folha, fechar, $ } = abrirFolha(`
    <h3>${esc(item.produto || item.codigo || 'Item')}</h3>
    <div class="sub">${cabecalho}</div>
    ${camposCadastro}
    ${blocoStatus}
    <label>Descarga realizada</label>
    <div class="opts" id="op-dc">${['SIM', 'NAO'].map((o) => `<button type="button" data-v="${o}">${o}</button>`).join('')}</div>
    <label for="f-obs">Observações</label>
    <textarea id="f-obs" rows="3" maxlength="2000">${esc(item.observacoes || '')}</textarea>
    <div class="status" id="st" aria-live="polite"></div>
    <div class="acts">
      ${cadastroLiberado ? '<button type="button" class="del" id="rm">Excluir</button>' : ''}
      <button type="button" id="x">Cancelar</button>
      <span class="spacer"></span>
      <button type="button" class="go" id="ok">Salvar</button>
    </div>`);

  let status = statusAtual;
  let descarga = item.descarga || 'NAO';

  const corDoStatus = (v) => COR[v === 'PENDENTE' ? 'DENTRO DO PRAZO' : v][0];
  const marcar = (grupo, valor, cor) => {
    folha.querySelectorAll(`${grupo} button`).forEach((b) => {
      const ligado = b.dataset.v === valor;
      b.setAttribute('aria-pressed', String(ligado));
      b.style.cssText = ligado
        ? `background:${cor(b.dataset.v)};border-color:transparent;color:#071A33;`
        : '';
    });
  };

  marcar('#op-st', status, corDoStatus);
  marcar('#op-dc', descarga, () => '#D9A441');

  folha.querySelectorAll('#op-st button').forEach((b) => {
    b.addEventListener('click', () => { status = b.dataset.v; marcar('#op-st', status, corDoStatus); });
  });
  folha.querySelectorAll('#op-dc button').forEach((b) => {
    b.addEventListener('click', () => { descarga = b.dataset.v; marcar('#op-dc', descarga, () => '#D9A441'); });
  });

  // Digitou o fornecedor, o CNPJ vem da base cadastrada.
  if (cadastroLiberado) ligarAutocomplete($('#f-fornecedor'), $('#f-cnpj'));

  $('#x').addEventListener('click', fechar);

  if (cadastroLiberado) {
    $('#rm').addEventListener('click', async () => {
      if (!confirm('Excluir esta programação? A ação fica registrada na auditoria.')) return;
      travar(folha, true);
      aviso($('#st'), 'Excluindo…');
      try {
        await dados.excluir(id);
        fechar();
      } catch (e) {
        travar(folha, false);
        aviso($('#st'), e.message, true);
      }
    });
  }

  $('#ok').addEventListener('click', async () => {
    travar(folha, true);
    aviso($('#st'), 'Salvando…');
    try {
      if (cadastroLiberado) {
        const campos = { status_entrega: status, descarga, observacoes: $('#f-obs').value.trim() };
        for (const [chave] of CAMPOS) {
          const bruto = folha.querySelector(`#f-${chave}`).value.trim();
          if (chave === 'volume') campos.volume = bruto === '' ? null : normNumero(bruto);
          else if (chave === 'data_entrega') {
            const d = normData(bruto);
            if (!d) { throw new Error('Data de entrega inválida.'); }
            campos.data_entrega = d;
          } else campos[chave] = bruto;
        }
        await dados.salvarCadastro(id, campos);
      } else {
        await dados.darBaixa(id, status, descarga, $('#f-obs').value.trim());
      }
      fechar();
    } catch (e) {
      travar(folha, false);
      aviso($('#st'), e.ehRede ? 'Sem conexão — a baixa não foi salva. Tente de novo quando o sinal voltar.' : e.message, true);
    }
  });
}

/* ------------------------------------------------ 2. Grade de inserção */

export function abrirInsercao() {
  let linhas = 5;

  const { folha, fechar, $ } = abrirFolha(`
    <h3>Inserir programação</h3>
    <div class="sub">Digite ou cole direto do Excel — a colagem se espalha a partir da célula selecionada</div>
    <div class="hint">
      Ordem das colunas: <b>${CAMPOS.map(([, r]) => r).join(' · ')}</b>.
      A data aceita <b>10/09/2026</b> ou <b>2026-09-10</b>.
      Linha sem data, ou sem código e sem produto, é descartada.
    </div>
    <div id="gwrap"></div>
    <div class="gridbar">
      <button type="button" id="mais">+ mais 5 linhas</button>
      <span class="spacer"></span>
      <span class="status" id="st" aria-live="polite"></span>
    </div>
    <div class="acts">
      <button type="button" id="x">Cancelar</button>
      <span class="spacer"></span>
      <button type="button" class="go" id="ok">Inserir</button>
    </div>`, { largo: true });

  const celula = (r, c) => folha.querySelector(`#gwrap input[data-r="${r}"][data-c="${c}"]`);

  function desenhar() {
    const antes = [...folha.querySelectorAll('#gwrap input')].map((i) => i.value);
    folha.querySelector('#gwrap').innerHTML = `
      <table class="grid">
        <thead><tr>${CAMPOS.map(([, r]) => `<th>${r}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: linhas }, (_, r) =>
          `<tr>${CAMPOS.map((_c, c) =>
            `<td><input type="text" data-r="${r}" data-c="${c}" autocomplete="off"></td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table>`;

    const campos = folha.querySelectorAll('#gwrap input');
    campos.forEach((el, n) => { if (antes[n] !== undefined) el.value = antes[n]; });
    campos.forEach((el) => el.addEventListener('paste', colar));

    // Cada linha ganha o par Fornecedor -> CNPJ ligado à base cadastrada.
    for (let r = 0; r < linhas; r++) {
      ligarAutocomplete(celula(r, COL_FORNECEDOR), celula(r, COL_CNPJ));
    }
  }

  /** Pares nome/CNPJ de todas as linhas, para o preenchimento pós-colagem. */
  const paresDaGrade = () =>
    Array.from({ length: linhas }, (_v, r) => ({
      nome: celula(r, COL_FORNECEDOR),
      cnpj: celula(r, COL_CNPJ),
    }));

  /** Colagem em bloco vinda do Excel: tab separa coluna, quebra separa linha. */
  function colar(e) {
    const texto = (e.clipboardData || window.clipboardData).getData('text');
    if (!texto.includes('\t') && !texto.includes('\n')) return;
    e.preventDefault();

    const r0 = Number(e.target.dataset.r);
    const c0 = Number(e.target.dataset.c);
    const matriz = texto.replace(/\r/g, '').split('\n').filter((l) => l.length).map((l) => l.split('\t'));

    if (r0 + matriz.length > linhas) {
      linhas = r0 + matriz.length;
      desenhar();
    }
    matriz.forEach((linha, ri) => linha.forEach((valor, ci) => {
      const alvo = celula(r0 + ri, c0 + ci);
      if (alvo) alvo.value = String(valor).trim();
    }));

    // Colou sem a coluna de CNPJ? A base preenche o que reconhecer.
    const completados = completarEmLote(paresDaGrade());
    if (completados) {
      aviso($('#st'), `${completados} CNPJ(s) preenchido(s) pela base de fornecedores.`);
    }
  }

  desenhar();
  $('#mais').addEventListener('click', () => { linhas += 5; desenhar(); });
  $('#x').addEventListener('click', fechar);

  $('#ok').addEventListener('click', async () => {
    const novos = [];
    const descartadas = [];

    for (let r = 0; r < linhas; r++) {
      const v = CAMPOS.map((_c, c) => (celula(r, c)?.value || '').trim());
      if (v.every((x) => !x)) continue;

      const data = normData(v[5]);
      if (!data || (!v[0] && !v[1])) { descartadas.push(r + 1); continue; }

      novos.push({
        codigo: v[0], produto: v[1], fornecedor: v[2], cnpj: v[3],
        volume: normNumero(v[4]),
        data_entrega: data, ordem_compra: v[6], unidade: v[7],
      });
    }

    if (!novos.length) {
      aviso($('#st'), 'Nenhuma linha válida — confira código/produto e a data.', true);
      return;
    }
    if (novos.length > 500) {
      aviso($('#st'), 'Máximo de 500 linhas por envio. Divida a planilha.', true);
      return;
    }

    travar(folha, true);
    aviso($('#st'), `Gravando ${novos.length} linha(s)…`);
    try {
      const gravadas = await dados.inserirLote(novos);
      if (descartadas.length) {
        alert(`${gravadas.length} linha(s) inserida(s).\nDescartadas por falta de data ou de código/produto: ${descartadas.join(', ')}.`);
      }
      fechar();
    } catch (e) {
      travar(folha, false);
      aviso($('#st'), e.ehRede ? 'Sem conexão — nada foi gravado.' : e.message, true);
    }
  });
}

/* --------------------------------------------------- 3. Troca de senha */

/**
 * @param {{obrigatoria?: boolean, aoConcluir?: Function}} opcoes
 *   obrigatoria = primeiro acesso: não dá para fechar nem usar o painel antes.
 */
export function abrirTrocaSenha({ obrigatoria = false, aoConcluir = null } = {}) {
  const { folha, fechar, $ } = abrirFolha(`
    <h3>${obrigatoria ? 'Defina sua senha' : 'Trocar senha'}</h3>
    <div class="sub">Matrícula ${esc(sessao.matricula())}</div>
    ${obrigatoria ? `<div class="hint">
      Este é o seu primeiro acesso. A senha padrão vale só para entrar: escolha
      agora uma senha sua. <b>Enquanto não trocar, o sistema não aceita nenhuma
      operação da sua conta.</b></div>` : ''}
    <label for="s-atual">${obrigatoria ? 'Senha padrão (a que você acabou de usar)' : 'Senha atual'}</label>
    <input id="s-atual" type="password" autocomplete="current-password" maxlength="64">
    <label for="s-nova">Nova senha</label>
    <input id="s-nova" type="password" autocomplete="new-password" maxlength="64">
    <label for="s-conf">Repita a nova senha</label>
    <input id="s-conf" type="password" autocomplete="new-password" maxlength="64">
    <div class="status" id="st" aria-live="polite"></div>
    <div class="acts">
      ${obrigatoria ? '<button type="button" id="x">Sair</button>' : '<button type="button" id="x">Cancelar</button>'}
      <span class="spacer"></span>
      <button type="button" class="go" id="ok">Salvar senha</button>
    </div>`, { fixa: obrigatoria });

  $('#s-atual').focus();

  $('#x').addEventListener('click', () => {
    if (obrigatoria) { fechar(); document.getElementById('sair').click(); }
    else fechar();
  });

  const salvar = async () => {
    const atual = $('#s-atual').value;
    const nova = $('#s-nova').value;
    const conf = $('#s-conf').value;

    if (nova !== conf) { aviso($('#st'), 'A confirmação não confere com a nova senha.', true); return; }

    travar(folha, true);
    aviso($('#st'), 'Salvando…');
    try {
      const r = await DB.trocarSenha(sessao.token(), atual, nova);
      if (!r || !r.ok) {
        travar(folha, false);
        aviso($('#st'), (r && r.motivo) || 'Não foi possível trocar a senha.', true);
        return;
      }
      sessao.senhaTrocada();
      fechar();
      if (aoConcluir) await aoConcluir();
    } catch (e) {
      travar(folha, false);
      aviso($('#st'), e.ehRede ? 'Sem conexão — a senha não foi trocada.' : e.message, true);
    }
  };

  $('#ok').addEventListener('click', salvar);
  folha.querySelectorAll('input').forEach((el) =>
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); }));
}

/* ------------------------------------------------ 4. Cadastro de usuário */

function avisoSenhaPadrao(matricula, senha) {
  alert(
    `Usuário ${matricula} pronto.\n\n` +
    `Senha inicial: ${senha}\n\n` +
    `Entregue essa senha à pessoa. No primeiro acesso o sistema vai obrigá-la a trocar.`
  );
}

/** @param {string|null} matricula — null abre o formulário de novo usuário. */
export function abrirUsuario(matricula) {
  const u = matricula ? dados.usuario(matricula) : null;
  const novo = !u;
  const euMesmo = u && u.matricula === sessao.matricula();

  const opcoesPerfil = PERFIS.map(([valor, rotulo]) =>
    `<button type="button" data-v="${valor}">${rotulo}</button>`).join('');

  const { folha, fechar, $ } = abrirFolha(`
    <h3>${novo ? 'Novo usuário' : esc(u.nome || u.matricula)}</h3>
    <div class="sub">${novo
      ? 'A senha inicial é a padrão; a pessoa troca no primeiro acesso'
      : `Matrícula ${esc(u.matricula)} · cadastrado em ${new Date(u.criado_em).toLocaleDateString('pt-BR')}`}</div>

    ${novo ? `<div class="hint">Precisa cadastrar o turno inteiro?
      <b>Use o botão “Colar lista” abaixo</b> e cole matrícula e nome direto da planilha.</div>` : ''}

    <div class="fields">
      <div>
        <label for="u-mat">Matrícula</label>
        <input id="u-mat" type="text" inputmode="numeric" maxlength="10"
               value="${novo ? '' : esc(u.matricula)}" ${novo ? '' : 'disabled'}>
      </div>
      <div>
        <label for="u-nome">Nome</label>
        <input id="u-nome" type="text" maxlength="80" value="${novo ? '' : esc(u.nome)}">
      </div>
    </div>

    <label>Perfil</label>
    <div class="opts" id="u-perfil">${opcoesPerfil}</div>
    <div class="hint" id="u-perfil-nota" style="margin-top:8px"></div>

    ${novo ? '' : `
      <label>Situação</label>
      <div class="opts" id="u-ativo">
        <button type="button" data-v="1">Ativo</button>
        <button type="button" data-v="0">Inativo</button>
      </div>
      ${euMesmo ? '<div class="hint" style="margin-top:8px">Esta é a sua conta: você não pode se rebaixar, se desativar nem se excluir.</div>' : ''}`}

    <div class="status" id="st" aria-live="polite"></div>
    <div class="acts">
      ${novo ? '<button type="button" id="lote">Colar lista</button>' : ''}
      ${(!novo && !euMesmo) ? '<button type="button" id="reset">Resetar senha</button>' : ''}
      ${(!novo && !euMesmo) ? '<button type="button" class="del" id="rm">Excluir</button>' : ''}
      <button type="button" id="x">Cancelar</button>
      <span class="spacer"></span>
      <button type="button" class="go" id="ok">${novo ? 'Cadastrar' : 'Salvar'}</button>
    </div>`);

  let perfil = novo ? 'operador' : u.perfil;
  let ativo = novo ? true : u.ativo;

  const marcarPerfil = () => {
    folha.querySelectorAll('#u-perfil button').forEach((b) => {
      const on = b.dataset.v === perfil;
      b.setAttribute('aria-pressed', String(on));
      b.style.cssText = on ? 'background:#D9A441;border-color:transparent;color:#071A33;' : '';
    });
    const achado = PERFIS.find(([v]) => v === perfil);
    $('#u-perfil-nota').textContent = achado ? achado[2] : '';
  };
  const marcarAtivo = () => {
    folha.querySelectorAll('#u-ativo button').forEach((b) => {
      const on = b.dataset.v === (ativo ? '1' : '0');
      b.setAttribute('aria-pressed', String(on));
      b.style.cssText = on ? 'background:#D9A441;border-color:transparent;color:#071A33;' : '';
    });
  };

  marcarPerfil();
  marcarAtivo();
  folha.querySelectorAll('#u-perfil button').forEach((b) =>
    b.addEventListener('click', () => { perfil = b.dataset.v; marcarPerfil(); }));
  folha.querySelectorAll('#u-ativo button').forEach((b) =>
    b.addEventListener('click', () => { ativo = b.dataset.v === '1'; marcarAtivo(); }));

  $('#x').addEventListener('click', fechar);
  if (novo) $('#lote').addEventListener('click', () => { fechar(); abrirUsuariosEmLote(); });

  if (!novo && !euMesmo) {
    $('#reset').addEventListener('click', async () => {
      if (!confirm(`Resetar a senha de ${u.matricula}?\n\nA pessoa volta para a senha padrão e será obrigada a trocá-la. As sessões abertas dela caem na hora.`)) return;
      travar(folha, true);
      aviso($('#st'), 'Resetando…');
      try {
        const r = await dados.resetarSenha(u.matricula);
        fechar();
        if (r && r.ok) avisoSenhaPadrao(u.matricula, r.senha_padrao);
      } catch (e) {
        travar(folha, false);
        aviso($('#st'), e.message, true);
      }
    });

    $('#rm').addEventListener('click', async () => {
      if (!confirm(`Excluir ${u.matricula} definitivamente?\n\nPara apenas tirar o acesso de quem saiu da empresa, prefira marcar como Inativo — assim o histórico de quem deu cada baixa continua legível.`)) return;
      travar(folha, true);
      aviso($('#st'), 'Excluindo…');
      try {
        const r = await dados.excluirUsuario(u.matricula);
        if (r && !r.ok) { travar(folha, false); aviso($('#st'), r.motivo, true); return; }
        fechar();
      } catch (e) {
        travar(folha, false);
        aviso($('#st'), e.message, true);
      }
    });
  }

  $('#ok').addEventListener('click', async () => {
    const mat = (novo ? $('#u-mat').value : u.matricula).replace(/\D/g, '');
    const nome = $('#u-nome').value.trim();

    if (novo && mat.length < 6) { aviso($('#st'), 'A matrícula precisa ter pelo menos 6 dígitos.', true); return; }

    travar(folha, true);
    aviso($('#st'), 'Salvando…');
    try {
      const r = await dados.salvarUsuario(mat, nome, perfil, ativo);
      if (r && !r.ok) { travar(folha, false); aviso($('#st'), r.motivo, true); return; }
      fechar();
      if (r && r.novo) avisoSenhaPadrao(mat, r.senha_padrao);
    } catch (e) {
      travar(folha, false);
      aviso($('#st'), e.ehRede ? 'Sem conexão — nada foi salvo.' : e.message, true);
    }
  });
}

/* -------------------------------------- 5. Cadastro de usuários em lote */

const COLUNAS_USUARIO = [['matricula', 'Matrícula'], ['nome', 'Nome'], ['perfil', 'Perfil']];

export function abrirUsuariosEmLote() {
  let linhas = 10;

  const { folha, fechar, $ } = abrirFolha(`
    <h3>Cadastrar vários usuários</h3>
    <div class="sub">Cole direto da planilha do RH — a colagem se espalha a partir da célula selecionada</div>
    <div class="hint">
      Colunas: <b>Matrícula · Nome · Perfil</b>. O perfil aceita
      <b>operador</b>, <b>compras</b> ou <b>master</b>; em branco vira operador.
      Todos nascem com a senha padrão e trocam no primeiro acesso.
      Matrícula já cadastrada é ignorada — ninguém é sobrescrito por engano.
    </div>
    <div id="gwrap"></div>
    <div class="gridbar">
      <button type="button" id="mais">+ mais 10 linhas</button>
      <span class="spacer"></span>
      <span class="status" id="st" aria-live="polite"></span>
    </div>
    <div class="acts">
      <button type="button" id="x">Cancelar</button>
      <span class="spacer"></span>
      <button type="button" class="go" id="ok">Cadastrar</button>
    </div>`, { largo: true });

  const celula = (r, c) => folha.querySelector(`#gwrap input[data-r="${r}"][data-c="${c}"]`);

  function desenhar() {
    const antes = [...folha.querySelectorAll('#gwrap input')].map((i) => i.value);
    folha.querySelector('#gwrap').innerHTML = `
      <table class="grid" style="min-width:520px">
        <thead><tr>${COLUNAS_USUARIO.map(([, r]) => `<th>${r}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: linhas }, (_, r) =>
          `<tr>${COLUNAS_USUARIO.map((_c, c) =>
            `<td><input type="text" data-r="${r}" data-c="${c}" autocomplete="off"></td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table>`;
    const campos = folha.querySelectorAll('#gwrap input');
    campos.forEach((el, n) => { if (antes[n] !== undefined) el.value = antes[n]; });
    campos.forEach((el) => el.addEventListener('paste', colar));
  }

  function colar(e) {
    const texto = (e.clipboardData || window.clipboardData).getData('text');
    if (!texto.includes('\t') && !texto.includes('\n')) return;
    e.preventDefault();
    const r0 = Number(e.target.dataset.r);
    const c0 = Number(e.target.dataset.c);
    const matriz = texto.replace(/\r/g, '').split('\n').filter((l) => l.length).map((l) => l.split('\t'));
    if (r0 + matriz.length > linhas) { linhas = r0 + matriz.length; desenhar(); }
    matriz.forEach((linha, ri) => linha.forEach((valor, ci) => {
      const alvo = celula(r0 + ri, c0 + ci);
      if (alvo) alvo.value = String(valor).trim();
    }));
  }

  desenhar();
  $('#mais').addEventListener('click', () => { linhas += 10; desenhar(); });
  $('#x').addEventListener('click', fechar);

  $('#ok').addEventListener('click', async () => {
    const novos = [];
    for (let r = 0; r < linhas; r++) {
      const v = COLUNAS_USUARIO.map((_c, c) => (celula(r, c)?.value || '').trim());
      if (v.every((x) => !x)) continue;
      novos.push({ matricula: v[0].replace(/\D/g, ''), nome: v[1], perfil: (v[2] || 'operador').toLowerCase() });
    }

    if (!novos.length) { aviso($('#st'), 'Nenhuma linha preenchida.', true); return; }

    travar(folha, true);
    aviso($('#st'), `Cadastrando ${novos.length} usuário(s)…`);
    try {
      const r = await dados.inserirUsuarios(novos);
      fechar();
      alert(
        `${r.cadastrados} usuário(s) cadastrado(s).` +
        (r.ignorados ? `\n${r.ignorados} linha(s) ignorada(s) — matrícula já existente, curta demais ou perfil inválido.` : '') +
        `\n\nSenha inicial de todos: ${r.senha_padrao}\nCada um troca no primeiro acesso.`
      );
    } catch (e) {
      travar(folha, false);
      aviso($('#st'), e.ehRede ? 'Sem conexão — nada foi cadastrado.' : e.message, true);
    }
  });
}

/* ------------------------------------------------ 6. Cadastro de fornecedor */

/** @param {string|null} cnpj — null abre o formulário de novo fornecedor. */
export function abrirFornecedor(cnpj) {
  const f = cnpj ? dados.fornecedor(cnpj) : null;
  const novo = !f;

  const { folha, fechar, $ } = abrirFolha(`
    <h3>${novo ? 'Novo fornecedor' : esc(f.nome)}</h3>
    <div class="sub">${novo
      ? 'Entra na base de consulta usada pelo preenchimento automático'
      : `CNPJ ${formataCnpj(f.cnpj)} · cadastrado em ${new Date(f.criado_em).toLocaleDateString('pt-BR')}`}</div>

    ${novo ? `<div class="hint">Vai carregar a base inteira?
      <b>Use o botão “Colar lista” abaixo</b> e cole CNPJ e razão social direto da planilha.</div>` : ''}

    <div class="fields">
      <div>
        <label for="fr-cnpj">CNPJ</label>
        <input id="fr-cnpj" type="text" inputmode="numeric" maxlength="18"
               value="${novo ? '' : formataCnpj(f.cnpj)}" ${novo ? '' : 'disabled'}>
      </div>
      <div>
        <label for="fr-apelido">Apelido <span style="text-transform:none">(como o pessoal chama)</span></label>
        <input id="fr-apelido" type="text" maxlength="60" value="${novo ? '' : esc(f.apelido || '')}">
      </div>
      <div class="full">
        <label for="fr-nome">Razão social</label>
        <input id="fr-nome" type="text" maxlength="120" value="${novo ? '' : esc(f.nome)}">
      </div>
    </div>

    <div class="status" id="st" aria-live="polite"></div>
    <div class="acts">
      ${novo ? '<button type="button" id="lote">Colar lista</button>' : ''}
      ${novo ? '' : '<button type="button" class="del" id="rm">Excluir</button>'}
      <button type="button" id="x">Cancelar</button>
      <span class="spacer"></span>
      <button type="button" class="go" id="ok">${novo ? 'Cadastrar' : 'Salvar'}</button>
    </div>`);

  // Máscara e alerta de dígito verificador enquanto digita.
  const campoCnpj = $('#fr-cnpj');
  campoCnpj.addEventListener('blur', () => {
    const d = soDigitos(campoCnpj.value);
    if (d.length === 14) {
      campoCnpj.value = formataCnpj(d);
      if (!cnpjValido(d)) {
        aviso($('#st'), 'Atenção: o dígito verificador não bate. Confira antes de salvar.', true);
      }
    }
  });

  $('#x').addEventListener('click', fechar);
  if (novo) $('#lote').addEventListener('click', () => { fechar(); abrirFornecedoresEmLote(); });

  if (!novo) {
    $('#rm').addEventListener('click', async () => {
      if (!confirm(`Excluir ${f.nome} da base de consulta?\n\nA programação já lançada não muda — o CNPJ continua gravado em cada entrega. O que se perde é o preenchimento automático daqui para a frente.`)) return;
      travar(folha, true);
      aviso($('#st'), 'Excluindo…');
      try {
        await dados.excluirFornecedor(f.cnpj);
        fechar();
      } catch (e) {
        travar(folha, false);
        aviso($('#st'), e.message, true);
      }
    });
  }

  $('#ok').addEventListener('click', async () => {
    const valorCnpj = novo ? $('#fr-cnpj').value : f.cnpj;
    const nome = $('#fr-nome').value.trim();
    const apelido = $('#fr-apelido').value.trim();

    if (soDigitos(valorCnpj).length !== 14) {
      aviso($('#st'), 'O CNPJ precisa ter 14 dígitos.', true);
      return;
    }
    if (!nome) {
      aviso($('#st'), 'Informe a razão social.', true);
      return;
    }

    travar(folha, true);
    aviso($('#st'), 'Salvando…');
    try {
      const r = await dados.salvarFornecedor(soDigitos(valorCnpj), nome, apelido, true);
      if (r && !r.ok) { travar(folha, false); aviso($('#st'), r.motivo, true); return; }
      fechar();
    } catch (e) {
      travar(folha, false);
      aviso($('#st'), e.ehRede ? 'Sem conexão — nada foi salvo.' : e.message, true);
    }
  });
}

/* --------------------------------------- 7. Carga da base de fornecedores */

const COLUNAS_FORNECEDOR = [['cnpj', 'CNPJ'], ['nome', 'Razão social'], ['apelido', 'Apelido (opcional)']];

export function abrirFornecedoresEmLote() {
  let linhas = 15;

  const { folha, fechar, $ } = abrirFolha(`
    <h3>Carregar base de fornecedores</h3>
    <div class="sub">Cole direto da planilha — a colagem se espalha a partir da célula selecionada</div>
    <div class="hint">
      Colunas: <b>CNPJ · Razão social · Apelido</b>. O CNPJ aceita com ou sem
      pontuação. Linha sem CNPJ de 14 dígitos ou sem razão social é descartada.
      <br><br>
      <b>Pode repetir a carga quando quiser:</b> quem já está cadastrado tem o
      nome atualizado, não duplica. Assim você joga a base nova do ERP por cima
      da antiga sem medo.
    </div>
    <div id="gwrap"></div>
    <div class="gridbar">
      <button type="button" id="mais">+ mais 15 linhas</button>
      <span class="spacer"></span>
      <span class="status" id="st" aria-live="polite"></span>
    </div>
    <div class="acts">
      <button type="button" id="x">Cancelar</button>
      <span class="spacer"></span>
      <button type="button" class="go" id="ok">Carregar</button>
    </div>`, { largo: true });

  const celula = (r, c) => folha.querySelector(`#gwrap input[data-r="${r}"][data-c="${c}"]`);

  function desenhar() {
    const antes = [...folha.querySelectorAll('#gwrap input')].map((i) => i.value);
    folha.querySelector('#gwrap').innerHTML = `
      <table class="grid" style="min-width:620px">
        <thead><tr>${COLUNAS_FORNECEDOR.map(([, r]) => `<th>${r}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: linhas }, (_, r) =>
          `<tr>${COLUNAS_FORNECEDOR.map((_c, c) =>
            `<td><input type="text" data-r="${r}" data-c="${c}" autocomplete="off"></td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table>`;
    const campos = folha.querySelectorAll('#gwrap input');
    campos.forEach((el, n) => { if (antes[n] !== undefined) el.value = antes[n]; });
    campos.forEach((el) => el.addEventListener('paste', colar));
  }

  function colar(e) {
    const texto = (e.clipboardData || window.clipboardData).getData('text');
    if (!texto.includes('\t') && !texto.includes('\n')) return;
    e.preventDefault();
    const r0 = Number(e.target.dataset.r);
    const c0 = Number(e.target.dataset.c);
    const matriz = texto.replace(/\r/g, '').split('\n').filter((l) => l.length).map((l) => l.split('\t'));
    if (r0 + matriz.length > linhas) { linhas = r0 + matriz.length; desenhar(); }
    matriz.forEach((linha, ri) => linha.forEach((valor, ci) => {
      const alvo = celula(r0 + ri, c0 + ci);
      if (alvo) alvo.value = String(valor).trim();
    }));
  }

  desenhar();
  $('#mais').addEventListener('click', () => { linhas += 15; desenhar(); });
  $('#x').addEventListener('click', fechar);

  $('#ok').addEventListener('click', async () => {
    const novos = [];
    let suspeitos = 0;

    for (let r = 0; r < linhas; r++) {
      const v = COLUNAS_FORNECEDOR.map((_c, c) => (celula(r, c)?.value || '').trim());
      if (v.every((x) => !x)) continue;
      const cnpj = soDigitos(v[0]);
      if (cnpj.length === 14 && !cnpjValido(cnpj)) suspeitos++;
      novos.push({ cnpj, nome: v[1], apelido: v[2] });
    }

    if (!novos.length) { aviso($('#st'), 'Nenhuma linha preenchida.', true); return; }

    travar(folha, true);
    aviso($('#st'), `Carregando ${novos.length} fornecedor(es)…`);
    try {
      const r = await dados.inserirFornecedores(novos);
      fechar();
      alert(
        `Base atualizada.\n\n` +
        `${r.novos} novo(s)\n${r.atualizados} atualizado(s)` +
        (r.ignorados ? `\n${r.ignorados} descartado(s) — CNPJ fora de 14 dígitos ou sem razão social` : '') +
        (suspeitos ? `\n\nAtenção: ${suspeitos} CNPJ(s) entraram com dígito verificador inconsistente. Eles ficam marcados na lista.` : '')
      );
    } catch (e) {
      travar(folha, false);
      aviso($('#st'), e.ehRede ? 'Sem conexão — nada foi carregado.' : e.message, true);
    }
  });
}
