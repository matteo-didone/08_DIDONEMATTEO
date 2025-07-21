#include <TimerOne.h>
#include <Wire.h>
#include <MultiFuncShield.h>
#include <ArduinoJson.h>

// Sistema Gestione Lavorazioni Temporizzate
// Prova d'Esame TECNICO SUPERIORE DIGITAL SOLUTIONS 4.0

// Stati del sistema lavorazioni
enum LavorazioneState
{
    WAITING_LAVORAZIONE,    // In attesa di lavorazione dal gateway
    LAVORAZIONE_IN_CODA,    // Lavorazione ricevuta, in attesa accettazione
    LAVORAZIONE_ACCETTATA,  // Lavorazione accettata, pronta per avvio
    COUNTDOWN_ATTIVO,       // Countdown lavorazione in corso
    LAVORAZIONE_COMPLETATA, // Lavorazione terminata con successo
    LAVORAZIONE_RIFIUTATA   // Lavorazione rifiutata o cancellata
};

// Variabili globali sistema
LavorazioneState currentState = WAITING_LAVORAZIONE;
String lavorazioneData = "";       // JSON lavorazione completo
String identificativo = "";        // Identificativo lavorazione
String nomeLavorazione = "";       // Nome lavorazione
int lavorazioneId = 0;             // ID lavorazione per logging
int durataSecondi = 0;             // Durata lavorazione in secondi
int countdownSecondi = 0;          // Countdown attuale
unsigned long lastUpdate = 0;      // Timing controllo
unsigned long lastCountdown = 0;   // Timing countdown
unsigned long stateChangeTime = 0; // Tempo cambio stato

void setup()
{
    Serial.begin(9600);
    Timer1.initialize();
    MFS.initialize();

    // Messaggio iniziale sistema
    MFS.write("INIT");
    MFS.writeLeds(LED_ALL, OFF);

    Serial.println("===========================================");
    Serial.println("🔧 Sistema Gestione Lavorazioni Temporizzate");
    Serial.println("📋 Prova d'Esame - DIGITAL SOLUTIONS 4.0");
    Serial.println("===========================================");
    Serial.println("📡 In attesa di lavorazioni dal gateway...");
    Serial.println("🔧 Comandi supportati:");
    Serial.println("   - JSON: parametri lavorazione");
    Serial.println("   - Pulsante 1: Info/Accetta lavorazione");
    Serial.println("   - Pulsante 2: Avvia lavorazione");
    Serial.println("   - Pulsante 3: Rifiuta/Cancella");
    Serial.println("===========================================");
    Serial.println();

    delay(2000);
    MFS.write("WAIT");
    currentState = WAITING_LAVORAZIONE;
}

void loop()
{
    // Controlla input seriale per nuove lavorazioni
    checkSerialInput();

    // Gestisce pulsanti Multi-Function Shield
    handleButtons();

    // Gestisce stato corrente sistema
    handleCurrentState();

    delay(50); // Piccolo delay per stabilità
}

// =====================================
// GESTIONE COMUNICAZIONE SERIALE
// =====================================

void checkSerialInput()
{
    if (Serial.available())
    {
        String jsonString = Serial.readStringUntil('\n');
        jsonString.trim();

        if (jsonString.length() > 0)
        {
            parseLavorazione(jsonString);
        }
    }
}

void parseLavorazione(String jsonString)
{
    // Parse JSON lavorazione da gateway
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, jsonString);

    if (error)
    {
        Serial.println("❌ Errore parsing JSON lavorazione: " + String(error.c_str()));
        MFS.write("ERR");
        delay(2000);
        MFS.write("WAIT");
        return;
    }

    // Estrai parametri lavorazione secondo specifiche esame
    if (doc.containsKey("id") && doc.containsKey("name") && doc.containsKey("durata"))
    {
        lavorazioneId = doc["id"];
        nomeLavorazione = doc["name"].as<String>();
        identificativo = doc["identificativo"] | "";
        durataSecondi = doc["durata"] | 0;

        // Salva JSON completo per riferimento
        lavorazioneData = jsonString;
        countdownSecondi = durataSecondi;

        // Cambia stato a lavorazione in coda
        currentState = LAVORAZIONE_IN_CODA;
        stateChangeTime = millis();

        Serial.println("📋 Lavorazione ricevuta:");
        Serial.println("   🆔 ID: " + String(lavorazioneId));
        Serial.println("   🏷️  Identificativo: " + identificativo);
        Serial.println("   📝 Nome: " + nomeLavorazione);
        Serial.println("   ⏱️  Durata: " + String(durataSecondi) + " secondi");
        Serial.println("   📊 Stato: IN_CODA - In attesa accettazione");
        Serial.println();

        // LED per indicare lavorazione in coda (specifica esame)
        MFS.writeLeds(LED_ALL, OFF);
        MFS.writeLeds(LED_1, ON); // LED 1 = lavorazione in coda
        MFS.write("CODA");
    }
    else
    {
        Serial.println("❌ JSON lavorazione non valido - campi 'id', 'name' e 'durata' richiesti");
        MFS.write("BAD");
        delay(2000);
        MFS.write("WAIT");
    }
}

