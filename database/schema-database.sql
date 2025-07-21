-- Crea database
CREATE DATABASE IF NOT EXISTS esame;

USE esame;

-- Tabella per i tipi di lavorazione configurabili
CREATE TABLE IF NOT EXISTS lavorazioni (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identificativo VARCHAR(50) NOT NULL UNIQUE COMMENT 'Codice identificativo lavorazione',
    nome VARCHAR(100) NOT NULL COMMENT 'Nome descrittivo della lavorazione',
    durata INT NOT NULL COMMENT 'Durata in secondi',
    stato ENUM('CONFIGURATA', 'IN_CODA', 'INVIATA') DEFAULT 'CONFIGURATA' COMMENT 'Stato della lavorazione',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Vincoli
    CONSTRAINT chk_durata CHECK (durata > 0),
    -- Indici
    INDEX idx_identificativo (identificativo),
    INDEX idx_stato (stato),
    INDEX idx_created_at (created_at)
) COMMENT = 'Tipi di lavorazione configurabili dal sistema';

-- Tabella per il log delle lavorazioni eseguite
CREATE TABLE IF NOT EXISTS log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lavorazione_id INT NOT NULL,
    identificativo_lavorazione VARCHAR(50) NOT NULL COMMENT 'Backup identificativo per storico',
    nome_lavorazione VARCHAR(100) NOT NULL COMMENT 'Backup nome per storico',
    durata_lavorazione INT NOT NULL COMMENT 'Durata effettiva in secondi',
    stato ENUM(
        'INVIATA',
        'ACCETTATA',
        'AVVIATA',
        'COMPLETATA',
        'RIFIUTATA',
        'CANCELLATA'
    ) NOT NULL,
    orario_evento TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp dell evento',
    note TEXT NULL COMMENT 'Note aggiuntive opzionali',
    -- Chiave esterna
    FOREIGN KEY (lavorazione_id) REFERENCES lavorazioni(id) ON DELETE CASCADE,
    -- Indici
    INDEX idx_lavorazione_id (lavorazione_id),
    INDEX idx_stato (stato),
    INDEX idx_orario_evento (orario_evento),
    INDEX idx_identificativo_lavorazione (identificativo_lavorazione)
) COMMENT = 'Log cronologico delle lavorazioni eseguite';

-- Inserimento dati di esempio per test
INSERT INTO
    lavorazioni (identificativo, nome, durata, stato)
VALUES
    (
        'LAV001',
        'Lavorazione Standard',
        30,
        'CONFIGURATA'
    ),
    (
        'LAV002',
        'Lavorazione Veloce',
        15,
        'CONFIGURATA'
    ),
    (
        'LAV003',
        'Lavorazione Lunga',
        120,
        'CONFIGURATA'
    ),
    ('TEST01', 'Test Breve', 5, 'CONFIGURATA'),
    ('PROD01', 'Produzione Base', 60, 'CONFIGURATA');

-- Visualizzazione struttura creata
SELECT
    'Struttura Database Creata:' as Info;

SELECT
    TABLE_NAME,
    TABLE_COMMENT
FROM
    INFORMATION_SCHEMA.TABLES
WHERE
    TABLE_SCHEMA = 'esame';

SELECT
    'Dati di esempio inseriti:' as Info;

SELECT
    id,
    identificativo,
    nome,
    durata,
    stato
FROM
    lavorazioni;