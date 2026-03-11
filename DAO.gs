/**
 * ============================================================================
 * DAO.gs - Camada de Persistência (Data Access Object)
 * ============================================================================
 * Princípios:
 *  - Uma única chamada SpreadsheetApp.openById por operação
 *  - Cache de mapa de colunas via CacheService (evita reler cabeçalho toda vez)
 *  - Leitura em bloco (getDataRange uma vez), sem getRange repetido
 *  - Formatação de datas centralizada aqui (sem duplicar no Router)
 */

// --------------------------------------------------------------------------
// UTILITÁRIOS
// --------------------------------------------------------------------------

/**
 * Normaliza um texto para snake_case minúsculo sem acentos.
 * Ex: " ValoR  TOtal " → "valor_total"
 */
function normalizeKey(text) {
  if (!text) return "";
  return String(text)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * Formata um valor Date conforme o tipo de coluna.
 * Centraliza toda lógica de data, evitando duplicação no Router.
 */
function formatDateValue(date, key) {
  if (!(date instanceof Date)) return date;
  if (key === "competencia") {
    return Utilities.formatDate(date, TZ, "MM/yyyy");
  }
  return Utilities.formatDate(date, TZ, "dd/MM/yyyy");
}

// --------------------------------------------------------------------------
// MAPA DE COLUNAS (com cache de 6h)
// --------------------------------------------------------------------------

/**
 * Retorna o mapa de colunas para uma aba.
 * Usa CacheService para evitar reler o cabeçalho a cada requisição.
 *
 * Estrutura retornada:
 * {
 *   map:     { chave_normalizada: columnIndex },  — usado internamente para leitura/escrita
 *   labels:  { chave_normalizada: "Label Original" } — nome real da planilha para exibição
 * }
 */
function getHeaderMap(sheet) {
  const cacheKey = "hmap2_" + sheet.getName();
  const cache    = CacheService.getScriptCache();
  const cached   = cache.get(cacheKey);

  if (cached) return JSON.parse(cached);

  const rawHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map    = {};
  const labels = {};

  rawHeaders.forEach((h, i) => {
    if (!h) return;
    const key  = normalizeKey(h);
    map[key]   = i;
    labels[key] = String(h).trim(); // preserva o nome original exato da planilha
  });

  const result = { map, labels };
  cache.put(cacheKey, JSON.stringify(result), 21600); // 6 horas
  return result;
}

/**
 * Invalida o cache do mapa de uma aba (chamar após inserir/remover colunas).
 */
function invalidateHeaderCache(sheetName) {
  CacheService.getScriptCache().remove("hmap_" + sheetName);
}

// --------------------------------------------------------------------------
// OPERAÇÕES CRUD
// --------------------------------------------------------------------------

/**
 * Abre a planilha uma única vez e retorna { ss, sheet }.
 * Lança erro claro se a aba não existir.
 */
function _openSheet(sheetName) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Aba '" + sheetName + "' não encontrada.");
  return { ss, sheet };
}

/**
 * READ — Retorna todos os registros de uma aba como array de objetos.
 * Leitura em bloco único para máxima performance.
 */
function fetchAll(sheetName) {
  const { sheet }    = _openSheet(sheetName);
  const { map }      = getHeaderMap(sheet);
  const keys         = Object.keys(map);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  return rows.map(row => {
    const obj = {};
    keys.forEach(key => {
      obj[key] = formatDateValue(row[map[key]], key);
    });
    return obj;
  });
}

/**
 * CREATE — Adiciona uma linha ao final da aba.
 * Monta o array respeitando a ordem das colunas do cabeçalho.
 */
function insertRow(sheetName, dataObj) {
  const { sheet }  = _openSheet(sheetName);
  const { map }    = getHeaderMap(sheet);

  const maxCol = Math.max(...Object.values(map));
  const newRow = new Array(maxCol + 1).fill("");

  Object.entries(dataObj).forEach(([key, val]) => {
    const colIdx = map[normalizeKey(key)];
    if (colIdx !== undefined) newRow[colIdx] = val;
  });

  sheet.appendRow(newRow);
  return { success: true, message: "Registro inserido com sucesso." };
}

/**
 * UPDATE — Atualiza uma linha existente pelo número da linha (1-based).
 * rowNumber deve ser >= 2 (linha 1 é cabeçalho).
 */
function updateRow(sheetName, rowNumber, dataObj) {
  if (rowNumber < 2) throw new Error("rowNumber inválido: " + rowNumber);

  const { sheet } = _openSheet(sheetName);
  const { map }   = getHeaderMap(sheet);

  Object.entries(dataObj).forEach(([key, val]) => {
    const colIdx = map[normalizeKey(key)];
    if (colIdx !== undefined) {
      sheet.getRange(rowNumber, colIdx + 1).setValue(val);
    }
  });

  return { success: true, message: "Registro atualizado." };
}

/**
 * DELETE — Remove uma linha pelo número (1-based, >= 2).
 */
function deleteRow(sheetName, rowNumber) {
  if (rowNumber < 2) throw new Error("rowNumber inválido: " + rowNumber);
  const { sheet } = _openSheet(sheetName);
  sheet.deleteRow(rowNumber);
  return { success: true, message: "Registro removido." };
}

/**
 * DIAGNOSTICS — Retorna metadados da planilha para debug.
 */
function getDiagnostics() {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const abas = ss.getSheets().map(s => s.getName());

  const sheet      = ss.getSheetByName(SHEETS.NOTAS);
  const headerData = sheet ? getHeaderMap(sheet) : { map: {}, labels: {} };

  return {
    abas,
    mapa:         headerData.map,
    totalColunas: Object.keys(headerData.map).length,
    spreadsheetId: SPREADSHEET_ID,
  };
}
