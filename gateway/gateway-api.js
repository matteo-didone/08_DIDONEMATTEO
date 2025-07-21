// gateway/gateway-api.js - Gateway API per Frontend Web

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Legge stato Arduino da file condiviso
function getArduinoStatus() {
    try {
        const statusFile = path.join(__dirname, '../arduino_status.json');
        if (fs.existsSync(statusFile)) {
            const statusData = fs.readFileSync(statusFile, 'utf8');
            const status = JSON.parse(statusData);

            // Considera Arduino disconnesso se ultimo aggiornamento > 10 secondi
            const lastUpdate = new Date(status.timestamp);
            const now = new Date();
            const diffSeconds = (now - lastUpdate) / 1000;

            return {
                connected: status.connected && diffSeconds < 10,
                port: status.port,
                last_update: status.timestamp
            };
        }
    } catch (error) {
        console.error('Errore lettura status Arduino:', error);
    }

    return {
        connected: false,
        port: null,
        last_update: null
    };
}

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Database Configuration
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'esame'
};

// Database Connection
async function getConnection() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        return connection;
    } catch (error) {
        console.error('Errore connessione database:', error);
        throw error;
    }
}

// =====================================
// API ENDPOINTS
// =====================================

// POST /api/lavorazioni - Inserimento nuova lavorazione
app.post('/api/lavorazioni', async (req, res) => {
    try {
        const { identificativo, nome, durata } = req.body;

        // Validazione parametri
        if (!identificativo || !nome || !durata) {
            return res.status(400).json({
                success: false,
                message: 'Tutti i campi sono obbligatori (identificativo, nome, durata)'
            });
        }

        if (durata <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La durata deve essere maggiore di 0 secondi'
            });
        }

        const connection = await getConnection();

        // Verifica se identificativo già esiste
        const [existing] = await connection.execute(
            'SELECT id FROM lavorazioni WHERE identificativo = ?',
            [identificativo]
        );

        if (existing.length > 0) {
            await connection.end();
            return res.status(400).json({
                success: false,
                message: `Identificativo "${identificativo}" già esistente`
            });
        }

        // Inserisci nuova lavorazione
        const [result] = await connection.execute(`
            INSERT INTO lavorazioni (identificativo, nome, durata, stato)
            VALUES (?, ?, ?, 'CONFIGURATA')
        `, [identificativo, nome, parseInt(durata)]);

        await connection.end();

        console.log(`Nuova lavorazione creata: ${identificativo} - ${nome} (${durata}s)`);

        res.json({
            success: true,
            message: `Lavorazione "${nome}" creata con successo!`,
            data: {
                id: result.insertId,
                identificativo,
                nome,
                durata: parseInt(durata),
                stato: 'CONFIGURATA'
            }
        });

    } catch (error) {
        console.error('Errore creazione lavorazione:', error);
        res.status(500).json({
            success: false,
            message: 'Errore del server: ' + error.message
        });
    }
});

// GET /api/lavorazioni - Lista lavorazioni
app.get('/api/lavorazioni', async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM lavorazioni ORDER BY created_at DESC'
        );
        await connection.end();

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error('Errore lettura lavorazioni:', error);
        res.status(500).json({
            success: false,
            message: 'Errore del server: ' + error.message
        });
    }
});

