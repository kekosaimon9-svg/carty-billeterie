const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = "1966";

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// In-memory admin sessions
const adminSessions = new Set();

// Database initialization
const db = new sqlite3.Database(path.join(__dirname, 'data.db'), (err) => {
    if (err) console.error('Erreur SQLite:', err.message);
    else console.log('Connecté à la base SQLite.');
});

db.serialize(() => {
    // Foreign key support
    db.run('PRAGMA foreign_keys = ON');

    db.run(`
        CREATE TABLE IF NOT EXISTS vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            quota INTEGER NOT NULL CHECK (quota > 0),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE CASCADE
        )
    `);
});

// Helper for broadcasting
function broadcastUpdate() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'UPDATE_STATE' }));
        }
    });
}

// Authentication middleware for admin routes
function requireAdmin(req, res, next) {
    const sessionId = req.cookies.admin_session;
    if (sessionId && adminSessions.has(sessionId)) {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
}

// --- PUBLIC API ROUTES ---

// Get all vendors with calculated sales
app.get('/api/data', (req, res) => {
    const query = `
        SELECT v.id, v.name, v.quota, COALESCE(SUM(s.quantity), 0) as sold 
        FROM vendors v 
        LEFT JOIN sales s ON v.id = s.vendor_id 
        GROUP BY v.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ vendors: rows });
    });
});

// Record a sale
app.post('/api/sales', (req, res) => {
    const { vendor_id, quantity } = req.body;
    if (!vendor_id || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Données invalides' });
    }

    // Check quota logic
    const checkQuery = `
        SELECT v.quota, COALESCE(SUM(s.quantity), 0) as sold 
        FROM vendors v 
        LEFT JOIN sales s ON v.id = s.vendor_id 
        WHERE v.id = ? 
        GROUP BY v.id
    `;
    
    db.get(checkQuery, [vendor_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Vendeur introuvable' });
        
        if (row.sold + quantity > row.quota) {
            return res.status(400).json({ error: 'Quota dépassé' });
        }
        
        db.run(`INSERT INTO sales (vendor_id, quantity) VALUES (?, ?)`, [vendor_id, quantity], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            broadcastUpdate();
            res.json({ success: true, id: this.lastID });
        });
    });
});

// --- ADMIN API ROUTES ---

app.post('/api/admin/login', (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        adminSessions.add(sessionId);
        res.cookie('admin_session', sessionId, { httpOnly: true, sameSite: 'strict' });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Code incorrect' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    const sessionId = req.cookies.admin_session;
    if (sessionId) adminSessions.delete(sessionId);
    res.clearCookie('admin_session');
    res.json({ success: true });
});

app.post('/api/admin/vendors', requireAdmin, (req, res) => {
    const { name, quota } = req.body;
    if (!name || !quota || quota <= 0) return res.status(400).json({ error: 'Données invalides' });
    
    db.run(`INSERT INTO vendors (name, quota) VALUES (?, ?)`, [name, quota], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        broadcastUpdate();
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/admin/vendors/:id', requireAdmin, (req, res) => {
    const { quota } = req.body;
    const { id } = req.params;
    if (!quota || quota <= 0) return res.status(400).json({ error: 'Quota invalide' });
    
    db.run(`UPDATE vendors SET quota = ? WHERE id = ?`, [quota, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        broadcastUpdate();
        res.json({ success: true });
    });
});

app.delete('/api/admin/vendors/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM vendors WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        broadcastUpdate();
        res.json({ success: true });
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).send('Page non trouvée');
});

// Start server
server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
