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
  ESTIMATIVA:           "ESTIMATIVA",
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
// --------------------------------------------------------------------------
// FILTER VALUES
// --------------------------------------------------------------------------

/**
 * GET — Retorna valores únicos para cada campo de filtro de uma aba.
 * Usado pelo Card_Filter para popular os picklists.
 * @param {string} sheetName - nome da aba autorizada
 * @param {string[]} fieldKeys - chaves das colunas a extrair valores únicos
 */
function routerGetFilterValues(sheetName, fieldKeys) {
  return _route(() => {
    _assertAllowed(sheetName);
    const data = fetchAll(sheetName);

    const filterValues = {};
    const seen = {};
    fieldKeys.forEach(key => {
      filterValues[key] = [];
      seen[key] = new Set();
    });

    data.forEach(row => {
      fieldKeys.forEach(key => {
        const val = String(row[key] || '').trim();
        if (val && !seen[key].has(val)) {
          seen[key].add(val);
          filterValues[key].push(val);
        }
      });
    });

    // Competência: ordena decrescente (mais recente primeiro); demais: A-Z
    fieldKeys.forEach(key => {
      if (key === 'competencia') {
        filterValues[key].sort((a, b) => {
          const pa = a.split('/').map(Number);
          const pb = b.split('/').map(Number);
          return pa[1] !== pb[1] ? pb[1] - pa[1] : pb[0] - pa[0];
        });
      } else {
        filterValues[key].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      }
    });

    // Lê a aba FORECAST para saber quais iniciativas estao Ativas
    // Usada pelo Card_Filter para pre-selecionar apenas Ativas no picklist de Iniciativa
    // Opções do filtro de Iniciativa vêm da aba FORECAST (não da NOTA_FISCAL),
    // garantindo que TODAS as iniciativas ativas apareçam — mesmo sem nota fiscal.
    //   code   = coluna A (INICIATIVA)
    //   label  = "código - descrição" (coluna A + coluna B INICIATIVA_DESCRICAO)
    //   active = status (coluna D) != Encerrada/Cancelada/Inativa
    const activeIniciativas = [];   // mantido p/ retrocompat
    const iniciativaLabels  = {};   // mantido p/ retrocompat
    const iniciativaOptions = [];   // [{ code, label, active }]
    if (fieldKeys.indexOf('iniciativa') !== -1) {
      try {
        // Le a aba FORECAST diretamente, detectando colunas por padroes
        // semanticos — resiliente a mudancas de ordem/nome de colunas.
        function _nkF(s) {
          if (s instanceof Date || s == null) return '';
          return String(s).trim()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
        }
        const { sheet: fSheet } = _openSheet(ALLOWED_SHEETS.FORECAST);
        const fLastRow = fSheet.getLastRow();
        const fLastCol = fSheet.getLastColumn();
        if (fLastRow >= 2) {
          const fRaw     = fSheet.getRange(1, 1, fLastRow, fLastCol).getValues();
          const fHeaders = fRaw[0].map((h, i) => ({ key: _nkF(h), i }));
          function _fCol() {
            const pats = Array.prototype.slice.call(arguments);
            return fHeaders.find(c => c.key && pats.some(p =>
              typeof p === 'string' ? c.key === p : p.test(c.key)));
          }
          const FC_INI = _fCol(/inibank/, /ini_bank/, /^codigo$/, /^cod$/, /^cod_ini/, /^ini$/, /^iniciativa$/);
          const fHdrExcIni = FC_INI ? fHeaders.filter(c => c.i !== FC_INI.i) : fHeaders;
          const FC_DESC = (function() {
            const pats = ['iniciativa_descricao', 'descricao_iniciativa', 'nome_iniciativa',
              /iniciativa_desc/, /descricao_iniciativa/, /^descricao$/, /descr_ini/, /projeto/, /nome_projeto/, /iniciativa/];
            return fHdrExcIni.find(c => c.key && pats.some(p =>
              typeof p === 'string' ? c.key === p : p.test(c.key)));
          })();
          const FC_STATUS = _fCol('status', /^status/);

          const activeSet = new Set();
          const seenIni   = new Set();
          for (let r = 1; r < fRaw.length; r++) {
            const row = fRaw[r];
            const ini = FC_INI ? String(row[FC_INI.i] || '').trim() : '';
            if (!ini) continue;
            const st = FC_STATUS ? _nkF(row[FC_STATUS.i]) : '';
            const isActive = !st.includes('encerr') && !st.includes('cancel') && !st.includes('inativ');
            if (isActive) activeSet.add(ini);
            if (!iniciativaLabels[ini]) {
              const desc = FC_DESC ? String(row[FC_DESC.i] || '').trim() : '';
              iniciativaLabels[ini] = desc ? (ini + ' - ' + desc) : ini;
            }
            if (!seenIni.has(ini)) {
              seenIni.add(ini);
              iniciativaOptions.push({ code: ini, label: iniciativaLabels[ini], active: false });
            }
          }
          // Uma iniciativa e ativa se QUALQUER linha dela for ativa
          iniciativaOptions.forEach(o => { o.active = activeSet.has(o.code); });
          iniciativaOptions.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
          activeSet.forEach(v => activeIniciativas.push(v));
        }
        Logger.log('[FilterValues] FORECAST: ' + iniciativaOptions.length + ' iniciativas, ' + activeIniciativas.length + ' ativas');
      } catch(e) {
        Logger.log('[FilterValues] Nao foi possivel ler FORECAST: ' + e.message);
      }
    }

    return { filterValues, activeIniciativas, iniciativaLabels, iniciativaOptions };
  });
}

