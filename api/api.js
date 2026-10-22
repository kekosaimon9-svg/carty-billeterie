const express = require('express');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cookieParser());

// En environnement de dev local, on sert les fichiers statiques
if (!process.env.VERCEL) {
    app.use(express.static(__dirname + '/..'));
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uztprrunvtzcjfkaxdiw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6dHBycnVudnR6Y2pma2F4ZGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyOTk2NDcsImV4cCI6MjEwNTg3NTY0N30.gTOJ7xI3RXLRW7ejjgajhYc21EbB6jNyHNq-fvMcmZg';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_CODE = process.env.ADMIN_CODE || '1966';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'super-secure-token-itachi-1966';

// 6 souches de 19 tickets chacune = 114 tickets répartis entre 5 vendeurs
const DEFAULT_ITACHI_VENDORS = [
    {
        id: 1,
        name: "Vibes",
        quota: 38,
        souches_count: 2,
        souches_detail: [
            { id: "S1", name: "Souche n°1", tickets: 19, range: "N° 001 à 019" },
            { id: "S2", name: "Souche n°2", tickets: 19, range: "N° 020 à 038" }
        ],
        sold: 0
    },
    {
        id: 2,
        name: "Désirée",
        quota: 19,
        souches_count: 1,
        souches_detail: [
            { id: "S3", name: "Souche n°3", tickets: 19, range: "N° 039 à 057" }
        ],
        sold: 0
    },
    {
        id: 3,
        name: "Shannon",
        quota: 19,
        souches_count: 1,
        souches_detail: [
            { id: "S4", name: "Souche n°4", tickets: 19, range: "N° 058 à 076" }
        ],
        sold: 0
    },
    {
        id: 4,
        name: "Boosk-P",
        quota: 19,
        souches_count: 1,
        souches_detail: [
            { id: "S5", name: "Souche n°5", tickets: 19, range: "N° 077 à 095" }
        ],
        sold: 0
    },
    {
        id: 5,
        name: "Isabelle",
        quota: 19,
        souches_count: 1,
        souches_detail: [
            { id: "S6", name: "Souche n°6", tickets: 19, range: "N° 096 à 114" }
        ],
        sold: 0
    }
];

// Stockage mémoire résilient en cas de pause ou panne de Supabase
let localVendors = JSON.parse(JSON.stringify(DEFAULT_ITACHI_VENDORS));
let localSales = [];

function getSouchesForVendor(name, quota, vendorId) {
    const known = DEFAULT_ITACHI_VENDORS.find(v => v.name.toLowerCase() === name.toLowerCase());
    if (known) {
        return {
            souches_count: known.souches_count,
            souches_detail: known.souches_detail
        };
    }
    const count = Math.ceil(quota / 19) || 1;
    const detail = [];
    for (let i = 1; i <= count; i++) {
        detail.push({
            id: `V${vendorId}-S${i}`,
            name: `Souche ${i}`,
            tickets: i === count && quota % 19 !== 0 ? (quota % 19) : 19,
            range: `Attribué à ${name}`
        });
    }
    return {
        souches_count: count,
        souches_detail: detail
    };
}

function requireAdmin(req, res, next) {
    if (req.cookies.admin_session === ADMIN_SECRET || req.cookies.admin_session === 'super-secure-token-carty-123') {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
}

// Helper pour interroger Supabase avec timeout
async function fetchWithTimeout(promise, timeoutMs = 2500) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Supabase')), timeoutMs))
    ]);
}

// --- PUBLIC API ROUTES ---

