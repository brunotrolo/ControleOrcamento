# Arquitetura

Visão detalhada de como o projeto está organizado. Para o resumo rápido de
gotchas, veja `CLAUDE.md` na raiz do repositório.

## Visão geral

```
┌─────────────────────────────┐
│   Google Sheets (banco)     │  abas: NOTA_FISCAL, NOTA_FISCAL_ANALITICO,
│                              │  FORNECEDOR, PRESTADOR, FORECAST,
│                              │  ESTIMATIVA, HISTOGRAMA
└──────────────┬───────────────┘
               │ SpreadsheetApp
┌──────────────▼───────────────┐
│  DAO.gs                      │  leitura/escrita em bloco, cache de
│  (camada de persistência)    │  cabeçalho de 6h, normalização de chaves
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  Router.gs + ComponentHelper │  endpoints chamáveis via google.script.run
│  (camada de controller)      │  todos envolvidos por _route()
└──────────────┬───────────────┘
               │ google.script.run.<funcao>(...).withSuccessHandler(...)
┌──────────────▼───────────────┐
│  Page_*.html / Card_*.html   │  HTML + CSS + JS inline, um IIFE por
│  (frontend)                  │  módulo, sem framework, sem build
└───────────────────────────────┘
```

Ponto de entrada: `codigo.gs` → `doGet()` → renderiza `Index.html`, que
inclui todos os `Page_*.html`/`Card_*.html`/`SubPage_*.html` via
`<?!= include('NomeDoArquivo') ?>` (função `include()` definida em
`codigo.gs`).

## Arquivos backend (`.gs`)

| Arquivo | Responsabilidade |
|---|---|
| `codigo.gs` | `doGet()`, `include()`, utilitários de setup (`limparCache`, config do Gemini) |
| `config.gs` | Resolve `SPREADSHEET_ID` (script vinculado ou standalone via `PropertiesService`), define `SHEETS`, `TZ`, `ConfigHelper` |
| `DAO.gs` | `fetchAll`, `insertRow`, `updateRow`, `deleteRow`, `getHeaderMap` (com cache), `normalizeKey`, `formatDateValue` |
| `Router.gs` | `_route()` wrapper, `ALLOWED_SHEETS`, endpoints CRUD genéricos, e a maior parte dos endpoints específicos do dashboard (forecast, notas, etc.) — arquivo grande (~40KB) |
| `ComponentHelper.gs` | Endpoints reutilizáveis por componentes (`routerGetFilterValues`, `routerSaveComponent`, `routerDeleteComponent`, `routerGetSheetStats`) |
| `GeminiService.gs` | Integração com Gemini API (feature auxiliar) |

## Padrão `_route()` — MUITO IMPORTANTE

```js
function _route(handler) {
  const t0 = Date.now();
  try {
    const result = handler();
    return Object.assign({ success: true, metrics: { executionTime: Date.now() - t0 } }, result);
  } catch (e) {
    return { success: false, message: e.message, metrics: {...} };
  }
}
```

Qualquer chave que o `handler()` retornar vira uma chave na **raiz** do
objeto de resposta. Exemplo real (`routerGetForecastData`, simplificado):

```js
function routerGetForecastData() {
  return _route(() => {
    // ...
    return { rows: forecastRows, months: monthLabels };
  });
}
```

No frontend, a resposta chega como `{ success, metrics, rows, months }` —
**não** `{ success, metrics, data: { rows, months } }`. Só existe um
`res.data` quando o handler explicitamente retorna uma chave chamada
`data` (ex.: `routerGetSheet` retorna `{ data, headers, labels }`, aí sim
`res.data` existe).

## Whitelist de abas (`ALLOWED_SHEETS`)

```js
const ALLOWED_SHEETS = {
  NOTA_FISCAL:           "NOTA_FISCAL",
  NOTA_FISCAL_ANALITICO: "NOTA_FISCAL_ANALITICO",
  FORNECEDOR:            "FORNECEDOR",
  PRESTADOR:             "PRESTADOR",
  FORECAST:              "FORECAST",
  ESTIMATIVA:            "ESTIMATIVA",
  HISTOGRAMA:            "HISTOGRAMA",
};
```

Todo endpoint genérico (`routerGetSheet`, `routerInsertRow`,
`routerUpdateRow`, `routerDeleteComponent`, etc.) chama
`_assertAllowed(sheetName)` antes de tocar na planilha. Uma nova aba só
fica acessível pelo CRUD genérico depois de entrar nessa lista.

