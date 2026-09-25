const app = require('./api/index');
const http = require('http');

const server = http.createServer(app);
const PORT = process.env.PORT || 8085;

server.listen(PORT, () => {
    console.log(`Serveur local (Supabase activé) démarré sur http://localhost:${PORT}`);
});