// =====================================
// GESTIONE PULSANTI
// =====================================

void handleButtons()
{
    byte btn = MFS.getButton();

    switch (currentState)
    {
    case LAVORAZIONE_IN_CODA:
        if (btn == BUTTON_1_PRESSED)
        {
            // Pulsante 1 - Accettazione manuale lavorazione
            accettaLavorazione();
        }
        else if (btn == BUTTON_3_PRESSED)
        {
            // Pulsante 3 - Rifiuta lavorazione
            rifiutaLavorazione();
        }
        break;

    case LAVORAZIONE_ACCETTATA:
        if (btn == BUTTON_2_PRESSED)
        {
            // Pulsante 2 - Avvia lavorazione
            avviaLavorazione();
        }
        else if (btn == BUTTON_3_PRESSED)
        {
            // Pulsante 3 - Rifiuta lavorazione
            rifiutaLavorazione();
        }
        break;

    case COUNTDOWN_ATTIVO:
        if (btn == BUTTON_3_PRESSED)
        {
            // Pulsante 3 - Cancella lavorazione in corso
            cancellaLavorazione();
        }
        break;

    case LAVORAZIONE_RIFIUTATA:
    case LAVORAZIONE_COMPLETATA:
        // Qualsiasi pulsante resetta il sistema
        if (btn == BUTTON_1_PRESSED || btn == BUTTON_2_PRESSED || btn == BUTTON_3_PRESSED)
        {
            resetSistema();
        }
        break;
    }
}

// =====================================
// AZIONI SPECIFICHE PULSANTI
// =====================================

void accettaLavorazione()
{
    currentState = LAVORAZIONE_ACCETTATA;
    stateChangeTime = millis();

    // LED spenti, display primi caratteri nome (specifica esame)
    MFS.writeLeds(LED_ALL, OFF);

    // Mostra primi caratteri nome lavorazione sul display
    String displayName = nomeLavorazione.substring(0, min(4, (int)nomeLavorazione.length()));
    displayName.toUpperCase();
    MFS.write(displayName.c_str());

    // Notifica gateway
    Serial.println("ACCETTATA:" + String(lavorazioneId));

    Serial.println("✅ Lavorazione accettata:");
    Serial.println("   📝 Nome: " + nomeLavorazione);
    Serial.println("   🆔 Display: " + displayName);
    Serial.println("   📊 Stato: ACCETTATA - Pronta per avvio");
    Serial.println("   💡 Premere pulsante 2 per avviare");
}

void avviaLavorazione()
{
    currentState = COUNTDOWN_ATTIVO;
    countdownSecondi = durataSecondi; // Reset countdown
    lastCountdown = millis();
    stateChangeTime = millis();

    // LED 2 acceso durante lavorazione (specifica esame)
    MFS.writeLeds(LED_ALL, OFF);
    MFS.writeLeds(LED_2, ON); // LED 2 = lavorazione in corso

    // Display countdown
    updateCountdownDisplay();

    // Notifica gateway
    Serial.println("AVVIATA:" + String(lavorazioneId));

    Serial.println("🚀 Lavorazione avviata:");
    Serial.println("   📝 Nome: " + nomeLavorazione);
    Serial.println("   ⏱️  Countdown: " + String(countdownSecondi) + " secondi");
    Serial.println("   📊 Stato: COUNTDOWN_ATTIVO");
    Serial.println("   🚫 Premere pulsante 3 per cancellare");
}

void rifiutaLavorazione()
{
    currentState = LAVORAZIONE_RIFIUTATA;
    stateChangeTime = millis();

    // LED 3 per rifiuto (specifica esame)
    MFS.writeLeds(LED_ALL, OFF);
    MFS.writeLeds(LED_3, ON);

    // Display "canc" per 3 secondi (specifica esame)
    MFS.write("CANC");

    // Notifica gateway
    Serial.println("RIFIUTATA:" + String(lavorazioneId));

    Serial.println("❌ Lavorazione rifiutata:");
    Serial.println("   📝 Nome: " + nomeLavorazione);
    Serial.println("   📊 Stato: RIFIUTATA");
    Serial.println("   ⏱️  Display 'CANC' per 3 secondi");
}

void cancellaLavorazione()
{
    currentState = LAVORAZIONE_RIFIUTATA;
    stateChangeTime = millis();

    // LED 3 per cancellazione
    MFS.writeLeds(LED_ALL, OFF);
    MFS.writeLeds(LED_3, ON);

    // Display "canc" per 3 secondi
    MFS.write("CANC");

    // Notifica gateway
    Serial.println("CANCELLATA:" + String(lavorazioneId));

    Serial.println("🚫 Lavorazione cancellata:");
    Serial.println("   📝 Nome: " + nomeLavorazione);
    Serial.println("   ⏱️  Countdown interrotto a: " + String(countdownSecondi) + "s");
    Serial.println("   📊 Stato: CANCELLATA");
}