// --------------------------------------------------------------------------
// BUDGET CONTROL — FORECAST DATA
// --------------------------------------------------------------------------

/**
 * GET — Retorna dados completos do controle orçamentário com 4 tipos por iniciativa:
 *   Forecast (aba FORECAST), Realizado (aba NOTA_FISCAL),
 *   Resultado (Forecast − Realizado), Forecast Ajustado (saldo distribuído nos meses restantes).
 * mesReferencia: label "jan.-26" indicando o mês de corte para FA.
 *   Se omitido, auto-detecta o último mês com Realizado.
 */
function routerGetForecastData(mesReferencia) {
  return _route(() => {
    const PTR_MON = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

    function _nk(s) {
      if (s instanceof Date || s == null) return '';
      return String(s).trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w]/g, '');
    }

    function _num(v) {
      if (typeof v === 'number') return v;
      if (!v || v instanceof Date) return 0;
      return parseFloat(
        String(v).replace(/R\$\s*/g, '').replace(/\s/g, '')
          .replace(/\./g, '').replace(',', '.')
      ) || 0;
    }

    function _monthLabel(h) {
      if (h instanceof Date) {
        return PTR_MON[h.getMonth()] + '.-' + String(h.getFullYear()).slice(-2);
      }
      const k = _nk(h);
      if (!k) return null;
      const m1 = k.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\D*(\d{2})$/);
      if (m1) return m1[1] + '.-' + m1[2];
      const m2 = k.match(/^(\d{1,2})\D?(\d{4})$/);
      if (m2) { const mo = parseInt(m2[1]) - 1; if (mo >= 0 && mo <= 11) return PTR_MON[mo] + '.-' + String(m2[2]).slice(-2); }
      const m4 = k.match(/^(\d{4})(\d{2})\d{2,}$/);
      if (m4) { const mo = parseInt(m4[2]) - 1; if (mo >= 0 && mo <= 11) return PTR_MON[mo] + '.-' + String(m4[1]).slice(-2); }
      const m3 = k.match(/^(\d{4})\D?(\d{1,2})$/);
      if (m3) { const mo = parseInt(m3[2]) - 1; if (mo >= 0 && mo <= 11) return PTR_MON[mo] + '.-' + String(m3[1]).slice(-2); }
      return null;
    }

    // ── Lê aba FORECAST ──────────────────────────────────────────────────
    const { sheet } = _openSheet(ALLOWED_SHEETS.FORECAST);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { rows: [], months: [], mesReferencia: '' };

    const raw     = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = raw[0];

    const cols = headers.map((h, i) => {
      const mLabel = _monthLabel(h);
      if (mLabel) return { kind: 'month', label: mLabel, i };
      const key = _nk(h);
      if (!key) return { kind: 'skip', i };
      return { kind: 'field', key, rawHeader: String(h || '').trim(), i };
    });

    const months = cols.filter(c => c.kind === 'month').map(c => c.label);
    const fields  = cols.filter(c => c.kind === 'field');

    function _findCol(...patterns) {
      return fields.find(c => patterns.some(p =>
        typeof p === 'string' ? c.key === p : p.test(c.key)
      ));
    }

    const C_INI  = _findCol(/inibank/, /ini_bank/, /^codigo$/, /^cod$/, /^cod_ini/, /^ini$/, /^iniciativa$/);

    // C_DESC usa campos filtrados que excluem a coluna ja usada por C_INI,
    // evitando que ambas apontem para "INICIATIVA" quando nao ha "INICIATIVA_DESCRICAO"
    const fieldsExcIni = C_INI ? fields.filter(f => f.i !== C_INI.i) : fields;
    function _findColIn(pool, ...patterns) {
      return pool.find(c => patterns.some(p =>
        typeof p === 'string' ? c.key === p : p.test(c.key)
      ));
    }
    const C_DESC = _findColIn(fieldsExcIni,
      'iniciativa_descricao', 'descricao_iniciativa', 'nome_iniciativa',
      /iniciativa_desc/, /descricao_iniciativa/, /^descricao$/, /descr_ini/,
      /projeto/, /nome_projeto/, /iniciativa/
    );

    // C_DIR detecta a coluna de direcao (Soma / Subtracao) para filtrar linhas de ajuste
    const C_DIR    = _findCol('iniciativa_direcao', 'direcao', /^direcao/, /^dir_/);
    // C_STATUS detecta a coluna de status da iniciativa (Ativa / Encerrada)
    const C_STATUS = _findCol('status', /^status/);
    const C_ITEM   = _findCol('item', 'letra', 'codigo_tipo', 'cod_tipo', /item$/);
    const C_PROJ   = _findCol(/^projecao/, /^projec/, /^total_forecast$/, /^orcamento/, /^budget/, /^total/);

    Logger.log('[ForecastData] cols: ini=' + (C_INI&&C_INI.rawHeader) +
               ' desc=' + (C_DESC&&C_DESC.rawHeader) +
               ' dir=' + (C_DIR&&C_DIR.rawHeader) +
               ' status=' + (C_STATUS&&C_STATUS.rawHeader) +
               ' proj=' + (C_PROJ&&C_PROJ.rawHeader));

    function _str(col) {
      if (!col) return function() { return ''; };
      return function(row) {
        const v = row[col.i];
        return v instanceof Date ? Utilities.formatDate(v, TZ, 'dd/MM/yyyy') : String(v || '').trim();
      };
    }

    const getIni    = _str(C_INI);
    const getDesc   = _str(C_DESC);
    const getItem   = _str(C_ITEM);
    const getStatus = _str(C_STATUS);

    function _normStatus(s) {
      const k = _nk(s);
      if (k.includes('encerrr') || k.includes('encerr') || k.includes('cancel') || k.includes('inativ')) return 'Encerrada';
      return 'Ativa';
    }

    // forecastMap: { inibank → { desc, item, status, monthly: {label→val}, projecao } }
    const forecastMap = {};
    const inibankOrder = [];

    for (let r = 1; r < raw.length; r++) {
      const row = raw[r];
      if (row.every(v => v === '' || v === null || v === undefined)) continue;

      // Determina o sinal da linha: Subtrai = -1, Soma (ou omitido) = +1
      let sign = 1;
      if (C_DIR) {
        const dir = _nk(String(row[C_DIR.i] || ''));
        if (dir.includes('subtr') || dir === 'sub') sign = -1;
      }

      const inibank = getIni(row) || '—';
      if (inibank === '—') continue;  // pula linhas sem codigo de iniciativa
      const desc    = getDesc(row);
      const item    = getItem(row);
      const status  = _normStatus(getStatus(row));

      const monthly = {};
      cols.filter(c => c.kind === 'month').forEach(c => { monthly[c.label] = _num(row[c.i]); });

      let projecao = C_PROJ ? _num(row[C_PROJ.i]) : 0;
      if (projecao === 0) projecao = Object.values(monthly).reduce((s, v) => s + v, 0);

      if (!forecastMap[inibank]) {
        forecastMap[inibank] = { desc: desc || '', item: item || '', status: status, monthly: {}, projecao: 0 };
        months.forEach(m => { forecastMap[inibank].monthly[m] = 0; });
        inibankOrder.push(inibank);
      }
      // Aplica sinal: linhas "Soma" somam (+1), linhas "Subtrai" subtraem (-1)
      months.forEach(m => {
        forecastMap[inibank].monthly[m] = (forecastMap[inibank].monthly[m] || 0) + sign * (monthly[m] || 0);
      });
      forecastMap[inibank].projecao += sign * projecao;
      if (!forecastMap[inibank].desc && desc) forecastMap[inibank].desc = desc;
      // Atualiza status: se qualquer linha indicar Ativa, a iniciativa e Ativa
      if (status === 'Ativa') forecastMap[inibank].status = 'Ativa';
    }

    Logger.log('[ForecastData] FORECAST: ' + inibankOrder.length + ' iniciativas, meses=' + months.length);

    // ── Lê aba NOTA_FISCAL → agrega Realizado por inibank + mês ─────────
    const nfRows = fetchAll(ALLOWED_SHEETS.NOTA_FISCAL);

    // realizadoMap: { inibank → { monthly: {label→val} } }
    const realizadoMap = {};
    const lastRealMonth = { label: '', idx: -1, year: 0 };

    nfRows.forEach(r => {
      if ((r.status_nfe || '').trim() !== 'Autorizada') return;
      const inibank = String(r.iniciativa || '').trim();
      if (!inibank) return;
      const comp = String(r.competencia || '').trim();  // "MM/yyyy"
      const val  = _num(r.total_nfe);
      if (!val) return;

      const parts = comp.match(/^(\d{1,2})\/(\d{4})$/);
      if (!parts) return;
      const mo    = parseInt(parts[1]) - 1;
      const yr    = parseInt(parts[2]);
      const label = PTR_MON[mo] + '.-' + String(yr).slice(-2);

      if (!realizadoMap[inibank]) realizadoMap[inibank] = { monthly: {} };
      realizadoMap[inibank].monthly[label] = (realizadoMap[inibank].monthly[label] || 0) + val;

      const absIdx = yr * 12 + mo;
      if (absIdx > lastRealMonth.idx) {
        lastRealMonth.idx   = absIdx;
        lastRealMonth.label = label;
        lastRealMonth.year  = yr;
      }
    });

    Logger.log('[ForecastData] NOTA_FISCAL: ' + Object.keys(realizadoMap).length + ' iniciativas com realizado');

    // ── Lê aba ESTIMATIVA → agrega por inibank + mês ────────────────────
    // estimativaMap: { inibank → { monthly: {label→val} } }
    const estimativaMap = {};
    try {
      const { sheet: estSheet } = _openSheet(ALLOWED_SHEETS.ESTIMATIVA);
      const estLastRow = estSheet.getLastRow();
      const estLastCol = estSheet.getLastColumn();
      if (estLastRow >= 2) {
        const estRaw     = estSheet.getRange(1, 1, estLastRow, estLastCol).getValues();
        const estHeaders = estRaw[0];
        const estCols = estHeaders.map((h, i) => {
          const mLabel = _monthLabel(h);
          if (mLabel) return { kind: 'month', label: mLabel, i };
          const key = _nk(h);
          if (!key) return { kind: 'skip', i };
          return { kind: 'field', key, i };
        });
        const estFields = estCols.filter(c => c.kind === 'field');
        const estMonthCols = estCols.filter(c => c.kind === 'month');
        function _estFind() {
          const pats = Array.prototype.slice.call(arguments);
          return estFields.find(c => pats.some(p =>
            typeof p === 'string' ? c.key === p : p.test(c.key)));
        }
        const EC_INI = _estFind(/inibank/, /ini_bank/, /^codigo$/, /^cod$/, /^cod_ini/, /^ini$/, /^iniciativa$/);
        const EC_DIR = _estFind('iniciativa_direcao', 'direcao', /^direcao/, /^dir_/);

        for (let r = 1; r < estRaw.length; r++) {
          const row = estRaw[r];
          if (row.every(v => v === '' || v === null || v === undefined)) continue;

          let sign = 1;
          if (EC_DIR) {
            const dir = _nk(String(row[EC_DIR.i] || ''));
            if (dir.includes('subtr') || dir === 'sub') sign = -1;
          }

          const inibank = EC_INI
            ? (row[EC_INI.i] instanceof Date ? '' : String(row[EC_INI.i] || '').trim())
            : '';
          if (!inibank) continue;

          if (!estimativaMap[inibank]) estimativaMap[inibank] = { monthly: {} };
          estMonthCols.forEach(c => {
            estimativaMap[inibank].monthly[c.label] =
              (estimativaMap[inibank].monthly[c.label] || 0) + sign * _num(row[c.i]);
          });
        }
      }
      Logger.log('[ForecastData] ESTIMATIVA: ' + Object.keys(estimativaMap).length + ' iniciativas');
    } catch (e) {
      Logger.log('[ForecastData] ESTIMATIVA indisponivel: ' + e.message);
    }

    // ── Resolve mesReferencia ─────────────────────────────────────────────
    let mesRef = String(mesReferencia || '').trim();
    if (!mesRef && lastRealMonth.label) mesRef = lastRealMonth.label;
    if (!mesRef && months.length > 0)   mesRef = months[0];

    (function normMesRef() {
      const k = _nk(mesRef);
      const m1 = k.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\D*(\d{2})$/);
      if (m1) { mesRef = m1[1] + '.-' + m1[2]; return; }
      const m2 = k.match(/^(\d{1,2})\D?(\d{4})$/);
      if (m2) { const mo = parseInt(m2[1]) - 1; if (mo >= 0 && mo <= 11) { mesRef = PTR_MON[mo] + '.-' + String(m2[2]).slice(-2); return; } }
    })();

    const monthIdx = {};
    months.forEach((m, i) => { monthIdx[m] = i; });
    const refIdx = monthIdx[mesRef] !== undefined ? monthIdx[mesRef] : -1;

    function _yearOfLabel(label) {
      const m = label.match(/\.-(\d{2})$/);
      return m ? parseInt('20' + m[1]) : 0;
    }
    const refYear = _yearOfLabel(mesRef);

    Logger.log('[ForecastData] mesRef=' + mesRef + ' refIdx=' + refIdx + ' refYear=' + refYear);

    // ── Monta rows com 4 tipos por iniciativa ────────────────────────────
    const rows = [];

    inibankOrder.forEach(inibank => {
      const fData = forecastMap[inibank];
      const rData = realizadoMap[inibank] || { monthly: {} };

      const fMonthly = fData.monthly;

      const rMonthly = {};
      months.forEach(m => { rMonthly[m] = rData.monthly[m] || 0; });

      const resMonthly = {};
      months.forEach(m => { resMonthly[m] = (fMonthly[m] || 0) - (rMonthly[m] || 0); });

      const fProj   = months.reduce((s, m) => s + (fMonthly[m] || 0), 0);
      const rProj   = months.reduce((s, m) => s + (rMonthly[m] || 0), 0);
      const resProj = fProj - rProj;

      const rAteRef = months.reduce((s, m, i) => {
        if (i <= refIdx) s += (rMonthly[m] || 0);
        return s;
      }, 0);
      // FA saldo: usa apenas o forecast do ano de referência (exclui anos futuros como 2027)
      const fProjRefYear = months.reduce((s, m) => _yearOfLabel(m) === refYear ? s + (fMonthly[m] || 0) : s, 0);
      const saldo = fProjRefYear - rAteRef;

      const futureMonths = months.filter((m, i) => {
        return i > refIdx && _yearOfLabel(m) === refYear;
      });
      const nFuture = futureMonths.length;

      const faMonthly = {};
      months.forEach(m => { faMonthly[m] = 0; });
      if (saldo > 0 && nFuture > 0) {
        const perMonth = saldo / nFuture;
        futureMonths.forEach(m => { faMonthly[m] = perMonth; });
      }
      const faProj = months.reduce((s, m) => s + faMonthly[m], 0);

      // ── Estimado: valores da aba ESTIMATIVA apenas para os meses ─────────
      // posteriores ao mês de competência até o fim do ano vigente
      const eData = estimativaMap[inibank] || { monthly: {} };
      const estMonthly = {};
      months.forEach(m => { estMonthly[m] = 0; });
      futureMonths.forEach(m => { estMonthly[m] = eData.monthly[m] || 0; });
      const estProj = months.reduce((s, m) => s + estMonthly[m], 0);

      const status = fData.status || 'Ativa';
      rows.push(
        { inibank, iniciativa: fData.desc, status, tipo: 'Forecast',          item: 'A',     projecao_2026: fProj,   _monthly: fMonthly   },
        { inibank, iniciativa: fData.desc, status, tipo: 'Realizado',         item: 'B',     projecao_2026: rProj,   _monthly: rMonthly   },
        { inibank, iniciativa: fData.desc, status, tipo: 'Resultado',         item: 'A-B=C', projecao_2026: resProj, _monthly: resMonthly },
        { inibank, iniciativa: fData.desc, status, tipo: 'Forecast Ajustado', item: 'FA',    projecao_2026: faProj,  _monthly: faMonthly  },
        { inibank, iniciativa: fData.desc, status, tipo: 'Estimado',          item: 'E',     projecao_2026: estProj, _monthly: estMonthly }
      );
    });

    const activeInibankCodes = inibankOrder.filter(k => (forecastMap[k].status || 'Ativa') === 'Ativa');
    Logger.log('[ForecastData] rows geradas: ' + rows.length + ' mesRef=' + mesRef +
               ' ativas=' + activeInibankCodes.length + '/' + inibankOrder.length);

    return { rows, months, mesReferencia: mesRef, activeInibankCodes };
  });
}



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