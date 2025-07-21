// gateway/gateway-serial.js - Gateway Seriale per Arduino

const mysql = require('mysql2/promise');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('fs');
const path = require('path');

// Database Configuration
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'esame'
};

// File di stato condiviso
const statusFile = path.join(__dirname, '../arduino_status.json');

// Arduino Serial Configuration
let serialPort = null;
let parser = null;
let isArduinoConnected = false;
let currentArduinoPort = null;

let currentWorkProgress = {
    active: false,
    lavorazioneId: null,
    identificativo: '',
    nome: '',
    startTime: null,
    duration: 0,
    remaining: 0,
    status: 'WAITING'
};

// Aggiorna stato Arduino su file
function updateArduinoStatus(connected, port = null) {
    const status = {
        connected: connected,
        port: port,
        timestamp: new Date().toISOString(),
        currentWork: currentWorkProgress
    };

    try {
        fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
    } catch (error) {
        console.error('Errore aggiornamento status file:', error);
    }
}

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
// GESTIONE PROGRESS REALE LAVORAZIONE
// =====================================

function startWorkProgress(lavorazioneId, identificativo, nome, durata) {
    currentWorkProgress = {
        active: true,
        lavorazioneId: lavorazioneId,
        identificativo: identificativo,
        nome: nome,
        startTime: Date.now(),
        duration: durata,
        remaining: durata,
        status: 'AVVIATA'
    };

    console.log(`🚀 [PROGRESS] Avviato tracking per ${identificativo} - ${durata}s`);
    updateArduinoStatus(isArduinoConnected, currentArduinoPort);
}

function updateWorkProgress() {
    if (!currentWorkProgress.active) return;

    const elapsed = Math.floor((Date.now() - currentWorkProgress.startTime) / 1000);
    currentWorkProgress.remaining = Math.max(0, currentWorkProgress.duration - elapsed);

    // Log ogni 5 secondi per debug
    if (elapsed % 5 === 0 && currentWorkProgress.remaining > 0) {
        console.log(`⏱️  [PROGRESS] ${currentWorkProgress.identificativo}: ${currentWorkProgress.remaining}s rimanenti`);
    }

    updateArduinoStatus(isArduinoConnected, currentArduinoPort);
}

function completeWorkProgress(lavorazioneId) {
    if (currentWorkProgress.lavorazioneId === parseInt(lavorazioneId)) {
        console.log(`🏁 [PROGRESS] Completato tracking per ${currentWorkProgress.identificativo}`);
        currentWorkProgress = {
            active: false,
            lavorazioneId: null,
            identificativo: '',
            nome: '',
            startTime: null,
            duration: 0,
            remaining: 0,
            status: 'COMPLETATA'
        };
        updateArduinoStatus(isArduinoConnected, currentArduinoPort);
    }
}

function cancelWorkProgress(lavorazioneId) {
    if (currentWorkProgress.lavorazioneId === parseInt(lavorazioneId)) {
        console.log(`[PROGRESS] Cancellato tracking per ${currentWorkProgress.identificativo}`);
        currentWorkProgress = {
            active: false,
            lavorazioneId: null,
            identificativo: '',
            nome: '',
            startTime: null,
            duration: 0,
            remaining: 0,
            status: 'CANCELLATA'
        };
        updateArduinoStatus(isArduinoConnected, currentArduinoPort);
    }
}

// =====================================
// ARDUINO SERIAL COMMUNICATION
// =====================================

