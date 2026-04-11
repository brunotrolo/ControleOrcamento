/**
 * ============================================================================
 * ComponentHelper — Extensão do Router para componentes reutilizáveis
 * ============================================================================
 * Funções específicas para suportar componentes isolados (Card_Filter, etc.)
 */

/**
 * GET — Retorna os valores únicos de campos específicos de uma aba.
 * Usado pelo Card_Filter para popular dropdowns.
 *
 * @param {string} sheetName - Nome da aba (NOTA_FISCAL, FORNECEDOR, etc.)
 * @param {array} fields - Array de nomes de colunas (snake_case)
 * @returns {Object} { filterValues: { field1: [...], field2: [...], ... } }
 */
function routerGetFilterValues(sheetName, fields) {
  return _route(() => {
    _assertAllowed(sheetName);
    const data = fetchAll(sheetName);
    const filterValues = {};

    // Para cada campo solicitado, extrair valores únicos
    fields.forEach(field => {
      const values = new Set();
      data.forEach(row => {
        const val = row[field];
        if (val && val !== '' && val !== null && val !== undefined) {
          values.add(String(val).trim());
        }
      });
      // Converter Set para Array ordenado
      filterValues[field] = [...values].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    });

    return { filterValues };
  });
}

/**
 * POST — Salva dados dinamicamente em qualquer aba autorizada.
 * Reutilizável por múltiplos componentes.
 *
 * @param {string} sheetName
 * @param {Object} dataObj
 */
function routerSaveComponent(sheetName, dataObj) {
  return _route(() => {
    _assertAllowed(sheetName);
    return insertRow(sheetName, dataObj);
  });
}

/**
 * DELETE — Remove dados dinamicamente de qualquer aba autorizada.
 * Reutilizável por múltiplos componentes.
 *
 * @param {string} sheetName
 * @param {array} rowNumbers
 */
function routerDeleteComponent(sheetName, rowNumbers) {
  return _route(() => {
    _assertAllowed(sheetName);
    const { sheet } = _openSheet(sheetName);
    const sorted = [...rowNumbers].sort((a, b) => b - a);
    sorted.forEach(n => {
      if (n >= 2) sheet.deleteRow(n);
    });
    return { message: sorted.length + " registro(s) removido(s)." };
  });
}

/**
 * GET — Retorna estatísticas agregadas de uma aba.
 * Útil para cards de KPI genéricos.
 *
 * @param {string} sheetName
 * @returns {Object} { rowCount, lastUpdated, columnCount }
 */
function routerGetSheetStats(sheetName) {
  return _route(() => {
    _assertAllowed(sheetName);
    const { sheet } = _openSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    return {
      rowCount: Math.max(0, lastRow - 1), // -1 para excluir cabeçalho
      columnCount: lastCol,
      lastUpdated: new Date().toISOString(),
    };
  });
}