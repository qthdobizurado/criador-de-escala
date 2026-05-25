// ============================================================
// GOOGLE APPS SCRIPT - Gerador de Escala
// Cole este código no Google Apps Script da sua planilha.
// Publicar como: "Implantar como aplicativo da web"
//   - Executar como: Eu (sua conta)
//   - Quem tem acesso: Qualquer pessoa (anonymous)
// ============================================================
//
// ESTRUTURA DA PLANILHA:
//   Linha 1: Cabeçalho (ignorada pelo script)
//   Colunas por linha de usuário:
//     A = usuario
//     B = senha
//     C = nome_slot_1 | json_slot_1    (separados por "|")
//     D = nome_slot_2 | json_slot_2
//     ...
//     N = nome_slot_12 | json_slot_12
//
// MÁXIMO: 12 slots de JSON por usuário (colunas C a N)
// ============================================================

const SHEET_NAME = 'Usuarios'; // Nome da aba na planilha

function doPost(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.parse(e.postData.contents);
    const acao = body.acao;

    if (acao === 'login') {
      return handleLogin(body, headers);
    } else if (acao === 'salvar') {
      return handleSalvar(body, headers);
    } else if (acao === 'listar') {
      return handleListar(body, headers);
    } else if (acao === 'carregar') {
      return handleCarregar(body, headers);
    } else if (acao === 'apagar') {
      return handleApagar(body, headers);
    } else {
      return resposta({ ok: false, erro: 'Ação desconhecida' }, headers);
    }
  } catch (err) {
    return resposta({ ok: false, erro: 'Erro interno: ' + err.message }, headers);
  }
}

function doGet(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  return resposta({ ok: true, msg: 'API Gerador de Escala ativa' }, headers);
}

// ── LOGIN ──────────────────────────────────────────────────
function handleLogin(body, headers) {
  const { usuario, senha } = body;
  if (!usuario || !senha) {
    return resposta({ ok: false, erro: 'Usuário e senha são obrigatórios' }, headers);
  }

  const sheet = getSheet();
  const dados = sheet.getDataRange().getValues();

  // Linha 1 é cabeçalho, começa da linha 2 (índice 1)
  for (let i = 1; i < dados.length; i++) {
    const u = String(dados[i][0]).trim();
    const s = String(dados[i][1]).trim();
    if (u === usuario.trim() && s === senha.trim()) {
      // Retorna lista de slots já salvos
      const slots = getSlots(dados[i]);
      return resposta({ ok: true, slots: slots }, headers);
    }
  }

  return resposta({ ok: false, erro: 'Usuário ou senha incorretos' }, headers);
}

// ── LISTAR slots do usuário ───────────────────────────────
function handleListar(body, headers) {
  const { usuario, senha } = body;
  const sheet = getSheet();
  const dados = sheet.getDataRange().getValues();

  const linhaIdx = encontrarUsuario(dados, usuario, senha);
  if (linhaIdx === -1) {
    return resposta({ ok: false, erro: 'Usuário ou senha incorretos' }, headers);
  }

  const slots = getSlots(dados[linhaIdx]);
  return resposta({ ok: true, slots: slots }, headers);
}

// ── CARREGAR um slot específico ───────────────────────────
function handleCarregar(body, headers) {
  const { usuario, senha, nomeSlot } = body;
  const sheet = getSheet();
  const dados = sheet.getDataRange().getValues();

  const linhaIdx = encontrarUsuario(dados, usuario, senha);
  if (linhaIdx === -1) {
    return resposta({ ok: false, erro: 'Usuário ou senha incorretos' }, headers);
  }

  const linha = dados[linhaIdx];
  // Colunas C..N = índices 2..13
  for (let col = 2; col <= 13; col++) {
    const celula = String(linha[col] || '').trim();
    if (!celula) continue;
    const separador = celula.indexOf('|');
    if (separador === -1) continue;
    const nome = celula.substring(0, separador).trim();
    const json = celula.substring(separador + 1).trim();
    if (nome === nomeSlot) {
      try {
        // Se o valor começa com __GZ__, é dado comprimido — devolve como string para o cliente descomprimir.
        // Caso contrário, parseia como JSON normal (slots antigos não comprimidos).
        if (json.startsWith('__GZ__')) {
          return resposta({ ok: true, dados: json, nome: nome }, headers);
        }
        const parsed = JSON.parse(json);
        return resposta({ ok: true, dados: parsed, nome: nome }, headers);
      } catch (err) {
        return resposta({ ok: false, erro: 'JSON inválido no slot' }, headers);
      }
    }
  }

  return resposta({ ok: false, erro: 'Slot não encontrado: ' + nomeSlot }, headers);
}

