// ============================================================
// CONFIGURAÇÃO - Altere a URL abaixo para a URL do seu
// Google Apps Script implantado como "Web App"
// ============================================================
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxN0e8H7u-5eMRasYqnnGturWdpHc_q4mAvmipBtvjBs25LGBoGgkJ4EXzc94rPwxiFfg/exec';
// ============================================================

const alas = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
const VERMELHA_DIURNO = 36.41;
const VERMELHA_NOTURNO = 41.38;
const AZUL_DIURNO = 26.47;
const AZUL_NOTURNO = 29.80;
const taxas = {
  vermelha: { diurno: VERMELHA_DIURNO, noturno: VERMELHA_NOTURNO },
  azul: { diurno: AZUL_DIURNO, noturno: AZUL_NOTURNO }
};
let funcoes = [],
  responsaveis = [],
  vinculos = { Alpha: [], Bravo: [], Charlie: [], Delta: [] },
  afastamentos = [],
  calendarioGerado = false;
let exclusoesDiarias = {};
let resumoHTML = '',
  vagasHTML = '',
  escalaHTML = '',
  escalaAC4HTML = '';
const $ = id => document.getElementById(id);
const backupEdicaoFuncao = {};

// Estado de autenticação
let usuarioAtual = null;
let senhaAtual = null;

(function () {
  const style = document.createElement('style');
  style.textContent = `
.draggable-funcao,
.draggable-funcao * {
  cursor: default !important;
}
.drag-handle {
  cursor: move !important;
  user-select: none;
  padding: 0 8px;
}
.btn-small {
  font-size: 11px;
  padding: 2px 6px;
  margin-left: 4px;
  min-width: 120px;
}
.input-disabled {
  background-color: #f0f0f0 !important;
  color: #888 !important;
  cursor: not-allowed !important;
}
.select-disabled {
  background-color: #f0f0f0 !important;
  color: #888 !important;
  cursor: not-allowed !important;
}
`;
  document.head.appendChild(style);
})();

// ============================================================
// LOGIN / LOGOUT
// ============================================================
async function fazerLogin() {
  const usuario = $('loginUsuario').value.trim();
  const senha = $('loginSenha').value.trim();
  $('loginErro').textContent = '';
  if (!usuario || !senha) {
    $('loginErro').textContent = 'Preencha usuário e senha.';
    return;
  }
  const btn = $('btnLogin');
  btn.disabled = true;
  $('loginStatus').textContent = 'Verificando...';
  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({ acao: 'login', usuario, senha })
    });
    const data = await res.json();
    if (data.ok) {
      usuarioAtual = usuario;
      senhaAtual = senha;
      _slotsCache = data.slots || [];
      $('loginOverlay').style.display = 'none';
      $('appContent').style.display = 'block';
      $('usuarioLogado').textContent = '👤 ' + usuario;
      carregarDadosPersistentes();
      _atualizarSelectAutoSave();
    } else {
      $('loginErro').textContent = data.erro || 'Usuário ou senha incorretos.';
      $('loginStatus').textContent = '';
    }
  } catch (err) {
    $('loginErro').textContent = 'Erro ao conectar com o servidor. Verifique a URL do Apps Script.';
    $('loginStatus').textContent = '';
    console.error(err);
  }
  btn.disabled = false;
}

function fazerLogout() {
  usuarioAtual = null;
  senhaAtual = null;
  $('loginOverlay').style.display = 'flex';
  $('appContent').style.display = 'none';
  $('loginSenha').value = '';
  $('loginErro').textContent = '';
  $('loginStatus').textContent = '';
}

// ============================================================
// MODAIS
// ============================================================
function openModal(message, onConfirm, onCancel) {
  const modal = document.getElementById('myModal');
  document.getElementById('modalMessage').textContent = message;
  modal.style.display = 'block';
  document.getElementById('confirmBtn').onclick = () => {
    onConfirm();
    closeModal();
  };
  document.getElementById('cancelBtn').onclick = () => {
    if (onCancel) onCancel();
    closeModal();
  };
}
function closeModal() {
  document.getElementById('myModal').style.display = 'none';
}
function openWarningModal(message) {
  const warningModal = document.getElementById('warningModal');
  document.getElementById('warningMessage').textContent = message;
  warningModal.style.display = 'block';
  document.getElementById('warningConfirmBtn').onclick = closeWarningModal;
}
function closeWarningModal() {
  document.getElementById('warningModal').style.display = 'none';
}

// ============================================================
// BACKUP LOCAL (PC)
// ============================================================
function exportarBackup() {
  const dados = coletarDadosParaSalvar();
  const json = JSON.stringify(dados, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup_escala_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importarBackup() {
  $('inputImportarBackup').click();
}

function processarImportacao(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const dados = JSON.parse(e.target.result);
      aplicarDados(dados);
      openWarningModal('Backup importado com sucesso!');
    } catch (err) {
      openWarningModal('Erro ao ler o arquivo de backup. Verifique se é um JSON válido.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================
// NUVEM - ESTADO COMPARTILHADO
// ============================================================
let _slotsCache = [];         // cache dos slots após listar
let _slotAutoSave = null;     // nome do slot de auto-save selecionado

async function _listarSlots() {
  const res = await fetch(SHEETS_URL, {
    method: 'POST',
    body: JSON.stringify({ acao: 'listar', usuario: usuarioAtual, senha: senhaAtual })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.erro || 'Erro ao listar slots');
  _slotsCache = data.slots || [];
  return _slotsCache;
}

// ============================================================
// NUVEM - SALVAR
// ============================================================
async function abrirModalSalvarNuvem() {
  $('modalSalvarNuvem').style.display = 'block';
  _renderModalSalvar('Carregando slots...', true);
  try {
    await _listarSlots();
    _renderModalSalvar('', false);
  } catch (err) {
    $('nuvemSalvarStatus').textContent = '❌ Erro de conexão.';
    console.error(err);
  }
}

function _renderModalSalvar(statusMsg, carregando) {
  const total = _slotsCache.length;
  const cheio = total >= 12;

  // Status
  if (carregando) {
    $('nuvemSalvarStatus').textContent = statusMsg || 'Carregando...';
  } else {
    $('nuvemSalvarStatus').textContent = cheio
      ? `⚠ Limite atingido (12/12). Só é possível substituir um slot existente.`
      : `${total}/12 slots utilizados.`;
    $('nuvemSalvarStatus').style.color = cheio ? '#c62828' : '#555';
  }

  // Modos: Criar Novo / Substituir — modoAtual lido diretamente onde necessário

  // Botão "Criar Novo" desabilitado se cheio
  $('radioModoNovo').disabled = cheio;
  $('labelModoNovo').style.opacity = cheio ? '0.45' : '1';

  // Se cheio e estava em "novo", força "substituir"
  if (cheio && $('radioModoNovo').checked) {
    $('radioModoSubstituir').checked = true;
  }

  // Campo nome
  $('inputNomeNovoSlot').value = '';

  // Select substituir
  const sel = $('selectSlotSubstituir');
  sel.innerHTML = '<option value="">-- Selecione o slot --</option>' +
    _slotsCache.map(s => `<option value="${s.nome}">${s.nome}</option>`).join('');

  // Mostrar/ocultar campos conforme modo
  _atualizarVisibilidadeModoSalvar();
}

function _atualizarVisibilidadeModoSalvar() {
  const modoNovo = $('radioModoNovo').checked;
  $('campoSubstituirSlot').style.display = modoNovo ? 'none' : 'block';
  $('labelNomeNovoSlot').textContent = modoNovo ? 'Nome do novo save:' : 'Nome para o save (pode ser diferente do slot substituído):';
}

async function confirmarSalvarNuvem() {
  const nomeSlot = $('inputNomeNovoSlot').value.trim();
  const modoNovo = $('radioModoNovo').checked;
  const substituir = modoNovo ? '' : $('selectSlotSubstituir').value;
  const cheio = _slotsCache.length >= 12;

  if (!nomeSlot) {
    $('nuvemSalvarStatus').textContent = '⚠ Informe um nome para o save.';
    $('nuvemSalvarStatus').style.color = '#c62828';
    return;
  }
  if (cheio && modoNovo) {
    $('nuvemSalvarStatus').textContent = '⚠ Limite de 12 saves atingido. Escolha "Substituir existente".';
    $('nuvemSalvarStatus').style.color = '#c62828';
    return;
  }
  if (!modoNovo && !substituir) {
    $('nuvemSalvarStatus').textContent = '⚠ Selecione o slot que deseja substituir.';
    $('nuvemSalvarStatus').style.color = '#c62828';
    return;
  }

  const dados = coletarDadosParaNuvem();
  $('nuvemSalvarStatus').textContent = 'Salvando...';
  $('nuvemSalvarStatus').style.color = '#555';
  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({
        acao: 'salvar',
        usuario: usuarioAtual,
        senha: senhaAtual,
        nomeSlot,
        substituir,
        dados
      })
    });
    const data = await res.json();
    if (data.ok) {
      // Atualiza auto-save se foi o slot monitorado
      if (_slotAutoSave && substituir && substituir === _slotAutoSave) _slotAutoSave = nomeSlot;
      $('nuvemSalvarStatus').textContent = '✅ Salvo com sucesso!';
      $('nuvemSalvarStatus').style.color = '#2e7d32';
      await _listarSlots();
      _atualizarSelectAutoSave();
      setTimeout(() => fecharModalNuvem('modalSalvarNuvem'), 1300);
    } else {
      $('nuvemSalvarStatus').textContent = '❌ ' + data.erro;
      $('nuvemSalvarStatus').style.color = '#c62828';
    }
  } catch (err) {
    $('nuvemSalvarStatus').textContent = '❌ Erro de conexão.';
    $('nuvemSalvarStatus').style.color = '#c62828';
    console.error(err);
  }
}

// ============================================================
// NUVEM - CARREGAR
// ============================================================
async function abrirModalCarregarNuvem() {
  $('modalCarregarNuvem').style.display = 'block';
  $('nuvemCarregarStatus').textContent = 'Carregando slots...';
  $('slotsParaCarregar').innerHTML = '';
  try {
    await _listarSlots();
    _renderListaCarregar();
  } catch (err) {
    $('nuvemCarregarStatus').textContent = '❌ Erro de conexão.';
    console.error(err);
  }
}

function _renderListaCarregar() {
  const slots = _slotsCache;
  $('nuvemCarregarStatus').textContent = `${slots.length} save(s) disponíveis.`;
  if (slots.length === 0) {
    $('slotsParaCarregar').innerHTML = '<p class="sem-slots">Nenhum save na nuvem.</p>';
    return;
  }
  $('slotsParaCarregar').innerHTML = '<div class="slot-lista">' +
    slots.map(s => {
      const nome = s.nome.replace(/'/g, "\\'");
      return `<div class="slot-item">
        <span>📄 ${s.nome}</span>
        <div class="slot-acoes">
          <button class="btn-carregar-slot" onclick="carregarSlotNuvem('${nome}')">⬇ Carregar</button>
          <button class="btn-apagar-slot" onclick="apagarSlotNuvem('${nome}')">🗑 Apagar</button>
        </div>
      </div>`;
    }).join('') +
    '</div>';
}

async function carregarSlotNuvem(nomeSlot) {
  $('nuvemCarregarStatus').textContent = 'Carregando "' + nomeSlot + '"...';
  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({ acao: 'carregar', usuario: usuarioAtual, senha: senhaAtual, nomeSlot })
    });
    const data = await res.json();
    if (data.ok) {
      aplicarDados(data.dados);
      fecharModalNuvem('modalCarregarNuvem');
      openWarningModal('✅ "' + nomeSlot + '" carregado com sucesso!');
    } else {
      $('nuvemCarregarStatus').textContent = '❌ ' + data.erro;
    }
  } catch (err) {
    $('nuvemCarregarStatus').textContent = '❌ Erro de conexão.';
    console.error(err);
  }
}

