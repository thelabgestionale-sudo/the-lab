// ============================================================
//  THE LAB — Google Apps Script Backend
//  Incolla questo file in Extensions → Apps Script
//  poi vai su Deploy → New deployment → Web App
// ============================================================

var SPREADSHEET_ID = "INSERISCI_QUI_IL_TUO_SPREADSHEET_ID";

// Ruoli utente
var USERS = {
  "admin@tuostudio.com": "admin",   // sostituisci con le email reali
  "staff@tuostudio.com": "base"
};

// ============================================================
//  ROUTING PRINCIPALE
// ============================================================

function doGet(e) {
  var action = e.parameter.action || "";
  var email  = e.parameter.email  || "";

  if (!isAuthorized(email)) return respond({ error: "Non autorizzato" }, 403);

  if (action === "getClients")        return getClients(e);
  if (action === "getClient")         return getClient(e);
  if (action === "getUserRole")       return getUserRole(email);
  return respond({ error: "Azione non valida" }, 400);
}

function doPost(e) {
  var body  = JSON.parse(e.postData.contents);
  var email = body.email || "";

  if (!isAuthorized(email)) return respond({ error: "Non autorizzato" }, 403);

  var action = body.action || "";

  if (action === "createClient") return createClient(body);
  if (action === "updateClient") return updateClient(body);
  if (action === "deleteClient") {
    if (getRole(email) !== "admin") return respond({ error: "Solo gli admin possono eliminare" }, 403);
    return deleteClient(body);
  }
  return respond({ error: "Azione non valida" }, 400);
}

// ============================================================
//  AUTH
// ============================================================

function isAuthorized(email) {
  return USERS.hasOwnProperty(email);
}

function getRole(email) {
  return USERS[email] || null;
}

function getUserRole(email) {
  if (!isAuthorized(email)) return respond({ error: "Non autorizzato" }, 403);
  return respond({ email: email, role: getRole(email) });
}

// ============================================================
//  HELPERS SPREADSHEET
// ============================================================

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

function respond(data, code) {
  var output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================================
//  CLIENTI
// ============================================================

function getClients(e) {
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

function getClient(e) {
  var id      = e.parameter.id;
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
  var last = sheet.getLastRow();
  var num  = last; // row 1 = headers, so last-1 clients + 1 new
  return "CLI-" + String(num).padStart(4, "0");
}

function generateId() {
  return Utilities.getUuid();
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
    "Nome":               body.Nome               || "",
    "Cognome":            body.Cognome            || "",
    "Nickname":           body.Nickname           || "",
    "Telefono":           body.Telefono           || "",
    "Instagram":          body.Instagram          || "",
    "Città":              body.Città              || "",
    "Fonte":              body.Fonte              || "",
    "StatoLead":          body.StatoLead          || "NEW",
    "StatoPipeline":      body.StatoPipeline      || "INITIAL_CONTACT",
    "DataContatto":       body.DataContatto       || "",
    "UltimoContatto":     body.UltimoContatto     || "",
    "ProssimaAzione":     body.ProssimaAzione     || "",
    "DataProssimaAzione": body.DataProssimaAzione || "",
    "Note":               body.Note               || "",
    "CreatedAt":          now
  };

  sheet.appendRow(objectToRow(headers, client));
  return respond(client);
}

function updateClient(body) {
  var id      = body.ID_Cliente;
  var sheet   = getSheet("Clienti");
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      var existing = rowToObject(headers, data[i]);
      var updated  = Object.assign(existing, body);
      var row      = objectToRow(headers, updated);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return respond(updated);
    }
  }
  return respond({ error: "Cliente non trovato" }, 404);
}

function deleteClient(body) {
  var id    = body.ID_Cliente;
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