async function findArduinoPort() {
    try {
        const ports = await SerialPort.list();

        console.log('Porte seriali disponibili:');
        ports.forEach(port => {
            console.log(`   ${port.path} - ${port.manufacturer || 'Unknown'}`);
        });

        // Strategia di ricerca Arduino migliorata
        let arduinoPort = null;

        // 1. Cerca per manufacturer Arduino
        arduinoPort = ports.find(port =>
            port.manufacturer && port.manufacturer.toLowerCase().includes('arduino')
        );

        // 2. Se non trovato, cerca per pattern comuni macOS
        if (!arduinoPort) {
            arduinoPort = ports.find(port =>
                port.path.includes('cu.usbmodem') ||
                port.path.includes('tty.usbmodem')
            );
        }

        // 3. Se non trovato, cerca per pattern comuni Windows/Linux
        if (!arduinoPort) {
            arduinoPort = ports.find(port =>
                port.path.includes('COM') ||           // Windows
                port.path.includes('ttyUSB') ||        // Linux
                port.path.includes('ttyACM') ||        // Linux
                port.manufacturer && (
                    port.manufacturer.includes('FTDI') ||
                    port.manufacturer.includes('Silicon Labs') ||
                    port.manufacturer.includes('CH340') ||
                    port.manufacturer.includes('CP210')
                )
            );
        }

        // 4. Se ancora non trovato, cerca qualsiasi porta con 'usb' nel nome
        if (!arduinoPort) {
            arduinoPort = ports.find(port =>
                port.path.toLowerCase().includes('usb')
            );
        }

        return arduinoPort;
    } catch (error) {
        console.error('Errore ricerca porte seriali:', error);
        return null;
    }
}

async function initializeArduino() {
    try {
        console.log('Ricerca Arduino con rilevamento dinamico...');

        const arduinoPort = await findArduinoPort();

        if (!arduinoPort) {
            console.log('Arduino non trovato automaticamente');
            console.log('Modalità simulazione attivata');
            updateArduinoStatus(false);
            return false;
        }

        console.log(`Arduino trovato: ${arduinoPort.path}`);
        if (arduinoPort.manufacturer) {
            console.log(`Manufacturer: ${arduinoPort.manufacturer}`);
        }

        currentArduinoPort = arduinoPort.path;

        // Crea connessione seriale
        serialPort = new SerialPort({
            path: arduinoPort.path,
            baudRate: 9600,
            autoOpen: false
        });

        parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

        // Eventi SerialPort
        serialPort.on('open', () => {
            console.log('Arduino connesso e pronto!');
            isArduinoConnected = true;
            updateArduinoStatus(true, currentArduinoPort);
        });

        serialPort.on('error', (error) => {
            console.error('Errore Arduino:', error.message);
            isArduinoConnected = false;
            updateArduinoStatus(false);

            // Prova a riconnettersi dopo 5 secondi
            setTimeout(() => {
                console.log('Tentativo riconnessione Arduino...');
                initializeArduino();
            }, 5000);
        });

        serialPort.on('close', () => {
            console.log('Arduino disconnesso');
            isArduinoConnected = false;
            updateArduinoStatus(false);
        });

        // Gestisci risposte da Arduino
        parser.on('data', (data) => {
            const message = data.toString().trim();
            if (message.length > 0) {
                console.log(`Arduino: ${message}`);
                handleArduinoResponse(message);
            }
        });

        // Apri connessione con timeout
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log('Timeout connessione Arduino');
                resolve(false);
            }, 3000);

            serialPort.open((error) => {
                clearTimeout(timeout);
                if (error) {
                    console.error('Errore apertura porta:', error.message);
                    resolve(false);
                } else {
                    // Attendi stabilizzazione
                    setTimeout(() => resolve(true), 2000);
                }
            });
        });

    } catch (error) {
        console.error('Errore inizializzazione Arduino:', error);
        updateArduinoStatus(false);
        return false;
    }
}

