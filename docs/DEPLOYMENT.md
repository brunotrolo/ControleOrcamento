# Deploy — clasp + GitHub Actions

Este projeto é publicado como um Web App do Google Apps Script (GAS). O
código-fonte vive neste repositório GitHub; o `clasp` (CLI oficial do
Google para Apps Script) sincroniza esse código com o projeto GAS de
verdade. Este guia cobre:

1. Setup local do `clasp` (uma vez, por pessoa)
2. Deploy manual
3. **Deploy automático via GitHub Actions ao dar merge na `main`**
4. Troubleshooting

> Pré-requisito: o projeto Apps Script (GAS) já precisa existir — vinculado
> à planilha do Google Sheets que serve de banco de dados (`Extensões →
> Apps Script` na planilha), ou standalone. Este guia assume que ele já
> existe e você só precisa conectar este repositório a ele.

---

## 1. Setup local (uma vez por pessoa)

```bash
npm install -g @google/clasp
clasp login
```

Isso abre um navegador para autenticar com a conta Google dona do projeto
Apps Script. Ao final, cria `~/.clasprc.json` na sua máquina — **esse
arquivo é uma credencial, nunca commitar**.

### Conectar o repo ao projeto GAS existente

Se você **já tem o Script ID** do projeto GAS (Editor do Apps Script →
⚙️ Configurações do projeto → "ID do script"):

```bash
clasp clone <SCRIPT_ID> --rootDir .
```

Isso baixa os arquivos do GAS para uma pasta separada — como este repo já
tem o código-fonte completo, **não sobrescreva os arquivos existentes**;
o que você precisa mesmo é só o arquivo `.clasp.json` gerado na raiz:

```json
{
  "scriptId": "SEU_SCRIPT_ID_AQUI",
  "rootDir": "."
}
```

Copie esse `.clasp.json` para a raiz deste repositório (há um
`.clasp.json.example` como modelo). Esse arquivo **não** é segredo — pode
ser commitado — mas o repo atual não o inclui porque o Script ID depende
de qual conta/planilha você está usando.

Se em vez disso você precisar **criar um projeto GAS novo** a partir
deste código:

```bash
clasp create --type webapp --title "BudgetDev | Gestão Orçamentária" --rootDir .
```

Depois vá em `Extensões → Apps Script` na planilha do Google Sheets que
deve servir de banco, e vincule/copie o projeto criado a ela (ou ajuste
`config.gs`/`ConfigHelper.setSpreadsheetId` para apontar pro Sheet ID
certo caso o script seja standalone).

### `.claspignore`

Por padrão o `clasp push` envia todo arquivo do `rootDir`. Como este repo
tem `docs/`, `README.md`, `CLAUDE.md`, workflows do GitHub etc. que não
devem ir para o Apps Script, crie um `.claspignore` (mesmo formato do
`.gitignore`) — veja o arquivo `.claspignore` já incluído neste repo.

---

## 2. Deploy manual

```bash
# Sincroniza o código local com o projeto Apps Script
clasp push -f

# Abre o editor do Apps Script no navegador (opcional, para conferir)
clasp open
```

`clasp push` atualiza o conteúdo "HEAD" do projeto — isso já é
suficiente se o Web App estiver publicado como **implantação de teste**
(a URL `/dev` do editor, ou uma implantação apontando para `@HEAD`), que
reflete o código mais recente automaticamente.

Se o Web App estiver publicado como **implantação versionada** (a URL
`/exec` de produção, usada pelos usuários finais), `clasp push` sozinho
**não** atualiza o que os usuários veem — é preciso criar uma nova versão
e apontar a implantação para ela:

```bash
# Lista as implantações existentes e pega o Deployment ID de produção
clasp deployments

# Cria uma nova versão e atualiza essa implantação para apontar pra ela
clasp deploy -i <DEPLOYMENT_ID> -d "Descrição da mudança"
```

---

## 3. Deploy automático (GitHub Actions → clasp push + deploy ao merge na `main`)

O workflow `.github/workflows/deploy.yml` já está configurado neste repo
para: a cada `push` na branch `main` (ou seja, toda vez que uma PR é
mergeada), ele roda `clasp push` e, se um Deployment ID de produção
estiver configurado, também `clasp deploy` para atualizar a URL `/exec`
publicada.

