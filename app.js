// Variables globales
let currentVendors = [];
let ws;
const isAdminPage = window.location.pathname.includes('admin.html');
const isVendorPage = window.location.pathname.includes('vendeur.html');

// Initialisation Supabase Client & Realtime
const supabaseUrl = 'https://uztprrunvtzcjfkaxdiw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6dHBycnVudnR6Y2pma2F4ZGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyOTk2NDcsImV4cCI6MjEwNTg3NTY0N30.gTOJ7xI3RXLRW7ejjgajhYc21EbB6jNyHNq-fvMcmZg';
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

function initWebSocket() {
    if (!supabase) return;
    
    // Subscribe to public schema changes
    supabase.channel('public-updates')
      .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
          console.log('Changement détecté dans Supabase:', payload);
          loadData();
      })
      .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
              document.getElementById('ws-status')?.classList.add('connected');
              console.log('Connecté au serveur en temps réel (Supabase)');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              document.getElementById('ws-status')?.classList.remove('connected');
              console.log('Déconnecté, tentative de reconnexion...');
              setTimeout(initWebSocket, 3000);
          }
      });
}

// Afficher un message temporaire
function showAlert(msg, isError = false) {
    const box = document.getElementById('alert-box');
    if (!box) return;
    box.textContent = msg;
    box.className = `alert ${isError ? 'alert-error' : 'alert-success'}`;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 4000);
}

// Charger les données depuis l'API
async function loadData() {
    try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('Erreur réseau');
        const data = await res.json();
        currentVendors = data.vendors || [];
        updateUI();
    } catch (err) {
        console.error('Erreur chargement données:', err);
    }
}

// Mettre à jour l'interface selon la page
function updateUI() {
    if (isVendorPage) updateVendorUI();
    if (isAdminPage) updateAdminUI();
}

// --- LOGIQUE VENDEUR ---
function updateVendorUI() {
    const select = document.getElementById('vendor-select');
    const currentVal = select.value;
    
    // Garder la sélection actuelle si elle existe
    let options = '<option value="">-- Choisissez --</option>';
    currentVendors.forEach(v => {
        options += `<option value="${v.id}" ${currentVal == v.id ? 'selected' : ''}>${v.name}</option>`;
    });
    select.innerHTML = options;

    if (currentVal) {
        const vendor = currentVendors.find(v => v.id == currentVal);
        if (vendor) displayVendorDashboard(vendor);
        else document.getElementById('vendor-dashboard').style.display = 'none';
    }
}

function displayVendorDashboard(vendor) {
    document.getElementById('vendor-dashboard').style.display = 'block';
    document.getElementById('vendor-name-display').textContent = vendor.name;
    document.getElementById('vendor-sales').textContent = vendor.sold;
    document.getElementById('vendor-quota').textContent = vendor.quota;
    
    const percent = vendor.quota > 0 ? Math.min((vendor.sold / vendor.quota) * 100, 100) : 0;
    const bar = document.getElementById('vendor-progress');
    bar.style.width = percent + '%';
    
    if (percent >= 100) {
        bar.style.backgroundColor = '#d62828'; // Rouge si quota max
    } else {
        bar.style.backgroundColor = 'var(--primary)';
    }
}

if (isVendorPage) {
    document.getElementById('vendor-select').addEventListener('change', (e) => {
        if (!e.target.value) {
            document.getElementById('vendor-dashboard').style.display = 'none';
            return;
        }
        const vendor = currentVendors.find(v => v.id == e.target.value);
        if (vendor) displayVendorDashboard(vendor);
    });

    document.getElementById('btn-sell').addEventListener('click', async () => {
        const vendor_id = document.getElementById('vendor-select').value;
        const quantity = parseInt(document.getElementById('sell-quantity').value, 10);
        
        if (!vendor_id) return showAlert("Sélectionnez un vendeur d'abord.", true);
        if (!quantity || quantity <= 0) return showAlert("Quantité invalide.", true);

        try {
            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendor_id, quantity })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur lors de la vente');
            
            showAlert(`Vente de ${quantity} billet(s) enregistrée !`);
            document.getElementById('sell-quantity').value = 1; // reset
        } catch (err) {
            showAlert(err.message, true);
        }
    });
}

