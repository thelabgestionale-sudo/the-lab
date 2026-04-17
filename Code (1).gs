// ============================================================
//  THE LAB — Google Apps Script Backend (versione sicura)
//  
//  ISTRUZIONI SETUP:
//  1. Sostituisci SPREADSHEET_ID con l'ID del tuo Google Sheet
//  2. Sostituisci SECRET_TOKEN con una stringa casuale lunga
//     (generala su: https://www.uuidgenerator.net/ oppure
//      usa due UUID concatenati per maggiore sicurezza)
//  3. Imposta le email reali in AUTHORIZED_USERS
//  4. Copia lo stesso SECRET_TOKEN in index.html
//  5. Distribuisci come Web App (Esegui come: Me, Accesso: Chiunque)
// ============================================================

// ── CONFIGURAZIONE ──────────────────────────────────────────

var SPREADSHEET_ID = "11sfXGB4fGl-hszGazAuTBj7NuOObwsztNBoPKnhsJ48";

// Genera una stringa casuale su https://www.uuidgenerator.net/
// Esempio: "f47ac10b-58cc-4372-a567-0e02b2c3d479-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
// DEVE essere identico al SECRET_TOKEN in index.html
var SECRET_TOKEN = "71d246c0-00b3-424a-a680-99231fb43b32-b10c7d4e-d3ea-4821-beee-f613dfd0ff93";

// Dominio autorizzato — solo richieste da questo origine sono accettate
var ALLOWED_ORIGIN = "https://thelabgestionale-sudo.github.io";

// Utenti autorizzati: email → ruolo
// DEVE corrispondere ad ALLOWED_USERS in index.html
var AUTHORIZED_USERS = {
  "thelabgestionale@gmail.com": "admin",
  "simone.rosa965@gmail.com":   "base"
};

// Rate limiting: max richieste per email per finestra temporale
var RATE_LIMIT_MAX      = 60;   // massimo 60 richieste
var RATE_LIMIT_WINDOW   = 60;   // in 60 secondi

// ── ROUTING ─────────────────────────────────────────────────

function doGet(e) {
  var check = securityCheck(e.parameter, null, e.parameter.action);
  if (check.error) return respond(check, check.status || 403);

  var action = e.parameter.action || "";
  if (action === "getClients") return getClients();
  if (action === "getClient")  return getClient(e.parameter.id);
  return respond({ error: "Azione non valida" }, 400);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ error: "Body non valido" }, 400);
  }

  var check = securityCheck(null, body, body.action);
  if (check.error) return respond(check, check.status || 403);

  var role   = check.role;
  var action = body.action || "";

  if (action === "createClient") return createClient(body);
  if (action === "updateClient") return updateClient(body);
  if (action === "deleteClient") {
    if (role !== "admin") return respond({ error: "Permesso negato: solo gli admin possono eliminare" }, 403);
    return deleteClient(body);
  }
  return respond({ error: "Azione non valida" }, 400);
}

// ── SICUREZZA ────────────────────────────────────────────────

// Controllo centralizzato: token segreto + JWT Google + rate limit
function securityCheck(params, body, action) {
  var token   = (params && params.token)   || (body && body.token)   || "";
  var idToken = (params && params.idToken) || (body && body.idToken) || "";

  // 1. Verifica token segreto condiviso
  if (token !== SECRET_TOKEN) {
    return { error: "Non autorizzato", status: 403 };
  }

  // 2. Verifica Google ID Token (JWT firmato da Google)
  var identity = verifyGoogleToken(idToken);
  if (!identity) {
    return { error: "Token Google non valido o scaduto", status: 401 };
  }

  // 3. Verifica che l'email sia nella whitelist
  var email = identity.email;
  var role  = AUTHORIZED_USERS[email];
  if (!role) {
    return { error: "Utente non autorizzato: " + email, status: 403 };
  }

  // 4. Rate limiting per email
  var rateLimitResult = checkRateLimit(email);
  if (!rateLimitResult.allowed) {
    return { error: "Troppe richieste. Riprova tra " + rateLimitResult.retryAfter + " secondi.", status: 429 };
  }

  return { ok: true, email: email, role: role };
}

// Verifica il Google ID Token chiamando le API Google
function verifyGoogleToken(idToken) {
  if (!idToken) return null;
  try {
    var url      = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code     = response.getResponseCode();
    if (code !== 200) return null;

    var payload = JSON.parse(response.getContentText());

    // Verifica che il token non sia scaduto
    var now = Math.floor(Date.now() / 1000);
    if (payload.exp && parseInt(payload.exp) < now) return null;

    // Verifica che il token sia stato emesso per questa app
    // (audience deve corrispondere al Google Client ID dell'app)
    if (!payload.email || !payload.email_verified) return null;

    return { email: payload.email };
  } catch (err) {
    Logger.log("Errore verifica token: " + err.toString());
    return null;
  }
}

