# Guia de instalação — passo a passo

Do zero ao painel no ar, com a equipe cadastrada. São 5 etapas e algo entre
40 minutos e 1 hora na primeira vez.

Você vai precisar de: acesso ao projeto no Supabase, acesso ao repositório
(GitHub ou onde o painel é publicado hoje) e a sua matrícula.

---

## Antes de começar: rotacione a chave secreta

**Se a chave `sb_secret_` ou `service_role` do Supabase já esteve em algum
arquivo publicado ou em algum commit, troque-a agora**, antes de qualquer coisa.
O histórico do Git guarda tudo, e quem tiver essa chave passa por cima de toda a
segurança que vamos montar.

Supabase › **Project Settings › API Keys › Rotate**.

A chave `sb_publishable_` **não** precisa ser trocada — ela é feita para ficar
visível, e é justamente por isso que a proteção vai para dentro do banco.

---

## Etapa 1 — Preparar o banco (≈ 10 min)

No Supabase, abra **SQL Editor › New query**.

### 1.1 — Estrutura

Abra o arquivo `sql/01_schema.sql`, copie tudo, cole no editor e clique em
**Run**.

Cria as tabelas de usuários, sessões, programação, parâmetros e a auditoria.
Se você já tinha uma tabela `programacao` com dados, ela é preservada — o script
só acrescenta o que falta.

### 1.2 — Segurança

Mesmo caminho, agora com `sql/02_seguranca.sql`.

Este é o arquivo que fecha as tabelas e cria as funções de acesso. Depois dele,
a chave pública do Supabase sozinha não lê nem escreve mais nada.

### 1.3 — Seu usuário master

Abra `sql/03_usuarios.sql`. **Antes de rodar, edite duas linhas:**

```sql
  '4000552',                    -- <<< troque pela SUA matrícula
  'Administrador',              -- <<< troque pelo SEU nome
```

Cole e rode. Ao final ele mostra uma tabela com o usuário criado — confira que
apareceu com perfil `master`.

Este é o único usuário que você cria por SQL. Todo o resto é pelo painel.

### 1.4 — Conferir que a porta fechou

Cole no SQL Editor e rode:

```sql
select tablename from pg_tables
 where schemaname = 'public' and rowsecurity = false;
```

**O resultado tem de ser vazio** (`No rows returned`). Se aparecer qualquer nome
de tabela, o `02_seguranca.sql` não passou inteiro — role a tela para trás,
procure a mensagem de erro em vermelho e rode de novo. Não siga adiante antes
disso.

---

## Etapa 2 — Configurar o `.env` (≈ 5 min)

O `.env` que veio no pacote já está preenchido com a URL e a chave publicável do
seu projeto. Confira se batem com o que está em Supabase › **Project Settings ›
Data API** (Project URL) e **API Keys** (Publishable key).

Se estiver tudo certo, só gere o arquivo de configuração:

```bash
node scripts/gerar-config.mjs
```

Não tem Node na máquina? Use o gêmeo em Python:

```bash
python3 scripts/gerar-config.py
```

A saída esperada termina com `✓ assets/js/config.js gerado` e mostra a URL do
Supabase. Se ele reclamar de alguma coisa, leia a mensagem: o gerador foi feito
para não deixar passar chave secreta nem valor de exemplo.

> **Sempre que mexer em qualquer arquivo do projeto, rode o gerador de novo
> antes de publicar.** É ele que muda a assinatura do build e faz os celulares
> já instalados baixarem a versão nova.

---

## Etapa 3 — Publicar (≈ 10 min)

### Se o painel hoje é um `index.html` solto no GitHub Pages

Suba a pasta inteira do projeto no lugar do arquivo antigo, **menos** estes três
itens, que não vão para o ar:

- `.env`
- `sql/`
- `scripts/`

O `assets/js/config.js` **vai** — é ele que o navegador lê.

### Se quiser o deploy automático (recomendado)

Já está pronto em `.github/workflows/deploy.yml`. Faça uma vez:

1. No GitHub, **Settings › Secrets and variables › Actions › New repository
   secret**, cadastre:
   - `APP_SUPABASE_URL`
   - `APP_SUPABASE_PUBLISHABLE_KEY`
2. **Settings › Pages › Source** = **GitHub Actions**.
3. Suba o projeto (sem o `.env`, que o `.gitignore` já bloqueia).

A partir daí, todo push na `main` publica sozinho: o workflow monta o `.env` a
partir dos Secrets, gera o `config.js`, confere que nenhuma credencial secreta
entrou no pacote e sobe.

> **O endereço precisa ser `https://`.** Em `http://` o painel abre, mas não
> instala como app nem funciona offline.

---

## Etapa 4 — Seu primeiro acesso (≈ 2 min)

Abra o endereço do painel.

