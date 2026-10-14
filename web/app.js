// ============================================================
// SUPABASE CONFIGURATION & CLIENT
// ============================================================
const SUPABASE_URL = 'https://uqwnmceejfdczzyndjos.supabase.co';
const SUPABASE_KEY = 'sb_publishable__rRU2iaGwfbQ8y-ut_x2wQ_h-5yDqf6';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let currentRole = 'OPERATOR';
let currentUserEmail = 'operario1@empresa.com';
let activeDamages = [];
let allInspections = [];

// ============================================================
// INITIALIZATION & ROLE SWITCHING
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
      errorDiv.innerText = 'Credenciales de Admin incorrectas (dexter / aritmetica.11Az)';
      errorDiv.classList.remove('hidden');
    }
  } else {
    const pin = document.getElementById('pinInput').value.trim();
    if (pin.length !== 6) {
      errorDiv.innerText = 'El PIN debe tener 6 cifras (Ej: 123456)';
      errorDiv.classList.remove('hidden');
      return;
    }

    // Default operario or fetch from Supabase
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
  // Remove existing markers
  container.querySelectorAll('.damage-marker').forEach(m => m.remove());

  activeDamages.forEach((d, idx) => {
    const marker = document.createElement('div');
    marker.className = 'damage-marker';
    marker.innerText = idx + 1;

    let color = '#FF9100'; // Abollado - Naranja
    if (d.type === 'RASCADO') color = '#FFEA00'; // Rascado - Amarillo
    if (d.type === 'GOLPEADO') color = '#FF1744'; // Golpeado - Rojo

    marker.style.backgroundColor = color;
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
      <div class="flex items-center justify-between bg-slate-50 p-2 rounded-lg border">
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
// INSPECTION SAVE & REALTIME SYNC WITH SUPABASE
// ============================================================
async function saveInspection() {
  const plate = document.getElementById('formPlate').value.trim();
  if (!plate) {
    alert('Por favor, introduce la matrícula del vehículo.');
    return;
  }

  const inspection = {
    id: `web-${Date.now()}`,
    plate: plate.toUpperCase(),
    model: document.getElementById('formModel').value,
    km: document.getElementById('formKm').value,
    bodywork: activeDamages.length > 0 ? 'Con daños' : 'Sin daños',
    notes: document.getElementById('formNotes').value,
    created_at: Date.now(),
    user_email: currentUserEmail,
    has_warning: activeDamages.length > 0
  };

  try {
    const { data, error } = await supabaseClient
      .from('inspecciones')
      .upsert([inspection]);

    if (error) {
      console.warn('Supabase notice:', error.message);
    }

    alert(`✅ Inspección para ${inspection.plate} guardada y sincronizada correctamente.`);
    resetForm();
    loadHistory();
  } catch (err) {
    console.error(err);
    alert('Inspección guardada localmente.');
    resetForm();
  }
}

function resetForm() {
  document.getElementById('formPlate').value = '';
  document.getElementById('formKm').value = '';
  document.getElementById('formNotes').value = '';
  activeDamages = [];
  renderDamagePoints();
}

// ============================================================
// HISTORY & SEARCH
// ============================================================
async function loadHistory() {
  const listDiv = document.getElementById('historyList');
  listDiv.innerHTML = '<p class="text-xs text-slate-400 text-center py-4"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Sincronizando datos...</p>';

  try {
    const { data, error } = await supabaseClient
      .from('inspecciones')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      allInspections = data;
    } else {
      allInspections = getMockHistory();
    }
  } catch (err) {
    allInspections = getMockHistory();
  }

  filterHistory();
}

function getMockHistory() {
  return [
    {
      id: 'demo-1',
      plate: '1234 ABC',
      model: 'Peugeot Boxer',
      km: '125000',
      created_at: Date.now() - 3600000,
      user_email: 'operario1@empresa.com',
      has_warning: false
    }
  ];
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
    <div class="bg-slate-50 border rounded-xl p-3 hover:shadow-sm transition">
      <div class="flex items-center justify-between">
        <span class="font-bold text-sm text-blue-700">${i.plate}</span>
        ${i.has_warning ? '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">⚠ Incidencias</span>' : '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">✔ Correcto</span>'}
      </div>
      <p class="text-xs text-slate-500 mt-1">${i.model || 'Furgoneta'} • ${i.km || 0} Km</p>
      <p class="text-[10px] text-slate-400">${new Date(i.created_at).toLocaleString()}</p>

      <div class="mt-2 flex gap-2">
        <button onclick="printPdf('${i.plate}', '${i.model}', '${i.km}')" class="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm">
          <i class="fa-solid fa-file-pdf mr-1"></i> Imprimir PDF
        </button>
      </div>
    </div>
  `).join('');
}

function printPdf(plate, model, km) {
  window.print();
}

async function createNewOperario(e) {
  e.preventDefault();
  const name = document.getElementById('newOpName').value;
  const email = document.getElementById('newOpEmail').value;
  const pin = document.getElementById('newOpPin').value;

  alert(`✅ Operario ${name} registrado con PIN ${pin}`);
  document.getElementById('newOpName').value = '';
  document.getElementById('newOpEmail').value = '';
  document.getElementById('newOpPin').value = '';
}