// ============================================================
// NUVEM - APAGAR
// ============================================================
async function apagarSlotNuvem(nomeSlot) {
  // Confirmação antes de apagar
  openModal(
    `Tem certeza que deseja apagar o save "${nomeSlot}" da nuvem? Esta ação não pode ser desfeita.`,
    async () => {
      $('nuvemCarregarStatus').textContent = 'Apagando "' + nomeSlot + '"...';
      try {
        const res = await fetch(SHEETS_URL, {
          method: 'POST',
          body: JSON.stringify({ acao: 'apagar', usuario: usuarioAtual, senha: senhaAtual, nomeSlot })
        });
        const data = await res.json();
        if (data.ok) {
          if (_slotAutoSave === nomeSlot) {
            _slotAutoSave = null;
            localStorage.removeItem('escala_autosave_slot_' + usuarioAtual);
            _atualizarSelectAutoSave();
          }
          await _listarSlots();
          _renderListaCarregar();
          _atualizarSelectAutoSave();
          $('nuvemCarregarStatus').textContent = `✅ "${nomeSlot}" apagado. ${_slotsCache.length} save(s) restantes.`;
        } else {
          $('nuvemCarregarStatus').textContent = '❌ ' + data.erro;
        }
      } catch (err) {
        $('nuvemCarregarStatus').textContent = '❌ Erro de conexão.';
        console.error(err);
      }
    }
  );
}

// ============================================================
// NUVEM - AUTO-SAVE
// ============================================================
function _atualizarSelectAutoSave() {
  const sel = $('selectAutoSave');
  if (!sel) return;
  const valorAtual = _slotAutoSave || '';
  sel.innerHTML = '<option value="">-- Desativado --</option>' +
    _slotsCache.map(s =>
      `<option value="${s.nome}" ${s.nome === valorAtual ? 'selected' : ''}>${s.nome}</option>`
    ).join('');
  sel.value = valorAtual;
  _atualizarIndicadorAutoSave();
}

function _atualizarIndicadorAutoSave() {
  // Não sobrescreve o indicador enquanto um auto-save está em andamento
  if (_autoSaveEmAndamento) return;
  const ind = $('indicadorAutoSave');
  if (!ind) return;
  if (_slotAutoSave) {
    ind.textContent = `🔄 Auto-save ativo: "${_slotAutoSave}"`;
    ind.style.color = '#1565c0';
    ind.style.fontSize = '12px';
    ind.style.fontWeight = 'normal';
  } else {
    ind.textContent = '⚠ Atenção: Auto-save desativado.';
    ind.style.color = '#c62828';
    ind.style.fontSize = '15px';
    ind.style.fontWeight = '700';
  }
}

function onChangeAutoSave() {
  const sel = $('selectAutoSave');
  _slotAutoSave = sel.value || null;
  if (_slotAutoSave) {
    localStorage.setItem('escala_autosave_slot_' + (usuarioAtual || 'guest'), _slotAutoSave);
  } else {
    localStorage.removeItem('escala_autosave_slot_' + (usuarioAtual || 'guest'));
  }
  _atualizarIndicadorAutoSave();
}

// Flag que impede _atualizarIndicadorAutoSave de sobrescrever o status "Salvando..."
let _autoSaveEmAndamento = false;

async function _autoSaveNuvem() {
  if (!_slotAutoSave || !usuarioAtual) return;
  // Verifica se o slot ainda existe
  const existe = _slotsCache.some(s => s.nome === _slotAutoSave);
  if (!existe) return;

  _autoSaveEmAndamento = true;

  // Mostra toast flutuante de "Salvando..." — mais visível que o indicador pequeno
  _mostrarToastAutoSave('salvando');

  // Atualiza também o indicador inline
  const ind = $('indicadorAutoSave');
  if (ind) {
    ind.textContent = '💾 Salvando na nuvem...';
    ind.style.color = '#e65100';
    ind.style.fontSize = '13px';
    ind.style.fontWeight = '600';
    ind.classList.add('salvando');
  }

  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({
        acao: 'salvar',
        usuario: usuarioAtual,
        senha: senhaAtual,
        nomeSlot: _slotAutoSave,
        substituir: _slotAutoSave,
        dados: coletarDadosParaNuvem()
      })
    });
    _mostrarToastAutoSave('ok');
  } catch (err) {
    console.warn('Auto-save falhou:', err);
    _mostrarToastAutoSave('erro');
  } finally {
    _autoSaveEmAndamento = false;
    if (ind) ind.classList.remove('salvando');
    _atualizarIndicadorAutoSave();
  }
}

function _mostrarToastAutoSave(estado) {
  let toast = $('toastAutoSave');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastAutoSave';
    document.body.appendChild(toast);
  }
  if (estado === 'salvando') {
    toast.textContent = '💾 Salvando na nuvem...';
    toast.className = 'toast-autosave toast-salvando';
    toast.style.display = 'block';
    toast._clearTimer && clearTimeout(toast._clearTimer);
  } else if (estado === 'ok') {
    toast.textContent = '✅ Salvo na nuvem!';
    toast.className = 'toast-autosave toast-ok';
    toast._clearTimer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
  } else {
    toast.textContent = '❌ Auto-save falhou. Verifique a conexão.';
    toast.className = 'toast-autosave toast-erro';
    toast._clearTimer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
  }
}

function fecharModalNuvem(id) {
  $(id).style.display = 'none';
}

// ============================================================
// DADOS PERSISTENTES (localStorage como cache local)
// ============================================================
function coletarDadosParaSalvar() {
  // HTMLs gerados (resumo, vagas, escala, escalaAC4) são omitidos intencionalmente:
  // são regenerados automaticamente via gerarCalendario(true) ao carregar.
  // JSONs antigos que contenham esses campos são aceitos sem erro (ignorados em aplicarDados).
  return {
    funcoes, responsaveis, vinculos, afastamentos,
    calendarioGerado, exclusoesDiarias,
    mes: $('mes').value,
    ano: $('ano').value,
    inicioEscala: $('inicioEscala').value,
    fimDaEscala: $('fimDaEscala').value
  };
}

// coletarDadosParaNuvem aponta para coletarDadosParaSalvar — ambos omitem HTMLs
function coletarDadosParaNuvem() {
  return coletarDadosParaSalvar();
}

function aplicarDados(dados) {
  if (!dados) return;
  funcoes = dados.funcoes || [];
  responsaveis = dados.responsaveis || [];
  vinculos = dados.vinculos || { Alpha: [], Bravo: [], Charlie: [], Delta: [] };
  afastamentos = dados.afastamentos || [];
  calendarioGerado = dados.calendarioGerado || false;
  exclusoesDiarias = dados.exclusoesDiarias || {};
  alas.forEach(a => {
    vinculos[a].forEach(func => {
      if (!func.hasOwnProperty('dia')) {
        func.horaInicio = func.horaInicio ?? 8;
        func.horaFim = func.horaFim ?? 8;
        func.remuneracao = func.remuneracao || 'Normal';
      }
    });
  });
  if (dados.mes) $('mes').value = dados.mes;
  if (dados.ano) $('ano').value = dados.ano;
  if (dados.inicioEscala) $('inicioEscala').value = dados.inicioEscala;
  if (dados.fimDaEscala) $('fimDaEscala').value = dados.fimDaEscala;
  // HTMLs não são mais salvos no JSON. Se vier de backup antigo, ignora silenciosamente.
  // O calendário será regenerado por gerarCalendario(true) abaixo, que recriarará tudo.
  resumoHTML = '';
  vagasHTML = '';
  escalaHTML = '';
  escalaAC4HTML = '';
  $('funcoes').value = funcoes.join('\n');
  $('responsaveis').value = responsaveis.join('\n');
  exibirVinculos();
  exibirAfastamentos();
  atualizarSelectResponsaveis();
  if (calendarioGerado) gerarCalendario(true);
  salvarDadosPersistentes();
}

// Debounce para auto-save na nuvem (evita chamadas excessivas)
const _autoSaveDebounced = (function() {
  let t;
  return function() { clearTimeout(t); t = setTimeout(_autoSaveNuvem, 4000); };
})();

function salvarDadosPersistentes() {
  try {
    const dados = coletarDadosParaSalvar();
    localStorage.setItem('escala_dados_' + (usuarioAtual || 'guest'), JSON.stringify(dados));
  } catch (err) {
    console.warn('Não foi possível salvar no localStorage:', err);
  }
  // Dispara auto-save na nuvem se um slot estiver selecionado
  if (_slotAutoSave && usuarioAtual) _autoSaveDebounced();
}

function carregarDadosPersistentes() {
  // Restaura preferência de auto-save
  try {
    const savedSlot = localStorage.getItem('escala_autosave_slot_' + (usuarioAtual || 'guest'));
    if (savedSlot) {
      _slotAutoSave = savedSlot;
      _atualizarIndicadorAutoSave();
    }
  } catch(_) {}
  try {
    const raw = localStorage.getItem('escala_dados_' + (usuarioAtual || 'guest'));
    if (!raw) return;
    const dados = JSON.parse(raw);
    aplicarDados(dados);
  } catch (err) {
    console.warn('Erro ao carregar do localStorage:', err);
  }
}

// ============================================================
// ABRIR RELATÓRIOS EM NOVA ABA (substitui window.api)
// ============================================================
function abrirHtmlNova(titulo, conteudo) {
  const baseStyle = '<style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px;text-align:left}</style>';
  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + titulo + '</title>' + baseStyle + '</head><body>' + conteudo + '</body></html>';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function abrirResumoNoNavegador() {
  if (!resumoHTML) return;
  abrirHtmlNova('Resumo de Responsáveis', resumoHTML);
}
function abrirVagasNoNavegador() {
  if (!vagasHTML) return;
  abrirHtmlNova('Vagas Disponíveis', vagasHTML);
}
function abrirEscalaNoNavegador() {
  if (!escalaHTML) return;
  abrirHtmlNova('Escala', escalaHTML);
}
function abrirEscalaAC4NoNavegador() {
  if (!escalaAC4HTML) return;
  abrirHtmlNova('Escala de AC4', escalaAC4HTML);
}

// salvarArquivosTemporarios não faz nada no contexto web (sem Electron)
function salvarArquivosTemporarios() {}

// ============================================================
// DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  $('funcoes').addEventListener('input', debounce(adicionarFuncoes));
  $('responsaveis').addEventListener('input', debounce(adicionarResponsaveis));
  $('mes').addEventListener('change', () => {
    setFimDaEscalaPadrao();
    salvarDadosPersistentes();
  });
  $('ano').addEventListener('change', () => {
    setFimDaEscalaPadrao();
    salvarDadosPersistentes();
  });
  $('inicioEscala').addEventListener('change', () => {
    if (calendarioGerado) {
      gerarEscala();
      gerarResumoResponsaveis();
      gerarVagasDisponiveis();
    }
    salvarDadosPersistentes();
  });
  $('fimDaEscala').addEventListener('change', () => {
    if (calendarioGerado) {
      gerarEscala();
      gerarResumoResponsaveis();
      gerarVagasDisponiveis();
    }
    salvarDadosPersistentes();
  });
  atualizarSelectResponsaveis();
});

// ============================================================
// UTILITÁRIOS
// ============================================================
function debounce(fn, delay = 1000) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function normalizarData(data) {
  if (typeof data === 'string') {
    const partes = data.split('-');
    if (partes.length === 3) {
      return new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    }
  }
  if (data instanceof Date) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }
  return new Date(data);
}
function compararDatas(data1, data2) {
  const d1 = normalizarData(data1);
  const d2 = normalizarData(data2);
  const t1 = d1.getFullYear() * 10000 + d1.getMonth() * 100 + d1.getDate();
  const t2 = d2.getFullYear() * 10000 + d2.getMonth() * 100 + d2.getDate();
  if (t1 < t2) return -1;
  if (t1 > t2) return 1;
  return 0;
}
function setFimDaEscalaPadrao() {
  const m = parseInt($('mes').value), a = parseInt($('ano').value);
  $('fimDaEscala').value = m && a ? new Date(a, m, 0).getDate() : '';
}


