/**
 * ============================================================================
 * Router.gs - Camada de Roteamento (Controller)
 * ============================================================================
 * Cada função pública é um endpoint chamável pelo frontend via google.script.run.
 * Responsabilidades:
 *  - Receber a chamada do front
 *  - Chamar o DAO
 *  - Aplicar regras de negócio simples (sem lógica de persistência aqui)
 *  - Retornar { success, data?, message?, metrics? }
 *
 * NOTA: Formatação de datas é feita no DAO. O Router não reformata datas.
 */

// --------------------------------------------------------------------------
// WRAPPER PADRÃO — envolve qualquer handler e garante retorno consistente
// --------------------------------------------------------------------------
function _route(handler) {
  const t0 = Date.now();
  try {
    const result = handler();
    return Object.assign({ success: true, metrics: { executionTime: Date.now() - t0 } }, result);
  } catch (e) {
    Logger.log("[Router Error] " + e.toString());
    return { success: false, message: e.message, metrics: { executionTime: Date.now() - t0 } };
  }
}

// --------------------------------------------------------------------------
// DIAGNÓSTICO
// --------------------------------------------------------------------------

function diagnosticoGeral() {
  return _route(() => ({ debugInfo: getDiagnostics() }));
}

// --------------------------------------------------------------------------
// NOTAS FISCAIS
// --------------------------------------------------------------------------

/** GET — Retorna todas as notas fiscais + cabeçalhos para tabela dinâmica */
function routerGetNotas() {
  return _route(() => {
    const { sheet }        = _openSheet(SHEETS.NOTAS);
    const { map, labels }  = getHeaderMap(sheet);

    // Ordena as chaves pela posição original da planilha
    const headers = Object.entries(map)
      .sort((a, b) => a[1] - b[1])
      .map(([key]) => key);

    const data = fetchAll(SHEETS.NOTAS);
    return { data, headers, labels };
  });
}

/** POST — Salva uma nova nota fiscal */
function routerSaveNotaFiscal(dataObj) {
  return _route(() => {
    // Regra de negócio: status padrão ao criar
    if (!dataObj.status) dataObj.status = "PENDENTE";
    return insertRow(SHEETS.NOTAS, dataObj);
  });
}

/** PUT — Atualiza uma nota fiscal existente */
function routerUpdateNotaFiscal(rowNumber, dataObj) {
  return _route(() => updateRow(SHEETS.NOTAS, rowNumber, dataObj));
}

/** DELETE — Remove uma nota fiscal */
function routerDeleteNotaFiscal(rowNumber) {
  return _route(() => deleteRow(SHEETS.NOTAS, rowNumber));
}

// --------------------------------------------------------------------------
// IMPORTAÇÃO DE NOTA FISCAL VIA GEMINI
// --------------------------------------------------------------------------

/**
 * EXTRACT — Envia o PDF para o Gemini e retorna os campos extraídos para revisão.
 * O frontend exibe os campos para o usuário confirmar ANTES de salvar na planilha.
 *
 * @param {string} base64Data - PDF convertido em base64 no frontend
 */
function routerExtractNota(base64Data) {
  return _route(() => {
    const extracted = GeminiService.extractFromPdf(base64Data);
    return {
      data: {
        ...extracted,
        status: "PENDENTE",
      }
    };
  });
}

/**
 * CONFIRM — Salva na planilha após o usuário revisar e confirmar os dados.
 * Separado do extract para garantir que nada é gravado sem revisão humana.
 *
 * @param {Object} dataObj - Dados revisados pelo usuário
 */
function routerConfirmImportNota(dataObj) {
  return _route(() => {
    if (!dataObj.status) dataObj.status = "PENDENTE";
    return insertRow(SHEETS.NOTAS, dataObj);
  });
}

// --------------------------------------------------------------------------
// DASHBOARD
// --------------------------------------------------------------------------

/**
 * GET — Agrega dados reais da planilha para o dashboard.
 * Calcula KPIs diretamente no servidor para não sobrecarregar o front.
 */
function routerGetDashboardData() {
  return _route(() => {
    const notas = fetchAll(SHEETS.NOTAS);

    // --- KPIs ---
    let totalRealizado = 0;
    const porIniciativa = {};
    const porMes        = {};

    notas.forEach(n => {
      const valor = parseFloat(String(n.valor_total).replace(",", ".")) || 0;

      // Ignora canceladas no realizado
      const status = (n.status || "").toString().toUpperCase();
      if (status !== "CANCELADA") {
        totalRealizado += valor;
      }

      // Agrupamento por iniciativa
      const ini = n.iniciativa || "Outros";
      porIniciativa[ini] = (porIniciativa[ini] || 0) + valor;

      // Agrupamento por competência (MM/yyyy)
      const mes = n.competencia || "??";
      porMes[mes] = (porMes[mes] || 0) + valor;
    });

    // Serializa para arrays ordenados
    const topIniciativas = Object.entries(porIniciativa)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nome, valor]) => ({
        nome,
        valor,
        valorStr: valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      }));

    const evolucaoMensal = Object.entries(porMes)
      .sort((a, b) => _parseMesAno(a[0]) - _parseMesAno(b[0]))
      .map(([mes, valor]) => ({
        mes,
        valor,
        valorStr: valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      }));

    return {
      data: {
        totalNotas:       notas.length,
        totalRealizado,
        realizadoStr:     totalRealizado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        topIniciativas,
        evolucaoMensal,
      }
    };
  });
}

/** Auxiliar: converte "MM/yyyy" em timestamp para ordenação */
function _parseMesAno(str) {
  if (!str || str === "??") return 0;
  const parts = str.split("/");
  if (parts.length !== 2) return 0;
  return new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1).getTime();
}