## Schema conhecido das abas principais

Os nomes de coluna reais do Sheets são normalizados para snake_case ASCII
por `normalizeKey` (`DAO.gs`) antes de virar chave de objeto no JS —
"Valor Total" → `valor_total`.

### `NOTA_FISCAL`
Uma linha por nota fiscal. Campos usados no código: `status_nfe`
(precisa ser `"Autorizada"` para entrar nos totais), `competencia`
(formato `MM/yyyy`), `total_nfe`, `iniciativa` (código/inibank),
`iniciativa_descricao`, `vencimento`.

### `NOTA_FISCAL_ANALITICO`
Detalhamento de uma nota fiscal por profissional alocado (várias linhas
por nota). Campos: `matricula`, `nome_profissional`, `subtotal_nfe`,
`iniciativa` (pode divergir da iniciativa da nota-pai — é a fonte de
verdade para "em qual iniciativa esse profissional trabalhou").

### `PRESTADOR`
Uma linha por prestador de serviço (podem existir múltiplas linhas com o
mesmo nome/matrícula placeholder — **nunca colapsar por matrícula sem
checar se é placeholder**, ver `CLAUDE.md`). Campos usados:
matrícula, nome, papel (ex.: "Desenvolvedor Salesforce Sênior"),
fornecedor (a consultoria/empresa), iniciativa (alocação declarada),
status (`Ativo`/`Inativo`), HH (rate card por hora) e estimativa
mensal (`estMensal`).

### `FORECAST`
Uma ou mais linhas por iniciativa (`inibank`) e mês, com colunas de
direção (`Soma`/`Subtrai`) que se combinam para formar o valor final por
mês — ver `routerGetForecastData` em `Router.gs` para a lógica de sinal.

### `FORNECEDOR`, `ESTIMATIVA`, `HISTOGRAMA`
Abas de apoio — ver `ALLOWED_SHEETS` e os respectivos `Page_*.html`
(`Page_Fornecedor.html`, `SubPage_*`) para uso específico.

## Frontend

### Estrutura de arquivo

Cada `Page_*.html`/`Card_*.html` segue o padrão:

```html
<style> /* CSS do componente, com prefixo de classe único */ </style>
<div id="..."> ... HTML estático inicial ... </div>
<script>
var MeuModulo = (function() {
  // estado do módulo em variáveis var/let no escopo da IIFE
  function render(data) { /* monta HTML via concatenação e injeta */ }
  function _attachHandlers() { /* liga listeners, chamado uma vez */ }
  // chamadas ao backend: google.script.run.withSuccessHandler(cb).routerX(...)
  return { init: ..., render: ... };
})();
</script>
```

`Page_Home.html` é o maior arquivo (~110KB) — o dashboard principal, com
múltiplos cards/seções cada um com seu próprio `render*()`.

### Comunicação entre componentes

`Card_Filter.html` dispara um `CustomEvent('filterchange', { detail })`
no objeto global sempre que o usuário muda o filtro global (iniciativa,
competência, status). Qualquer componente que precise reagir a isso
adiciona um listener em `window`:

```js
window.addEventListener('filterchange', function(e) {
  _filteredData = _applyFilters(_allData, e.detail);
  renderTudo(_filteredData);
});
```

### Chamando o backend

Padrão único no projeto — sempre via `google.script.run`:

```js
google.script.run
  .withSuccessHandler(function(res) {
    if (!res.success) { SyncMonitor.update('error', res.message); return; }
    // usar res.<campo> diretamente — ver seção "_route()" acima
  })
  .withFailureHandler(function(err) { SyncMonitor.update('error', String(err)); })
  .routerNomeDoEndpoint(args);
```

`SyncMonitor` (definido em `Index.html`) mostra o estado de
sincronização (loading/success/error) no topo da página e o tempo de
execução (`metrics.executionTime`) retornado por `_route`.

## Convenções de nomenclatura

- Endpoints backend: prefixo `router` (`routerGetForecastData`,
  `routerSaveComponent`, ...).
- Funções privadas de módulo frontend: prefixo `_` (`_renderProfSquad`,
  `_joinKey`, `_fillProfSelects`).
- IDs de elementos: `kebab-case` com prefixo do componente
  (`prof-f-status`, `home-prof-detail`, `hdr-prof`).
- Classes CSS: prefixo curto do componente (`.prof-*`, `.squad-*`,
  `.hx-*` para o heatmap).