function adicionarFuncoes() {
  const input = $('funcoes').value.split('\n').map(f => f.trim()).filter(Boolean);
  const unicas = [], duplicadas = [];
  input.forEach(f => unicas.includes(f) ? duplicadas.push(f) : unicas.push(f));
  if (duplicadas.length) {
    $('funcoes').value = unicas.join('\n');
    openWarningModal(`Não deve haver funções com nomes repetidos`);
  }
  const funcoesRemovidas = funcoes.filter(f => !unicas.includes(f));
  funcoes = unicas;
  atualizarSelectResponsaveis();
  funcoesRemovidas.forEach(funcaoRemovida => {
    removerResiduosFuncao(funcaoRemovida);
  });
  alas.forEach(a => {
    vinculos[a] = vinculos[a].filter(v => funcoes.includes(v.funcao));
    funcoes.forEach(f => {
      if (!vinculos[a].some(v => v.funcao === f && !v.hasOwnProperty('dia')))
        vinculos[a].push({ funcao: f, responsavel: 'Indeterminado' });
    });
    const gerais = vinculos[a].filter(v => !v.hasOwnProperty('dia'));
    const diarios = vinculos[a].filter(v => v.hasOwnProperty('dia'));
    vinculos[a] = funcoes.map(f => gerais.find(v => v.funcao === f) || { funcao: f, responsavel: 'Indeterminado' }).concat(diarios);
  });
  for (let a in exclusoesDiarias) {
    for (let d in exclusoesDiarias[a]) {
      exclusoesDiarias[a][d] = exclusoesDiarias[a][d].filter(f => funcoes.includes(f));
      if (!exclusoesDiarias[a][d].length) delete exclusoesDiarias[a][d];
    }
  }
  exibirVinculos();
  salvarDadosPersistentes();
  if (calendarioGerado) gerarCalendario(true);
}
function removerResiduosFuncao(funcao) {
  alas.forEach(ala => {
    vinculos[ala] = vinculos[ala].filter(v => v.funcao !== funcao);
  });
  for (let ala in exclusoesDiarias) {
    for (let dia in exclusoesDiarias[ala]) {
      exclusoesDiarias[ala][dia] = exclusoesDiarias[ala][dia].filter(f => f !== funcao);
      if (!exclusoesDiarias[ala][dia].length) delete exclusoesDiarias[ala][dia];
    }
    if (Object.keys(exclusoesDiarias[ala]).length === 0) delete exclusoesDiarias[ala];
  }
}
function removerResiduosResponsavel(responsavel) {
  alas.forEach(ala => {
    vinculos[ala] = vinculos[ala].map(v => {
      if (v.responsavel === responsavel) {
        v.responsavel = 'Indeterminado';
        if (v.hasOwnProperty('dia')) v.remuneracao = 'AC4';
      }
      if (v.originalResponsavel === responsavel) v.originalResponsavel = 'Indeterminado';
      return v;
    });
  });
  afastamentos = afastamentos.filter(af => af.responsavel !== responsavel);
}
function adicionarResponsaveis() {
  const input = $('responsaveis').value.split('\n').map(r => r.trim()).filter(Boolean);
  const unicos = [], duplicados = [];
  input.forEach(r => unicos.includes(r) ? duplicados.push(r) : unicos.push(r));
  if (duplicados.length) {
    $('responsaveis').value = unicos.join('\n');
    openWarningModal(`Não deve haver responsáveis com nomes repetidos`);
  }
  const responsaveisRemovidos = responsaveis.filter(r => !unicos.includes(r));
  responsaveisRemovidos.forEach(responsavelRemovido => {
    removerResiduosResponsavel(responsavelRemovido);
  });
  responsaveis = unicos;
  atualizarSelectResponsaveis();
  exibirVinculos();
  exibirAfastamentos();
  if (calendarioGerado) gerarCalendario(true);
  salvarDadosPersistentes();
}
function atualizarSelectResponsaveis() {
  document.querySelectorAll('select[data-role="responsavel-vinculo"], select[data-role="responsavel-calendario"]').forEach(sel => {
    const val = sel.value;
    sel.innerHTML = '<option value="">Selecione um responsável</option>' +
      responsaveis.map(r => {
        // Vínculos gerais (responsavel-vinculo) não têm dia no id → diaId = NaN → sem cálculo de afastamento
        const diaId = parseInt(sel.id.split('-')[1]);
        const dt = isNaN(diaId) ? null : new Date(parseInt($('ano').value), parseInt($('mes').value) - 1, diaId);
        const afastado = dt ? isResponsavelAfastado(r, dt) : false;
        return `<option value="${r}" ${r === val ? 'selected' : ''}>${r}${afastado ? ' (Afastado)' : ''}</option>`;
      }).join('');
  });
  $('afastamento-responsavel').innerHTML = '<option value="">Selecione um responsável</option>' +
    responsaveis.map(r => `<option value="${r}">${r}</option>`).join('');
}
function gerarVinculos() {
  const resetar = () => {
    alas.forEach(a => {
      vinculos[a] = funcoes.map(f => ({ funcao: f, responsavel: 'Indeterminado' }));
    });
    exibirVinculos();
    gerarResumoResponsaveis();
    if (calendarioGerado) gerarCalendario(true);
    salvarDadosPersistentes();
  };
  if (vinculos.Alpha.length || vinculos.Bravo.length || vinculos.Charlie.length || vinculos.Delta.length)
    openModal("As informações dos vínculos serão resetadas. Deseja continuar?", resetar);
  else resetar();
}
function exibirVinculos() {
  $('vinculos').innerHTML = alas.map(a => {
    const arr = vinculos[a].filter(v => !v.hasOwnProperty('dia'));
    if (!arr.length) return '';
    return `<h3>Vínculos da Ala ${a}</h3>
<table>
<tr><th>Função</th><th>Responsável</th></tr>
${arr.map(it => `<tr>
<td>${it.funcao}</td>
<td><select data-role="responsavel-vinculo" onchange="editarResponsavel('${a}','${it.funcao}',this.value)">
<option value="">Selecione um responsável</option>
${responsaveis.map(r => `<option value="${r}" ${r === it.responsavel ? 'selected' : ''}>${r}</option>`).join('')}
</select></td>
</tr>`).join('')}
</table>`;
  }).join('');
  setTimeout(ativarTodosCustomSelects, 0);
}

// ✅ CORREÇÃO PRINCIPAL: Verificação por responsável em QUALQUER função em outra ala
function editarResponsavel(a, funcao, nv) {
  const vinculoGeral = vinculos[a].find(v => v.funcao === funcao && !v.hasOwnProperty('dia'));
  if (!vinculoGeral) return;
  const prev = vinculoGeral.responsavel;
  if (nv) {
    // 🔥 Agora verifica se o responsável já está em QUALQUER função em outra ala (sem depender da função)
    const alasVinculadas = alas.filter(ala => ala !== a &&
      vinculos[ala].some(v => v.responsavel === nv && !v.hasOwnProperty('dia')));

    if (alasVinculadas.length) {
      openModal(`O responsável ${nv} já está vinculado nas alas: ${alasVinculadas.join(', ')}. Deseja mesmo alterar a seleção?`,
        () => { setTimeout(() => { aplicarAtualizacao(); }, 10); },
        () => { vinculoGeral.responsavel = prev; exibirVinculos(); }
      );
      return;
    }
  }
  aplicarAtualizacao();
  function aplicarAtualizacao() {
    if (calendarioGerado) {
      setTimeout(() => {
        openModal(`A função "${funcao}" da Ala ${a} será redefinida no calendário. Deseja continuar?`,
          () => { atualizarVinculosDiarios(); },
          () => { vinculoGeral.responsavel = prev; exibirVinculos(); }
        );
      }, 10);
    } else {
      atualizarVinculosDiarios();
    }
  }
  function atualizarVinculosDiarios() {
    vinculoGeral.responsavel = nv || 'Indeterminado';
    const anoAtual = parseInt($('ano').value);
    const mesAtual = parseInt($('mes').value);
    vinculos[a].forEach(item => {
      if (item.funcao === funcao && item.hasOwnProperty('dia')) {
        item.originalResponsavel = nv || 'Indeterminado';
        if (item.bloqueada) return;
        const dataItem = new Date(anoAtual, mesAtual - 1, item.dia);
        const estaAfastado = nv && nv !== 'Indeterminado' && isResponsavelAfastado(nv, dataItem);
        if (item.geradoAutomaticamente || item.responsavel === 'Indeterminado') {
          item.responsavel = estaAfastado ? 'Indeterminado' : (nv || 'Indeterminado');
          item.remuneracao = estaAfastado ? 'AC4' : 'Normal';
          item.horaInicio = 8;
          item.horaFim = 8;
        }
      }
    });
    if (exclusoesDiarias[a]) {
      Object.keys(exclusoesDiarias[a]).forEach(dia => {
        exclusoesDiarias[a][dia] = exclusoesDiarias[a][dia].filter(f => f !== funcao);
        if (!exclusoesDiarias[a][dia].length) delete exclusoesDiarias[a][dia];
      });
    }
    exibirVinculos();
    gerarResumoResponsaveis();
    if (calendarioGerado) gerarCalendario(true);
    gerarVagasDisponiveis();
    salvarDadosPersistentes();
  }
}