// *** MIGLIORATO: Gestisci risposte Arduino con tracking reale ***
async function handleArduinoResponse(message) {
    try {
        // Filtra messaggi di debug/info
        if (message.includes('🔧') || message.includes('📋') || message.includes('=')) {
            return;
        }

        console.log(`[GATEWAY] Risposta Arduino: "${message}"`);

        // Parsing messaggi Arduino secondo specifiche esame (formato: "STATO:ID")
        if (message.includes('ACCETTATA:')) {
            const lavorazioneId = message.split(':')[1];
            await logStato(lavorazioneId, 'ACCETTATA', 'Lavorazione accettata dall operatore (Pulsante 1)');
            console.log(`Lavorazione ${lavorazioneId} accettata da Arduino`);
        }
        else if (message.includes('AVVIATA:')) {
            const lavorazioneId = message.split(':')[1];
            await logStato(lavorazioneId, 'AVVIATA', 'Lavorazione avviata - countdown iniziato (Pulsante 2)');

            const lavorazione = await getLavorazioneById(lavorazioneId);
            if (lavorazione) {
                startWorkProgress(lavorazioneId, lavorazione.identificativo, lavorazione.nome, lavorazione.durata);
            }

            console.log(`🚀 Lavorazione ${lavorazioneId} avviata - tracking attivo`);
        }
        else if (message.includes('COMPLETATA:')) {
            const lavorazioneId = message.split(':')[1];
            await logStato(lavorazioneId, 'COMPLETATA', 'Lavorazione completata con successo - beep emesso');
            completeWorkProgress(lavorazioneId);
            console.log(`Lavorazione ${lavorazioneId} completata con successo`);
        }
        else if (message.includes('RIFIUTATA:')) {
            const lavorazioneId = message.split(':')[1];
            await logStato(lavorazioneId, 'RIFIUTATA', 'Lavorazione rifiutata dall operatore (Pulsante 3)');
            await resetStatoLavorazione(lavorazioneId);

            cancelWorkProgress(lavorazioneId);

            console.log(`Lavorazione ${lavorazioneId} rifiutata da Arduino`);
        }
        else if (message.includes('CANCELLATA:')) {
            const lavorazioneId = message.split(':')[1];
            await logStato(lavorazioneId, 'CANCELLATA', 'Lavorazione cancellata durante countdown (Pulsante 3)');
            await resetStatoLavorazione(lavorazioneId);

            // *** AGGIUNTO: Cancella tracking reale ***
            cancelWorkProgress(lavorazioneId);

            console.log(`Lavorazione ${lavorazioneId} cancellata da Arduino`);
        }
    } catch (error) {
        console.error('Errore gestione risposta Arduino:', error);
    }
}

async function getLavorazioneById(lavorazioneId) {
    try {
        const connection = await getConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM lavorazioni WHERE id = ?',
            [lavorazioneId]
        );
        await connection.end();

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Errore recupero lavorazione:', error);
        return null;
    }
}

// Invia lavorazione ad Arduino
function sendLavorazioneToArduino(lavorazione) {
    if (!isArduinoConnected || !serialPort || !serialPort.isOpen) {
        console.log('Arduino non connesso - modalità simulazione');
        return false;
    }

    try {
        // Formato JSON per Arduino (compatibile con formato esistente)
        const jsonData = {
            id: lavorazione.id,
            name: lavorazione.nome,  // Arduino si aspetta 'name' non 'nome'
            identificativo: lavorazione.identificativo,
            durata: lavorazione.durata
        };

        const jsonString = JSON.stringify(jsonData) + '\n';
        serialPort.write(jsonString);
        console.log(`Lavorazione inviata ad Arduino: ${lavorazione.identificativo} - ${lavorazione.nome}`);
        return true;
    } catch (error) {
        console.error('Errore invio lavorazione:', error);
        return false;
    }
}

// Aggiorna log nel database
async function logStato(lavorazioneId, stato, note = null) {
    try {
        const connection = await getConnection();

        // Ottieni info lavorazione
        const [lavorazioni] = await connection.execute(
            'SELECT * FROM lavorazioni WHERE id = ?',
            [lavorazioneId]
        );

        if (lavorazioni.length > 0) {
            const lav = lavorazioni[0];

            await connection.execute(`
                INSERT INTO log (lavorazione_id, identificativo_lavorazione, nome_lavorazione, 
                               durata_lavorazione, stato, note) 
                VALUES (?, ?, ?, ?, ?, ?)
            `, [lavorazioneId, lav.identificativo, lav.nome, lav.durata, stato, note]);
        }

        await connection.end();
    } catch (error) {
        console.error('Errore aggiornamento log:', error);
    }
}

// Reset stato lavorazione a CONFIGURATA (per rifiuti/cancellazioni)
async function resetStatoLavorazione(lavorazioneId) {
    try {
        const connection = await getConnection();
        await connection.execute(
            'UPDATE lavorazioni SET stato = "CONFIGURATA" WHERE id = ?',
            [lavorazioneId]
        );
        await connection.end();
        console.log(`Stato lavorazione ${lavorazioneId} resettato a CONFIGURATA`);
    } catch (error) {
        console.error('Errore reset stato lavorazione:', error);
    }
}

