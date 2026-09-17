/* ===========================================================================
 * sw.js — service worker do Painel de Recebimento
 * ---------------------------------------------------------------------------
 * O que ele guarda: o aplicativo (HTML, CSS, JS, ícones e as fontes).
 * O que ele NÃO guarda: a programação. Os dados chegam por RPC (POST), e o
 * Cache Storage não guarda resposta de POST — quem faz esse papel é o
 * assets/js/cache.js, no lado da página.
 *
 * Versão do cache = CFG.BUILD, calculado pelo gerador a partir do conteúdo de
 * todos os arquivos do shell. Mudou qualquer arquivo, muda o hash, o cache
 * antigo é descartado. Não existe "esqueci de subir a versão".
 * ======================================================================== */

/* global importScripts */
'use strict';

importScripts('./assets/js/config.js');

const CFG = self.__APP_ENV || {};
const BUILD = CFG.BUILD || 'dev';

const CACHE_APP = `recebimento-app-${BUILD}`;
const CACHE_FONTES = 'recebimento-fontes-v1';

/** Tudo que precisa existir para o app abrir sem rede. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/config.js',
  './assets/js/app.js',
  './assets/js/env.js',
  './assets/js/util.js',
  './assets/js/regras.js',
  './assets/js/db.js',
  './assets/js/sessao.js',
  './assets/js/cache.js',
  './assets/js/estado.js',
  './assets/js/dados.js',
  './assets/js/ui.js',
  './assets/js/modais.js',
  './assets/js/exportar.js',
  './assets/js/pwa.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

const HOSTS_FONTE = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* ---------------------------------------------------------------- Instala */

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    // addAll é tudo-ou-nada; um ícone faltando derrubaria a instalação inteira.
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        console.warn('[sw] não consegui pré-carregar', url, e);
      }
    }));
  })());
});

/* ----------------------------------------------------------------- Ativa */

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(
      nomes
        .filter((n) => n.startsWith('recebimento-app-') && n !== CACHE_APP)
        .map((n) => caches.delete(n))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

/* ---------------------------------------------------------------- Mensagens */

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'ATIVAR_AGORA') self.skipWaiting();
});

/* ------------------------------------------------------------------ Fetch */

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;                      // RPC do Supabase passa direto

  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    evento.respondWith(navegacao(evento));
    return;
  }

  if (HOSTS_FONTE.includes(url.hostname)) {
    evento.respondWith(cachePrimeiro(req, CACHE_FONTES));
    return;
  }

  if (url.origin === self.location.origin) {
    evento.respondWith(revalidando(req));
  }
  // Qualquer outra origem (inclusive o Supabase) segue sem interferência.
});

/**
 * Navegação: tenta a rede para pegar versão nova, cai no shell quando falha.
 * Sem isto, abrir o app offline mostraria o erro do navegador.
 */
async function navegacao(evento) {
  try {
    const preload = await evento.preloadResponse;
    if (preload) return preload;

    const daRede = await fetch(evento.request);
    const cache = await caches.open(CACHE_APP);
    cache.put('./index.html', daRede.clone());
    return daRede;
  } catch {
    const cache = await caches.open(CACHE_APP);
    return (
      (await cache.match('./index.html')) ||
      (await cache.match('./')) ||
      new Response(
        '<meta charset="utf-8"><body style="background:#071A33;color:#EAF0F8;font-family:system-ui;padding:40px">' +
        '<h1>Sem conexão</h1><p>Abra o aplicativo uma vez com internet para que ele fique disponível offline.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    );
  }
}

/** Entrega o que está em cache e atualiza por baixo para a próxima abertura. */
async function revalidando(req) {
  const cache = await caches.open(CACHE_APP);
  const guardado = await cache.match(req);

  const daRede = fetch(req)
    .then((resposta) => {
      if (resposta && resposta.ok && resposta.type === 'basic') cache.put(req, resposta.clone());
      return resposta;
    })
    .catch(() => null);

  return guardado || (await daRede) || Response.error();
}

/** Fontes mudam quase nunca: cache primeiro, rede só na primeira vez. */
async function cachePrimeiro(req, nomeCache) {
  const cache = await caches.open(nomeCache);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  try {
    const resposta = await fetch(req);
    if (resposta && (resposta.ok || resposta.type === 'opaque')) cache.put(req, resposta.clone());
    return resposta;
  } catch {
    return guardado || Response.error();
  }
}