function limparCalendarioEResiduos() {
  exclusoesDiarias = {};
  alas.forEach(ala => {
    vinculos[ala] = vinculos[ala].filter(f => !f.hasOwnProperty('dia'));
    vinculos[ala].forEach(f => {
      if (!f.hasOwnProperty('dia')) {
        f.horaInicio = 8;
        f.horaFim = 8;
        f.remuneracao = 'Normal';
        if (f.hasOwnProperty('horaFimEscala')) delete f.horaFimEscala;
      }
    });
  });
  resumoHTML = '';
  vagasHTML = '';
  escalaHTML = '';
  escalaAC4HTML = '';
  ['botao-imprimir-resumo', 'botao-imprimir-vagas', 'botao-imprimir-escala', 'botao-imprimir-escala-ac4']
    .forEach(id => { const btn = $(id); if (btn) btn.style.display = 'none'; });
}
function gerarCalendario(mantemEd = false) {
  const m = parseInt($('mes').value);
  const a = parseInt($('ano').value);
  if (!m || !a || a < 2000) {
    openWarningModal("Selecione corretamente o mês e o ano antes de gerar o calendário.");
    return;
  }
  if (calendarioGerado && !mantemEd) {
    openModal("O calendário já foi gerado. Ao gerar novamente, todas as edições manuais serão perdidas. Deseja continuar?",
      () => { limparCalendarioEResiduos(); gerarCalendarioInterno(false); },
      () => { }
    );
  } else {
    if (!mantemEd) limparCalendarioEResiduos();
    gerarCalendarioInterno(mantemEd);
  }
}
function gerarCalendarioInterno(mantemEd) {
  $('calendarioError').textContent = "";
  const m = parseInt($('mes').value), a = parseInt($('ano').value);
  if (!a || a < 2000) { openWarningModal("Selecione corretamente o ano"); return; }
  if (!m) { openWarningModal("Selecione corretamente o mês."); return; }
  const dMax = new Date(a, m, 0).getDate();
  let totMes = 0, html = `<table><thead><tr><th>Data</th><th>Ala</th><th>Funções e Responsáveis</th><th>Valores</th></tr></thead><tbody>`;
  for (let dia = 1; dia <= dMax; dia++) {
    const dt = new Date(a, m - 1, dia),
      dw = dt.toLocaleDateString('pt-BR', { weekday: 'long' }),
      idx = ((Math.floor((dt - new Date(2024, 2, 21)) / 86400000)) % alas.length + alas.length) % alas.length,
      ala = alas[idx];
    let td = 0;
    funcoes.forEach(funcao => {
      const geral = vinculos[ala].find(v => v.funcao === funcao && !v.hasOwnProperty('dia'));
      if (!geral) return;
      let responsavel = geral.responsavel;
      let remuneracao = geral.remuneracao || 'Normal';
      if (responsavel === 'Indeterminado' || isResponsavelAfastado(responsavel, dt)) {
        responsavel = 'Indeterminado';
        remuneracao = 'AC4';
      }
      const excluida = exclusoesDiarias[ala] && exclusoesDiarias[ala][dia] && exclusoesDiarias[ala][dia].includes(funcao);
      const jaExisteManual = vinculos[ala].some(v => v.funcao === funcao && v.dia === dia && !v.geradoAutomaticamente);
      const jaExisteAutomatica = vinculos[ala].some(v => v.funcao === funcao && v.dia === dia && v.geradoAutomaticamente);
      if (excluida || jaExisteManual) return;
      if (!jaExisteAutomatica) {
        // ✅ Intencional: ocultar é definido globalmente no dia 1 e propagado via geral.ocultar
        // Nos outros dias gerados automaticamente, ocultar segue o vínculo geral (checkbox só aparece no dia 1)
        let ocultarValue = false;
        if (dia === 1) ocultarValue = geral.hasOwnProperty('ocultar') ? geral.ocultar : false;
        vinculos[ala].push({
          funcao: funcao,
          responsavel: responsavel,
          dia: dia,
          horaInicio: 8,
          horaFim: 8,
          horaFimEscala: 8,
          remuneracao: remuneracao,
          geradoAutomaticamente: true,
          originalResponsavel: geral.responsavel,
          ocultar: ocultarValue,
          ordemOriginal: funcoes.indexOf(funcao)
        });
      }
    });
    if (dia === dMax) {
      vinculos[ala].forEach(v => {
        if (v.dia === dia && !v.hasOwnProperty('horaFimEscala')) v.horaFimEscala = v.horaFim;
      });
    }
    const vincDia = vinculos[ala].filter(v => v.dia === dia);
    const vincDiaFiltrado = vincDia.filter(v => {
      if (exclusoesDiarias[ala] && exclusoesDiarias[ala][dia]) {
        if (v.geradoAutomaticamente && exclusoesDiarias[ala][dia].includes(v.funcao)) return false;
      }
      return true;
    });
    vincDiaFiltrado.sort((a, b) => {
      const ordemA = a.hasOwnProperty('ordemOriginal') ? a.ordemOriginal : (a.hasOwnProperty('ordem') ? a.ordem : 9999);
      const ordemB = b.hasOwnProperty('ordemOriginal') ? b.ordemOriginal : (b.hasOwnProperty('ordem') ? b.ordem : 9999);
      return ordemA - ordemB;
    });
    let funHtml = "";
    vincDiaFiltrado.forEach((func, index) => {
      const hi = `hora-inicio-${dia}-${ala}-${func.funcao}`,
        hf = `hora-fim-${dia}-${ala}-${func.funcao}`,
        rm = `remuneracao-${dia}-${ala}-${func.funcao}`,
        c = `custo-${dia}-${ala}-${func.funcao}`,
        hI = func.horaInicio ?? 8,
        hF = func.horaFim ?? 8,
        hFE = func.horaFimEscala ?? hF,
        rS = func.remuneracao || 'Normal',
        // ✅ Inclui "..." como isento de cálculo
        cIni = rS !== 'Extra não remunerado' && rS !== 'Normal' && rS !== '...' && rS !== 'Troca com a SOP' ? calcularCusto(dt, hI, hF) : 0;
      td += cIni;
      const originalResponsavel = func.originalResponsavel;
      const isResponsavelDiferente = func.responsavel !== originalResponsavel;
      const isOriginalUndefined = !originalResponsavel;
      let alertaHtml = "";
      if (isOriginalUndefined) {
        alertaHtml = `<div id="alerta-responsavel-msg-${ala}-${func.funcao}-${dia}" style="color: dodgerblue; font-size: 12px; margin-top: 5px; text-align: center;">
Função adicionada manualmente</div>`;
      }
      else if (originalResponsavel && originalResponsavel !== 'Indeterminado' && isResponsavelAfastado(originalResponsavel, dt)) {
        alertaHtml = `<div id="alerta-responsavel-msg-${ala}-${func.funcao}-${dia}" style="color: #FF8C00; font-size: 12px; margin-top: 5px; text-align: center;">
Função com responsável afastado definido no vínculo geral</div>`;
      }
      else if (mantemEd && isResponsavelDiferente && originalResponsavel && originalResponsavel !== 'Indeterminado') {
        alertaHtml = `<div id="alerta-responsavel-msg-${ala}-${func.funcao}-${dia}" style="color: red; font-size: 12px; margin-top: 5px; text-align: center;">
${originalResponsavel} é o responsável por essa função no vínculo geral da Ala ${ala}.</div>`;
      }
      else if (originalResponsavel && originalResponsavel !== 'Indeterminado') {
        alertaHtml = `<div id="alerta-responsavel-msg-${ala}-${func.funcao}-${dia}" style="color: darkgoldenrod; font-size: 12px; margin-top: 5px; text-align: center;">
Função com responsável definido no vínculo geral</div>`;
      }
      const disabledClass = func.bloqueada ? ' input-disabled' : '';
      const selectDisabledClass = func.bloqueada ? ' select-disabled' : '';
      const disabledAttr = func.bloqueada ? ' disabled' : '';
      funHtml += `<div id="funcao-${dia}-${ala}-${func.funcao}" class="draggable-funcao" data-dia="${dia}" data-ala="${ala}" data-funcao="${func.funcao}" data-ordem="${index}">
<div class="linha-funcao" style="text-align: center;">
<span class="drag-handle">↓≡↑</span>
<strong id="nome-funcao-${dia}-${ala}-${func.funcao}">${func.funcao}:</strong>
<button class="btn-editar-funcao${disabledClass}"${disabledAttr} onclick="editarNomeFuncaoDia(${dia},'${ala}','${func.funcao.replace(/'/g, "\\'")}')">Editar Nome</button>
<button class="btn-small" onclick="toggleBloqueioFuncao('${ala}','${func.funcao}',${dia}${!func.bloqueada ? ', true' : ''})">
${func.bloqueada ? '🔓 Desbloquear Modificaçoes' : '🔒 Bloquear Modificaçoes'}
</button>
</div>
<div class="linha linha-funcao-campos" style="justify-content: center; align-items: center;">
<label class="label-inline">Nome:</label>
<select data-role="responsavel-calendario" id="responsavel-${dia}-${ala}-${func.funcao}" class="${selectDisabledClass} select-nome-funcao"${disabledAttr} onchange="atualizarRespCal('${ala}','${func.funcao}',this.value,${dia})">
<option value="">Selecione um responsável</option>
${responsaveis.map(r => `<option value="${r}" ${r === func.responsavel ? 'selected' : ''}>${r}${isResponsavelAfastado(r, dt) ? ' (Afastado)' : ''}</option>`).join('')}
</select>
<label class="label-inline">H.Início:</label>
<input type="number" id="${hi}" class="input-hora${disabledClass}" value="${hI}" min="0" max="23"${disabledAttr} onchange="atualizarCusto(${dia},'${ala}','${func.funcao}')">
<label class="label-inline">H.Fim:</label>
<input type="number" id="${hf}" class="input-hora${disabledClass}" value="${hF}" min="0" max="23"${disabledAttr} onchange="atualizarCusto(${dia},'${ala}','${func.funcao}')">
${dia === dMax ? `<label class="label-inline">H.Fim Escala:</label>
<input type="number" id="hora-fim-escala-${dia}-${ala}-${func.funcao}" class="input-hora${disabledClass}" value="${hFE}" min="0" max="23"${disabledAttr} onchange="atualizarHoraFimEscala(${dia},'${ala}','${func.funcao}')">` : ``}
<label class="label-inline">Remuneração:</label>
<select id="${rm}" class="${selectDisabledClass}"${disabledAttr} onchange="atualizarCusto(${dia},'${ala}','${func.funcao}')">
<option value="AC4" ${rS==='AC4' ? 'selected' : ''}>AC4</option>
<option value="AC4 - Regência" ${rS==='AC4 - Regência' ? 'selected' : ''}>AC4 - Regência</option>
<option value="AC4-2" ${rS==='AC4-2' ? 'selected' : ''}>AC4-2</option>
<option value="Extra não remunerado" ${rS==='Extra não remunerado' ? 'selected' : ''}>Extra não remunerado</option>
<option value="Normal" ${rS==='Normal' ? 'selected' : ''}>Normal</option>
<option value="..." ${rS==='...' ? 'selected' : ''}>...</option>
<option value="Troca com a SOP" ${rS==='Troca com a SOP' ? 'selected' : ''}>Troca com a SOP</option>
</select>
<label class="label-inline">Custo:</label>
<span id="${c}" class="custo-valor">R$ ${formatarMoeda(cIni)}</span>
<button${disabledAttr} onclick="removerFuncaoCalendario('${ala}','${func.funcao}',${dia})">Remover</button>
${dia === 1 ? `<label><input type="checkbox" id="ocultar-${dia}-${ala}-${func.funcao}"${disabledAttr} onchange="toggleOcultar(${dia},'${ala}','${func.funcao}',this.checked)" ${func.ocultar ? 'checked' : ''}> Ocultar da escala</label>` : ``}
</div>${alertaHtml}</div>`;
    });
    html += `<tr class="${dia % 2 === 0 ? 'linha-par' : 'linha-impar'}">
<td class="td-data"><span class="data-dia">${dia}/${m}/${a}</span><span class="data-dw">(${dw})</span></td>
<td>${ala}</td>
<td id="container-funcoes-${dia}-${ala}" class="sortable-container">
<div class="funcoes-container">
${funHtml}
</div>
<div class="input-container">
<label for="nova-funcao-${dia}-${ala}">Nova Função:</label>
<input type="text" id="nova-funcao-${dia}-${ala}" placeholder="Adicionar função">
<button onclick="adicionarFuncaoNoCalendario(${dia},'${ala}')">Adicionar Função</button>
</div>
</td>
<td id="total-diario-${dia}">R$ ${formatarMoeda(td)}</td>
</tr>`;
    totMes += td;
  }
  html += `<tr><td colspan="3" style="text-align:right;"><strong>Total do Mês:</strong></td>
<td id="total-mensal"><strong>R$ ${formatarMoeda(totMes)}</strong></td></tr></tbody></table>`;
  $('calendario').innerHTML = html;
  calendarioGerado = true;
  inicializarDragAndDrop();
  setTimeout(ativarTodosCustomSelects, 0);
  gerarResumoResponsaveis();
  gerarVagasDisponiveis();
  gerarEscala();
  salvarDadosPersistentes();
}
function inicializarDragAndDrop() {
  // Rastreia qual funcoesContainer originou o drag atual
  let dragSourceContainer = null;

  const containers = document.querySelectorAll('.sortable-container');
  containers.forEach(container => {
    const funcoesContainer = container.querySelector('.funcoes-container');
    if (!funcoesContainer) return;
    funcoesContainer.querySelectorAll('.draggable-funcao').forEach(el => {
      el.draggable = false;
    });
    funcoesContainer.querySelectorAll('.drag-handle').forEach(handle => {
      const draggable = handle.closest('.draggable-funcao');
      if (!draggable) return;
      handle.addEventListener('mousedown', (e) => {
        draggable.setAttribute('draggable', 'true');
        draggable.classList.add('dragging');
        // Registra o container de origem
        dragSourceContainer = funcoesContainer;
      });
      handle.addEventListener('mouseup', () => {
        draggable.setAttribute('draggable', 'false');
      });
      draggable.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', '');
      });
      draggable.addEventListener('dragend', () => {
        draggable.classList.remove('dragging');
        draggable.setAttribute('draggable', 'false');
        dragSourceContainer = null;
        atualizarOrdemFuncoesNoDia(container);
      });
    });
    funcoesContainer.addEventListener('dragover', e => {
      // Só aceita o drag se vier do mesmo container (mesmo dia)
      if (dragSourceContainer !== funcoesContainer) return;
      e.preventDefault();
      const afterElement = getDragAfterElement(funcoesContainer, e.clientY);
      const draggable = document.querySelector('.dragging');
      if (!draggable) return;
      if (afterElement == null) {
        funcoesContainer.appendChild(draggable);
      } else {
        funcoesContainer.insertBefore(draggable, afterElement);
      }
    });
  });
}
function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.draggable-funcao:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}
function atualizarOrdemFuncoesNoDia(container) {
  const idParts = container.id.split('-');
  const dia = parseInt(idParts[2]);
  const ala = idParts[3];
  const funcoesContainer = container.querySelector('.funcoes-container');
  if (!funcoesContainer) return;
  const funcoesNoContainer = funcoesContainer.querySelectorAll('.draggable-funcao');
  funcoesNoContainer.forEach((element, novaOrdem) => {
    const funcao = element.getAttribute('data-funcao');
    element.setAttribute('data-ordem', novaOrdem);
    const vinculo = vinculos[ala].find(v => v.funcao === funcao && v.dia === dia);
    if (vinculo) vinculo.ordemOriginal = novaOrdem;
  });
  salvarDadosPersistentes();
  gerarEscala();
}
function editarNomeFuncaoDia(dia, ala, funcaoAtual) {
  const container = document.getElementById(`funcao-${dia}-${ala}-${funcaoAtual}`);
  if (!container) return;
  const vinculoExistente = vinculos[ala].find(v => v.funcao === funcaoAtual && v.dia === dia);
  if (vinculoExistente && vinculoExistente.bloqueada) {
    openWarningModal("Edição bloqueada para esta função.");
    return;
  }
  backupEdicaoFuncao[`${dia}-${ala}-${funcaoAtual}`] = container.innerHTML;
  const nomeAtual = document.getElementById(`nome-funcao-${dia}-${ala}-${funcaoAtual}`)?.textContent.replace(':', '').trim() || funcaoAtual;
  const inputHtml = `
<input type="text"
id="input-editar-funcao-${dia}-${ala}-${funcaoAtual}"
value="${nomeAtual.replace(/"/g, '&quot;').replace(/'/g, "\\'")}"
style="width: 200px; margin-right: 5px;">
<button onclick="salvarNomeFuncaoDia(${dia},'${ala}','${funcaoAtual}')">Salvar</button>
<button onclick="cancelarEdicaoFuncaoDia(${dia},'${ala}','${funcaoAtual}')">Cancelar</button>
`;
  const linhaFuncao = container.querySelector('.linha-funcao');
  if (linhaFuncao) {
    linhaFuncao.innerHTML = inputHtml;
  }
}
function cancelarEdicaoFuncaoDia(dia, ala, funcaoAtual) {
  const container = document.getElementById(`funcao-${dia}-${ala}-${funcaoAtual}`);
  if (!container) return;
  const chave = `${dia}-${ala}-${funcaoAtual}`;
  if (backupEdicaoFuncao[chave]) {
    container.innerHTML = backupEdicaoFuncao[chave];
    delete backupEdicaoFuncao[chave];
  }
}
function salvarNomeFuncaoDia(dia, ala, funcaoAntiga) {
  const input = document.getElementById(`input-editar-funcao-${dia}-${ala}-${funcaoAntiga}`);
  if (!input) return;
  const novoNome = input.value.trim();
  if (!novoNome) {
    openWarningModal("O nome da função não pode estar vazio.");
    return;
  }
  const funcoesNoDia = vinculos[ala].filter(v => v.dia === dia);
  const funcaoExistente = funcoesNoDia.find(v => v.funcao === novoNome);
  if (funcaoExistente && funcaoExistente.funcao !== funcaoAntiga) {
    openWarningModal(`Já existe uma função chamada "${novoNome}" neste dia.`);
    return;
  }
  const vinculoExistente = vinculos[ala].find(v => v.funcao === funcaoAntiga && v.dia === dia);
  if (vinculoExistente && vinculoExistente.bloqueada) {
    openWarningModal("Edição bloqueada para esta função.");
    cancelarEdicaoFuncaoDia(dia, ala, funcaoAntiga);
    return;
  }
  const temVinculoGeral = vinculos[ala].some(v => v.funcao === funcaoAntiga && !v.hasOwnProperty('dia'));
  if (temVinculoGeral) {
    openModal(
      `Esta função "${funcaoAntiga}" está no vínculo geral da Ala ${ala}. ` +
      `Ao editar o nome apenas para o dia ${dia}, você criará uma função especial para este dia. ` +
      `A função original "${funcaoAntiga}" continuará existindo nos outros dias. Deseja continuar?`,
      () => {
        aplicarEdicaoFuncaoComVinculoGeral(dia, ala, funcaoAntiga, novoNome);
      },
      () => {
        cancelarEdicaoFuncaoDia(dia, ala, funcaoAntiga);
      }
    );
  } else {
    aplicarEdicaoFuncao(dia, ala, funcaoAntiga, novoNome);
  }
}
function aplicarEdicaoFuncao(dia, ala, funcaoAntiga, novoNome) {
  const vinculo = vinculos[ala].find(v => v.funcao === funcaoAntiga && v.dia === dia);
  if (vinculo) {
    const ordemOriginal = vinculo.hasOwnProperty('ordemOriginal') ? vinculo.ordemOriginal :
      (vinculo.hasOwnProperty('ordem') ? vinculo.ordem : funcoes.indexOf(funcaoAntiga));
    vinculo.funcao = novoNome;
    vinculo.ordemOriginal = ordemOriginal;
    if (exclusoesDiarias[ala] && exclusoesDiarias[ala][dia]) {
      const index = exclusoesDiarias[ala][dia].indexOf(funcaoAntiga);
      if (index !== -1) {
        exclusoesDiarias[ala][dia][index] = novoNome;
      }
    }
    salvarDadosPersistentes();
    gerarCalendario(true);
  }
}
function aplicarEdicaoFuncaoComVinculoGeral(dia, ala, funcaoAntiga, novoNome) {
  const funcaoExistente = vinculos[ala].find(v => v.funcao === novoNome && v.dia === dia);
  if (funcaoExistente) {
    openWarningModal(`Já existe uma função chamada "${novoNome}" neste dia.`);
    cancelarEdicaoFuncaoDia(dia, ala, funcaoAntiga);
    return;
  }
  const funcoesAntigas = vinculos[ala].filter(v => v.funcao === funcaoAntiga && v.dia === dia);
  if (!funcoesAntigas.length) {
    cancelarEdicaoFuncaoDia(dia, ala, funcaoAntiga);
    return;
  }
  const funcaoAutomatica = funcoesAntigas.find(v => v.geradoAutomaticamente);
  let ordemOriginal, responsavelOriginal, originalResponsavelOriginal, horaInicioOriginal, horaFimOriginal, remuneracaoOriginal, ocultarOriginal;
  if (funcaoAutomatica) {
    ordemOriginal = funcaoAutomatica.hasOwnProperty('ordemOriginal') ? funcaoAutomatica.ordemOriginal :
      (funcaoAutomatica.hasOwnProperty('ordem') ? funcaoAutomatica.ordem : funcoes.indexOf(funcaoAntiga));
    responsavelOriginal = funcaoAutomatica.responsavel;
    originalResponsavelOriginal = funcaoAutomatica.originalResponsavel || funcaoAutomatica.responsavel;
    horaInicioOriginal = funcaoAutomatica.horaInicio || 8;
    horaFimOriginal = funcaoAutomatica.horaFim || 8;
    remuneracaoOriginal = funcaoAutomatica.remuneracao || 'Normal';
    ocultarOriginal = funcaoAutomatica.ocultar || false;
  } else {
    ordemOriginal = funcoesAntigas[0].hasOwnProperty('ordemOriginal') ? funcoesAntigas[0].ordemOriginal :
      (funcoesAntigas[0].hasOwnProperty('ordem') ? funcoesAntigas[0].ordem : funcoes.indexOf(funcaoAntiga));
    responsavelOriginal = funcoesAntigas[0].responsavel;
    originalResponsavelOriginal = funcoesAntigas[0].originalResponsavel || funcoesAntigas[0].responsavel;
    horaInicioOriginal = funcoesAntigas[0].horaInicio || 8;
    horaFimOriginal = funcoesAntigas[0].horaFim || 8;
    remuneracaoOriginal = funcoesAntigas[0].remuneracao || 'Normal';
    ocultarOriginal = funcoesAntigas[0].ocultar || false;
  }
  registrarExclusao(ala, funcaoAntiga, dia);
  vinculos[ala] = vinculos[ala].filter(v => !(v.funcao === funcaoAntiga && v.dia === dia));
  vinculos[ala].push({
    funcao: novoNome,
    responsavel: responsavelOriginal,
    dia: dia,
    horaInicio: horaInicioOriginal,
    horaFim: horaFimOriginal,
    horaFimEscala: horaFimOriginal,
    remuneracao: remuneracaoOriginal,
    geradoAutomaticamente: false,
    originalResponsavel: originalResponsavelOriginal,
    ordemOriginal: ordemOriginal,
    ocultar: ocultarOriginal
  });
  salvarDadosPersistentes();
  gerarCalendario(true);
}
function toggleBloqueioFuncao(ala, funcao, dia, requerConfirmacao = false) {
  const vinculo = vinculos[ala].find(v => v.funcao === funcao && v.dia === dia);
  if (!vinculo) return;
  if (vinculo.bloqueada) {
    if (vinculo.estadoBloqueado) {
      vinculo.responsavel = vinculo.estadoBloqueado.responsavel;
      vinculo.remuneracao = vinculo.estadoBloqueado.remuneracao;
      vinculo.horaInicio = vinculo.estadoBloqueado.horaInicio;
      vinculo.horaFim = vinculo.estadoBloqueado.horaFim;
      vinculo.horaFimEscala = vinculo.estadoBloqueado.horaFimEscala;
      delete vinculo.estadoBloqueado;
    }
    vinculo.bloqueada = false;
    salvarDadosPersistentes();
    gerarCalendario(true);
  } else if (requerConfirmacao) {
    openModal(
      `Tem certeza de que deseja bloquear modificaçoes nesta função?\n` +
      `Enquanto estiver bloqueada, a função não poderá sofrer alterações, sejam elas manuais ou automáticas.`,
      () => {
        vinculo.estadoBloqueado = {
          responsavel: vinculo.responsavel,
          remuneracao: vinculo.remuneracao,
          horaInicio: vinculo.horaInicio,
          horaFim: vinculo.horaFim,
          horaFimEscala: vinculo.horaFimEscala
        };
        vinculo.bloqueada = true;
        salvarDadosPersistentes();
        gerarCalendario(true);
      },
      () => { }
    );
  }
}

