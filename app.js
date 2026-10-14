// ============================================================
// SUPABASE CONFIGURATION & CLIENT
// ============================================================
const SUPABASE_URL = 'https://uqwnmceejfdczzyndjos.supabase.co';
const SUPABASE_KEY = 'sb_publishable__rRU2iaGwfbQ8y-ut_x2wQ_h-5yDqf6';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Local State
let currentRole = 'OPERATOR';
let currentUserEmail = 'operario1@empresa.com';
let activeDamages = [];
let allInspections = [];
let currentEditingId = null;

// ============================================================
// ROLE SWITCHING & AUTH
// ============================================================
function switchRole(role) {
  currentRole = role;
  const opBtn = document.getElementById('roleOperatorBtn');
  const adminBtn = document.getElementById('roleAdminBtn');
  const pinGroup = document.getElementById('pinGroup');
  const adminGroup = document.getElementById('adminGroup');

  if (role === 'OPERATOR') {
    opBtn.className = 'flex-1 py-2 px-3 rounded-xl font-semibold text-sm bg-blue-600 text-white shadow';
    adminBtn.className = 'flex-1 py-2 px-3 rounded-xl font-semibold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200';
    pinGroup.classList.remove('hidden');
    adminGroup.classList.add('hidden');
  } else {
    adminBtn.className = 'flex-1 py-2 px-3 rounded-xl font-semibold text-sm bg-purple-700 text-white shadow';
    opBtn.className = 'flex-1 py-2 px-3 rounded-xl font-semibold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200';
    adminGroup.classList.remove('hidden');
    pinGroup.classList.add('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const errorDiv = document.getElementById('authError');
  errorDiv.classList.add('hidden');

  if (currentRole === 'ADMIN') {
    const user = document.getElementById('adminUserInput').value.trim();
    const pass = document.getElementById('adminPassInput').value.trim();

    if ((user === 'dexter' || user === 'dexter@empresa.com') && pass === 'aritmetica.11Az') {
      currentUserEmail = 'dexter@empresa.com';
      launchApp();
    } else {
      errorDiv.innerText = 'Credenciales de Admin incorrectas. Usar usuario: dexter | Pass: aritmetica.11Az';
      errorDiv.classList.remove('hidden');
    }
  } else {
    const pin = document.getElementById('pinInput').value.trim();
    if (pin.length !== 6) {
      errorDiv.innerText = 'El PIN debe tener exactamente 6 cifras (Ej: 123456)';
      errorDiv.classList.remove('hidden');
      return;
    }

    currentUserEmail = `operario_${pin}@empresa.com`;
    launchApp();
  }
}

function launchApp() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  document.getElementById('userBadge').innerText = `${currentRole === 'ADMIN' ? 'Admin Dexter' : 'Operario'}: ${currentUserEmail}`;

  if (currentRole === 'ADMIN') {
    document.getElementById('adminPanel').classList.remove('hidden');
    renderRegisteredUsers();
  } else {
    document.getElementById('adminPanel').classList.add('hidden');
  }

  loadHistory();
}

function handleLogout() {
  document.getElementById('appSection').classList.add('hidden');
  document.getElementById('authSection').classList.remove('hidden');
}

// ============================================================
// DAMAGE CANVAS (CLICK TO ADD DAMAGE POINT)
// ============================================================
function addDamageFromClick(event) {
  const container = document.getElementById('vanCanvas');
  const rect = container.getBoundingClientRect();
  const relX = ((event.clientX - rect.left) / rect.width).toFixed(3);
  const relY = ((event.clientY - rect.top) / rect.height).toFixed(3);

  const selectedType = document.querySelector('input[name="damageType"]:checked').value;

  activeDamages.push({
    x: parseFloat(relX),
    y: parseFloat(relY),
    type: selectedType
  });

  renderDamagePoints();
}

function renderDamagePoints() {
  const container = document.getElementById('vanCanvas');
  container.querySelectorAll('.damage-marker').forEach(m => m.remove());

  activeDamages.forEach((d, idx) => {
    const marker = document.createElement('div');
    marker.className = 'damage-marker';
    marker.innerText = idx + 1;

    let color = '#FB8C00'; // Abollado - Naranja
    if (d.type === 'RASCADO') color = '#FDD835'; // Rascado - Amarillo
    if (d.type === 'GOLPEADO') color = '#E53935'; // Golpeado - Rojo

    marker.style.backgroundColor = color;
    if (d.type === 'RASCADO') marker.style.color = 'black';
    marker.style.left = `${d.x * 100}%`;
    marker.style.top = `${d.y * 100}%`;

    marker.onclick = (e) => {
      e.stopPropagation();
      activeDamages.splice(idx, 1);
      renderDamagePoints();
    };

    container.appendChild(marker);
  });

  const listDiv = document.getElementById('damageList');
  if (activeDamages.length === 0) {
    listDiv.innerHTML = '<span class="text-slate-400 font-medium">Sin daños marcados</span>';
  } else {
    listDiv.innerHTML = activeDamages.map((d, i) => `
      <div class="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border">
        <span class="font-bold text-slate-700">#${i + 1} ${d.type} en (${Math.round(d.x*100)}%, ${Math.round(d.y*100)}%)</span>
        <button onclick="removeDamage(${i})" class="text-red-500 font-bold hover:underline">Eliminar</button>
      </div>
    `).join('');
  }
}

function removeDamage(index) {
  activeDamages.splice(index, 1);
  renderDamagePoints();
}

// ============================================================
// INSPECTION SAVE & LOCALSTORAGE + SUPABASE SYNC
// ============================================================
function getLocalInspections() {
  try {
    const data = localStorage.getItem('inspecciones_local');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalInspections(list) {
  try {
    localStorage.setItem('inspecciones_local', JSON.stringify(list));
  } catch (e) {
    console.error('LocalStorage write error', e);
  }
}

async function saveInspection(isNewCopy = false) {
  const plate = document.getElementById('formPlate').value.trim().toUpperCase();
  if (!plate) {
    alert('Por favor, introduce la matrícula del vehículo.');
    return;
  }

  const existingId = (!isNewCopy && currentEditingId) ? currentEditingId : `insp-${Date.now()}`;
  const existingRecord = getLocalInspections().find(i => i.id === existingId);
  const createdAt = (!isNewCopy && existingRecord) ? existingRecord.created_at : Date.now();

  const inspection = {
    id: existingId,
    plate: plate,
    model: document.getElementById('formModel').value || 'Peugeot Boxer',
    km: document.getElementById('formKm').value || '125000',
    last_review_km: document.getElementById('formLastKm').value || '',
    next_review_km: document.getElementById('formNextKm').value || '',
    oil: document.getElementById('levelOil').value,
    adblue: document.getElementById('levelAdBlue').value,
    coolant: document.getElementById('levelCoolant').value,
    brake_fluid: document.getElementById('levelBrakeFluid').value,
    washer_fluid: document.getElementById('levelWasher').value,
    front_pads: document.getElementById('levelFrontPads').value,
    front_tires: document.getElementById('levelFrontTires').value,
    spare_wheel: document.getElementById('eqSpareWheel').checked,
    jack_tools: document.getElementById('eqJack').checked,
    papers: document.getElementById('eqPapers').checked,
    damages: activeDamages,
    notes: document.getElementById('formNotes').value,
    created_at: createdAt,
    user_email: currentUserEmail,
    has_warning: activeDamages.length > 0 || !document.getElementById('eqSpareWheel').checked || !document.getElementById('eqJack').checked
  };

  // 1. Save locally
  let localList = getLocalInspections();
  const index = localList.findIndex(i => i.id === inspection.id);
  if (index >= 0) {
    localList[index] = inspection;
  } else {
    localList.unshift(inspection);
  }
  saveLocalInspections(localList);

  // 2. Sync asynchronously to Supabase
  try {
    await supabaseClient
      .from('inspecciones')
      .upsert([inspection]);
  } catch (err) {
    console.warn('Supabase sync notice:', err);
  }

  alert(`✅ Inspección para ${inspection.plate} guardada correctamente.`);
  resetForm();
  loadHistory();
}

function resetForm() {
  currentEditingId = null;
  document.getElementById('formPlate').value = '';
  document.getElementById('formKm').value = '';
  document.getElementById('formLastKm').value = '';
  document.getElementById('formNextKm').value = '';
  document.getElementById('formNotes').value = '';
  document.getElementById('levelOil').value = 'MAX';
  document.getElementById('levelAdBlue').value = 'MAX';
  document.getElementById('levelCoolant').value = 'MAX';
  document.getElementById('eqSpareWheel').checked = true;
  document.getElementById('eqJack').checked = true;
  document.getElementById('eqPapers').checked = true;
  activeDamages = [];
  renderDamagePoints();
}

// ============================================================
// HISTORY, EDITING & DELETION
// ============================================================
async function loadHistory() {
  let localList = getLocalInspections();

  // Try merging with Supabase remote data
  try {
    const { data } = await supabaseClient
      .from('inspecciones')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      const mergedMap = new Map();
      localList.forEach(i => mergedMap.set(i.id, i));
      data.forEach(i => mergedMap.set(i.id, i));
      allInspections = Array.from(mergedMap.values());
    } else {
      allInspections = localList;
    }
  } catch (err) {
    allInspections = localList;
  }

  // Ensure initial demo item if list is completely empty
  if (allInspections.length === 0) {
    allInspections = [
      {
        id: 'demo-1',
        plate: '1234 ABC',
        model: 'Peugeot Boxer',
        km: '125000',
        created_at: Date.now() - 86400000,
        user_email: 'operario1@empresa.com',
        has_warning: false,
        damages: []
      }
    ];
    saveLocalInspections(allInspections);
  }

  allInspections.sort((a, b) => b.created_at - a.created_at);
  filterHistory();
}

function filterHistory() {
  const query = document.getElementById('searchPlate').value.trim().toUpperCase();
  const listDiv = document.getElementById('historyList');

  let list = allInspections;
  if (currentRole !== 'ADMIN') {
    list = list.filter(i => i.user_email === currentUserEmail);
  }
  if (query) {
    list = list.filter(i => i.plate.includes(query));
  }

  if (list.length === 0) {
    listDiv.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No se encontraron inspecciones.</p>';
    return;
  }

  listDiv.innerHTML = list.map(i => `
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 hover:shadow-md transition">
      <div class="flex items-center justify-between">
        <span class="font-bold text-base text-blue-700">${i.plate}</span>
        ${i.has_warning ? '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">⚠ Incidencias</span>' : '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">✔ Sin Avisos</span>'}
      </div>
      <p class="text-xs text-slate-600 font-medium mt-1">${i.model || 'Peugeot Boxer'} • ${i.km || 0} Km</p>
      <p class="text-[10px] text-slate-400 mt-0.5">${new Date(i.created_at).toLocaleString()} ${currentRole === 'ADMIN' ? `• ${i.user_email}` : ''}</p>

      <div class="mt-3 flex gap-2">
        <button onclick="editInspection('${i.id}')" class="flex-1 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold rounded-lg border border-blue-300">
          <i class="fa-solid fa-pen-to-square mr-1"></i> Editar
        </button>
        <button onclick="printPdf('${i.id}')" class="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm">
          <i class="fa-solid fa-file-pdf mr-1"></i> Crear PDF
        </button>
        <button onclick="deleteInspection('${i.id}')" class="px-2.5 py-1.5 bg-slate-200 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function editInspection(id) {
  const item = allInspections.find(i => i.id === id);
  if (!item) return;

  currentEditingId = item.id;
  document.getElementById('formPlate').value = item.plate || '';
  document.getElementById('formModel').value = item.model || 'Peugeot Boxer';
  document.getElementById('formKm').value = item.km || '';
  document.getElementById('formLastKm').value = item.last_review_km || '';
  document.getElementById('formNextKm').value = item.next_review_km || '';
  document.getElementById('formNotes').value = item.notes || '';

  if (item.oil) document.getElementById('levelOil').value = item.oil;
  if (item.adblue) document.getElementById('levelAdBlue').value = item.adblue;
  if (item.coolant) document.getElementById('levelCoolant').value = item.coolant;

  activeDamages = Array.isArray(item.damages) ? item.damages : [];
  renderDamagePoints();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteInspection(id) {
  if (!confirm('¿Estás seguro de borrar este registro de inspección?')) return;

  let localList = getLocalInspections().filter(i => i.id !== id);
  saveLocalInspections(localList);

  try {
    await supabaseClient.from('inspecciones').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase delete notice', err);
  }

  loadHistory();
}

function printPdf(id) {
  const item = allInspections.find(i => i.id === id);
  if (!item) return;
  window.print();
}

// ============================================================
// ADMIN OPERARIOS MANAGEMENT
// ============================================================
function getLocalUsers() {
  try {
    const data = localStorage.getItem('operarios_local');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function renderRegisteredUsers() {
  const users = getLocalUsers();
  const container = document.getElementById('registeredUsersList');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = '<span class="text-slate-400">No hay operarios creados aún</span>';
  } else {
    container.innerHTML = users.map(u => `
      <div class="flex items-center justify-between bg-white p-2 rounded-lg border">
        <div>
          <span class="font-bold text-purple-900 block">${u.name}</span>
          <span class="text-slate-500">${u.email} • PIN: <strong class="text-purple-700">${u.pin}</strong></span>
        </div>
        <button onclick="deleteOperario('${u.email}')" class="text-red-500 font-bold px-2 py-1 hover:bg-red-50 rounded">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');
  }
}

function createNewOperario(e) {
  e.preventDefault();
  const name = document.getElementById('newOpName').value.trim();
  const email = document.getElementById('newOpEmail').value.trim();
  const pin = document.getElementById('newOpPin').value.trim();

  if (pin.length !== 6) {
    alert('El PIN debe tener exactamente 6 cifras.');
    return;
  }

  let users = getLocalUsers();
  users.push({ name, email, pin });
  localStorage.setItem('operarios_local', JSON.stringify(users));

  alert(`✅ Operario ${name} registrado con PIN ${pin}`);
  document.getElementById('newOpName').value = '';
  document.getElementById('newOpEmail').value = '';
  document.getElementById('newOpPin').value = '';

  renderRegisteredUsers();
}

function deleteOperario(email) {
  let users = getLocalUsers().filter(u => u.email !== email);
  localStorage.setItem('operarios_local', JSON.stringify(users));
  renderRegisteredUsers();
}