// --- LOGIQUE ADMIN ---
function updateAdminUI() {
    const list = document.getElementById('vendors-list');
    if (!list) return;

    let globalSold = 0;
    let globalQuota = 0;
    let html = '';

    const TICKET_PRICE = 150;

    currentVendors.forEach((v, index) => {
        globalSold += v.sold;
        globalQuota += v.quota;
        
        // Délai d'animation en cascade
        const delay = (index * 0.08).toFixed(2);
        const revenue = v.sold * TICKET_PRICE;
        
        html += `
            <div class="vendor-list-item" style="animation-delay: ${delay}s">
                <div class="vendor-info">
                    <strong style="font-size: 1.15rem; display: block; margin-bottom: 4px;">${v.name}</strong>
                    <span style="color: rgba(255,255,255,0.6); font-size: 0.95rem;">Vendus: ${v.sold} / Quota: ${v.quota}</span>
                    <span style="color: var(--success); font-weight: 600; font-size: 0.95rem; margin-left: 8px;">💰 ${revenue.toLocaleString('fr-FR')} DH</span>
                </div>
                <div class="vendor-actions">
                    <button class="btn btn-small btn-secondary" onclick="editQuota(${v.id}, ${v.quota})">Modifier</button>
                    <button class="btn btn-small btn-danger" onclick="deleteVendor(${v.id})">Supprimer</button>
                </div>
            </div>
        `;
    });
    
    if (currentVendors.length === 0) html = '<p>Aucun vendeur trouvé.</p>';
    list.innerHTML = html;

    // Total Global
    document.getElementById('global-sales').textContent = globalSold;
    document.getElementById('global-quota').textContent = globalQuota;
    const globalRevenueEl = document.getElementById('global-revenue');
    if (globalRevenueEl) globalRevenueEl.textContent = (globalSold * TICKET_PRICE).toLocaleString('fr-FR') + ' DH';
    
    const percent = globalQuota > 0 ? Math.min((globalSold / globalQuota) * 100, 100) : 0;
    const bar = document.getElementById('global-progress');
    bar.style.width = percent + '%';
    if (percent >= 100) bar.style.backgroundColor = '#d62828';
    else bar.style.backgroundColor = 'var(--primary)';
}

if (isAdminPage) {
    // Login
    document.getElementById('btn-login').addEventListener('click', async () => {
        const code = document.getElementById('admin-code').value;
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Code incorrect');
            }
            // Succès
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('dashboard-section').style.display = 'block';
            loadData(); // Charge les données après login
            showAlert("Connecté avec succès");
        } catch (err) {
            showAlert(err.message, true);
        }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('admin-code').value = '';
    });

    // Add Vendor
    document.getElementById('btn-add-vendor').addEventListener('click', async () => {
        const name = document.getElementById('new-vendor-name').value;
        const quota = parseInt(document.getElementById('new-vendor-quota').value, 10);
        
        if (!name || !quota || quota <= 0) return showAlert("Nom ou quota invalide", true);

        try {
            const res = await fetch('/api/admin/vendors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, quota })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erreur d\'ajout');
            }
            showAlert("Vendeur ajouté !");
            document.getElementById('new-vendor-name').value = '';
            document.getElementById('new-vendor-quota').value = '';
        } catch (err) {
            if (err.message.includes('401')) {
                showAlert('Session expirée, veuillez vous reconnecter.', true);
                document.getElementById('btn-logout').click();
            } else {
                showAlert(err.message, true);
            }
        }
    });

    // Globals fixes for onclick in HTML strings
    window.editQuota = async function(id, oldQuota) {
        const newQuota = prompt('Nouveau quota pour ce vendeur :', oldQuota);
        if (!newQuota) return;
        const q = parseInt(newQuota, 10);
        if (isNaN(q) || q <= 0) return alert('Quota invalide');

        try {
            const res = await fetch(`/api/admin/vendors/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quota: q })
            });
            if (!res.ok) throw new Error('Erreur lors de la modification');
        } catch (err) {
            alert(err.message);
        }
    };

    window.deleteVendor = async function(id) {
        if (!confirm('Voulez-vous vraiment supprimer ce vendeur ? Toutes ses ventes seront effacées.')) return;
        
        try {
            const res = await fetch(`/api/admin/vendors/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Erreur lors de la suppression');
        } catch (err) {
            alert(err.message);
        }
    };
}

// Démarrage initial
if (isVendorPage) loadData(); // Admin le charge après login
initWebSocket();