### 3.1. Gerar a credencial do clasp para uso em CI

O clasp usa OAuth; em CI não há navegador para o login interativo, então
reaproveitamos o token gerado pelo `clasp login` local:

```bash
# Na sua máquina, com o clasp já logado na conta certa:
cat ~/.clasprc.json
```

Copie o **conteúdo inteiro** desse arquivo (é um JSON com `token`,
`oauth2ClientSettings`, etc.).

> Alternativa mais robusta para CI: `clasp login --creds <arquivo-de-credenciais-oauth-de-uma-Service-Account-ou-OAuth-Client-próprio>`,
> seguindo a doc oficial do clasp
> (https://github.com/google/clasp/blob/master/docs/run.md), caso a
> política de segurança da empresa exija uma credencial dedicada em vez
> de reutilizar o login pessoal. Para a maioria dos casos de uso interno,
> o `.clasprc.json` do login pessoal funciona bem.

### 3.2. Configurar os Secrets no GitHub

No repositório de destino (o clonado na conta corporativa), vá em
**Settings → Secrets and variables → Actions → New repository secret** e
crie:

| Secret | Valor |
|---|---|
| `CLASP_CREDENTIALS` | Conteúdo completo do `~/.clasprc.json` (passo 3.1) |
| `CLASP_SCRIPT_ID` | Script ID do projeto Apps Script (mesmo valor do `.clasp.json`) |
| `CLASP_DEPLOYMENT_ID` | *(opcional)* Deployment ID de produção, se você quiser que o merge na `main` também atualize a URL `/exec` pública (obtido via `clasp deployments`). Se omitido, o workflow só faz `clasp push` (atualiza HEAD/`/dev`), sem tocar na implantação de produção. |

### 3.3. O que o workflow faz

Ver `.github/workflows/deploy.yml`. Resumo do fluxo:

1. Dispara em `push` para `main`.
2. Faz checkout do código.
3. Instala `@google/clasp` via `npm ci`.
4. Escreve o secret `CLASP_CREDENTIALS` em `~/.clasprc.json` (efêmero,
   só existe durante o job).
5. Gera `.clasp.json` a partir do secret `CLASP_SCRIPT_ID` (assim o
   `.clasp.json` real com o Script ID de produção não precisa estar
   commitado no repo, se preferir mantê-lo fora do controle de versão).
6. Roda `clasp push -f`.
7. Se `CLASP_DEPLOYMENT_ID` estiver definido, roda
   `clasp deploy -i "$CLASP_DEPLOYMENT_ID" -d "Deploy automático $GITHUB_SHA"`.

### 3.4. Fluxo de trabalho resultante

```
feature branch → PR → merge direto na main → GitHub Actions dispara
   → clasp push (sempre) → clasp deploy (se configurado) → live no GAS
```

Não é necessário nenhum passo manual depois do merge — é esse o
comportamento que a automação entrega.

---

## 4. Troubleshooting

- **`clasp push` falha com erro de autenticação em CI**: o token em
  `CLASP_CREDENTIALS` expirou ou foi revogado — gere um novo com
  `clasp login` local e atualize o secret.
- **Mudança não aparece para os usuários finais mesmo após o deploy
  automático**: confirme que `CLASP_DEPLOYMENT_ID` aponta pro
  deployment correto (`clasp deployments` mostra todos; o de produção é
  o que tem a URL `/exec` usada no dia a dia). Sem esse secret, o
  workflow só atualiza HEAD, não a versão publicada.
- **`Aba não autorizada` após adicionar uma aba nova no Sheets**: não é
  um problema de deploy — é a whitelist `ALLOWED_SHEETS` em `Router.gs`
  que precisa incluir o nome da nova aba (ver `CLAUDE.md`).
- **Erro de sintaxe só aparece em produção, nunca localmente**: Apps
  Script não tem checagem estática — o `clasp push` copia o texto do
  arquivo sem validar. Erros de sintaxe (como function declaration dentro
  de bloco `if`/`try`, ver `CLAUDE.md`) só aparecem no `Logger`/execução
  real. Sempre dê uma olhada no editor do Apps Script (`clasp open`)
  depois de um push grande.
