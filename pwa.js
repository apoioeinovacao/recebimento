/* ===========================================================================
 * pwa.js — instalação, atualização e estado da conexão.
 * ---------------------------------------------------------------------------
 * O service worker cuida só do app (HTML, CSS, JS, ícones). Os dados ficam a
 * cargo do cache.js, porque chamada RPC é POST e o Cache Storage não guarda
 * resposta de POST.
 *
 * Atualização: nunca troca a versão debaixo do usuário no meio de uma baixa.
 * Aparece um aviso; quem decide é ele.
 * ======================================================================== */

'use strict';

import { CFG } from './env.js';

const $ = (id) => document.getElementById(id);

let promptInstalacao = null;
let registro = null;
let recarregando = false;

/* ------------------------------------------------------- Service worker */

export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  // file:// não tem origem segura; o SW só roda em https ou localhost.
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    console.info('[pwa] service worker exige https (ou localhost). Ignorado.');
    return null;
  }

  try {
    registro = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });

    // Já existe uma versão nova esperando de uma visita anterior.
    if (registro.waiting) mostrarAvisoAtualizacao(registro.waiting);

    registro.addEventListener('updatefound', () => {
      const novo = registro.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        // controller existente => é troca de versão, não primeira instalação.
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          mostrarAvisoAtualizacao(novo);
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregando) return;
      recarregando = true;
      location.reload();
    });

    // Procura versão nova ao voltar para o app e de hora em hora.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update().catch(() => {});
    });
    setInterval(() => registro.update().catch(() => {}), 60 * 60 * 1000);

    return registro;
  } catch (e) {
    console.warn('[pwa] falha ao registrar o service worker', e);
    return null;
  }
}

function mostrarAvisoAtualizacao(worker) {
  const caixa = $('aviso-update');
  if (!caixa) return;
  caixa.hidden = false;

  $('btn-update').onclick = () => {
    caixa.hidden = true;
    worker.postMessage({ tipo: 'ATIVAR_AGORA' });
  };
  $('btn-update-depois').onclick = () => { caixa.hidden = true; };
}

/* ------------------------------------------------------------- Conexão */

/** @param {(online: boolean) => void} aoMudar */
export function vigiarConexao(aoMudar) {
  const caixa = $('aviso-offline');

  const aplicar = () => {
    const online = navigator.onLine;
    if (caixa) caixa.hidden = online;
    aoMudar(online);
  };

  window.addEventListener('online', aplicar);
  window.addEventListener('offline', aplicar);
  aplicar();
}

export function avisoOffline(texto) {
  const el = $('aviso-offline-txt');
  if (el && texto) el.textContent = texto;
}

/* ---------------------------------------------------------- Instalação */

export function prepararInstalacao() {
  const botao = $('btn-instalar');
  if (!botao) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptInstalacao = e;
    botao.hidden = false;
  });

  botao.addEventListener('click', async () => {
    if (!promptInstalacao) return;
    botao.hidden = true;
    promptInstalacao.prompt();
    try { await promptInstalacao.userChoice; } catch { /* usuário fechou */ }
    promptInstalacao = null;
  });

  window.addEventListener('appinstalled', () => {
    botao.hidden = true;
    promptInstalacao = null;
  });

  // Instalado e aberto em modo standalone: nada a oferecer.
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    botao.hidden = true;
  }
}

/** Aparece no console para conferir qual build está no aparelho. */
export function anunciarVersao() {
  console.info(
    `%c${CFG.NOME} %cv${CFG.VERSAO} · build ${CFG.BUILD} · ${CFG.AMBIENTE}`,
    'font-weight:700', 'color:#D9A441'
  );
}