// =====================================
// POLLING SYSTEM
// =====================================

async function pollNuoveLavorazioni() {
    try {
        const connection = await getConnection();

        // Cerca lavorazioni in coda per Arduino (ogni secondo)
        const [rows] = await connection.execute(`
            SELECT * FROM lavorazioni 
            WHERE stato = 'IN_CODA'
            ORDER BY created_at ASC 
            LIMIT 1
        `);

        if (rows.length > 0) {
            const lavorazione = rows[0];
            console.log(`📋 Lavorazione da inviare: ${lavorazione.identificativo} - ${lavorazione.nome} (${lavorazione.durata}s)`);

            // Invia ad Arduino
            const sent = sendLavorazioneToArduino(lavorazione);

            if (sent || !isArduinoConnected) {
                // Aggiorna stato a INVIATA
                await connection.execute(
                    'UPDATE lavorazioni SET stato = "INVIATA" WHERE id = ?',
                    [lavorazione.id]
                );

                // Log invio
                await connection.execute(`
                    INSERT INTO log (lavorazione_id, identificativo_lavorazione, nome_lavorazione, 
                                   durata_lavorazione, stato, note) 
                    VALUES (?, ?, ?, ?, 'INVIATA', ?)
                `, [
                    lavorazione.id,
                    lavorazione.identificativo,
                    lavorazione.nome,
                    lavorazione.durata,
                    isArduinoConnected ? 'Inviata ad Arduino via seriale' : 'Simulazione invio (Arduino non connesso)'
                ]);

                console.log(`Lavorazione "${lavorazione.nome}" processata`);
            }
        }

        await connection.end();

    } catch (error) {
        console.error('Errore polling:', error);
    }
}

function getCurrentProgress() {
    return currentWorkProgress;
}

// =====================================
// STARTUP
// =====================================

async function startGatewaySeriale() {
    try {
        console.log('========================================');
        console.log('   GATEWAY SERIALE ARDUINO - REALE');
        console.log('========================================');
        console.log('Avvio Gateway Seriale Arduino...');

        // Test database
        console.log('Test connessione database...');
        const testConnection = await getConnection();
        await testConnection.end();
        console.log('Database connesso!');

        // Inizializza Arduino con rilevamento dinamico
        console.log('Inizializzazione Arduino...');
        const arduinoConnected = await initializeArduino();

        if (arduinoConnected) {
            console.log('Arduino connesso!');
            updateArduinoStatus(true, currentArduinoPort);
        } else {
            console.log('Arduino non connesso - modalità simulazione attiva');
            updateArduinoStatus(false);
        }

        // Avvia polling ogni secondo come richiesto dalla prova
        setInterval(pollNuoveLavorazioni, 1000);
        console.log('Polling database attivato (1 secondo)');

        setInterval(updateWorkProgress, 1000);
        console.log('Progress tracking attivato (1 secondo)');

        // Aggiorna stato Arduino ogni 5 secondi
        setInterval(() => {
            updateArduinoStatus(isArduinoConnected, currentArduinoPort);
        }, 5000);

        console.log('\n========================================');
        console.log('     GATEWAY SERIALE REALE ATTIVO');
        console.log('========================================');
        console.log(`Arduino: ${isArduinoConnected ? 'Connesso' : '⚠️  Simulazione'}`);
        if (isArduinoConnected) {
            console.log(`Porta: ${currentArduinoPort}`);
        }
        console.log('Polling: Attivo ogni 1 secondo');
        console.log('Progress: Tracking reale attivato');
        console.log('Monitoraggio tabella: lavorazioni (stato=IN_CODA)');
        console.log('Logging: tabella log');
        console.log('========================================\n');

    } catch (error) {
        console.error('Errore avvio gateway seriale:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n Shutdown gateway seriale...');
    updateArduinoStatus(false);
    if (serialPort && serialPort.isOpen) {
        serialPort.close(() => {
            console.log('Arduino disconnesso');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

// Avvia gateway se eseguito direttamente
if (require.main === module) {
    startGatewaySeriale();
}

module.exports = { startGatewaySeriale, getCurrentProgress };