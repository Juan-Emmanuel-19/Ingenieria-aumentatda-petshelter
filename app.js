// ---- Helpers ----------------------------------------------------------------
function genReqId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'REQ-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function nowTime() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- State ------------------------------------------------------------------
let currentReqId = genReqId();
document.getElementById('req-id-display').textContent = currentReqId;

document.getElementById('btn-new-id').addEventListener('click', () => {
  currentReqId = genReqId();
  document.getElementById('req-id-display').textContent = currentReqId;
});

// ---- Log stream helpers -----------------------------------------------------
const logEl = document.getElementById('log-stream');

function clearLog() { logEl.innerHTML = ''; }

function appendLog(level, msg, fields) {
  const colors = { info: 'log-level-info', warn: 'log-level-warn', error: 'log-level-error' };
  let fieldsHtml = '';
  if (fields) {
    Object.entries(fields).forEach(([k, v]) => {
      fieldsHtml += ` <span class="log-key">${k}</span>=<span class="log-val">"${v}"</span>`;
    });
  }
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML =
    `<span class="log-time">${nowTime()}</span>` +
    `<span class="${colors[level] || 'log-level-info'}">[${level.toUpperCase()}]</span>` +
    `<span class="log-msg">${msg}${fieldsHtml}</span>`;
  logEl.appendChild(line);
}

// ---- Result renderer --------------------------------------------------------
const resultEl = document.getElementById('result-card');

function showResult(data) {
  const approved = data.aprobado;
  const cls = approved ? 'approved' : 'rejected';
  const estado = approved ? 'EN_REVISIÓN' : 'RECHAZADO';

  const gridCells = `
    <div class="result-cell">
      <div class="rc-label">Adoptante</div>
      <div class="rc-value">${data.nombre || '—'}</div>
    </div>
    <div class="result-cell">
      <div class="rc-label">Edad</div>
      <div class="rc-value">${data.edad} años</div>
    </div>
    <div class="result-cell">
      <div class="rc-label">Historial maltrato</div>
      <div class="rc-value">${data.maltrato ? 'Sí ⚠' : 'No ✓'}</div>
    </div>
    <div class="result-cell">
      <div class="rc-label">Request ID</div>
      <div class="rc-value" style="font-family:'DM Mono',monospace;font-size:.78rem">${data.reqId}</div>
    </div>
  `;

  const messageBlock = approved
    ? `<div class="result-success-msg">
        <span class="icon-ok">✓</span>
        <p>El adoptante cumple todos los requisitos. La solicitud ha sido enviada al equipo de revisión para su evaluación presencial.</p>
       </div>`
    : `<div class="result-reason">
        <span class="icon-warn">⚠</span>
        <p><strong>Motivo del rechazo:</strong> ${data.motivo}</p>
       </div>`;

  resultEl.className = `result-card ${cls}`;
  resultEl.innerHTML = `
    <div class="result-header">
      <span class="status-badge ${cls}">
        <span class="status-dot"></span>${estado}
      </span>
    </div>
    <div class="result-title ${cls}">${approved ? 'Solicitud aprobada preliminarmente' : 'Solicitud rechazada'}</div>
    <div class="result-meta">Actualización en BD completada · estado → <code style="font-family:'DM Mono',monospace;font-size:.72rem">${estado}</code></div>
    <div class="result-grid">${gridCells}</div>
    ${messageBlock}
  `;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => resultEl.classList.add('visible'));
  });
}

// ---- Core validation logic (mirrors AdoptionValidatorService.ts) ------------
async function adoptionValidatorService(adoptante, solicitudId) {
  if (adoptante.edad < 18) {
    return {
      aprobado: false,
      nuevoEstado: 'RECHAZADO',
      motivo: 'El adoptante es menor de edad (se requieren mínimo 18 años).'
    };
  }
  if (adoptante.tieneHistorialMaltrato) {
    return {
      aprobado: false,
      nuevoEstado: 'RECHAZADO',
      motivo: 'El adoptante presenta reportes previos de maltrato animal en el sistema.'
    };
  }
  return { aprobado: true, nuevoEstado: 'EN_REVISION' };
}

// ---- Button handler ---------------------------------------------------------
document.getElementById('btn-verify').addEventListener('click', async () => {
  const nombre  = document.getElementById('nombre').value.trim();
  const edadRaw = document.getElementById('edad').value;
  const maltrato = document.getElementById('maltrato-chk').checked;

  if (!nombre) { alert('Por favor ingresa el nombre del adoptante.'); return; }
  const edad = parseInt(edadRaw, 10);
  if (!edadRaw || isNaN(edad) || edad < 1 || edad > 120) {
    alert('Por favor ingresa una edad válida (1–120 años).'); return;
  }

  const btn     = document.getElementById('btn-verify');
  const btnLabel = document.getElementById('btn-label');
  const spinner  = document.getElementById('spinner');

  resultEl.className = 'result-card';
  resultEl.innerHTML = '';
  clearLog();
  logEl.classList.remove('visible');

  btn.disabled = true;
  btnLabel.classList.add('hidden');
  spinner.classList.add('visible');

  await sleep(300);
  logEl.classList.add('visible');

  const adoptante = { id: 'ADO-' + Math.random().toString(36).slice(2,8).toUpperCase(), nombre, edad, tieneHistorialMaltrato: maltrato };
  const solicitudId = currentReqId;

  document.getElementById('spinner-text').textContent = 'Evaluando reglas de gobernanza...';
  appendLog('info', 'Iniciando validación de solicitud', { solicitudId, adoptanteId: adoptante.id });
  await sleep(600);

  appendLog('info', 'Conectando con módulo de historial de bienestar animal...');
  await sleep(500);

  appendLog('info', 'Aplicando reglas de negocio del dominio AdoptionValidator');
  await sleep(500);

  document.getElementById('spinner-text').textContent = 'Ejecutando UPDATE seguro en BD...';

  let result;
  try {
    result = await adoptionValidatorService(adoptante, solicitudId);
  } catch (e) {
    appendLog('error', 'Fallo inesperado en AdoptionValidatorService', { error: e.message });
    spinner.classList.remove('visible');
    btnLabel.classList.remove('hidden');
    btn.disabled = false;
    return;
  }

  if (result.aprobado) {
    appendLog('info', 'Validación exitosa: adoptante cumple todos los requisitos', { solicitudId });
    await sleep(350);
    appendLog('info', 'DB UPDATE → estado=? WHERE id=?', { nuevoEstado: result.nuevoEstado, id: solicitudId });
  } else {
    appendLog('warn', 'Solicitud rechazada por regla de negocio', { solicitudId, motivo: result.motivo });
    await sleep(350);
    appendLog('info', 'DB UPDATE → estado=? WHERE id=?', { nuevoEstado: result.nuevoEstado, id: solicitudId });
  }

  await sleep(400);
  document.getElementById('spinner-text').textContent = '¡Proceso completado!';
  await sleep(350);

  spinner.classList.remove('visible');
  btnLabel.classList.remove('hidden');
  btn.disabled = false;

  showResult({
    aprobado: result.aprobado,
    nombre,
    edad,
    maltrato,
    reqId: solicitudId,
    motivo: result.motivo
  });
});