1. **Matrícula:** a sua. **Senha:** `123456`.
2. O sistema abre direto a tela **Defina sua senha** — e ela não fecha. Isso é
   proposital: enquanto a senha padrão não for trocada, o banco recusa qualquer
   operação da sua conta.
3. Em *Senha padrão*, digite `123456`. Escolha a nova senha e repita.
   - mínimo de 6 caracteres;
   - não pode ser `123456`, nem a sua matrícula, nem a senha anterior.
4. O painel carrega.

Se algo der errado aqui, veja **Se der problema** no fim deste guia.

---

## Etapa 5 — Cadastrar a equipe (≈ 10 min)

Clique na aba **Usuários** (ela só aparece para o perfil master).

### 5.1 — Cadastre o segundo master AGORA

Não deixe para depois. Com um único master, esquecer a senha significa voltar ao
SQL Editor.

**Novo usuário** › matrícula, nome, perfil **Master** › **Cadastrar**.

### 5.2 — Cadastre o resto do quadro

Para poucas pessoas, uma a uma em **Novo usuário**.

Para o turno inteiro: **Novo usuário › Colar lista**. Monte na planilha três
colunas, **sem cabeçalho**:

| A | B | C |
|---|---|---|
| 4008001 | Ana Ribeiro | operador |
| 4008002 | Bruno Salles | operador |
| 4008003 | Carla Tavares | compras |

Copie o bloco, clique na primeira célula da grade e cole (Ctrl+V). A colagem se
espalha sozinha. Perfil em branco vira `operador`. Matrícula já cadastrada é
ignorada — ninguém é sobrescrito.

### 5.3 — Qual perfil dar a quem

| Perfil | O que faz | Para quem |
|---|---|---|
| **Operador** | Dá baixa na doca: status, descarga, observação | Almoxarifado, conferente |
| **Compras** | Tudo do operador + lançar e editar programação | Comprador, suprimentos |
| **Master** | Tudo + cadastrar usuários | Você e mais uma pessoa de confiança |

### 5.4 — Avise a equipe

Mensagem pronta:

> Painel de recebimento no ar: `<endereço>`
> Entre com a **sua matrícula** e a senha **123456**.
> Na primeira vez o sistema vai pedir para você criar a sua senha.
> No celular, use "Adicionar à tela de início" para virar aplicativo.

Na aba Usuários, quem ainda não trocou a senha aparece marcado com
**Senha padrão** — é o seu acompanhamento de quem já entrou.

---

## Pronto. O dia a dia daqui para frente

| Preciso… | Onde |
|---|---|
| Admitir alguém | Aba **Usuários › Novo usuário** |
| Promover ou rebaixar | Aba **Usuários**, clique na pessoa, troque o perfil |
| Alguém esqueceu a senha | Aba **Usuários**, clique na pessoa › **Resetar senha** |
| Alguém saiu da empresa | Aba **Usuários**, clique na pessoa › **Inativo** |
| Mudar horário de corte ou feriados | `.env` + `node scripts/gerar-config.mjs` + publicar |
| Ver quem alterou o quê | SQL Editor (consulta no README) |

**Inativo em vez de Excluir**, sempre que a pessoa apenas saiu: o histórico de
quem deu cada baixa continua legível na auditoria.

---

## Se der problema

**"Falta configurar" na tela**
O `assets/js/config.js` não subiu. Rode o gerador e publique de novo.

**"Matrícula ou senha inválida" com a senha certa**
Cinco erros seguidos bloqueiam por 15 minutos. Espere, ou peça a outro master
para **Resetar senha**.

**"As funções do banco não foram criadas"**
O `02_seguranca.sql` não rodou. Volte à Etapa 1.2.

**"Troque a senha padrão antes de continuar"**
Alguém resetou sua senha enquanto você estava logado. Saia e entre de novo.

**Nenhum master consegue entrar**
Único caso que exige SQL. Em `sql/03_usuarios.sql`, no fim do arquivo, está a
receita *"Perdi a senha do único master"*: descomente, troque a matrícula, rode.
A senha volta para `123456`.

**O celular abre uma versão velha**
Você publicou sem rodar o gerador. Rode `node scripts/gerar-config.mjs`,
publique e o aviso "Nova versão disponível" aparece nos aparelhos.

---

## Um teste que vale os 30 segundos

Depois de tudo no ar, entre no painel, abra o Console do navegador (F12) e cole:

```js
fetch(`${window.__APP_ENV.SUPABASE_URL}/rest/v1/programacao?select=*`, {
  headers: { apikey: window.__APP_ENV.SUPABASE_KEY }
}).then(r => r.text()).then(console.log)
```

O esperado é `[]` ou um erro de permissão. Se vier a sua programação inteira, a
Etapa 1.2 não foi aplicada e qualquer pessoa com o link consegue ler os dados —
volte lá antes de liberar o painel para a equipe.
