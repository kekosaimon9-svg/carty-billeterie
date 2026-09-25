const express = require('express');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cookieParser());

// En environnement de dev local, on sert le dossier public statiquement
// Sur Vercel, c'est géré par vercel.json
if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, '../public')));
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uztprrunvtzcjfkaxdiw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6dHBycnVudnR6Y2pma2F4ZGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyOTk2NDcsImV4cCI6MjEwNTg3NTY0N30.gTOJ7xI3RXLRW7ejjgajhYc21EbB6jNyHNq-fvMcmZg';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_CODE = process.env.ADMIN_CODE || '1966';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'super-secure-token-carty-123';

function requireAdmin(req, res, next) {
    if (req.cookies.admin_session === ADMIN_SECRET) {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
}

// --- PUBLIC API ROUTES ---

// Get all vendors with calculated sales
app.get('/api/data', async (req, res) => {
    try {
        const { data: vendors, error: vErr } = await supabase.from('vendors').select('*');
        const { data: sales, error: sErr } = await supabase.from('sales').select('*');
        
        if (vErr) throw vErr;
        if (sErr) throw sErr;

        const result = (vendors || []).map(v => {
            const vendorSales = (sales || []).filter(s => s.vendor_id === v.id);
            const sold = vendorSales.reduce((acc, curr) => acc + curr.quantity, 0);
            return { ...v, sold };
        });
        res.json({ vendors: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Record a sale
app.post('/api/sales', async (req, res) => {
    try {
        const { vendor_id, quantity } = req.body;
        if (!vendor_id || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Données invalides' });
        }

        // Check quota logic
        const { data: vendor, error: vErr } = await supabase.from('vendors').select('*').eq('id', vendor_id).single();
        if (vErr || !vendor) return res.status(404).json({ error: 'Vendeur introuvable' });
        
        const { data: sales, error: sErr } = await supabase.from('sales').select('quantity').eq('vendor_id', vendor_id);
        if (sErr) throw sErr;

        const sold = (sales || []).reduce((acc, curr) => acc + curr.quantity, 0);
        
        if (sold + quantity > vendor.quota) {
            return res.status(400).json({ error: 'Quota dépassé' });
        }
        
        const { error: insertErr } = await supabase.from('sales').insert([{ vendor_id, quantity }]);
        if (insertErr) throw insertErr;

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN API ROUTES ---

app.post('/api/admin/login', (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) {
        // En Serverless (Vercel), on doit stocker l'authentification côté client (cookie signé) car la mémoire est volatile
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
        if (!name || !quota || quota <= 0) return res.status(400).json({ error: 'Données invalides' });
        
        const { data, error } = await supabase.from('vendors').insert([{ name, quota }]).select();
        if (error) throw error;
        res.json({ success: true, id: data[0].id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/vendors/:id', requireAdmin, async (req, res) => {
    try {
        const { quota } = req.body;
        const { id } = req.params;
        if (!quota || quota <= 0) return res.status(400).json({ error: 'Quota invalide' });
        
        const { error } = await supabase.from('vendors').update({ quota }).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/vendors/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('vendors').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = app;