// POST /api/lavorazioni/:id/invia - Mette lavorazione in coda per Arduino
app.post('/api/lavorazioni/:id/invia', async (req, res) => {
    try {
        const lavorazioneId = parseInt(req.params.id);
        const connection = await getConnection();

        // Verifica lavorazione esistente e stato
        const [lavorazioni] = await connection.execute(
            'SELECT * FROM lavorazioni WHERE id = ? AND stato = "CONFIGURATA"',
            [lavorazioneId]
        );

        if (lavorazioni.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: 'Lavorazione non trovata o già in coda/inviata'
            });
        }

        const lavorazione = lavorazioni[0];

        // Aggiorna stato a IN_CODA
        await connection.execute(
            'UPDATE lavorazioni SET stato = "IN_CODA" WHERE id = ?',
            [lavorazioneId]
        );

        // Aggiungi log di invio
        await connection.execute(`
            INSERT INTO log (lavorazione_id, identificativo_lavorazione, nome_lavorazione, 
                           durata_lavorazione, stato, note) 
            VALUES (?, ?, ?, ?, 'INVIATA', 'Lavorazione messa in coda per Arduino')
        `, [lavorazioneId, lavorazione.identificativo, lavorazione.nome, lavorazione.durata]);

        await connection.end();

        console.log(`📤 Lavorazione in coda: ${lavorazione.identificativo} - ${lavorazione.nome}`);

        res.json({
            success: true,
            message: `Lavorazione "${lavorazione.nome}" messa in coda per Arduino`,
            data: lavorazione
        });

    } catch (error) {
        console.error('Errore invio lavorazione:', error);
        res.status(500).json({
            success: false,
            message: 'Errore del server: ' + error.message
        });
    }
});

// GET /api/log - Storico lavorazioni
app.get('/api/log', async (req, res) => {
    try {
        const connection = await getConnection();

        const [rows] = await connection.execute(`
            SELECT l.*, lav.identificativo, lav.nome
            FROM log l
            LEFT JOIN lavorazioni lav ON l.lavorazione_id = lav.id
            ORDER BY l.orario_evento DESC
            LIMIT 100
        `);

        await connection.end();

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error('Errore lettura log:', error);
        res.status(500).json({
            success: false,
            message: 'Errore del server: ' + error.message
        });
    }
});

// GET /api/status - Stato sistema
app.get('/api/status', async (req, res) => {
    try {
        const connection = await getConnection();

        // Conta lavorazioni per stato
        const [stati] = await connection.execute(`
            SELECT stato, COUNT(*) as count 
            FROM lavorazioni 
            GROUP BY stato
        `);

        // Ultima attività
        const [ultimaAttivita] = await connection.execute(`
            SELECT orario_evento, stato, nome_lavorazione 
            FROM log 
            ORDER BY orario_evento DESC 
            LIMIT 1
        `);

        await connection.end();

        // Stato Arduino da file condiviso
        const arduinoStatus = getArduinoStatus();

        res.json({
            success: true,
            sistema: {
                database_connesso: true,
                arduino_connesso: arduinoStatus.connected,
                arduino_porta: arduinoStatus.port,
                arduino_ultimo_aggiornamento: arduinoStatus.last_update,
                timestamp: new Date().toISOString()
            },
            statistiche: {
                stati_lavorazioni: stati,
                ultima_attivita: ultimaAttivita[0] || null
            }
        });

    } catch (error) {
        console.error('Errore stato sistema:', error);
        res.status(500).json({
            success: false,
            message: 'Errore del server: ' + error.message
        });
    }
});

app.get('/api/progress', (req, res) => {
    try {
        const statusFile = path.join(__dirname, '../arduino_status.json');
        if (fs.existsSync(statusFile)) {
            const statusData = fs.readFileSync(statusFile, 'utf8');
            const status = JSON.parse(statusData);

            res.json({
                success: true,
                progress: status.currentWork || {
                    active: false,
                    lavorazioneId: null,
                    nome: '',
                    identificativo: '',
                    remaining: 0,
                    duration: 0,
                    status: 'WAITING'
                }
            });
        } else {
            res.json({
                success: true,
                progress: { active: false }
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Errore lettura progress: ' + error.message
        });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Errore interno del server'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint non trovato'
    });
});

// Avvio server
app.listen(PORT, () => {
    console.log('========================================');
    console.log('   GATEWAY API SISTEMA LAVORAZIONI');
    console.log('========================================');
    console.log(`Server in ascolto su http://localhost:${PORT}`);
    console.log('Endpoints API disponibili:');
    console.log('   POST /api/lavorazioni - Crea lavorazione');
    console.log('   GET  /api/lavorazioni - Lista lavorazioni');
    console.log('   POST /api/lavorazioni/:id/invia - Invia ad Arduino');
    console.log('   GET  /api/log - Storico lavorazioni');
    console.log('   GET  /api/status - Stato sistema');
    console.log('🔧 ========================================\n');
});

module.exports = app;