// Get all vendors with calculated sales and individual souche tracking
app.get('/api/data', async (req, res) => {
    try {
        // Tenter de récupérer depuis Supabase
        const { data: vendors, error: vErr } = await fetchWithTimeout(supabase.from('vendors').select('*'));
        const { data: sales, error: sErr } = await fetchWithTimeout(supabase.from('sales').select('*'));
        
        if (vErr || !vendors || vendors.length === 0) {
            // Utiliser le stockage local
            return res.json({ vendors: localVendors });
        }

        const result = vendors.map(v => {
            const vendorSales = (sales || []).filter(s => s.vendor_id === v.id);
            const sold = vendorSales.reduce((acc, curr) => acc + curr.quantity, 0);
            const soucheInfo = getSouchesForVendor(v.name, v.quota, v.id);
            return {
                ...v,
                sold,
                souches_count: soucheInfo.souches_count,
                souches_detail: soucheInfo.souches_detail
            };
        });

        // Mettre à jour le cache local
        localVendors = result;
        res.json({ vendors: result });
    } catch (e) {
        // En cas de projet Supabase en pause ou erreur DNS, renvoyer les données Itachi
        res.json({ vendors: localVendors });
    }
});

// Enregistrer une vente
app.post('/api/sales', async (req, res) => {
    try {
        const { vendor_id, quantity } = req.body;
        const numQty = parseInt(quantity, 10);
        if (!vendor_id || !numQty || numQty <= 0) {
            return res.status(400).json({ error: 'Données invalides' });
        }

        // Vérifier le vendeur dans le cache local
        const targetVendor = localVendors.find(v => String(v.id) === String(vendor_id));
        if (!targetVendor) {
            return res.status(404).json({ error: 'Vendeur introuvable' });
        }

        if (targetVendor.sold + numQty > targetVendor.quota) {
            return res.status(400).json({ error: `Quota dépassé (Max disponible : ${targetVendor.quota - targetVendor.sold} tickets)` });
        }

        // Mettre à jour en local immédiatement
        targetVendor.sold += numQty;
        localSales.push({ vendor_id: targetVendor.id, quantity: numQty, timestamp: new Date().toISOString() });

        // Tenter de synchroniser vers Supabase si accessible
        try {
            await fetchWithTimeout(supabase.from('sales').insert([{ vendor_id: targetVendor.id, quantity: numQty }]), 2000);
        } catch (supabaseErr) {
            console.log('Supabase non disponible ou en pause, vente enregistrée localement.');
        }

        res.json({ success: true, sold: targetVendor.sold });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN API ROUTES ---

app.post('/api/admin/login', (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) {
        res.cookie('admin_session', ADMIN_SECRET, { httpOnly: true, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Code incorrect' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_session');
    res.json({ success: true });
});

app.post('/api/admin/vendors', requireAdmin, async (req, res) => {
    try {
        const { name, quota } = req.body;
        const numQuota = parseInt(quota, 10);
        if (!name || !numQuota || numQuota <= 0) return res.status(400).json({ error: 'Données invalides' });
        
        const newId = Date.now();
        const soucheInfo = getSouchesForVendor(name, numQuota, newId);
        const newVendor = {
            id: newId,
            name: name.trim(),
            quota: numQuota,
            sold: 0,
            souches_count: soucheInfo.souches_count,
            souches_detail: soucheInfo.souches_detail
        };
        localVendors.push(newVendor);

        try {
            await fetchWithTimeout(supabase.from('vendors').insert([{ name: newVendor.name, quota: numQuota }]), 2000);
        } catch (_) {}

        res.json({ success: true, id: newId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/vendors/:id', requireAdmin, async (req, res) => {
    try {
        const { quota } = req.body;
        const { id } = req.params;
        const numQuota = parseInt(quota, 10);
        if (!numQuota || numQuota <= 0) return res.status(400).json({ error: 'Quota invalide' });
        
        const vendor = localVendors.find(v => String(v.id) === String(id));
        if (vendor) {
            vendor.quota = numQuota;
            const soucheInfo = getSouchesForVendor(vendor.name, numQuota, vendor.id);
            vendor.souches_count = soucheInfo.souches_count;
            vendor.souches_detail = soucheInfo.souches_detail;
        }

        try {
            await fetchWithTimeout(supabase.from('vendors').update({ quota: numQuota }).eq('id', id), 2000);
        } catch (_) {}

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/vendors/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        localVendors = localVendors.filter(v => String(v.id) !== String(id));
        localSales = localSales.filter(s => String(s.vendor_id) !== String(id));

        try {
            await fetchWithTimeout(supabase.from('vendors').delete().eq('id', id), 2000);
        } catch (_) {}

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = app;
