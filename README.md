# ControleOrcamento

**BudgetDev | Gestão Orçamentária** — web app de controle orçamentário e
financeiro (notas fiscais, fornecedores, prestadores/squads alocados em
iniciativas, forecast e dashboards de acompanhamento), construído
inteiramente em **Google Apps Script** com **Google Sheets** como banco
de dados. Sem backend externo, sem build step.

## Documentação

- **[CLAUDE.md](./CLAUDE.md)** — contexto do projeto para Claude Code:
  stack, fluxo de trabalho de Git e as armadilhas recorrentes deste
  código (leia antes de codar).
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — mapa de arquivos,
  camadas (Router/DAO), schema das abas do Sheets, convenções de frontend.
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — como configurar o
  `clasp` e o deploy automático via GitHub Actions (push na `main` →
  publica no Apps Script).

## Quickstart

```bash
npm install                 # instala o clasp como devDependency
npx clasp login              # autentica com a conta Google dona do projeto GAS
cp .clasp.json.example .clasp.json   # preencha com o Script ID real
npx clasp push -f            # publica o código no projeto Apps Script
```

Para deploy automático a cada merge na `main`, veja
[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Estrutura

```
codigo.gs, config.gs, DAO.gs, Router.gs, ComponentHelper.gs, GeminiService.gs
  → backend Apps Script

Index.html, MenuSidebar.html, Styles.html, CrudModal.html, CrudTable.html
  → shell e componentes compartilhados do frontend

Page_*.html, Card_*.html, SubPage_*.html
  → páginas e componentes do dashboard (um IIFE autocontido por arquivo)
```

Sem testes automatizados, sem lint configurado — Apps Script não tem
checagem estática, então a validação de mudanças é sempre manual (ver
seção final de `CLAUDE.md`).
