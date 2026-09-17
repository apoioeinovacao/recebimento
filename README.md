# Painel de Recebimento

Programação e entrada de materiais do almoxarifado. Aplicação web instalável
(PWA), sem etapa de build, publicada como arquivos estáticos.

---

## O que mudou em relação à versão anterior

| Antes | Agora |
|---|---|
| Um `index.html` de ~700 linhas com HTML, CSS, JS e credenciais juntos | 1 HTML de marcação, 1 CSS e 12 módulos JavaScript |
| URL e chave do Supabase escritas no meio do código | `.env` como fonte única, com gerador e validação |
| Matrículas e perfis dentro do JavaScript | Tabela `usuarios` no banco, com perfil e senha |
| Entrava só com a matrícula | Matrícula + senha, com troca obrigatória no 1º acesso |
| Admitir alguém exigia editar o código e republicar | Aba **Usuários**: o master cadastra, promove, reseta senha e desliga |
| Qualquer pessoa com o link podia apagar programação pela API | RLS fechada; escrita só por função que confere perfil |
| Abria só com internet | PWA: instala, abre offline e mostra a última leitura |
| Nenhum registro de quem mexeu no quê | Tabela de auditoria com antes/depois de cada alteração |

> **Leia antes de publicar:** a seção [Segurança](#segurança) explica por que o
> `.env`, sozinho, **não** esconde a chave do Supabase — e o que realmente
> protege os dados.

---

## Estrutura

```
painel-recebimento/
├── .env                      credenciais e parâmetros (NÃO versionar)
├── .env.example              modelo comentado, este sim versionado
├── index.html                só marcação — nenhuma linha de JavaScript
├── manifest.webmanifest      identidade do app instalável
├── sw.js                     service worker (cache do aplicativo)
│
├── assets/
│   ├── css/app.css           toda a folha de estilo
│   ├── icons/                ícones do PWA
│   └── js/
│       ├── config.js         GERADO a partir do .env — não edite
│       ├── env.js            lê e valida a configuração
│       ├── util.js           formatação de data, número, texto
│       ├── regras.js         regras de negócio: cortes, atraso, faixas
│       ├── db.js             única porta de saída para o banco
│       ├── sessao.js         token da sessão no aparelho
│       ├── cache.js          última programação lida, para uso offline
│       ├── estado.js         estado da tela, observável
│       ├── dados.js          busca, decide entre banco e cache, avisa a tela
│       ├── ui.js             desenho do painel
│       ├── modais.js         folha de detalhe e grade de inserção
│       ├── exportar.js       CSV
│       ├── pwa.js            instalação, atualização, conexão
│       └── app.js            ponto de entrada
│
├── sql/
│   ├── 01_schema.sql         tabelas, índices, auditoria
│   ├── 02_seguranca.sql      RLS e funções de acesso
│   └── 03_usuarios.sql       matrículas, perfis e receitas de operação
│
├── scripts/
│   ├── gerar-config.mjs      .env -> assets/js/config.js (Node)
│   ├── gerar-config.py       o mesmo, para quem não tem Node
│   └── gerar-icones.py       redesenha os ícones do PWA
│
└── .github/workflows/deploy.yml   publica no GitHub Pages usando Secrets
```

**Regra de ouro:** cada arquivo tem um assunto. Mudou horário de corte? `.env`.
Mudou a regra de atraso? `regras.js`. Mudou o banco? `db.js` e `sql/`. Mudou o
visual? `app.css`. Nenhuma dessas mudanças obriga a abrir os outros arquivos.

---

## Instalação

### Passo 1 — Banco

No Supabase, em **SQL Editor › New query**, rode na ordem:

1. `sql/01_schema.sql`
2. `sql/02_seguranca.sql`
3. `sql/03_usuarios.sql` — **troque a matrícula pela sua antes de rodar**

Os três são idempotentes: podem ser executados de novo sem perder dados. Só o
terceiro pede edição, e ele cria apenas o seu usuário master. Todo o resto do
quadro é cadastrado depois pelo próprio painel, na aba **Usuários**.

Se a tabela `programacao` já existir com dados, ela é preservada; o script só
acrescenta as colunas e restrições que faltarem.

**Conferência.** Depois de rodar, no SQL Editor:

```sql
-- Deve retornar ZERO linhas (nenhuma tabela aberta para a chave pública)
select tablename from pg_tables
 where schemaname = 'public' and rowsecurity = false;
```

E no navegador, com a aplicação no ar, abra o Console e cole:

```js
fetch(`${window.__APP_ENV.SUPABASE_URL}/rest/v1/programacao?select=*`, {
  headers: { apikey: window.__APP_ENV.SUPABASE_KEY }
}).then(r => r.text()).then(console.log)
```

O esperado é `[]` ou um erro de permissão. Se vier a programação inteira, o
`02_seguranca.sql` não foi aplicado — **não publique** antes de resolver.

### Passo 2 — Configuração

```bash
cp .env.example .env
# preencha APP_SUPABASE_URL e APP_SUPABASE_PUBLISHABLE_KEY
node scripts/gerar-config.mjs        # ou: python3 scripts/gerar-config.py
```

O gerador escreve `assets/js/config.js`, que é o arquivo que o navegador lê.
Ele recusa o build quando:

- falta variável obrigatória;
- algum valor ainda é o texto de exemplo;
- **uma variável `APP_` contém chave secreta** (`sb_secret_`, `service_role`,
  string de conexão do Postgres). Esse é o erro caro, e o script existe em boa
  parte para impedi-lo.

Rode de novo o gerador sempre que mudar o `.env` **ou qualquer arquivo do app** —
o `BUILD` é um hash do conteúdo, e é ele que faz o PWA se atualizar sozinho nos
aparelhos.

### Passo 3 — Publicar

**Manual:** suba a pasta inteira (incluindo `assets/js/config.js`) para o
servidor ou para o GitHub Pages. Não suba `.env`, `sql/` nem `scripts/`.

**Automático (recomendado):** `.github/workflows/deploy.yml` já faz isso.
Cadastre em *Settings › Secrets and variables › Actions*:

- `APP_SUPABASE_URL`
- `APP_SUPABASE_PUBLISHABLE_KEY`

e ligue *Settings › Pages › Source = GitHub Actions*. A cada push na `main` o
workflow monta o `.env`, gera o `config.js`, **verifica que nenhuma credencial
secreta entrou no pacote** e publica. Assim o `.env` nunca precisa existir no
repositório.

> **HTTPS é obrigatório.** Service worker e instalação do PWA só funcionam em
> `https://` (ou `localhost`). Em `http://` o painel continua abrindo, mas sem
> offline e sem instalar.

---

## Segurança

### O que o `.env` resolve, e o que não resolve

O `.env` resolve **configuração**: um lugar só para URL, chave, horários de
corte e feriados; ambientes diferentes sem tocar no código; credencial fora do
Git; troca de chave sem caçar string espalhada em arquivo.

O `.env` **não** resolve **sigilo no navegador**. Tudo que o navegador precisa
para chamar a API, ele recebe — e o usuário pode ler. Qualquer promessa de
"esconder a chave" numa aplicação que roda no cliente é falsa, com ou sem
`.env`, com ou sem build, com ou sem ofuscação.

Por isso a arquitetura aqui é outra:

```
       chave publicável (visível)
                 │
                 ▼
        PostgREST  ──►  tabelas com RLS ligada e ZERO policy
                        (a chave sozinha não lê nem escreve nada)
                 │
                 ▼
        funções SECURITY DEFINER
          app_login          → confere matrícula e senha, emite token
          app_trocar_senha   → única aceita com a senha padrão pendente
          app_listar         → exige token válido
          app_baixa          → exige token; qualquer perfil
          app_salvar   ┐
          app_inserir  ├─ exigem token E perfil master/compras
          app_excluir  ┘
          app_usuarios       ┐
          app_usuario_salvar ├─ exigem token E perfil master
          app_usuario_inserir│
          app_usuario_resetar│
          app_usuario_excluir┘
```

A chave publicável vira apenas um bilhete de entrada no balcão. Quem decide o
que pode ser feito é o Postgres, lendo o perfil na tabela `usuarios`. Um
operador que abra o DevTools e chame `app_excluir` na mão recebe
`sem_permissao` — não porque a tela escondeu o botão, mas porque o banco
recusou.

As checagens de perfil no JavaScript (`regras.js`) existem só para não mostrar
botão que vai dar erro. **Elas não são o controle de segurança.**

### Matrícula, senha e primeiro acesso

Login é **matrícula + senha**. Matrícula não é segredo — está no crachá, no
ponto, na planilha do RH —, então ela sozinha nunca abriu porta nenhuma e agora
não abre mesmo.

Todo usuário nasce com a senha padrão **123456** e com a marca
`precisa_trocar_senha`. Enquanto ela estiver marcada, o banco recusa **todas**
as operações daquela conta: a única função que atende é a de trocar a senha. Não
é a tela que insiste — é o Postgres que responde `senha_expirada` para qualquer
outra chamada.

A nova senha precisa ter 6 caracteres ou mais e não pode ser a padrão, a própria
matrícula ou a senha anterior. Ao trocar, as outras sessões daquela matrícula
caem: se a senha padrão circulou pelo WhatsApp do turno, quem estava usando
perde o acesso na hora.

As senhas ficam em bcrypt. Ninguém — nem você no SQL Editor — lê a senha de
alguém; o que existe é **resetar**, o que devolve a pessoa para a senha padrão e
para a troca obrigatória.

Cinco erros seguidos bloqueiam a matrícula por 15 minutos.

O parâmetro `auto_cadastro_operador` vem em `false`: só entra quem o master
cadastrou. Ligá-lo faz qualquer número de matrícula com a senha padrão abrir o
painel como operador — cômodo num primeiro dia, ruim como estado permanente.

### A aba Usuários

Visível só para o perfil `master`. Dela saem todas as operações de acesso:

- **Novo usuário** — matrícula, nome e perfil. A senha sai como a padrão, e o
  painel mostra qual é para você repassar à pessoa.
- **Colar lista** — cola matrícula, nome e perfil direto da planilha do RH e
  cadastra o turno inteiro de uma vez. Matrícula já existente é ignorada, nunca
  sobrescrita.
- **Resetar senha** — para quem esqueceu. Volta para a padrão, exige troca e
  derruba as sessões abertas daquela pessoa.
- **Inativo** — para quem saiu da empresa. Prefira isto a excluir: o histórico
  de quem deu cada baixa continua legível.
- **Excluir** — apaga o cadastro de vez.

Três travas que o banco impõe, não a tela: o master não se rebaixa, não se
desativa e não se exclui; e o sistema nunca fica sem nenhum master ativo.

> Cadastre **dois** masters. Com um só, esquecer a senha significa voltar ao SQL
> Editor (a receita está em `sql/03_usuarios.sql`).

### Se a chave secreta já vazou

Se em algum momento a `sb_secret_` ou a `service_role` esteve num arquivo
publicado ou num commit, **trocá-la é obrigatório**: o histórico do Git guarda
tudo. Supabase › *Project Settings › API Keys › Rotate*.

### Cabeçalhos HTTP

O `index.html` já traz uma CSP em `<meta>` que limita scripts a `'self'` —
possível justamente porque nenhum JavaScript mora mais dentro do HTML. Se você
controla o servidor (Nginx, Cloudflare, Netlify), acrescente o que `<meta>` não
consegue entregar:

```
Content-Security-Policy: frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

No GitHub Pages não há como definir cabeçalhos; nesse caso a CSP do `<meta>` é
o que se tem, e já cobre a maior parte.

---

## O PWA

**Instalar.** No celular ou no desktop, o botão *Instalar app* aparece na barra
de abas quando o navegador oferece a instalação. No iPhone, o caminho é
*Compartilhar › Adicionar à Tela de Início* (o iOS não oferece o botão).

**Offline.** Duas camadas, com papéis diferentes:

- o **service worker** guarda o aplicativo (HTML, CSS, JS, ícones, fontes) —
  é o que faz a tela abrir sem sinal;
- o **`cache.js`** guarda a última programação lida, no próprio aparelho — é o
  que faz aparecer conteúdo em vez de tela vazia.

São separados porque os dados chegam por RPC, que é `POST`, e o Cache Storage
do navegador não guarda resposta de `POST`.

Sem sinal, o painel abre, mostra a última leitura e marca no canto
`offline — dados de há 12 min`. **Salvar offline não é aceito:** a folha
continua aberta com o aviso *"Sem conexão — a baixa não foi salva"*. Isso é
deliberado: fila de gravação offline sem tratamento de conflito é a receita
para dois operadores sobrescreverem a baixa um do outro. Se a operação exigir
isso, é um projeto próprio — veja [Próximos passos](#próximos-passos).

**Atualização.** Ao subir uma versão nova, quem já tem o app instalado recebe
uma tarja *"Nova versão disponível — Atualizar"*. A troca só acontece com o
clique, nunca no meio de uma baixa. Isso funciona porque o nome do cache é o
`BUILD`, que é hash do conteúdo de todos os arquivos: **basta rodar o gerador
depois de editar qualquer arquivo** e o cache antigo é descartado sozinho. Não
existe "esqueci de subir o número da versão".

---

## Operação do dia a dia

| Preciso… | Onde |
|---|---|
| Admitir, promover, desligar, resetar senha | Aba **Usuários**, no painel |
| Mudar horário de corte ou feriados | `.env` + `node scripts/gerar-config.mjs` |
| Ver quem alterou o quê | SQL Editor, consulta abaixo |
| Destravar quem errou a senha 5 vezes | Aba **Usuários** › Resetar senha |
| Recuperar o acesso quando ninguém entra | Receitas em `sql/03_usuarios.sql` |

```sql
-- Auditoria: as últimas 50 mudanças de programação
select l.em, l.acao, l.matricula, u.nome,
       l.antes ->> 'status_entrega' as de,
       l.depois ->> 'status_entrega' as para,
       coalesce(l.depois ->> 'ordem_compra', l.antes ->> 'ordem_compra') as oc
  from public.programacao_log l
  left join public.usuarios u on u.matricula = l.matricula
 order by l.em desc limit 50;
```

---

## Desenvolvimento local

```bash
npm run config     # gera o config.js a partir do .env
npm run dev        # gera e sobe em http://localhost:8080
```

Qualquer servidor estático serve (`python3 -m http.server 8080` também). Abrir
o `index.html` por `file://` **não funciona**: módulos ES e service worker
exigem origem HTTP.

Para apontar a um Supabase de homologação sem mexer no `.env` de produção:

```bash
node scripts/gerar-config.mjs --env=.env.homologacao
```

O gerador aceita `http://localhost` na URL, para quem quiser rodar contra um
Supabase local ou um mock.

---

## Próximos passos

Em ordem de retorno, na minha leitura:

1. **Cadastrar um segundo master.** Dois minutos na aba Usuários, e evita o dia
   em que o único master esqueceu a senha.
2. **Limpeza de sessões agendada.** `select public.app_limpar_sessoes();` via
   `pg_cron`, diário. Hoje a limpeza só acontece de carona no login.
3. **Baixa offline com fila.** O maior salto operacional, e o mais caro:
   precisa de fila em IndexedDB, número de versão por linha e uma decisão de
   negócio sobre quem ganha quando duas pessoas mexem no mesmo item.
4. **Testes automatizados de `regras.js`.** As funções de corte e atraso são
   puras e concentram o risco de negócio — é onde um teste rende mais.
5. **Realtime do Supabase** no lugar do polling de 15 segundos, se o número de
   aparelhos na doca crescer.
