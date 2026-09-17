/* ===========================================================================
 * db.js — única porta de saída para o banco.
 * ---------------------------------------------------------------------------
 * Nenhuma tabela é acessada diretamente: tudo passa por funções RPC que o
 * Postgres publica (ver sql/02_seguranca.sql). Do lado do banco, /rest/v1/
 * programacao está fechado por RLS — chamar a tabela na mão não devolve nada.
 *
 * Trocar o Supabase por outro backend significa reescrever só este arquivo.
 * ======================================================================== */

'use strict';

import { CFG, API } from './env.js';

const TEMPO_LIMITE = 20000;

/* ------------------------------------------------------------------ Erros */

export class ErroBanco extends Error {
  constructor(mensagem, { tipo = 'desconhecido', status = 0, original = null } = {}) {
    super(mensagem);
    this.name = 'ErroBanco';
    this.tipo = tipo;           // rede | sessao | permissao | validacao | desconhecido
    this.status = status;
    this.original = original;
  }
  get ehRede()   { return this.tipo === 'rede'; }
  get ehSessao() { return this.tipo === 'sessao'; }
  get ehSenha()  { return this.tipo === 'senha'; }
}

/** Traduz a mensagem crua do Postgres para algo que sirva na doca. */
function traduzir(msg, status) {
  const m = String(msg || '');
  if (/sessao_invalida/.test(m))          return ['sessao',     'Sua sessão expirou. Entre novamente.'];
  if (/senha_expirada/.test(m))           return ['senha',      'Troque a senha padrão antes de continuar.'];
  if (/sem_permissao/.test(m))            return ['permissao',  'Seu perfil não permite esta ação.'];
  if (/ultimo_master/.test(m))            return ['validacao',  'O sistema não pode ficar sem nenhum master ativo.'];
  if (/registro_nao_encontrado/.test(m))  return ['validacao',  'Este item não existe mais — alguém excluiu.'];
  if (/status_invalido/.test(m))          return ['validacao',  'Status de entrega inválido.'];
  if (/descarga_invalida/.test(m))        return ['validacao',  'Valor de descarga inválido.'];
  if (/lote_grande_demais/.test(m))       return ['validacao',  'Máximo de 500 linhas por envio.'];
  if (/formato_invalido/.test(m))         return ['validacao',  'Formato dos dados inválido.'];
  if (/PGRST202|does not exist|Could not find the function/i.test(m))
    return ['validacao', 'As funções do banco não foram criadas. Rode os arquivos de sql/ no Supabase.'];
  if (status === 401 || status === 403)
    return ['permissao', 'O banco recusou a chamada. Confira a chave publicável e as permissões do SQL.'];
  return ['desconhecido', 'Falha ao falar com o banco.'];
}

/* -------------------------------------------------------------- Transporte */

async function rpc(funcao, parametros = {}) {
  if (!API) throw new ErroBanco('Aplicação sem configuração.', { tipo: 'validacao' });

  const ctrl = new AbortController();
  const relogio = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);

  let resposta;
  try {
    resposta = await fetch(`${API}rpc/${funcao}`, {
      method: 'POST',
      headers: {
        apikey: CFG.SUPABASE_KEY,
        Authorization: `Bearer ${CFG.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(parametros),
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch (e) {
    throw new ErroBanco(
      navigator.onLine ? 'Não foi possível falar com o banco.' : 'Sem conexão com a internet.',
      { tipo: 'rede', original: e }
    );
  } finally {
    clearTimeout(relogio);
  }

  const texto = await resposta.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }

  if (!resposta.ok) {
    const cru = (corpo && (corpo.message || corpo.hint || corpo.details)) || texto || '';
    const [tipo, amigavel] = traduzir(cru, resposta.status);
    const erro = new ErroBanco(amigavel, { tipo, status: resposta.status });
    erro.detalhe = cru;
    if (CFG.AMBIENTE !== 'producao') console.error(`[db] ${funcao}`, resposta.status, cru);
    throw erro;
  }
  return corpo;
}

/* ------------------------------------------------------------------- API  */

export const DB = {
  /** Devolve { ok:true, token, perfil, precisa_trocar, ... } ou { ok:false, motivo }. */
  login: (matricula, senha) => rpc('app_login', { p_matricula: matricula, p_senha: senha || null }),

  logout: (token) => rpc('app_logout', { p_token: token }),

  /** Única chamada aceita enquanto a senha padrão não for trocada. */
  trocarSenha: (token, atual, nova) =>
    rpc('app_trocar_senha', { p_token: token, p_atual: atual, p_nova: nova }),

  /** Programação inteira, ordenada por data. */
  listar: (token) => rpc('app_listar', { p_token: token }).then((r) => r || []),

  /** Baixa da doca: status, descarga e observação. Qualquer perfil. */
  baixa: (token, id, status, descarga, observacoes) =>
    rpc('app_baixa', {
      p_token: token, p_id: id,
      p_status: status, p_descarga: descarga, p_obs: observacoes || '',
    }),

  /** Edição de cadastro. Só master e compras — o banco confere. */
  salvar: (token, id, dados) => rpc('app_salvar', { p_token: token, p_id: id, p_dados: dados }),

  /** Lote da grade de inserção. Máximo de 500 linhas. */
  inserir: (token, linhas) => rpc('app_inserir', { p_token: token, p_linhas: linhas }).then((r) => r || []),

  excluir: (token, id) => rpc('app_excluir', { p_token: token, p_id: id }),

  /* ---- Gestão de usuários. O banco só atende se o perfil for master. ---- */

  usuarios: (token) => rpc('app_usuarios', { p_token: token }).then((r) => r || []),

  usuarioSalvar: (token, matricula, nome, perfil, ativo) =>
    rpc('app_usuario_salvar', {
      p_token: token, p_matricula: matricula,
      p_nome: nome, p_perfil: perfil, p_ativo: ativo,
    }),

  usuarioInserir: (token, linhas) => rpc('app_usuario_inserir', { p_token: token, p_linhas: linhas }),

  usuarioResetar: (token, matricula) => rpc('app_usuario_resetar', { p_token: token, p_matricula: matricula }),

  usuarioExcluir: (token, matricula) => rpc('app_usuario_excluir', { p_token: token, p_matricula: matricula }),
};
