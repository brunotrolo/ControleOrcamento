/**
 * ============================================================================
 * GeminiService.gs - Camada de Integração com a API do Gemini
 * ============================================================================
 * Responsabilidades:
 *  - Comunicação exclusiva com a API do Gemini
 *  - Construção do prompt e parseamento da resposta
 *  - Sem lógica de negócio aqui — apenas extração de dados
 *
 * SETUP (uma única vez):
 *  1. Acesse: https://aistudio.google.com/app/apikey
 *  2. Gere uma API Key
 *  3. No editor do Apps Script, execute:
 *     GeminiService.saveApiKey("SUA_API_KEY_AQUI")
 */

const GeminiService = (() => {

  const MODEL   = "gemini-1.5-flash";   // Rápido e econômico. Troque por gemini-1.5-pro se precisar de mais precisão.
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  // -------------------------------------------------------------------------
  // Gerenciamento da API Key (via PropertiesService — nunca hardcoded)
  // -------------------------------------------------------------------------

  function _getApiKey() {
    const key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    if (!key) throw new Error(
      "API Key do Gemini não configurada. " +
      "Execute GeminiService.saveApiKey('SUA_KEY') no editor do Apps Script."
    );
    return key;
  }

  function saveApiKey(key) {
    PropertiesService.getScriptProperties().setProperty("GEMINI_API_KEY", key);
    Logger.log("✅ GEMINI_API_KEY salva com sucesso.");
  }

  function removeApiKey() {
    PropertiesService.getScriptProperties().deleteProperty("GEMINI_API_KEY");
    Logger.log("🗑️ GEMINI_API_KEY removida.");
  }

  // -------------------------------------------------------------------------
  // Prompt de Extração
  // Centralizado aqui para facilitar evolução futura (novos campos = novas linhas)
  // -------------------------------------------------------------------------

  function _buildPrompt() {
    return `
Você é um especialista em leitura de Notas Fiscais de Serviço brasileiras (NFS-e).
Analise o documento PDF fornecido e extraia os campos abaixo com máxima precisão.

REGRAS OBRIGATÓRIAS:
- Retorne SOMENTE um objeto JSON válido, sem texto antes ou depois, sem markdown, sem blocos de código.
- Se um campo não for encontrado, use null (não use strings vazias, não invente valores).
- Datas devem estar no formato dd/MM/yyyy.
- Valores monetários devem ser números (float), sem símbolo de moeda. Ex: 1500.00

CAMPOS A EXTRAIR:
{
  "fornecedor":        "Razão social ou nome do prestador de serviço",
  "cnpj_fornecedor":   "CNPJ do prestador no formato XX.XXX.XXX/XXXX-XX",
  "nfe":               "Número da nota fiscal",
  "data_emissao":      "Data de emissão no formato dd/MM/yyyy",
  "data_vencimento":   "Data de vencimento no formato dd/MM/yyyy",
  "valor_total":       "Valor total da nota como número float",
  "colaborador":       "Nome do colaborador ou profissional mencionado na descrição do serviço",
  "horas":             "Quantidade de horas trabalhadas mencionada na descrição (apenas o número)",
  "codigo_iniciativa": "Código de projeto ou iniciativa mencionado na descrição",
  "descricao_servico": "Resumo da descrição do serviço prestado (máximo 200 caracteres)"
}
`.trim();
  }

  // -------------------------------------------------------------------------
  // Chamada Principal
  // -------------------------------------------------------------------------

  /**
   * Envia um PDF em base64 para o Gemini e retorna os dados extraídos.
   * @param {string} base64Data - Conteúdo do PDF em base64
   * @returns {Object} Dados extraídos da nota fiscal
   */
  function extractFromPdf(base64Data) {
    const apiKey = _getApiKey();

    const payload = {
      contents: [{
        parts: [
          { text: _buildPrompt() },
          {
            inline_data: {
              mime_type: "application/pdf",
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature:     0.1,   // Baixo para respostas mais determinísticas
        maxOutputTokens: 1024,
      }
    };

    const options = {
      method:      "POST",
      contentType: "application/json",
      payload:     JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(`${API_URL}?key=${apiKey}`, options);
    const status   = response.getResponseCode();
    const body     = JSON.parse(response.getContentText());

    if (status !== 200) {
      const errMsg = body.error ? body.error.message : "Erro desconhecido na API do Gemini";
      throw new Error(`Gemini API [${status}]: ${errMsg}`);
    }

    // Extrai o texto da resposta
    const rawText = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini não retornou conteúdo válido.");

    // Remove eventuais blocos de markdown que o modelo possa incluir
    const cleanJson = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      return JSON.parse(cleanJson);
    } catch (e) {
      Logger.log("[GeminiService] Resposta raw: " + rawText);
      throw new Error("Não foi possível interpretar a resposta do Gemini como JSON. Verifique o log.");
    }
  }

  // -------------------------------------------------------------------------
  // API Pública
  // -------------------------------------------------------------------------
  return {
    extractFromPdf,
    saveApiKey,
    removeApiKey,
  };

})();