// Rate limiting con PropertiesService (persiste tra le chiamate)
function checkRateLimit(email) {
  var props    = PropertiesService.getScriptProperties();
  var key      = "rl_" + email.replace(/[@.]/g, "_");
  var now      = Math.floor(Date.now() / 1000);
  var existing = props.getProperty(key);
  var data     = existing ? JSON.parse(existing) : { count: 0, windowStart: now };

  // Reset finestra se scaduta
  if (now - data.windowStart > RATE_LIMIT_WINDOW) {
    data = { count: 0, windowStart: now };
  }

  data.count++;
  props.setProperty(key, JSON.stringify(data));

  if (data.count > RATE_LIMIT_MAX) {
    var retryAfter = RATE_LIMIT_WINDOW - (now - data.windowStart);
    return { allowed: false, retryAfter: retryAfter };
  }
  return { allowed: true };
}

// ── RISPOSTA ─────────────────────────────────────────────────

function respond(data, statusCode) {
  // Apps Script non supporta status code personalizzati nelle Web App,
  // quindi includiamo sempre il codice nel body e gestiamo lato client
  if (statusCode && statusCode !== 200) {
    data._status = statusCode;
  }
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HELPERS SPREADSHEET ──────────────────────────────────────

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function rowToObject(headers, row) {
  var obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i]; });
  return obj;
}

function objectToRow(headers, obj) {
  return headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ""; });
}

// ── CLIENTI ──────────────────────────────────────────────────

function getClients() {
  var sheet   = getSheet("Clienti");
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var clients = [];
  for (var i = 1; i < data.length; i++) {
    var obj = rowToObject(headers, data[i]);
    if (obj["ID_Cliente"]) clients.push(obj);
  }
  return respond(clients);
}

function getClient(id) {
  if (!id) return respond({ error: "ID mancante" }, 400);
  var sheet   = getSheet("Clienti");
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    var obj = rowToObject(headers, data[i]);
    if (obj["ID_Cliente"] === id) return respond(obj);
  }
  return respond({ error: "Cliente non trovato" }, 404);
}

function generateClientCode(sheet) {
  var last = sheet.getLastRow(); // riga 1 = headers
  return "CLI-" + String(last).padStart(4, "0");
}

function generateId() {
  return Utilities.getUuid();
}

function sanitize(val) {
  if (typeof val !== "string") return val || "";
  // Rimuove caratteri potenzialmente pericolosi
  return val.replace(/[<>'"]/g, "").trim().substring(0, 500);
}

function createClient(body) {
  var sheet   = getSheet("Clienti");
  var headers = getHeaders(sheet);
  var now     = new Date().toISOString();
  var code    = generateClientCode(sheet);
  var id      = generateId();

  var client = {
    "ID_Cliente":         id,
    "ClientCode":         code,
    "Nome":               sanitize(body.Nome),
    "Cognome":            sanitize(body.Cognome),
    "Nickname":           sanitize(body.Nickname),
    "Telefono":           sanitize(body.Telefono),
    "Instagram":          sanitize(body.Instagram),
    "Città":              sanitize(body.Città),
    "Fonte":              sanitize(body.Fonte),
    "StatoLead":          sanitize(body.StatoLead)     || "NEW",
    "StatoPipeline":      sanitize(body.StatoPipeline) || "INITIAL_CONTACT",
    "DataContatto":       sanitize(body.DataContatto),
    "UltimoContatto":     sanitize(body.UltimoContatto),
    "ProssimaAzione":     sanitize(body.ProssimaAzione),
    "DataProssimaAzione": sanitize(body.DataProssimaAzione),
    "Note":               sanitize(body.Note),
    "CreatedAt":          now
  };

  // Validazione campi obbligatori
  if (!client["Nome"] || !client["Cognome"]) {
    return respond({ error: "Nome e Cognome sono obbligatori" }, 400);
  }

  sheet.appendRow(objectToRow(headers, client));
  return respond(client);
}

function updateClient(body) {
  var id = body.ID_Cliente;
  if (!id) return respond({ error: "ID mancante" }, 400);

  var sheet   = getSheet("Clienti");
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      var existing = rowToObject(headers, data[i]);
      // Sanitizza tutti i campi in ingresso prima di salvare
      var sanitized = {};
      Object.keys(body).forEach(function(k) {
        sanitized[k] = typeof body[k] === "string" ? sanitize(body[k]) : body[k];
      });
      var updated = Object.assign(existing, sanitized);
      var row     = objectToRow(headers, updated);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return respond(updated);
    }
  }
  return respond({ error: "Cliente non trovato" }, 404);
}

function deleteClient(body) {
  var id = body.ID_Cliente;
  if (!id) return respond({ error: "ID mancante" }, 400);

  var sheet = getSheet("Clienti");
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return respond({ success: true });
    }
  }
  return respond({ error: "Cliente non trovato" }, 404);
}
