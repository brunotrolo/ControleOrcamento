/**
 * ============================================================================
 * Config.gs - Configurações Globais
 * ============================================================================
 * 100% dinâmico — funciona em qualquer clone da planilha sem alteração.
 *
 * REQUISITO: O script deve estar vinculado (bound) à planilha Google Sheets.
 * Isso é o padrão quando você cria o script via:
 *   Planilha → Extensões → Apps Script
 *
 * Se o script for standalone (não vinculado), use PropertiesService
 * para armazenar o ID uma única vez (ver instrução no final deste arquivo).
 */

const SPREADSHEET_ID = (function () {
  // 1ª tentativa: script vinculado à planilha (caso mais comum)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss.getId();
  } catch (_) {}

  // 2ª tentativa: ID salvo via PropertiesService (para scripts standalone)
  // Configure uma vez rodando: ConfigHelper.setSpreadsheetId("SEU_ID_AQUI")
  try {
    const saved = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (saved) return saved;
  } catch (_) {}

  // Nenhuma das tentativas funcionou — lança erro claro em vez de falhar silenciosamente
  throw new Error(
    "Planilha não encontrada. " +
    "Se o script for standalone, execute ConfigHelper.setSpreadsheetId('ID_DA_PLANILHA') uma vez para registrá-la."
  );
})();

const SHEETS = {
  NOTAS:           "NOTA_FISCAL",
  NOTAS_ANALITICO: "NOTA_FISCAL_ANALITICO",
};

const TZ = Session.getScriptTimeZone();

/**
 * ============================================================================
 * ConfigHelper — utilitário de setup para scripts standalone
 * ============================================================================
 * Rode UMA VEZ manualmente no editor do Apps Script para registrar o ID.
 * Após isso, o ID fica salvo nas propriedades do script — não no código.
 *
 * Como usar:
 *   1. Abra o editor do Apps Script
 *   2. Na lista de funções, selecione: ConfigHelper_set
 *   3. Edite o ID abaixo e clique Executar — feito.
 */
const ConfigHelper = {
  setSpreadsheetId(id) {
    PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", id);
    Logger.log("✅ SPREADSHEET_ID salvo: " + id);
  },

  getSpreadsheetId() {
    const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    Logger.log(id ? "ID salvo: " + id : "Nenhum ID salvo.");
    return id;
  },

  clearSpreadsheetId() {
    PropertiesService.getScriptProperties().deleteProperty("SPREADSHEET_ID");
    Logger.log("🗑️ SPREADSHEET_ID removido.");
  }
};
