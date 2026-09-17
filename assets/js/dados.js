/* ===========================================================================
 * dados.js — busca a programação, decide entre banco e cache, avisa a tela.
 * ======================================================================== */

'use strict';

import { DB } from './db.js';
import * as cache from './cache.js';
import * as sessao from './sessao.js';
import { estado, notificar } from './estado.js';
import { zz, desde } from './util.js';

/** Chamado quando o banco diz que a sessão morreu. Definido pelo app.js. */
let aoExpirar = () => {};
export const quandoExpirar = (fn) => { aoExpirar = fn; };

/** Chamado quando o banco exige a troca da senha padrão antes de qualquer coisa. */
let aoExigirSenha = () => {};
export const quandoExigirSenha = (fn) => { aoExigirSenha = fn; };

let emVoo = false;

/**
 * Lê a programação. Em caso de falha de rede, cai para o cache do aparelho
 * sem apagar o que já está na tela.
 *
 * @param {{silencioso?: boolean}} opcoes
 */
export async function carregar({ silencioso = false } = {}) {
  if (!sessao.ativa() || emVoo) return;
  emVoo = true;

  try {
    const linhas = await DB.listar(sessao.token());
    const assinatura = JSON.stringify(linhas);

    estado.doCache = false;
    estado.lidoEm = Date.now();
    marcarSync(`atualizado ${zz(new Date().getHours())}:${zz(new Date().getMinutes())}`);

    cache.guardar(sessao.matricula(), linhas);

    if (assinatura !== estado.assinatura) {
      estado.assinatura = assinatura;
      estado.dados = linhas;
      notificar('dados');
    } else {
      notificar('sync');
    }
  } catch (e) {
    if (e.ehSenha) {
      marcarSync('troca de senha pendente', 'bad');
      aoExigirSenha();
      return;
    }
    if (e.ehSessao) {
      marcarSync('sessão expirada', 'bad');
      aoExpirar();
      return;
    }

    if (estado.dados.length) {
      // Já há algo na tela: mantém e só sinaliza que parou de atualizar.
      marcarSync(e.ehRede ? 'sem conexão — dados de ' + desde(estado.lidoEm) : 'falha ao atualizar', 'bad');
      notificar('sync');
      return;
    }

    const pacote = cache.recuperar(sessao.matricula());
    if (pacote) {
      estado.dados = pacote.dados;
      estado.assinatura = JSON.stringify(pacote.dados);
      estado.doCache = true;
      estado.lidoEm = pacote.em;
      marcarSync(`offline — dados de ${desde(pacote.em)}`, 'cache');
      notificar('dados');
      return;
    }

    marcarSync(e.ehRede ? 'sem conexão' : 'falha na leitura', 'bad');
    if (!silencioso) notificar('erro:' + e.message);
    else notificar('sync');
  } finally {
    emVoo = false;
  }
}

function marcarSync(texto, estilo = '') {
  estado.sync = { texto, estilo };
}

/* ------------------------------------------------------------- Escritas  */
/* Todas devolvem promessa; quem chamou trata o erro e mostra na própria
 * folha aberta. Depois de gravar, recarrega para refletir o que o banco
 * de fato aceitou — e não o que a tela supôs. */

export async function darBaixa(id, status, descarga, observacoes) {
  await DB.baixa(sessao.token(), id, status, descarga, observacoes);
  await carregar();
}

export async function salvarCadastro(id, campos) {
  await DB.salvar(sessao.token(), id, campos);
  await carregar();
}

export async function inserirLote(linhas) {
  const gravadas = await DB.inserir(sessao.token(), linhas);
  await carregar();
  return gravadas;
}

export async function excluir(id) {
  await DB.excluir(sessao.token(), id);
  await carregar();
}

/** Item por id, a partir do que está em memória. */
export const item = (id) => estado.dados.find((x) => x.id === id) || null;

/* --------------------------------------------------------- Usuários ---- */
/* Só o master consegue: quem tenta sem ser master recebe sem_permissao do
 * banco, não da tela. Nada disso vai para o cache offline — lista de pessoas
 * não fica parada no aparelho de ninguém. */

export async function carregarUsuarios() {
  estado.usuarios = await DB.usuarios(sessao.token());
  notificar('usuarios');
  return estado.usuarios;
}

export async function salvarUsuario(matricula, nome, perfil, ativo) {
  const r = await DB.usuarioSalvar(sessao.token(), matricula, nome, perfil, ativo);
  await carregarUsuarios();
  return r;
}

export async function inserirUsuarios(linhas) {
  const r = await DB.usuarioInserir(sessao.token(), linhas);
  await carregarUsuarios();
  return r;
}

export async function resetarSenha(matricula) {
  const r = await DB.usuarioResetar(sessao.token(), matricula);
  await carregarUsuarios();
  return r;
}

export async function excluirUsuario(matricula) {
  const r = await DB.usuarioExcluir(sessao.token(), matricula);
  await carregarUsuarios();
  return r;
}

export const usuario = (matricula) =>
  estado.usuarios.find((u) => u.matricula === matricula) || null;
