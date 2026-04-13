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
// CRUD GENÉRICO — reutilizado por todas as páginas de tabela
// --------------------------------------------------------------------------

/**
 * Whitelist de abas permitidas para o CRUD genérico.
 * Segurança: impede que o frontend acesse abas não autorizadas.
 */
const ALLOWED_SHEETS = {
  NOTA_FISCAL:          "NOTA_FISCAL",
  NOTA_FISCAL_ANALITICO:"NOTA_FISCAL_ANALITICO",
  FORNECEDOR:           "FORNECEDOR",
  PRESTADOR:            "PRESTADOR",
  FORECAST:             "FORECAST",
  HISTOGRAMA:           "HISTOGRAMA",
};

function _assertAllowed(sheetName) {
  if (!Object.values(ALLOWED_SHEETS).includes(sheetName)) {
    throw new Error("Aba não autorizada: " + sheetName);
  }
}

/** GET — Retorna dados + cabeçalhos de qualquer aba autorizada */
function routerGetSheet(sheetName) {
  return _route(() => {
    _assertAllowed(sheetName);
    const { sheet }       = _openSheet(sheetName);
    const { map, labels } = getHeaderMap(sheet);

    const headers = Object.entries(map)
      .sort((a, b) => a[1] - b[1])
      .map(([key]) => key);

    const data = fetchAll(sheetName);
    return { data, headers, labels };
  });
}

/** POST — Insere uma linha em qualquer aba autorizada */
function routerInsertRow(sheetName, dataObj) {
  return _route(() => {
    _assertAllowed(sheetName);
    return insertRow(sheetName, dataObj);
  });
}

/** PUT — Atualiza uma linha em qualquer aba autorizada */
function routerUpdateRow(sheetName, rowNumber, dataObj) {
  return _route(() => {
    _assertAllowed(sheetName);
    return updateRow(sheetName, rowNumber, dataObj);
  });
}

/**
 * DELETE — Remove múltiplas linhas de uma aba autorizada.
 * Recebe array de rowNumbers (1-based) e remove de baixo para cima
 * para não deslocar os índices durante a deleção.
 */