// ✅ CORREÇÃO FINAL: Aceita 0 como valor válido para Hora Fim na Escala
function atualizarHoraFimEscala(dia, ala, funcao) {
  const vinculoDia = vinculos[ala].find(v => v.funcao === funcao && v.dia === dia);
  // Verifica existência antes de qualquer outra operação
  if (!vinculoDia) return;
  if (vinculoDia.bloqueada) {
    openWarningModal("Edição bloqueada para esta função.");
    return;
  }
  const inputElem = document.getElementById(`hora-fim-escala-${dia}-${ala}-${funcao}`);
  if (!inputElem) return;
  
  // ✅ Corrigido: 0 agora é aceito
  const parsed = parseInt(inputElem.value, 10);
  const novoValor = isNaN(parsed) ? 8 : parsed;

  vinculoDia.horaFimEscala = novoValor;
  gerarEscala();
  salvarDadosPersistentes();
}

function toggleOcultar(dia, ala, funcao, marcado) {
  const v = vinculos[ala].find(v => v.funcao === funcao && v.dia === dia);
  if (v && v.bloqueada) {
    openWarningModal("Edição bloqueada para esta função.");
    const chk = $(`ocultar-${dia}-${ala}-${funcao}`);
    if (chk) chk.checked = !marcado;
    return;
  }
  if (v) v.ocultar = marcado;
  if (calendarioGerado) gerarEscala();
  salvarDadosPersistentes();
}
function gerarVagasDisponiveis() {
  const m = parseInt($('mes').value, 10);
  const a = parseInt($('ano').value, 10);
  const totalDias = new Date(a, m, 0).getDate();
  let inicioFiltro = parseInt($('inicioEscala').value, 10) || 1;
  let fimFiltro = parseInt($('fimDaEscala').value, 10) || totalDias;
  inicioFiltro = Math.max(1, Math.min(inicioFiltro, totalDias));
  fimFiltro = Math.max(1, Math.min(fimFiltro, totalDias));
  if (fimFiltro < inicioFiltro) fimFiltro = inicioFiltro;
  const diasVagas = {};
  // Percorre as linhas uma única vez (eficiente) em vez de uma varredura por dia
  const rows = document.querySelectorAll('#calendario tbody tr');
  rows.forEach(row => {
    const cols = row.querySelectorAll('td');
    if (!cols[0]) return;
    const _spanData1 = cols[0].querySelector('.data-dia');
    const [dStr] = (_spanData1 ? _spanData1.textContent : cols[0].textContent).split('/');
    const diaRow = parseInt(dStr, 10);
    if (isNaN(diaRow) || diaRow < inicioFiltro || diaRow > fimFiltro) return;
    if (!cols[2]) return; // linha do total mensal não tem cols[2] acessível normalmente
    const divs = cols[2].querySelectorAll('div[id^="funcao-"]');
    divs.forEach(dv => {
      const funcaoElement = dv.querySelector('.linha-funcao strong');
      if (!funcaoElement) return;
      const funcao = funcaoElement.textContent.replace(':', '').trim();
      const ala = row.querySelector('td:nth-child(2)').textContent.trim();
      if (exclusoesDiarias[ala] && exclusoesDiarias[ala][diaRow] &&
        exclusoesDiarias[ala][diaRow].includes(funcao)) return;
      const responsavel = dv.querySelector('select[data-role="responsavel-calendario"]').value;
      const remuneracao = dv.querySelector('select[id^="remuneracao-"]').value;
      const horaInicio = parseInt(dv.querySelector('input[id^="hora-inicio-"]').value, 10) || 0;
      const horaFim = parseInt(dv.querySelector('input[id^="hora-fim-"]').value, 10) || 0;
      if (!responsavel && (remuneracao === 'AC4' || remuneracao === 'AC4-2' || remuneracao === 'AC4 - Regência')) {
        diasVagas[diaRow] = diasVagas[diaRow] || [];
        diasVagas[diaRow].push({ funcao, horaInicio, horaFim, remuneracao });
      }
    });
  });
  let dayIndex = 0;
  let html = `<table border="1" style="border-collapse:collapse; width:100%;">
<thead><tr><th>Dia</th><th>Função</th><th>Hora</th><th>Tipo de Remuneração</th></tr></thead><tbody>`;
  Object.keys(diasVagas).map(Number).sort((a, b) => a - b).forEach(dia => {
    const vagas = diasVagas[dia];
    const bgColor = dayIndex % 2 === 0 ? '#f9f9f9' : '#ffffff';
    vagas.forEach((vaga, i) => {
      html += `<tr style="background-color:${bgColor}">`;
      if (i === 0) html += `<td rowspan="${vagas.length}">${dia}/${m}/${a}</td>`;
      html += `<td>${vaga.funcao}</td><td>${vaga.horaInicio}h às ${vaga.horaFim}h</td><td>${vaga.remuneracao}</td></tr>`;
    });
    dayIndex++;
  });
  html += `</tbody></table>`;
  vagasHTML = html;
  $('botao-imprimir-vagas').style.display = 'inline';
  salvarDadosPersistentes();
  salvarArquivosTemporarios();
}