// ── SALVAR um slot ────────────────────────────────────────
function handleSalvar(body, headers) {
  const { usuario, senha, nomeSlot, substituir, dados } = body;
  // nomeSlot    = nome do novo save
  // substituir  = nome do slot a ser substituído (ou null/'' para novo)
  // dados       = objeto JSON a salvar

  if (!nomeSlot || !dados) {
    return resposta({ ok: false, erro: 'nomeSlot e dados são obrigatórios' }, headers);
  }

  const sheet = getSheet();
  const planilhaDados = sheet.getDataRange().getValues();

  const linhaIdx = encontrarUsuario(planilhaDados, usuario, senha);
  if (linhaIdx === -1) {
    return resposta({ ok: false, erro: 'Usuário ou senha incorretos' }, headers);
  }

  const linha = planilhaDados[linhaIdx];

  // Se dados chegou como string comprimida (__GZ__...), usa direto.
  // Caso contrário, serializa o objeto (compatibilidade com clientes antigos sem compressão).
  const jsonStr = (typeof dados === 'string') ? dados : JSON.stringify(dados);
  const valor = nomeSlot + '|' + jsonStr;

  // Colunas C..N = índices 2..13 (12 slots)
  let slotColIdx = -1; // índice da coluna a salvar

  if (substituir && substituir.trim() !== '') {
    // Encontrar o slot com o nome a substituir
    for (let col = 2; col <= 13; col++) {
      const celula = String(linha[col] || '').trim();
      if (!celula) continue;
      const sep = celula.indexOf('|');
      const nome = sep !== -1 ? celula.substring(0, sep).trim() : '';
      if (nome === substituir.trim()) {
        slotColIdx = col;
        break;
      }
    }
    if (slotColIdx === -1) {
      return resposta({ ok: false, erro: 'Slot para substituir não encontrado: ' + substituir }, headers);
    }
  } else {
    // Salvar em slot vazio
    for (let col = 2; col <= 13; col++) {
      const celula = String(linha[col] || '').trim();
      if (!celula) {
        slotColIdx = col;
        break;
      }
    }
    if (slotColIdx === -1) {
      return resposta({ ok: false, erro: 'Limite de 12 saves atingido. Escolha um slot para substituir.' }, headers);
    }
  }

  // linhaIdx é 0-based no array, mas na planilha linha 1 = cabeçalho
  // Linha real na planilha = linhaIdx + 1 (1-based)
  const linhaReal = linhaIdx + 1;
  // Coluna real = slotColIdx + 1 (1-based)
  const colunaReal = slotColIdx + 1;
  sheet.getRange(linhaReal, colunaReal).setValue(valor);

  const slotsAtualizados = getSlots(sheet.getRange(linhaReal, 1, 1, 14).getValues()[0]);
  return resposta({ ok: true, msg: 'Salvo com sucesso', slots: slotsAtualizados }, headers);
}

// ── APAGAR um slot ────────────────────────────────────────
function handleApagar(body, headers) {
  const { usuario, senha, nomeSlot } = body;
  if (!nomeSlot) {
    return resposta({ ok: false, erro: 'nomeSlot é obrigatório' }, headers);
  }

  const sheet = getSheet();
  const planilhaDados = sheet.getDataRange().getValues();

  const linhaIdx = encontrarUsuario(planilhaDados, usuario, senha);
  if (linhaIdx === -1) {
    return resposta({ ok: false, erro: 'Usuário ou senha incorretos' }, headers);
  }

  const linha = planilhaDados[linhaIdx];
  let slotColIdx = -1;

  for (let col = 2; col <= 13; col++) {
    const celula = String(linha[col] || '').trim();
    if (!celula) continue;
    const sep = celula.indexOf('|');
    const nome = sep !== -1 ? celula.substring(0, sep).trim() : celula;
    if (nome === nomeSlot.trim()) {
      slotColIdx = col;
      break;
    }
  }

  if (slotColIdx === -1) {
    return resposta({ ok: false, erro: 'Slot não encontrado: ' + nomeSlot }, headers);
  }

  const linhaReal = linhaIdx + 1;
  const colunaReal = slotColIdx + 1;
  sheet.getRange(linhaReal, colunaReal).setValue('');

  const slotsAtualizados = getSlots(sheet.getRange(linhaReal, 1, 1, 14).getValues()[0]);
  return resposta({ ok: true, msg: 'Slot apagado com sucesso', slots: slotsAtualizados }, headers);
}

// ── HELPERS ───────────────────────────────────────────────

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function encontrarUsuario(dados, usuario, senha) {
  for (let i = 1; i < dados.length; i++) {
    const u = String(dados[i][0]).trim();
    const s = String(dados[i][1]).trim();
    if (u === (usuario || '').trim() && s === (senha || '').trim()) {
      return i;
    }
  }
  return -1;
}

function getSlots(linha) {
  // Retorna array de { nome, colIndex } para os slots preenchidos
  const slots = [];
  for (let col = 2; col <= 13; col++) {
    const celula = String(linha[col] || '').trim();
    if (!celula) continue;
    const sep = celula.indexOf('|');
    const nome = sep !== -1 ? celula.substring(0, sep).trim() : celula;
    slots.push({ nome: nome, col: col });
  }
  return slots;
}

function resposta(obj, headers) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
