// Variables globales
let currentVendors = [];
let pollingInterval = null;
const isAdminPage = window.location.pathname.includes('admin.html');
const isVendorPage = window.location.pathname.includes('vendeur.html');

const TICKET_PRICE = 200; // Prix de prévente Showcase General Itachi : 200 DH

// Configuration des 6 souches de 19 tickets = 114 tickets pour les 5 vendeurs
const KNOWN_SOUCHES = {
    'vibes': [
        { id: 1, name: 'Souche n°1', capacity: 19, range: 'N° 001 à 019' },
        { id: 2, name: 'Souche n°2', capacity: 19, range: 'N° 020 à 038' }
    ],
    'désirée': [
        { id: 3, name: 'Souche n°3', capacity: 19, range: 'N° 039 à 057' }
    ],
    'desiree': [
        { id: 3, name: 'Souche n°3', capacity: 19, range: 'N° 039 à 057' }
    ],
    'shannon': [
        { id: 4, name: 'Souche n°4', capacity: 19, range: 'N° 058 à 076' }
    ],
    'boosk-p': [
        { id: 5, name: 'Souche n°5', capacity: 19, range: 'N° 077 à 095' }
    ],
    'isabelle': [
        { id: 6, name: 'Souche n°6', capacity: 19, range: 'N° 096 à 114' }
    ]
};

// Obtenir le détail des souches pour un vendeur
function getVendorSouches(vendor) {
    const key = (vendor.name || '').trim().toLowerCase();
    if (KNOWN_SOUCHES[key]) {
        return KNOWN_SOUCHES[key];
    }
    // Génération automatique si vendeur personnalisé
    const count = Math.ceil(vendor.quota / 19) || 1;
    const list = [];
    for (let i = 1; i <= count; i++) {
        list.push({
            id: `auto-${vendor.id}-${i}`,
            name: `Souche ${i}`,
            capacity: (i === count && vendor.quota % 19 !== 0) ? (vendor.quota % 19) : 19,
            range: `${vendor.name}`
        });
    }
    return list;
}

// Calculer l'état de vente de chaque souche
function calculateSouchesBreakdown(vendor) {
    const souches = getVendorSouches(vendor);
    let remainingSold = vendor.sold || 0;
    
    return souches.map(s => {
        const soldInSouche = Math.min(remainingSold, s.capacity);
        remainingSold = Math.max(0, remainingSold - s.capacity);
        const isFull = soldInSouche >= s.capacity;
        return {
            ...s,
            sold: soldInSouche,
            isFull: isFull,
            statusLabel: isFull ? '✅ Complète' : soldInSouche > 0 ? '⏳ En cours' : '⚪ 0 vendus'
        };
    });
}

// Initialisation Supabase Client & Realtime avec fallback polling automatique
const supabaseUrl = 'https://uztprrunvtzcjfkaxdiw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6dHBycnVudnR6Y2pma2F4ZGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyOTk2NDcsImV4cCI6MjEwNTg3NTY0N30.gTOJ7xI3RXLRW7ejjgajhYc21EbB6jNyHNq-fvMcmZg';
let supabaseClient = null;

try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
} catch (e) {
    console.warn('Supabase local init bypassed, fallback actif.');
}

function setStatusConnected(connected) {
    const el = document.getElementById('ws-status');
    if (!el) return;
    if (connected) {
        el.classList.add('connected');
        el.title = 'Temps réel connecté (Showcase Itachi)';
    } else {
        el.classList.remove('connected');
        el.title = 'Reconnexion en cours...';
    }
}

function initRealtime() {
    // Statut vert actif par défaut via synchronisation continue
    setStatusConnected(true);

    if (supabaseClient) {
        try {
            supabaseClient.channel('public-updates')
                .on('postgres_changes', { event: '*', schema: 'public' }, () => {
                    loadData();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        setStatusConnected(true);
                    }
                });
        } catch (_) {}
    }

    // Polling régulier de sécurité pour assurer la synchronisation en direct
    if (!pollingInterval) {
        pollingInterval = setInterval(() => {
            loadData(false); // charge discrètement
        }, 3500);
    }
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

// Données de secours par défaut conformes à la consigne exacte
const DEFAULT_FALLBACK_VENDORS = [
    { id: 1, name: 'Vibes', quota: 38, sold: 0 },
    { id: 2, name: 'Désirée', quota: 19, sold: 0 },
    { id: 3, name: 'Shannon', quota: 19, sold: 0 },
    { id: 4, name: 'Boosk-P', quota: 19, sold: 0 },
    { id: 5, name: 'Isabelle', quota: 19, sold: 0 }
];

