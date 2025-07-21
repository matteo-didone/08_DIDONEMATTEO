// database/setup-database.js - Setup Database per Esame
// Sistema Gestione Lavorazioni Temporizzate

const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '', // Inserisci la tua password MySQL se necessaria
    database: 'esame'
};

async function setupDatabase() {
    let connection;

    try {
        console.log('🔧 Setup Database Sistema Lavorazioni');
        console.log('🗄️  Connessione a MySQL...');

        // Prima connessione senza database per crearlo
        const tempConfig = { ...dbConfig };
        delete tempConfig.database;

        let tempConnection = await mysql.createConnection(tempConfig);
        console.log('✅ Connesso a MySQL!');

        // Droppa e ricrea database per setup pulito
        console.log('🗑️  Drop database esistente...');
        await tempConnection.query('DROP DATABASE IF EXISTS esame');
        console.log('✅ Database droppato!');

        console.log('📋 Creazione database esame...');
        await tempConnection.query('CREATE DATABASE esame');
        console.log('✅ Database creato!');

        await tempConnection.end();

        // Nuova connessione con il database specificato
        console.log('📋 Connessione al database esame...');
        connection = await mysql.createConnection(dbConfig);

        // =====================================
        // TABELLA LAVORAZIONI
        // =====================================
        console.log('📋 Creazione tabella lavorazioni...');
        const createLavorazioniTable = `
            CREATE TABLE IF NOT EXISTS lavorazioni (
                id INT AUTO_INCREMENT PRIMARY KEY,
                identificativo VARCHAR(50) NOT NULL UNIQUE COMMENT 'Codice identificativo lavorazione',
                nome VARCHAR(100) NOT NULL COMMENT 'Nome descrittivo della lavorazione',
                durata INT NOT NULL COMMENT 'Durata in secondi',
                stato ENUM('CONFIGURATA', 'IN_CODA', 'INVIATA') DEFAULT 'CONFIGURATA' COMMENT 'Stato della lavorazione',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT chk_durata CHECK (durata > 0),
                
                INDEX idx_identificativo (identificativo),
                INDEX idx_stato (stato),
                INDEX idx_created_at (created_at)
            ) COMMENT='Tipi di lavorazione configurabili dal sistema'
        `;
        await connection.query(createLavorazioniTable);
        console.log('✅ Tabella lavorazioni creata!');

        // =====================================
        // TABELLA LOG  
        // =====================================
        console.log('📋 Creazione tabella log...');
        const createLogTable = `
            CREATE TABLE IF NOT EXISTS log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                lavorazione_id INT NOT NULL,
                identificativo_lavorazione VARCHAR(50) NOT NULL COMMENT 'Backup identificativo per storico',
                nome_lavorazione VARCHAR(100) NOT NULL COMMENT 'Backup nome per storico',
                durata_lavorazione INT NOT NULL COMMENT 'Durata effettiva in secondi',
                stato ENUM('INVIATA', 'ACCETTATA', 'AVVIATA', 'COMPLETATA', 'RIFIUTATA', 'CANCELLATA') NOT NULL,
                orario_evento TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp dell evento',
                note TEXT NULL COMMENT 'Note aggiuntive opzionali',
                
                FOREIGN KEY (lavorazione_id) REFERENCES lavorazioni(id) ON DELETE CASCADE,
                
                INDEX idx_lavorazione_id (lavorazione_id),
                INDEX idx_stato (stato),
                INDEX idx_orario_evento (orario_evento),
                INDEX idx_identificativo_lavorazione (identificativo_lavorazione)
            ) COMMENT='Log cronologico delle lavorazioni eseguite'
        `;
        await connection.query(createLogTable);
        console.log('✅ Tabella log creata!');

        // =====================================
        // DATI DI ESEMPIO
        // =====================================
        console.log('📋 Inserimento dati di esempio...');
        const insertExamples = `
            INSERT INTO lavorazioni (identificativo, nome, durata, stato) VALUES 
            ('LAV001', 'Lavorazione Standard', 30, 'CONFIGURATA'),
            ('LAV002', 'Lavorazione Veloce', 15, 'CONFIGURATA'),
            ('LAV003', 'Lavorazione Lunga', 120, 'CONFIGURATA'),
            ('TEST01', 'Test Breve', 5, 'CONFIGURATA'),
            ('PROD01', 'Produzione Base', 60, 'CONFIGURATA')
        `;
        await connection.query(insertExamples);
        console.log('✅ Dati di esempio inseriti!');

        // =====================================
        // VERIFICA INSTALLAZIONE
        // =====================================
        const [lavorazioniRows] = await connection.query('SELECT COUNT(*) as count FROM lavorazioni');
        const [logRows] = await connection.query('SELECT COUNT(*) as count FROM log');

        console.log('\n🔧 ========================================');
        console.log('   DATABASE SETUP COMPLETATO!');
        console.log('🔧 ========================================');
        console.log('✅ Database: esame');
        console.log('✅ Tabelle: lavorazioni, log');
        console.log(`✅ Lavorazioni disponibili: ${lavorazioniRows[0].count}`);
        console.log(`✅ Log registrati: ${logRows[0].count}`);
        console.log('\n📊 LAVORAZIONI DI ESEMPIO:');

        const [samples] = await connection.query(`
            SELECT identificativo, nome, durata, stato 
            FROM lavorazioni 
            ORDER BY id
        `);

        samples.forEach(lav => {
            console.log(`   🔧 ${lav.identificativo} - ${lav.nome}: ${lav.durata}s (${lav.stato})`);
        });

        console.log('\n💡 PROSSIMI STEP:');
        console.log('1. Implementa gateway seriale per Arduino');
        console.log('2. Implementa gateway API per frontend');
        console.log('3. Sviluppa interfaccia web');
        console.log('4. Programma scheda Arduino');
        console.log('🔧 ========================================\n');

    } catch (error) {
        console.error('❌ Errore setup database:', error);

        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 SUGGERIMENTI:');
            console.log('1. Assicurati che MySQL sia in esecuzione');
            console.log('2. Verifica host, porta e credenziali in dbConfig');
            console.log('3. Su macOS: brew services start mysql');
            console.log('4. Su Windows: Avvia servizio MySQL');
            console.log('5. Su Linux: sudo systemctl start mysql');
        }

        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Avvia setup se script eseguito direttamente
if (require.main === module) {
    setupDatabase();
}

module.exports = { setupDatabase };