function atualizarRespCal(a, funcao, r, d) {
  let vinculoDia = vinculos[a].find(v => v.funcao === funcao && v.dia === d);
  if (!vinculoDia) {
    const geral = vinculos[a].find(v => v.funcao === funcao && !v.hasOwnProperty('dia'));
    if (geral) { vinculoDia = { ...geral, dia: d }; vinculos[a].push(vinculoDia); }
    else return;
  }
  if (vinculoDia.bloqueada) {
    openWarningModal("Edição bloqueada para esta função.");
    const sel = $(`responsavel-${d}-${a}-${funcao}`);
    if (sel) sel.value = vinculoDia.responsavel === "Indeterminado" ? "" : vinculoDia.responsavel;
    return;
  }
  const dt = new Date(parseInt($('ano').value), parseInt($('mes').value) - 1, d);
  const prev = vinculoDia.responsavel;
  if (r) {
    const conflitoMesmoDia = vinculos[a].find(v => v.dia === d && v.funcao !== funcao && v.responsavel === r);
    if (conflitoMesmoDia && !isResponsavelAfastado(r, dt)) {
      openModal(`O responsável ${r} já está atribuído em outra função neste mesmo dia. Deseja continuar?`,
        () => {
          vinculoDia.responsavel = r || 'Indeterminado';
          atualizarCusto(d, a, funcao); // já chama gerarResumoResponsaveis, gerarVagasDisponiveis, gerarEscala internamente
          gerarCalendario(true); // atualiza alertas de cor do responsável no calendário
          salvarDadosPersistentes();
        },
        () => {
          vinculoDia.responsavel = prev;
          const sel = $(`responsavel-${d}-${a}-${funcao}`);
          if (sel) sel.value = prev === "Indeterminado" ? "" : prev;
        }
      );
      return;
    }
  }
  vinculoDia.responsavel = r || 'Indeterminado';
  atualizarCusto(d, a, funcao); // já chama gerarResumoResponsaveis, gerarVagasDisponiveis, gerarEscala internamente
  gerarCalendario(true); // atualiza alertas de cor do responsável no calendário
  salvarDadosPersistentes();
}
function atualizarCusto(d, a, funcao) {
  let vinculoDia = vinculos[a].find(v => v.funcao === funcao && v.dia === d);
  if (vinculoDia && vinculoDia.bloqueada) {
    openWarningModal("Edição bloqueada para esta função.");
    return;
  }
  const hi = `hora-inicio-${d}-${a}-${funcao}`,
    hf = `hora-fim-${d}-${a}-${funcao}`,
    c = `custo-${d}-${a}-${funcao}`,
    rm = `remuneracao-${d}-${a}-${funcao}`,
    hI = parseInt($(hi)?.value) || 0,
    hF = parseInt($(hf)?.value) || 0,
    r = $(rm)?.value,
    dt = new Date(parseInt($('ano').value), parseInt($('mes').value) - 1, d);
  if (!vinculoDia) {
    const geral = vinculos[a].find(v => v.funcao === funcao && !v.hasOwnProperty('dia'));
    if (geral) { vinculoDia = { ...geral, dia: d }; vinculos[a].push(vinculoDia); }
  }
  if (vinculoDia) {
    vinculoDia.horaInicio = hI;
    vinculoDia.horaFim = hF;
    vinculoDia.remuneracao = r;
  }
  // ✅ Inclui "..." como isento
  const val = r !== 'Extra não remunerado' && r !== 'Normal' && r !== '...' && r !== 'Troca com a SOP' ? calcularCusto(dt, hI, hF) : 0;
  $(c).textContent = `R$ ${formatarMoeda(val)}`;
  recalcularTotalDiario(d, a);
  recalcularTotalMensal();
  gerarResumoResponsaveis();
  gerarVagasDisponiveis();
  gerarEscala();
  salvarDadosPersistentes();
}
function recalcularTotalDiario(d, a) {
  let total = 0, m = parseInt($('mes').value), an = parseInt($('ano').value);
  vinculos[a].forEach(it => {
    if (it.dia === d) {
      const hi = `hora-inicio-${d}-${a}-${it.funcao}`,
        hf = `hora-fim-${d}-${a}-${it.funcao}`,
        rm = `remuneracao-${d}-${a}-${it.funcao}`;
      const iH = $(hi), fH = $(hf), sR = $(rm);
      if (!iH || !fH || !sR) return;
      const hI = parseInt(iH.value) || 0, hF = parseInt(fH.value) || 0, rr = sR.value;
      // ✅ Inclui "..." como isento
      if (rr !== 'Extra não remunerado' && rr !== 'Normal' && rr !== '...' && rr !== 'Troca com a SOP') {
        total += calcularCusto(new Date(an, m - 1, d), hI, hF);
      }
    }
  });
  const cell = $(`total-diario-${d}`);
  if (cell) cell.textContent = "R$ " + formatarMoeda(total);
}
function recalcularTotalMensal() {
  const totalMensalEl = $('total-mensal');
  if (!totalMensalEl) return; // calendário ainda não gerado
  const ano = parseInt($('ano').value);
  const mes = parseInt($('mes').value);
  if (!ano || !mes) return;
  const totalDias = new Date(ano, mes, 0).getDate();
  if (!totalDias || isNaN(totalDias)) return;
  const t = Array.from({ length: totalDias }, (_, d) => {
    const el = $(`total-diario-${d + 1}`);
    if (!el) return 0;
    const txt = el.textContent || '0';
    return parseFloat(txt.replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  }).reduce((sum, v) => sum + v, 0);
  totalMensalEl.innerHTML = `<strong>R$ ${formatarMoeda(t)}</strong>`;
}
function adicionarFuncaoNoCalendario(d, a) {
  let f = $(`nova-funcao-${d}-${a}`).value.trim();
  f = f.replace(/\\/g, '|'); // ✅ Intencional: previne quebra de onclick ao gerar HTML
  if (!f) return;
  if (exclusoesDiarias[a] && exclusoesDiarias[a][d] && exclusoesDiarias[a][d].includes(f)) {
    exclusoesDiarias[a][d] = exclusoesDiarias[a][d].filter(func => func !== f);
    $(`nova-funcao-${d}-${a}`).value = '';
    if (calendarioGerado) gerarCalendario(true);
    salvarDadosPersistentes();
    return;
  }
  if (vinculos[a].find(v => v.funcao === f && !v.hasOwnProperty('dia')) ||
    vinculos[a].some(func => func.funcao === f && func.dia === d)) {
    $(`nova-funcao-${d}-${a}`).value = '';
    openWarningModal(`Não é possível adicionar. A função "${f}" já existe no dia ${d}.`);
    return;
  }
  const funcoesNoDia = vinculos[a].filter(v => v.dia === d);
  const maxOrdem = Math.max(...funcoesNoDia.map(v => v.hasOwnProperty('ordemOriginal') ? v.ordemOriginal : -1), -1);
  const novaFuncao = {
    funcao: f, responsavel: 'Indeterminado', dia: d, horaInicio: 8, horaFim: 8, horaFimEscala: 8,
    remuneracao: 'AC4', ordemOriginal: maxOrdem + 1
  };
  vinculos[a].push(novaFuncao);
  $(`nova-funcao-${d}-${a}`).value = '';
  if (calendarioGerado) {
    const funcoesOrdenadas = vinculos[a]
      .filter(v => v.dia === d)
      .sort((a, b) => {
        const ordemA = a.hasOwnProperty('ordemOriginal') ? a.ordemOriginal : 9999;
        const ordemB = b.hasOwnProperty('ordemOriginal') ? b.ordemOriginal : 9999;
        return ordemA - ordemB;
      });
    funcoesOrdenadas.forEach((func, index) => { func.ordemOriginal = index; });
    gerarCalendario(true);
  }
  salvarDadosPersistentes();
}
function removerFuncaoCalendario(a, funcao, d) {
  const geral = vinculos[a].find(v => v.funcao === funcao && !v.hasOwnProperty('dia'));
  if (geral) {
    openModal(`A função "${funcao}" está presente no vínculo geral da Ala ${a}. Deseja mesmo removê-la para o dia ${d}?`,
      () => {
        registrarExclusao(a, funcao, d);
        vinculos[a] = vinculos[a].filter(v => !(v.funcao === funcao && v.dia === d));
        salvarDadosPersistentes();
        if (calendarioGerado) gerarCalendario(true);
      },
      () => { }
    );
  } else {
    vinculos[a] = vinculos[a].filter(v => !(v.funcao === funcao && v.dia === d));
    salvarDadosPersistentes();
    if (calendarioGerado) gerarCalendario(true);
  }
}
function registrarExclusao(a, funcao, d) {
  exclusoesDiarias[a] = exclusoesDiarias[a] || {};
  exclusoesDiarias[a][d] = exclusoesDiarias[a][d] || [];
  if (!exclusoesDiarias[a][d].includes(funcao)) exclusoesDiarias[a][d].push(funcao);
}
function isResponsavelAfastado(r, d) {
  const dataVerificar = normalizarData(d);
  return afastamentos.some(af => {
    const di = normalizarData(af.inicio);
    const df = normalizarData(af.fim);
    return af.responsavel === r && compararDatas(dataVerificar, di) >= 0 && compararDatas(dataVerificar, df) <= 0;
  });
}
function dentroDoPeriodo(data, inicioISO, fimISO) {
  const dataVerificar = normalizarData(data);
  const di = normalizarData(inicioISO);
  const df = normalizarData(fimISO);
  return compararDatas(dataVerificar, di) >= 0 && compararDatas(dataVerificar, df) <= 0;
}
function calcularFimAfastamento() {
  const inicio = $('afastamento-inicio').value;
  const diasVal = $('afastamento-dias').value;
  const dias = parseInt(diasVal, 10);

  // Se o campo dias estiver vazio, não faz nada no fim
  if (!diasVal || isNaN(dias) || dias < 1) return;

  if (!inicio) return;

  const dataInicio = normalizarData(inicio);
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + dias - 1);
  const ano = dataFim.getFullYear();
  const mes = String(dataFim.getMonth() + 1).padStart(2, '0');
  const dia = String(dataFim.getDate()).padStart(2, '0');
  $('afastamento-fim').value = `${ano}-${mes}-${dia}`;
}