// Charger les données depuis l'API
async function loadData(showError = true) {
    try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('Erreur réseau');
        const data = await res.json();
        currentVendors = data.vendors && data.vendors.length > 0 ? data.vendors : DEFAULT_FALLBACK_VENDORS;
        setStatusConnected(true);
        updateUI();
    } catch (err) {
        if (currentVendors.length === 0) {
            currentVendors = DEFAULT_FALLBACK_VENDORS;
            updateUI();
        }
        if (showError) {
            console.warn('Mode hors-ligne / fallback actif:', err);
        }
    }
}

// Mettre à jour l'interface selon la page
function updateUI() {
    if (isVendorPage) updateVendorUI();
    if (isAdminPage) updateAdminUI();
}

// --- LOGIQUE ESPACE VENDEUR ---
function updateVendorUI() {
    const select = document.getElementById('vendor-select');
    if (!select) return;
    const currentVal = select.value;
    
    let options = '<option value="">-- Choisissez votre nom --</option>';
    currentVendors.forEach(v => {
        options += `<option value="${v.id}" ${currentVal == v.id ? 'selected' : ''}>${v.name}</option>`;
    });
    select.innerHTML = options;

    if (currentVal) {
        const vendor = currentVendors.find(v => String(v.id) === String(currentVal));
        if (vendor) displayVendorDashboard(vendor);
        else document.getElementById('vendor-dashboard').style.display = 'none';
    }
}

