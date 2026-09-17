/* ===========================================================================
 * app.js — ponto de entrada. Liga os módulos e controla o ciclo de vida.
 * ---------------------------------------------------------------------------
 * Fluxo: configuração -> sessão -> painel.
 * Nenhuma regra de negócio mora aqui; isto é só a fiação.
 * ======================================================================== */

'use strict';

import { CFG, configurado, problema } from './env.js';
import * as sessao from './sessao.js';
import * as dados from './dados.js';
import { estado, aoMudar, limpar } from './estado.js';
import * as ui from './ui.js';
import { abrirInsercao, abrirTrocaSenha, abrirUsuario } from './modais.js';
import { exportarCSV } from './exportar.js';
import { ABAS } from './regras.js';
import {
  registrarServiceWorker, vigiarConexao, avisoOffline, prepararInstalacao, anunciarVersao,
} from './pwa.js';

const $ = (id) => document.getElementById(id);

let timerSync = null;
let timerRelogio = null;

/* ------------------------------------------------------- Telas */

function mostrar(tela) {
  $('setup').hidden = tela !== 'setup';
  $('login').hidden = tela !== 'login';
  $('app').hidden = tela !== 'app';
}

/* ------------------------------------------------------- Temporizadores */

function ligarTimers() {
  desligarTimers();
  timerSync = setInterval(() => {
    if (sessao.ativa() && document.visibilityState === 'visible') dados.carregar({ silencioso: true });
  }, CFG.INTERVALO_SYNC);

  timerRelogio = setInterval(() => {
    if (sessao.ativa()) ui.pintar();
  }, CFG.INTERVALO_RELOGIO);
}

function desligarTimers() {
  clearInterval(timerSync);
  clearInterval(timerRelogio);
  timerSync = timerRelogio = null;
}

/* ------------------------------------------------------- Entrada e saída */

async function abrirPainel() {
  const permitidas = ABAS[sessao.perfil()] || ABAS.operador;
  // Atalhos do manifest abrem direto numa aba (./?aba=almox).
  const pedida = new URLSearchParams(location.search).get('aba');
  estado.aba = permitidas.includes(pedida)
    ? pedida
    : (permitidas.includes('almox') ? 'almox' : permitidas[0]);
  estado.filtro = {};
  estado.assinatura = '';

  mostrar('app');
  ui.pintar();

  // Primeiro acesso: o painel abre, mas travado atrás da troca de senha.
  // Não adianta buscar dados — o banco recusaria tudo mesmo.
  if (sessao.precisaTrocarSenha()) {
    exigirTrocaDeSenha();
    return;
  }

  ligarTimers();
  await dados.carregar();
}

/** Folha de troca de senha que não fecha até a senha ser trocada. */
function exigirTrocaDeSenha() {
  desligarTimers();
  abrirTrocaSenha({
    obrigatoria: true,
    aoConcluir: async () => {
      ligarTimers();
      await dados.carregar();
      if (estado.aba === 'usuarios') await dados.carregarUsuarios();
    },
  });
}

/** Carrega o que a aba corrente precisa. */
async function carregarAba() {
  if (estado.aba === 'usuarios') await dados.carregarUsuarios();
  else await dados.carregar({ silencioso: true });
}

async function aoEntrar(evento) {
  evento.preventDefault();

  const botao = $('entrar');
  const erro = $('err');
  const matricula = $('mat').value;
  const senha = $('senha').value;

  botao.disabled = true;
  erro.textContent = '';

  try {
    const r = await sessao.entrar(matricula, senha);
    if (!r.ok) {
      erro.textContent = r.motivo;
      $(r.motivo.includes('senha') ? 'senha' : 'mat').focus();
      return;
    }
    $('mat').value = '';
    $('senha').value = '';
    await abrirPainel();
  } catch (e) {
    erro.textContent = e.ehRede
      ? 'Sem conexão — não dá para entrar agora.'
      : e.message || 'Não foi possível entrar.';
  } finally {
    botao.disabled = false;
  }
}

async function aoSair() {
  desligarTimers();
  await sessao.sair();
  limpar();
  mostrar('login');
  $('err').textContent = '';
  $('mat').focus();
}

/** O banco recusou o token: derruba a sessão sem perder o que está na tela. */
function aoExpirarSessao() {
  desligarTimers();
  sessao.descartar();
  mostrar('login');
  $('err').textContent = 'Sua sessão expirou. Entre novamente.';
  $('mat').focus();
}

/* ------------------------------------------------------------- Ligações */

function ligarEventos() {
  $('form-login').addEventListener('submit', aoEntrar);
  $('mat').addEventListener('input', () => { $('err').textContent = ''; });
  $('sair').addEventListener('click', aoSair);

  $('btn-senha').addEventListener('click', () => abrirTrocaSenha());

  $('tabs').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-r]');
    if (!b || b.dataset.r === estado.aba) return;
    estado.aba = b.dataset.r;
    estado.filtro = {};
    ui.pintar();
    try {
      await carregarAba();
    } catch (erro) {
      $('board').innerHTML = `<div class="empty">${erro.message}</div>`;
    }
  });

  // O mesmo botão serve às duas abas que cadastram coisas.
  $('btn-add').addEventListener('click', () => {
    if (estado.aba === 'usuarios') abrirUsuario(null);
    else abrirInsercao();
  });

  $('btn-exp').addEventListener('click', () => {
    const n = exportarCSV();
    if (!n) alert('Não há linhas para exportar com os filtros atuais.');
  });

  // Voltou do segundo plano: atualiza na hora em vez de esperar o tique.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sessao.ativa()) {
      ui.pintar();
      dados.carregar({ silencioso: true });
    }
  });

  aoMudar((motivo) => {
    if (!sessao.ativa()) return;
    if (motivo === 'sync') ui.sincronismo();
    else ui.pintar();
  });

  dados.quandoExpirar(aoExpirarSessao);
  dados.quandoExigirSenha(exigirTrocaDeSenha);
}

/* ---------------------------------------------------------------- Boot  */

async function iniciar() {
  anunciarVersao();

  if (!configurado) {
    $('setup-detalhe').textContent = problema;
    mostrar('setup');
    console.error('[app]', problema);
    return;
  }

  $('login-titulo').textContent = CFG.NOME;
  $('login-sub').textContent = CFG.DESCRICAO;
  document.title = CFG.NOME;

  ligarEventos();
  prepararInstalacao();

  vigiarConexao((online) => {
    avisoOffline(
      estado.doCache
        ? 'Sem conexão — mostrando os dados salvos no aparelho.'
        : 'Sem conexão — a tela não está atualizando e não dá para salvar.'
    );
    if (online && sessao.ativa()) dados.carregar({ silencioso: true });
  });

  if (sessao.restaurar()) {
    await abrirPainel();
  } else {
    mostrar('login');
    $('mat').focus();
  }

  // Registrado por último: não atrapalha a primeira pintura.
  registrarServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar, { once: true });
} else {
  iniciar();
}
