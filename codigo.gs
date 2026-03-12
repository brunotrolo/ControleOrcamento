/**
 * ============================================================================
 * Codigo.gs - Ponto de Entrada do Web App
 * ============================================================================
 */

/** Renderiza o Web App */
function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("BudgetDev | Gestão Orçamentária")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inclui arquivos HTML (CSS/JS/partials) dentro do template.
 * Usado via <?!= include('NomeDoArquivo') ?> nos templates.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function configurarGeminiKey() {
  GeminiService.saveApiKey("SUA_API_KEY_AQUI");
}

function verificarKey() {
  Logger.log(PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"));
}

function limparCache() {
  const cache = CacheService.getScriptCache();
  const abas = [
    "NOTA_FISCAL",
    "NOTA_FISCAL_ANALITICO",
    "FORNECEDOR",
    "PRESTADOR",
    "FORECAST",
    "HISTOGRAMA",
  ];
  abas.forEach(aba => {
    cache.remove("hmap_"  + aba);
    cache.remove("hmap2_" + aba);
  });
  Logger.log("Cache limpo para: " + abas.join(", "));
}