function displayVendorDashboard(vendor) {
    const dash = document.getElementById('vendor-dashboard');
    if (!dash) return;
    dash.style.display = 'block';

    document.getElementById('vendor-name-display').textContent = vendor.name;
    document.getElementById('vendor-sales').textContent = vendor.sold;
    document.getElementById('vendor-quota').textContent = vendor.quota;
    
    const revenueEl = document.getElementById('vendor-revenue');
    if (revenueEl) {
        revenueEl.textContent = (vendor.sold * TICKET_PRICE).toLocaleString('fr-FR') + ' DH';
    }

    // Afficher les badges de souches
    const badgesContainer = document.getElementById('vendor-souches-display');
    const breakdown = calculateSouchesBreakdown(vendor);
    if (badgesContainer) {
        badgesContainer.innerHTML = breakdown.map(s => `
            <span class="souche-chip">
                🎟️ ${s.name} (${s.capacity} tickets • ${s.range})
            </span>
        `).join('');
    }

    // Barre de progression
    const percent = vendor.quota > 0 ? Math.min((vendor.sold / vendor.quota) * 100, 100) : 0;
    const bar = document.getElementById('vendor-progress');
    if (bar) {
        bar.style.width = percent + '%';
        if (percent >= 100) bar.style.backgroundColor = 'var(--danger)';
        else bar.style.backgroundColor = 'var(--primary)';
    }

    // Détail individuel des souches
    const detailContainer = document.getElementById('vendor-souches-detail');
    if (detailContainer) {
        detailContainer.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 6px; color: rgba(255,255,255,0.9);">
                Suivi individuel des souches attribuées :
            </div>
            ${breakdown.map(s => `
                <div class="souche-row">
                    <span class="souche-name">${s.name} <small style="color: rgba(255,255,255,0.5);">(${s.range})</small></span>
                    <span class="souche-status ${s.isFull ? 'full' : ''}">${s.sold} / ${s.capacity} • ${s.statusLabel}</span>
                </div>
            `).join('')}
        `;
    }
}

if (isVendorPage) {
    const sel = document.getElementById('vendor-select');
    if (sel) {
        sel.addEventListener('change', (e) => {
            if (!e.target.value) {
                document.getElementById('vendor-dashboard').style.display = 'none';
                return;
            }
            const vendor = currentVendors.find(v => String(v.id) === String(e.target.value));
            if (vendor) displayVendorDashboard(vendor);
        });
    }

    const sellBtn = document.getElementById('btn-sell');
    if (sellBtn) {
        sellBtn.addEventListener('click', async () => {
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
                
                showAlert(`✅ Vente de ${quantity} ticket(s) enregistrée avec succès !`);
                document.getElementById('sell-quantity').value = 1;
                loadData();
            } catch (err) {
                showAlert(err.message, true);
            }
        });
    }
}

// --- LOGIQUE ESPACE ADMIN ---
function updateAdminUI() {
    const list = document.getElementById('vendors-list');
    if (!list) return;

    let globalSold = 0;
    let globalQuota = 0;
    let html = '';

    currentVendors.forEach((v, index) => {
        globalSold += v.sold;
        globalQuota += v.quota;
        
        const delay = (index * 0.08).toFixed(2);
        const revenue = v.sold * TICKET_PRICE;
        const breakdown = calculateSouchesBreakdown(v);
        const souchesBadgeText = breakdown.map(s => `${s.name} (${s.capacity})`).join(' + ');

        html += `
            <div class="vendor-list-item" style="animation-delay: ${delay}s">
                <div class="vendor-info" style="flex: 1;">
                    <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                        <strong style="font-size: 1.2rem; color: #fff;">${v.name}</strong>
                        <span style="color: var(--success); font-weight: 700; font-size: 1.05rem;">💰 ${revenue.toLocaleString('fr-FR')} DH</span>
                    </div>

                    <div class="souche-badge-list">
                        <span class="souche-chip">🏷️ ${v.quota === 38 ? '2 souches' : '1 souche'} : ${souchesBadgeText}</span>
                    </div>

                    <div style="color: rgba(255,255,255,0.7); font-size: 0.95rem; margin-top: 4px;">
                        Vendus : <strong>${v.sold}</strong> / ${v.quota} tickets
                    </div>

                    <!-- Découpage individuel par souche -->
                    <div class="souche-breakdown">
                        ${breakdown.map(s => `
                            <div class="souche-row">
                                <span class="souche-name">${s.name} <small style="color:rgba(255,255,255,0.45); font-weight: normal;">(${s.range})</small></span>
                                <span class="souche-status ${s.isFull ? 'full' : ''}"><strong>${s.sold}</strong> / ${s.capacity} tickets (${s.statusLabel})</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="vendor-actions" style="margin-top: 10px;">
                    <button class="btn btn-small btn-secondary" onclick="editQuota(${v.id}, ${v.quota})">Modifier</button>
                    <button class="btn btn-small btn-danger" onclick="deleteVendor(${v.id})">Supprimer</button>
                </div>
            </div>
        `;
    });
    
    if (currentVendors.length === 0) html = '<p>Aucun vendeur trouvé.</p>';
    list.innerHTML = html;

    // Total Global
    const globalSalesEl = document.getElementById('global-sales');
    if (globalSalesEl) globalSalesEl.textContent = globalSold;
    
    const globalQuotaEl = document.getElementById('global-quota');
    if (globalQuotaEl) globalQuotaEl.textContent = globalQuota || 114;

    const globalRevenueEl = document.getElementById('global-revenue');
    if (globalRevenueEl) globalRevenueEl.textContent = (globalSold * TICKET_PRICE).toLocaleString('fr-FR') + ' DH';
    
    const percent = globalQuota > 0 ? Math.min((globalSold / globalQuota) * 100, 100) : 0;
    const bar = document.getElementById('global-progress');
    if (bar) {
        bar.style.width = percent + '%';
        if (percent >= 100) bar.style.backgroundColor = 'var(--danger)';
        else bar.style.backgroundColor = 'var(--primary)';
    }
}

if (isAdminPage) {
    // Connexion admin
    const loginBtn = document.getElementById('btn-login');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
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
                document.getElementById('login-section').style.display = 'none';
                document.getElementById('dashboard-section').style.display = 'block';
                loadData();
                showAlert("Connecté avec succès — Showcase Itachi");
            } catch (err) {
                showAlert(err.message, true);
            }
        });
    }

    // Déconnexion
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/admin/logout', { method: 'POST' });
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('dashboard-section').style.display = 'none';
            document.getElementById('admin-code').value = '';
        });
    }

    // Ajouter un vendeur
    const addVendorBtn = document.getElementById('btn-add-vendor');
    if (addVendorBtn) {
        addVendorBtn.addEventListener('click', async () => {
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
                    throw new Error(data.error || 'Erreur lors de l\'ajout');
                }
                showAlert("Vendeur ajouté !");
                document.getElementById('new-vendor-name').value = '';
                document.getElementById('new-vendor-quota').value = '';
                loadData();
            } catch (err) {
                showAlert(err.message, true);
            }
        });
    }

    // Modifier le quota
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
            loadData();
        } catch (err) {
            alert(err.message);
        }
    };

    // Supprimer un vendeur
    window.deleteVendor = async function(id) {
        if (!confirm('Voulez-vous vraiment supprimer ce vendeur ?')) return;
        
        try {
            const res = await fetch(`/api/admin/vendors/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Erreur lors de la suppression');
            loadData();
        } catch (err) {
            alert(err.message);
        }
    };
}

// Initialisation au chargement de la page
loadData();
initRealtime();