function routerDeleteRows(sheetName, rowNumbers) {
  return _route(() => {
    _assertAllowed(sheetName);
    const { sheet } = _openSheet(sheetName);

    // Ordena decrescente para deletar de baixo para cima
    const sorted = [...rowNumbers].sort((a, b) => b - a);
    sorted.forEach(n => {
      if (n >= 2) sheet.deleteRow(n); // linha 1 é cabeçalho, nunca deleta
    });

    return { message: sorted.length + " registro(s) removido(s)." };
  });
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
// UTILITÁRIOS DE MANUTENÇÃO
// --------------------------------------------------------------------------

/**
 * Limpa o cache de cabeçalhos de todas as abas conhecidas.
 * Chamar sempre que adicionar, remover ou renomear colunas na planilha.
 */
/**
 * UTILITÁRIO — Rodar manualmente no editor do Apps Script.
 * Selecione esta função no dropdown e clique em Executar.
 * Invalida o cache de cabeçalhos de TODAS as abas do projeto.
 */
function ADMIN_invalidarTodoOCache() {
  const todas = [...new Set([
    ...Object.values(SHEETS),
    ...Object.values(ALLOWED_SHEETS),
  ])];
  todas.forEach(sheetName => invalidateHeaderCache(sheetName));
  Logger.log("✅ Cache invalidado para: " + todas.join(", "));
}

function routerInvalidarCache() {
  return _route(() => {
    // Une SHEETS (legado) + ALLOWED_SHEETS (novas páginas) sem duplicatas
    const todas = [...new Set([
      ...Object.values(SHEETS),
      ...Object.values(ALLOWED_SHEETS),
    ])];
    todas.forEach(sheetName => invalidateHeaderCache(sheetName));
    return { message: "Cache invalidado para: " + todas.join(", ") };
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
    const nfs  = fetchAll(SHEETS.NOTAS);
    const ana  = fetchAll(SHEETS.NOTAS_ANALITICO);

    const hoje = new Date();

    // ── helpers ────────────────────────────────────────────────────────
    function R(n) { return Math.round((parseFloat(n)||0)*100)/100; }

    function mesKey(val) {
      if (!val) return null;
      // DAO formata competencia como "MM/yyyy" (ex: "01/2025")
      // Outros campos de data chegam como "dd/MM/yyyy" ou Date object
      const s = String(val).trim();
      const mmYYYY = s.match(/^(\d{2})\/(\d{4})$/);
      if (mmYYYY) return mmYYYY[2] + '-' + mmYYYY[1]; // → "2025-01"
      // fallback para Date object
      const d = val instanceof Date ? val : new Date(val);
      if (isNaN(d.getTime())) return null;
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
    }

    function daysDiff(val) {
      if (!val) return null;
      const d = val instanceof Date ? val : new Date(val);
      if (isNaN(d)) return null;
      return Math.round((d.getTime() - hoje.getTime()) / 86400000);
    }

    // ── KPIs ───────────────────────────────────────────────────────────
    let totalAuth=0, totalCanc=0, nfsAuth=0, nfsCanc=0;
    let vence30Val=0, vence30Qtd=0, vencidasQtd=0;
    const proximos = [];

    nfs.forEach(r => {
      const st  = (r.status_nfe||'').trim();
      const val = R(r.total_nfe);
      const dd  = daysDiff(r.data_vencimento);

      if (st === 'Autorizada') {
        totalAuth = R(totalAuth + val);
        nfsAuth++;
        if (dd !== null) {
          if (dd < 0)            vencidasQtd++;
          if (dd >= 0 && dd<=30) { vence30Val = R(vence30Val+val); vence30Qtd++; }
          if (dd >= -7 && dd<=45) {
            proximos.push({
              data:        r.data_vencimento instanceof Date ? Utilities.formatDate(r.data_vencimento, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(r.data_vencimento||''),
              fornecedor:  r.nome_fantasia || '',
              iniciativa:  r.iniciativa   || '',
              nfe:         String(r.nfe   || ''),
              valor:       val,
              dias:        dd
            });
          }
        }
      } else if (st === 'Cancelada') {
        totalCanc = R(totalCanc + val);
        nfsCanc++;
      }
    });

    proximos.sort((a,b)=>a.dias-b.dias);

    // ── Por mês ─────────────────────────────────────────────────────────
    const porMes = {};
    nfs.forEach(r => {
      const m   = mesKey(r.competencia);
      if (!m) return;
      const st  = (r.status_nfe||'').trim();
      const val = R(r.total_nfe);
      if (!porMes[m]) porMes[m] = { auth:0, canc:0, qtd:0 };
      if (st==='Autorizada') { porMes[m].auth = R(porMes[m].auth+val); porMes[m].qtd++; }
      if (st==='Cancelada')  { porMes[m].canc = R(porMes[m].canc+val); }
    });

    // ── Por iniciativa ──────────────────────────────────────────────────
    const porIni = {};
    nfs.forEach(r => {
      if ((r.status_nfe||'').trim()==='Cancelada') return;
      const ini  = r.iniciativa  || 'Sem Iniciativa';
      const desc = r.iniciativa_descricao || '';
      const forn = r.nome_fantasia || '—';
      const mes  = mesKey(r.competencia);
      const val  = R(r.total_nfe);
      if (!porIni[ini]) porIni[ini] = { val:0, qtd:0, desc, meses:{}, fornecedores:{} };
      porIni[ini].val = R(porIni[ini].val + val);
      porIni[ini].qtd++;
      if (mes) porIni[ini].meses[mes] = R((porIni[ini].meses[mes]||0)+val);
      porIni[ini].fornecedores[forn]  = R((porIni[ini].fornecedores[forn]||0)+val);
    });

    // ── Por fornecedor ──────────────────────────────────────────────────
    const porForn = {};
    nfs.forEach(r => {
      if ((r.status_nfe||'').trim()==='Cancelada') return;
      const forn = r.nome_fantasia || '—';
      const ini  = r.iniciativa   || '—';
      const mes  = mesKey(r.competencia);
      const val  = R(r.total_nfe);
      if (!porForn[forn]) porForn[forn] = { val:0, qtd:0, meses:{}, iniciativas:{} };
      porForn[forn].val = R(porForn[forn].val + val);
      porForn[forn].qtd++;
      if (mes) porForn[forn].meses[mes] = R((porForn[forn].meses[mes]||0)+val);
      porForn[forn].iniciativas[ini]    = R((porForn[forn].iniciativas[ini]||0)+val);
    });

    // ── Por profissional (analítico) ────────────────────────────────────
    const porProf = {};
    ana.forEach(r => {
      const nome = r.nome_profissional;
      if (!nome || nome==='-') return;
      const val  = R(r.subtotal_nfe);
      const mes  = mesKey(r.competencia);
      const ini  = r.iniciativa || '';
      if (!porProf[nome]) porProf[nome] = { val:0, papel: r.papel_prestador||'', fornecedor: r.nome_fantasia||'', iniciativas:[], meses:{} };
      porProf[nome].val = R(porProf[nome].val + val);
      if (mes) porProf[nome].meses[mes] = R((porProf[nome].meses[mes]||0)+val);
      if (ini && porProf[nome].iniciativas.indexOf(ini)===-1) porProf[nome].iniciativas.push(ini);
    });

    // ordena profissionais por valor desc, top 15
    const porProfTop = {};
    Object.entries(porProf)
      .sort((a,b)=>b[1].val-a[1].val)
      .slice(0,15)
      .forEach(([k,v]) => { porProfTop[k]=v; });

    return {
      kpis: {
        total_auth:   totalAuth,
        total_canc:   totalCanc,
        nfs_auth:     nfsAuth,
        nfs_canc:     nfsCanc,
        vence_30_val: vence30Val,
        vence_30_qtd: vence30Qtd,
        vencidas_qtd: vencidasQtd,
        ativos:       fetchAll(ALLOWED_SHEETS.PRESTADOR).filter(r=>(r.status_prestador||'').includes('Ativo')).length,
      },
      por_mes:  porMes,
      por_ini:  porIni,
      por_forn: porForn,
      por_prof: porProfTop,
      proximos: proximos.slice(0,20),
    };
  });
}

function _parseMesAno(str) {
  if (!str || str === "??") return 0;
  const parts = str.split("/");
  if (parts.length !== 2) return 0;
  return new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1).getTime();
}


// --------------------------------------------------------------------------
// NOTA FISCAL ANALÍTICO — DADOS DE PROFISSIONAIS
// Adicione estas funções ao final do Router.gs
// --------------------------------------------------------------------------

/**
 * GET — Retorna dados de NOTA_FISCAL_ANALITICO (profissionais por NF)
 */
function routerGetNotaFiscalAnalitico() {
  return _route(() => {
    _assertAllowed(ALLOWED_SHEETS.NOTA_FISCAL_ANALITICO);
    const data = fetchAll(ALLOWED_SHEETS.NOTA_FISCAL_ANALITICO);
    return { data };
  });
}

/**
 * GET — Combina NOTA_FISCAL + NOTA_FISCAL_ANALITICO
 * Relaciona por NOME_FANTASIA + NFE
 * Retorna NOTA_FISCAL com array de profissionais em cada NF
 */
function routerGetNotaFiscalCombined() {
  return _route(() => {
    const nfs = fetchAll(ALLOWED_SHEETS.NOTA_FISCAL);
    const ana = fetchAll(ALLOWED_SHEETS.NOTA_FISCAL_ANALITICO);

    // Criar índice de NOTA_FISCAL_ANALITICO por NOME_FANTASIA + NFE
    const analiticoIndex = {};
    ana.forEach(row => {
      const key = (row.nome_fantasia || '') + '|' + (row.nfe || '');
      if (!analiticoIndex[key]) analiticoIndex[key] = [];
      analiticoIndex[key].push(row);
    });

    // Combinar dados
    const combined = nfs.map(nf => {
      const key = (nf.nome_fantasia || '') + '|' + (nf.nfe || '');
      const profissionais = analiticoIndex[key] || [];
      
      return Object.assign({}, nf, {
        profissionais: profissionais
      });
    });

    return { data: combined };
  });
}