void completaLavorazione()
{
    currentState = LAVORAZIONE_COMPLETATA;
    stateChangeTime = millis();

    // LED 4 per completamento + segnale acustico (specifica esame)
    MFS.writeLeds(LED_ALL, OFF);
    MFS.writeLeds(LED_4, ON);

    // Segnale acustico (beep) - simulato con messaggio
    MFS.beep();

    // Display "end" per 3 secondi (specifica esame)
    MFS.write("END");

    // Notifica gateway
    Serial.println("COMPLETATA:" + String(lavorazioneId));

    Serial.println("🏁 Lavorazione completata!");
    Serial.println("   📝 Nome: " + nomeLavorazione);
    Serial.println("   ⏱️  Durata: " + String(durataSecondi) + " secondi");
    Serial.println("   📊 Stato: COMPLETATA");
    Serial.println("   🔊 Beep emesso + Display 'END' per 3 secondi");
}

// =====================================
// GESTIONE STATI SISTEMA
// =====================================

void handleCurrentState()
{
    unsigned long currentTime = millis();

    switch (currentState)
    {
    case WAITING_LAVORAZIONE:
        // Mostra "WAIT" in attesa di lavorazioni
        if (currentTime - lastUpdate > 2000)
        {
            MFS.write("WAIT");
            lastUpdate = currentTime;
        }
        break;

    case LAVORAZIONE_IN_CODA:
        // LED 1 fisso + lampeggio "CODA"
        if (currentTime - lastUpdate > 1000)
        {
            static bool showCoda = true;
            MFS.writeLeds(LED_1, ON);

            if (showCoda)
            {
                MFS.write("CODA");
            }
            else
            {
                MFS.write("    ");
            }
            showCoda = !showCoda;
            lastUpdate = currentTime;
        }
        break;

    case LAVORAZIONE_ACCETTATA:
        // Mostra nome lavorazione fisso
        if (currentTime - stateChangeTime > 500)
        {
            String displayName = nomeLavorazione.substring(0, min(4, (int)nomeLavorazione.length()));
            displayName.toUpperCase();
            MFS.write(displayName.c_str());
        }
        break;

    case COUNTDOWN_ATTIVO:
        // Gestisce countdown con update ogni secondo
        if (currentTime - lastCountdown >= 1000)
        {
            countdownSecondi--;
            updateCountdownDisplay();

            Serial.println("⏱️  Countdown: " + String(countdownSecondi) + "s rimanenti");

            if (countdownSecondi <= 0)
            {
                completaLavorazione();
            }

            lastCountdown = currentTime;
        }
        break;

    case LAVORAZIONE_COMPLETATA:
        // Mostra "END" per 3 secondi, poi resetta
        if (currentTime - stateChangeTime > 3000)
        {
            resetSistema();
        }
        break;

    case LAVORAZIONE_RIFIUTATA:
        // Mostra "CANC" per 3 secondi, poi resetta
        if (currentTime - stateChangeTime > 3000)
        {
            resetSistema();
        }
        break;
    }
}

void updateCountdownDisplay()
{
    // Mostra countdown in formato appropriato
    if (countdownSecondi > 999)
    {
        // Se troppo grande, mostra solo le prime 4 cifre
        MFS.write(String(countdownSecondi).substring(0, 4).c_str());
    }
    else
    {
        MFS.write(countdownSecondi);
    }
}

void resetSistema()
{
    currentState = WAITING_LAVORAZIONE;
    lavorazioneData = "";
    identificativo = "";
    nomeLavorazione = "";
    lavorazioneId = 0;
    durataSecondi = 0;
    countdownSecondi = 0;

    MFS.writeLeds(LED_ALL, OFF);
    MFS.write("WAIT");

    Serial.println("🔄 Sistema resettato - In attesa di nuova lavorazione");
    Serial.println("📡 Pronto per prossima lavorazione");
    Serial.println();
}

// =====================================
// FUNZIONI UTILITÀ
// =====================================

void printSystemStatus()
{
    Serial.println("=== STATO SISTEMA LAVORAZIONI ===");
    Serial.println("Stato: " + String(currentState));
    Serial.println("Lavorazione: " + nomeLavorazione + " (ID: " + String(lavorazioneId) + ")");
    Serial.println("Identificativo: " + identificativo);
    Serial.println("Durata: " + String(durataSecondi) + "s");
    Serial.println("Countdown: " + String(countdownSecondi) + "s");
    Serial.println("============================");
}

// =====================================
// GESTIONE INTERRUPTS E BEEP
// =====================================

// Funzione beep semplificata per Multi Function Shield
void beepSound()
{
    // Il Multi Function Shield ha un buzzer integrato
    // Questa funzione può essere espansa per gestire il beep
    tone(8, 1000, 500); // Pin 8, 1000Hz, 500ms
}

// Debug function per stato LED
void debugLEDState()
{
    Serial.print("LED Status: ");
    for (int i = 1; i <= 4; i++)
    {
        Serial.print("LED" + String(i) + ":");
        Serial.print(digitalRead(i + 9)); // LED pins are 10,11,12,13
        Serial.print(" ");
    }
    Serial.println();
}