function onFimAfastamentoEditado() {
  const inicio = $('afastamento-inicio').value;
  const fim = $('afastamento-fim').value;
  const diasVal = $('afastamento-dias').value;
  if (!diasVal) return; // campo dias já vazio, nada a fazer

  // Recalcula quantos dias seriam e compara com o campo
  if (inicio && fim) {
    const di = normalizarData(inicio);
    const df = normalizarData(fim);
    const diffMs = df - di;
    const diffDias = Math.round(diffMs / 86400000) + 1; // conta o dia de início
    const diasAtual = parseInt(diasVal, 10);
    if (isNaN(diasAtual) || diffDias !== diasAtual) {
      $('afastamento-dias').value = '';
    }
  } else {
    $('afastamento-dias').value = '';
  }
}

function adicionarAfastamento() {
  const r = $('afastamento-responsavel').value,
    i = $('afastamento-inicio').value,
    f = $('afastamento-fim').value;
  if (!r || !i || !f) return;
  const dataInicio = normalizarData(i);
  const dataFim = normalizarData(f);
  if (compararDatas(dataInicio, dataFim) > 0) return;
  const ano = parseInt($('ano').value, 10), mes = parseInt($('mes').value, 10);
  let temFuncoesAfetadas = false;
  alas.forEach(ala => {
    vinculos[ala].forEach(v => {
      if (v.responsavel === r && v.hasOwnProperty('dia')) {
        const dtVinculo = new Date(ano, mes - 1, v.dia);
        if (dentroDoPeriodo(dtVinculo, i, f)) temFuncoesAfetadas = true;
      }
    });
  });
  const aplicarAfastamento = () => {
    afastamentos.push({ responsavel: r, inicio: i, fim: f });
    alas.forEach(ala => {
      vinculos[ala] = vinculos[ala].map(v => {
        if (v.hasOwnProperty('dia')) {
          const dtVinculo = new Date(ano, mes - 1, v.dia);
          if (v.responsavel === r && dentroDoPeriodo(dtVinculo, i, f)) {
            v.responsavel = 'Indeterminado';
            v.remuneracao = 'AC4';
            v.horaInicio = 8;
            v.horaFim = 8;
          }
        }
        return v;
      });
    });
    exibirAfastamentos();
    if (calendarioGerado) {
      gerarCalendario(true);
    }
    salvarDadosPersistentes();
  };
  if (temFuncoesAfetadas && calendarioGerado) {
    openModal(`As funções atribuídas a ${r} entre ${formatarData(i)} e ${formatarData(f)} serão ajustadas. Deseja continuar?`, aplicarAfastamento);
  } else {
    aplicarAfastamento();
  }
}
function exibirAfastamentos() {
  $('afastamentos').innerHTML = afastamentos
    .map((af, idx) => `<div><strong>Responsável:</strong> ${af.responsavel} | <strong>Início:</strong> ${formatarData(af.inicio)} | <strong>Fim:</strong> ${formatarData(af.fim)} | <button onclick="removerAfastamento(${idx})">Remover</button></div>`)
    .join('');
  atualizarSelectResponsaveis();
}
function removerAfastamento(idx) {
  const afastamentoRemovido = afastamentos[idx];
  afastamentos.splice(idx, 1);
  exibirAfastamentos();
  const responsavelAfast = afastamentoRemovido.responsavel,
    ano = parseInt($('ano').value, 10),
    mes = parseInt($('mes').value, 10);
  alas.forEach(ala => {
    vinculos[ala] = vinculos[ala].filter(v => {
      if (!v.geradoAutomaticamente || v.bloqueada) return true; // preserva manuais e bloqueados
      if (v.originalResponsavel !== responsavelAfast) return true;
      const dtVinculo = new Date(ano, mes - 1, v.dia);
      const eraDestePeriodo = dentroDoPeriodo(dtVinculo, afastamentoRemovido.inicio, afastamentoRemovido.fim);
      if (!eraDestePeriodo) return true;
      const aindaTemOutro = afastamentos.some(af =>
        af.responsavel === responsavelAfast && dentroDoPeriodo(dtVinculo, af.inicio, af.fim)
      );
      return aindaTemOutro;
    });
  });
  if (calendarioGerado) {
    gerarCalendario(true);
  }
  salvarDadosPersistentes();
}
function formatarData(dt) {
  const [a, m, d] = dt.split('-');
  return `${d}-${m}-${a}`;
}
function gerarResumoResponsaveis() {
  const t = document.querySelector('#calendario table');
  if (!t) return;
  const m = parseInt($('mes').value, 10);
  const a = parseInt($('ano').value, 10);
  const totalDias = new Date(a, m, 0).getDate();
  let inicioFiltro = parseInt($('inicioEscala').value, 10) || 1;
  let fimFiltro = parseInt($('fimDaEscala').value, 10) || totalDias;
  inicioFiltro = Math.max(1, Math.min(inicioFiltro, totalDias));
  fimFiltro = Math.max(1, Math.min(fimFiltro, totalDias));
  if (fimFiltro < inicioFiltro) fimFiltro = inicioFiltro;
  const rs = {};
  t.querySelectorAll('tbody tr').forEach(r => {
    if (r.querySelector('#total-mensal')) return;
    const cols = r.querySelectorAll('td');
    if (!cols[0]) return;
    const _spanData2 = cols[0].querySelector('.data-dia');
    const [dia, mes, ano] = (_spanData2 ? _spanData2.textContent : cols[0].textContent).split('/').map(Number);
    if (isNaN(dia) || dia < inicioFiltro || dia > fimFiltro) return;
    if (!cols[2]) return; // linha do total mensal
    const data = new Date(ano, mes - 1, dia);
    const weekday = data.toLocaleDateString('pt-BR', { weekday: 'long' }).toLowerCase();
    cols[2].querySelectorAll('div[id^="funcao-"]').forEach(div => {
      const funcaoElement = div.querySelector('.linha-funcao strong');
      if (!funcaoElement) return;
      const funcao = funcaoElement.textContent.replace(':', '').trim();
      const ala = r.querySelector('td:nth-child(2)').textContent.trim();
      if (exclusoesDiarias[ala] && exclusoesDiarias[ala][dia] &&
        exclusoesDiarias[ala][dia].includes(funcao)) return;
      const sel = div.querySelector('select[data-role="responsavel-calendario"]');
      const remuSel = div.querySelector('select[id^="remuneracao-"]');
      const hiInput = div.querySelector('input[id^="hora-inicio-"]');
      const hfInput = div.querySelector('input[id^="hora-fim-"]');
      const custoSpan = div.querySelector('span[id^="custo-"]');
      const resp = sel.value;
      if (!resp) return;
      const remu = remuSel.value;
      // ✅ "..." é tratado como Normal → não entra no resumo
      if (remu === 'Normal' || remu === '...' || remu === 'Troca com a SOP') return;
      const hi = parseInt(hiInput.value, 10) || 0;
      const hf = parseInt(hfInput.value, 10) || 0;
      const horasTrabalhadas = hi === hf ? 24 : hf > hi ? hf - hi : 24 - hi + hf;
      const custo = parseFloat(custoSpan.textContent.replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
      if (!rs[resp]) {
        rs[resp] = {
          gastoAC4: 0, gastoAC42: 0, gastoExtra: 0,
          gastoTotal: 0, horasAC4: 0, horasAC42: 0,
          horasExtra: 0, horasTotal: 0,
          trabalhos: { segunda: 0, terca: 0, quarta: 0, quinta: 0, sexta: 0, sabado: 0, domingo: 0 }
        };
      }
      if (remu === 'AC4' || remu === 'AC4 - Regência') {
        rs[resp].gastoAC4 += custo;
        rs[resp].horasAC4 += horasTrabalhadas;
      } else if (remu === 'AC4-2') {
        rs[resp].gastoAC42 += custo;
        rs[resp].horasAC42 += horasTrabalhadas;
      } else if (remu === 'Extra não remunerado') {
        rs[resp].horasExtra += horasTrabalhadas;
      }
      rs[resp].gastoTotal += custo;
      rs[resp].horasTotal += horasTrabalhadas;
      const diaSemana = weekday.includes('segunda') ? 'segunda'
        : weekday.includes('terça') ? 'terca'
          : weekday.includes('quarta') ? 'quarta'
            : weekday.includes('quinta') ? 'quinta'
              : weekday.includes('sexta') ? 'sexta'
                : weekday.includes('sábado') ? 'sabado'
                  : 'domingo';
      rs[resp].trabalhos[diaSemana] += horasTrabalhadas;
    });
  });
  const ordenados = Object.keys(rs).sort((a, b) => responsaveis.indexOf(a) - responsaveis.indexOf(b));
  let rowIndex = 0;
  let html = `<table><thead><tr>
<th>Responsável</th><th>Gasto AC4 (R$)</th><th>Gasto AC4-2 (R$)</th><th>Gasto Total (R$)</th>
<th>Total Horas Extras</th><th>Horas por Dia da Semana</th></tr></thead><tbody>`;
  ordenados.forEach(r => {
    const d = rs[r];
    const bgColor = rowIndex % 2 === 0 ? '#f9f9f9' : '#ffffff';
    const txtDias = `Seg: ${d.trabalhos.segunda}h, Ter: ${d.trabalhos.terca}h, Qua: ${d.trabalhos.quarta}h, ` +
      `Qui: ${d.trabalhos.quinta}h, Sex: ${d.trabalhos.sexta}h, Sáb: ${d.trabalhos.sabado}h, Dom: ${d.trabalhos.domingo}h`;
    html += `<tr style="background-color:${bgColor}">
<td>${r}</td><td>${formatarMoeda(d.gastoAC4)}</td><td>${formatarMoeda(d.gastoAC42)}</td>
<td>${formatarMoeda(d.gastoTotal)}</td><td>${d.horasTotal}h</td><td>${txtDias}</td></tr>`;
    rowIndex++;
  });
  html += `</tbody></table>`;
  resumoHTML = html;
  $('botao-imprimir-resumo').style.display = 'inline';
  salvarDadosPersistentes();
  salvarArquivosTemporarios();
}

function gerarEscala() {
  if (!calendarioGerado) return;
  const m = parseInt($('mes').value, 10);
  const a = parseInt($('ano').value, 10);
  let s = parseInt($('inicioEscala').value, 10) || 1;
  let f = parseInt($('fimDaEscala').value, 10) || 0;
  const dMax = new Date(a, m, 0).getDate();
  // Se fimDaEscala estiver vazio, usa o último dia do mês (não 0)
  if (!f) f = dMax;
  s = Math.max(1, Math.min(s, dMax));
  f = Math.max(1, Math.min(f, dMax));
  if (f < s) f = s;

  const dayData = {};
  for (let dia = s; dia <= f; dia++) {
    const dt = new Date(a, m - 1, dia);
    const idx = ((Math.floor((dt - new Date(2024, 2, 21)) / 86400000)) % alas.length + alas.length) % alas.length;
    const ala = alas[idx];
    const lines = [];
    const funcoesDoDia = vinculos[ala].filter(v => v.dia === dia);
    funcoesDoDia.sort((a, b) => {
      const ordemA = a.hasOwnProperty('ordemOriginal') ? a.ordemOriginal :
        (a.hasOwnProperty('ordem') ? a.ordem : funcoes.indexOf(a.funcao));
      const ordemB = b.hasOwnProperty('ordemOriginal') ? b.ordemOriginal :
        (b.hasOwnProperty('ordem') ? b.ordem : funcoes.indexOf(b.funcao));
      return ordemA - ordemB;
    });
    funcoesDoDia.forEach(v => {
      if (v.responsavel && v.responsavel !== 'Indeterminado') {
        if (v.ocultar) return;
        if (exclusoesDiarias[ala] && exclusoesDiarias[ala][dia] &&
          exclusoesDiarias[ala][dia].includes(v.funcao) && v.geradoAutomaticamente) return;

        const hI = v.horaInicio ?? 8;
        // Usa horaFimEscala SOMENTE no último dia do período da escala (dia === f)
        const hF = (dia === f && v.hasOwnProperty('horaFimEscala'))
          ? v.horaFimEscala
          : (v.horaFim ?? 8);

        lines.push({ funcao: v.funcao, responsavel: v.responsavel, tipo: v.remuneracao, horaInicio: hI, horaFim: hF });
      }
    });
    if (lines.length) dayData[dia] = { dia, ala, lines };
  }

  let html = `<table border="1" style="border-collapse:collapse;"><thead><tr>` +
    `<th>Dia</th><th>Ala</th><th>Função</th><th>Responsável</th><th>Tipo</th><th>Horário</th></tr></thead><tbody>`;
  let dayIndex = 0;
  for (let dia = s; dia <= f; dia++) {
    const info = dayData[dia];
    if (!info) { dayIndex++; continue; }
    const bgColor = dayIndex % 2 === 0 ? '#f9f9f9' : '#ffffff';
    const rSpan = info.lines.length;
    info.lines.forEach((ln, i) => {
      html += `<tr style="background-color:${bgColor};">`;
      if (i === 0) html += `<td rowspan="${rSpan}">${dia}/${m}/${a}</td><td rowspan="${rSpan}">${info.ala}</td>`;
      
      // ✅ Garante que 0 vire "00"
      const hI = String(Math.max(0, Math.min(23, parseInt(ln.horaInicio) || 0))).padStart(2, '0');
      const hF = String(Math.max(0, Math.min(23, parseInt(ln.horaFim) || 0))).padStart(2, '0');
      
      html += `<td>${ln.funcao}</td><td>${ln.responsavel}</td><td>${ln.tipo}</td><td>${hI}h às ${hF}h</td></tr>`;
    });
    dayIndex++;
  }
  html += `</tbody></table>`;
  escalaHTML = html;
  $('botao-imprimir-escala').style.display = 'inline';
  salvarArquivosTemporarios();
  buildEscalaAC4HTML();
  salvarDadosPersistentes();
}

function buildEscalaAC4HTML() {
  if (!calendarioGerado) return;
  const m = parseInt($('mes').value, 10);
  const a = parseInt($('ano').value, 10);
  let s = parseInt($('inicioEscala').value, 10) || 1;
  let f = parseInt($('fimDaEscala').value, 10) || 0;
  const dMax = new Date(a, m, 0).getDate();
  // Se fimDaEscala estiver vazio, usa o último dia do mês (não 0)
  if (!f) f = dMax;
  s = Math.max(1, Math.min(s, dMax));
  f = Math.max(1, Math.min(f, dMax));
  if (f < s) f = s;
  let dayIndex = 0, valorTotal = 0;
  let html = `<table border="1" style="border-collapse:collapse;">
<thead><tr><th>RG</th><th>Responsável</th><th>Dia Início</th><th>Dia Fim</th>
<th>Horário Início</th><th>Horário Fim</th><th>Função</th><th>Valor</th></tr></thead><tbody>`;
  for (let dia = s; dia <= f; dia++) {
    const dt = new Date(a, m - 1, dia);
    const idx = ((Math.floor((dt - new Date(2024, 2, 21)) / 86400000)) % alas.length + alas.length) % alas.length;
    const ala = alas[idx];
    let linhasAC4 = [];
    const funcoesDoDia = vinculos[ala].filter(v => v.dia === dia);
    funcoesDoDia.sort((a, b) => {
      const ordemA = a.hasOwnProperty('ordemOriginal') ? a.ordemOriginal :
        (a.hasOwnProperty('ordem') ? a.ordem : funcoes.indexOf(a.funcao));
      const ordemB = b.hasOwnProperty('ordemOriginal') ? b.ordemOriginal :
        (b.hasOwnProperty('ordem') ? b.ordem : funcoes.indexOf(b.funcao));
      return ordemA - ordemB;
    });
    funcoesDoDia.forEach(v => {
      if (v.responsavel && v.responsavel !== 'Indeterminado') {
        if (exclusoesDiarias[ala] && exclusoesDiarias[ala][dia] &&
          exclusoesDiarias[ala][dia].includes(v.funcao) && v.geradoAutomaticamente) return;
        // ✅ Inclui "AC4 - Regência" como AC4
        if (v.remuneracao === 'AC4' || v.remuneracao === 'AC4-2' || v.remuneracao === 'AC4 - Regência') {
          const hI = v.horaInicio ?? 8;
          const hF = v.horaFim ?? 8; // ✅ Intencional: escala AC4 usa sempre horaFim (não horaFimEscala)
          const valor = calcularCusto(dt, hI, hF);
          linhasAC4.push({ dt, func: v.funcao, resp: v.responsavel, hI, hF, valor });
          valorTotal += valor;
        }
      }
    });
    if (linhasAC4.length) {
      const bgColor = dayIndex % 2 === 0 ? '#f9f9f9' : '#ffffff';
      linhasAC4.forEach((ln, i) => {
        const dtIni = ln.dt;
        const dtFim = new Date(dtIni);
        if (ln.hF <= ln.hI) dtFim.setDate(dtFim.getDate() + 1);
        const diaIniStr = `${String(dtIni.getDate()).padStart(2,'0')}/${String(dtIni.getMonth()+1).padStart(2,'0')}/${dtIni.getFullYear()}`;
        const diaFimStr = `${String(dtFim.getDate()).padStart(2,'0')}/${String(dtFim.getMonth()+1).padStart(2,'0')}/${dtFim.getFullYear()}`;
        const hIstr = String(ln.hI).padStart(2,'0') + ':00:00';
        const hFstr = String(ln.hF).padStart(2,'0') + ':00:00';
        const match = ln.resp.match(/(\d{1,2}\.\d{3}|\d{4,5})/);
        const rg = match ? match[1] : '';
        html += `<tr style="background-color:${bgColor}">
<td>${rg}</td><td>${ln.resp}</td><td>${diaIniStr}</td><td>${diaFimStr}</td>
<td>${hIstr}</td><td>${hFstr}</td><td>${ln.func}</td><td>R$ ${formatarMoeda(ln.valor)}</td></tr>`;
      });
      dayIndex++;
    }
  }
  html += `<tr><td colspan="7" style="text-align:right;"><strong>Total:</strong></td>
<td><strong>R$ ${formatarMoeda(valorTotal)}</strong></td></tr></tbody></table>`;
  escalaAC4HTML = html;
  $('botao-imprimir-escala-ac4').style.display = 'inline';
  salvarDadosPersistentes();
}


function calcularCusto(data, hIni, hFim) {
  // ✅ Intencional: quando hFim <= hIni (incluindo hFim === hIni), representa plantão de 24h.
  // Ex: início 8h fim 8h = 24h de trabalho. É o comportamento esperado para escalas de plantão.
  let total = 0, d1 = new Date(data), d2 = new Date(d1);
  if (hFim <= hIni) d2.setDate(d2.getDate() + 1);
  function getTaxa(d, h) {
    const diaSemana = d.getDay(),
      verm = (diaSemana === 5 && h >= 5) || diaSemana === 6 || diaSemana === 0 || (diaSemana === 1 && h < 5),
      periodo = h >= 22 || h < 5 ? 'noturno' : 'diurno';
    return verm ? taxas.vermelha[periodo] : taxas.azul[periodo];
  }
  const horas = hFim > hIni
    ? Array.from({ length: hFim - hIni }, (_, h) => ({ d: d1, h: h + hIni }))
    : [...Array(24 - hIni).keys()].map(h => ({ d: d1, h: h + hIni })).concat([...Array(hFim).keys()].map(h => ({ d: d2, h })));
  horas.forEach(e => total += getTaxa(e.d, e.h));
  return total;
}

// ============================================================
// SELETOR COM PESQUISA (CustomSelect)
// Substitui <select data-role="responsavel-*"> por um widget
// de input com dropdown filtrável.
// ============================================================

// Fecha todos os dropdowns abertos ao clicar fora
document.addEventListener('click', function(e) {
  if (!e.target.closest('.cs-wrapper')) {
    document.querySelectorAll('.cs-dropdown.cs-open').forEach(d => d.classList.remove('cs-open'));
  }
});

/**
 * Converte um <select data-role="responsavel-*"> em CustomSelect.
 * Preserva o <select> original oculto para compatibilidade com o
 * código existente (onchange, value, etc.).
 */
function ativarCustomSelect(sel) {
  if (sel._csAtivado) return;
  sel._csAtivado = true;
  sel.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'cs-wrapper';
  sel.parentNode.insertBefore(wrapper, sel);
  wrapper.appendChild(sel);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cs-input';
  input.placeholder = 'Pesquisar responsável...';
  if (sel.disabled) { input.disabled = true; input.classList.add('input-disabled'); }

  const dropdown = document.createElement('div');
  dropdown.className = 'cs-dropdown';

  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);

  // Sincroniza o texto do input com o valor atual do select
  function sincronizarInput() {
    const opt = sel.options[sel.selectedIndex];
    input.value = (opt && opt.value) ? opt.text : '';
  }
  sincronizarInput();

  function renderOpcoes(filtro) {
    filtro = (filtro || '').toLowerCase();
    dropdown.innerHTML = '';

    // Opção "limpar"
    const limpar = document.createElement('div');
    limpar.className = 'cs-option cs-option-clear';
    limpar.textContent = '— Nenhum —';
    limpar.addEventListener('mousedown', e => {
      e.preventDefault();
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = '';
      dropdown.classList.remove('cs-open');
    });
    dropdown.appendChild(limpar);

    let count = 0;
    Array.from(sel.options).forEach(opt => {
      if (!opt.value) return; // pula o placeholder
      if (filtro && !opt.text.toLowerCase().includes(filtro)) return;
      count++;
      const div = document.createElement('div');
      div.className = 'cs-option';
      if (opt.value === sel.value) div.classList.add('cs-selected');

      // Destaque do trecho encontrado
      if (filtro) {
        const idx = opt.text.toLowerCase().indexOf(filtro);
        div.innerHTML =
          _esc(opt.text.slice(0, idx)) +
          '<mark>' + _esc(opt.text.slice(idx, idx + filtro.length)) + '</mark>' +
          _esc(opt.text.slice(idx + filtro.length));
      } else {
        div.textContent = opt.text;
      }

      div.addEventListener('mousedown', e => {
        e.preventDefault();
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        input.value = opt.text;
        dropdown.classList.remove('cs-open');
      });
      dropdown.appendChild(div);
    });

    if (count === 0 && filtro) {
      const vazio = document.createElement('div');
      vazio.className = 'cs-option cs-empty';
      vazio.textContent = 'Nenhum resultado para "' + filtro + '"';
      dropdown.appendChild(vazio);
    }
  }

  input.addEventListener('focus', () => {
    // Fecha outros abertos
    document.querySelectorAll('.cs-dropdown.cs-open').forEach(d => {
      if (d !== dropdown) d.classList.remove('cs-open');
    });
    renderOpcoes(input.value === (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].value ? sel.options[sel.selectedIndex].text : '') ? '' : input.value);
    dropdown.classList.add('cs-open');
  });

  input.addEventListener('input', () => {
    renderOpcoes(input.value);
    dropdown.classList.add('cs-open');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropdown.classList.remove('cs-open'); input.blur(); }
    if (e.key === 'Enter') {
      const first = dropdown.querySelector('.cs-option:not(.cs-option-clear):not(.cs-empty)');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
    }
  });

  // Quando o <select> muda externamente, sincroniza o input
  sel.addEventListener('change', sincronizarInput);

  // Observa mudanças no disabled
  const obs = new MutationObserver(() => {
    input.disabled = sel.disabled;
    input.classList.toggle('input-disabled', sel.disabled);
  });
  obs.observe(sel, { attributes: true, attributeFilter: ['disabled'] });

  // Guarda referência para resinc externa
  sel._csSync = sincronizarInput;
}

function _esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/**
 * Reativa todos os selects de responsável na página.
 * Chamada após gerarCalendario, exibirVinculos, etc.
 */
function ativarTodosCustomSelects() {
  document.querySelectorAll(
    'select[data-role="responsavel-vinculo"], select[data-role="responsavel-calendario"], #afastamento-responsavel'
  ).forEach(sel => ativarCustomSelect(sel));
}

// ── Monkey-patch em atualizarSelectResponsaveis para reativar após rebuild ──
const _origAtualizarSelectResponsaveis = atualizarSelectResponsaveis;
atualizarSelectResponsaveis = function() {
  _origAtualizarSelectResponsaveis.apply(this, arguments);
  // Após rebuild do innerHTML, reativa e sincroniza
  setTimeout(() => {
    document.querySelectorAll(
      'select[data-role="responsavel-vinculo"], select[data-role="responsavel-calendario"], #afastamento-responsavel'
    ).forEach(sel => {
      if (sel._csAtivado && sel._csSync) sel._csSync();
      else ativarCustomSelect(sel);
    });
  }, 0);
};

// Ativa após DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(ativarTodosCustomSelects, 300);
});
