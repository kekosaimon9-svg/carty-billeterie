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
    setStatusConnected(true);

    // Polling intelligent et silencieux toutes les 3.5 secondes
    if (!pollingInterval) {
        pollingInterval = setInterval(() => {
            loadData(false); // Vérifie silencieusement en arrière-plan
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

let lastDataFingerprint = '';

// Charger les données depuis l'API sans clignotement
async function loadData(showError = true) {
    try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('Erreur réseau');
        const data = await res.json();
        const incomingVendors = data.vendors && data.vendors.length > 0 ? data.vendors : DEFAULT_FALLBACK_VENDORS;
        
        // Empreinte : si les chiffres n'ont pas changé, NE PAS toucher au DOM (évite tout clignotement / recharge)
        const fingerprint = JSON.stringify(incomingVendors);
        if (fingerprint === lastDataFingerprint) {
            setStatusConnected(true);
            return;
        }

        lastDataFingerprint = fingerprint;
        currentVendors = incomingVendors;
        setStatusConnected(true);
        updateUI();
    } catch (err) {
        if (currentVendors.length === 0) {
            currentVendors = DEFAULT_FALLBACK_VENDORS;
            lastDataFingerprint = JSON.stringify(currentVendors);
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

    const pct = vendor.quota > 0 ? Math.round((vendor.sold / vendor.quota) * 100) : 0;
    const remaining = Math.max(0, vendor.quota - vendor.sold);

    document.getElementById('vendor-name-display').textContent = vendor.name;
    document.getElementById('vendor-sales').textContent = vendor.sold;
    document.getElementById('vendor-quota').textContent = vendor.quota;
    
    const quotaMaxEl = document.getElementById('vendor-quota-max');
    if (quotaMaxEl) quotaMaxEl.textContent = `Max: ${vendor.quota}`;

    const remainingEl = document.getElementById('vendor-remaining-text');
    if (remainingEl) {
        remainingEl.textContent = remaining > 0 ? `${remaining} ticket${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}` : '✅ Quota complet !';
    }

    const pctBadge = document.getElementById('vendor-percent-badge');
    if (pctBadge) {
        pctBadge.textContent = `${pct}%`;
        if (pct >= 100) pctBadge.classList.add('full');
        else pctBadge.classList.remove('full');
    }

    const revenueEl = document.getElementById('vendor-revenue');
    if (revenueEl) {
        revenueEl.textContent = (vendor.sold * TICKET_PRICE).toLocaleString('fr-FR') + ' DH';
    }

    // Barre de jauge stylée
    const bar = document.getElementById('vendor-progress');
    if (bar) {
        bar.style.width = Math.min(pct, 100) + '%';
        if (pct >= 100) {
            bar.style.background = 'linear-gradient(90deg, #1b8a47, #2ecc71)';
            bar.style.boxShadow = '0 0 16px rgba(46, 204, 113, 0.7)';
        } else {
            bar.style.background = 'linear-gradient(90deg, #990f14 0%, #e61c24 50%, #ff4d58 90%, #ff858e 100%)';
            bar.style.boxShadow = '0 0 16px rgba(230, 28, 36, 0.75)';
        }
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
        
        const revenue = v.sold * TICKET_PRICE;
        const pct = v.quota > 0 ? Math.round((v.sold / v.quota) * 100) : 0;
        const remaining = Math.max(0, v.quota - v.sold);

        html += `
            <div class="vendor-list-item">
                <div class="vendor-info" style="flex: 1;">
                    <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                        <strong style="font-size: 1.25rem; color: #fff;">${v.name}</strong>
                        <span style="color: var(--success); font-weight: 800; font-size: 1.15rem;">💰 ${revenue.toLocaleString('fr-FR')} DH</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; margin-bottom: 4px;">
                        <span style="color: rgba(255,255,255,0.85); font-size: 0.95rem;">
                            Tickets : <strong style="color: #fff; font-size: 1.05rem;">${v.sold}</strong> / ${v.quota} vendus
                        </span>
                        <span class="gauge-percent-badge ${pct >= 100 ? 'full' : ''}">${pct}%</span>
                    </div>

                    <!-- Jauge ultra stylée par vendeur -->
                    <div class="progress-container" style="height: 12px; margin-top: 4px;">
                        <div class="progress-bar" style="width: ${Math.min(pct, 100)}%;"></div>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: rgba(255,255,255,0.45); margin-top: 5px;">
                        <span>0 ticket</span>
                        <span style="color: #ff858e; font-weight: 600;">${remaining > 0 ? remaining + ' restant' + (remaining > 1 ? 's' : '') : '✅ Quota complet !'}</span>
                        <span>Max : ${v.quota}</span>
                    </div>
                </div>

                <div class="vendor-actions" style="margin-top: 12px;">
                    <button class="btn btn-small btn-secondary" onclick="editQuota(${v.id}, ${v.quota})">Modifier</button>
                    <button class="btn btn-small btn-danger" onclick="deleteVendor(${v.id})">Supprimer</button>
                </div>
            </div>
        `;
    });
    
    if (currentVendors.length === 0) html = '<p>Aucun vendeur trouvé.</p>';
    list.innerHTML = html;

    // Total Global & Jauge Globale
    const globalSalesEl = document.getElementById('global-sales');
    if (globalSalesEl) globalSalesEl.textContent = globalSold;
    
    const globalQuotaEl = document.getElementById('global-quota');
    if (globalQuotaEl) globalQuotaEl.textContent = globalQuota || 114;

    const globalRevenueEl = document.getElementById('global-revenue');
    if (globalRevenueEl) globalRevenueEl.textContent = (globalSold * TICKET_PRICE).toLocaleString('fr-FR') + ' DH';
    
    const globalPercent = globalQuota > 0 ? Math.round((globalSold / globalQuota) * 100) : 0;
    const globalRemaining = Math.max(0, (globalQuota || 114) - globalSold);

    const globalPctBadge = document.getElementById('global-percent-badge');
    if (globalPctBadge) {
        globalPctBadge.textContent = `${globalPercent}%`;
        if (globalPercent >= 100) globalPctBadge.classList.add('full');
        else globalPctBadge.classList.remove('full');
    }

    const globalRemainingEl = document.getElementById('global-remaining-text');
    if (globalRemainingEl) {
        globalRemainingEl.textContent = globalRemaining > 0 ? `${globalRemaining} ticket${globalRemaining > 1 ? 's' : ''} restant${globalRemaining > 1 ? 's' : ''}` : '🎉 Tous les billets sont vendus !';
    }

    const bar = document.getElementById('global-progress');
    if (bar) {
        bar.style.width = Math.min(globalPercent, 100) + '%';
        if (globalPercent >= 100) {
            bar.style.background = 'linear-gradient(90deg, #1b8a47, #2ecc71)';
            bar.style.boxShadow = '0 0 20px rgba(46, 204, 113, 0.8)';
        } else {
            bar.style.background = 'linear-gradient(90deg, #990f14 0%, #e61c24 50%, #ff4d58 90%, #ff858e 100%)';
            bar.style.boxShadow = '0 0 16px rgba(230, 28, 36, 0.75)';
        }
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
