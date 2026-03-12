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
