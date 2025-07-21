// server.js - Avvio Gateway API
// Sistema Gestione Lavorazioni Temporizzate - Prova d'Esame

const gatewayApi = require('./gateway/gateway-api');

// Il gateway API è già configurato e avviato nel modulo gateway-api.js
// Questo file serve come entry point principale del sistema

console.log('🚀 Avvio Sistema Gestione Lavorazioni Temporizzate');
console.log('📡 Gateway API avviato tramite gateway/gateway-api.js');
console.log('');
console.log('💡 Per avviare il gateway seriale separatamente:');
console.log('   npm run gateway-serial');
console.log('');
console.log('📝 Documentazione API:');
console.log('   http://localhost:3000 - Frontend Web');
console.log('   POST /api/lavorazioni - Crea nuova lavorazione');
console.log('   GET /api/lavorazioni - Lista lavorazioni');
console.log('   POST /api/lavorazioni/:id/invia - Invia ad Arduino');
console.log('   GET /api/log - Storico lavorazioni');
console.log('   GET /api/status - Stato sistema');