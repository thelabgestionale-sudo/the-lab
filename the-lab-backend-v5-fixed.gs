// ============================================================
//  THE LAB — Google Apps Script Backend  v4.0
//  CRM + Progetti + Bundle/Preventivi + Contabilità + Dashboard
//
//  Novità v4.0:
//    [v4-01] Listino: nuova categoria "Affitto Sala" (SRV-022)
//    [v4-02] Progetti: campi ID_Preventivo_Origine, PreventivoCode_Origine
//    [v4-03] Preventivi: campo ID_Progetto_Collegato
//    [v4-04] Nuova action createProjectFromPreventivo (atomica)
//    [v4-05] setupSheets aggiornato con nuovi header
// ============================================================

var SPREADSHEET_ID = "11sfXGB4fGl-hszGazAuTBj7NuOObwsztNBoPKnhsJ48";
var SECRET_TOKEN   = "71d246c0-00b3-424a-a680-99231fb43b32-b10c7d4e-d3ea-4821-beee-f613dfd0ff93";

var AUTHORIZED_USERS = {
  "thelabgestionale@gmail.com": "admin",
  "simone.rosa965@gmail.com":   "base"
};

var RATE_LIMIT_MAX    = 60;
var RATE_LIMIT_WINDOW = 60;

// ── ROUTING ──────────────────────────────────────────────────

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var check = securityCheck(params);
  if (check.error) return respond(check, check.status || 403);

  var action = params.action || "";
  if (action === "ping")               return respond({ success: true, message: "Backend online v4.0" });
  if (action === "setupSheets")        return setupSheets();
  if (action === "getClients")         return getClients();
  if (action === "getClient")          return getClient(params.id);
  if (action === "getProjects")        return getProjects();
  if (action === "getProject")         return getProject(params.id);
  if (action === "getListinoServizi")  return getListinoServizi();
  if (action === "getListinoBundles")  return getListinoBundles();
  if (action === "getPreventivi")      return getPreventivi();
  if (action === "getPreventivo")      return getPreventivo(params.id);
  return respond({ error: "Azione non valida" }, 400);
}

function doPost(e) {
  var body = parseRequestBody(e);
  if (!body || typeof body !== "object") return respond({ error: "Body non valido" }, 400);

  var check = securityCheck(body);
  if (check.error) return respond(check, check.status || 403);

  var action = body.action || "";
  if (action === "createClient")               return createClient(body);
  if (action === "updateClient")               return updateClient(body);
  if (action === "deleteClient")               { if (check.role !== "admin") return respond({ error: "Solo admin" }, 403); return deleteClient(body); }
  if (action === "createProject")              return createProject(body);
  if (action === "updateProject")              return updateProject(body);
  if (action === "deleteProject")              { if (check.role !== "admin") return respond({ error: "Solo admin" }, 403); return deleteProject(body); }
  if (action === "createPreventivo")           return createPreventivo(body);
  if (action === "updatePreventivo")           return updatePreventivo(body);
  if (action === "updateStatoPreventivo")      return updateStatoPreventivo(body);
  if (action === "deletePreventivo")           { if (check.role !== "admin") return respond({ error: "Solo admin" }, 403); return deletePreventivo(body); }
  // [v4-04] Nuova action atomica preventivo → progetto
  if (action === "createProjectFromPreventivo") return createProjectFromPreventivo(body);
  // [v4-05] Salva obiettivi mensili
  if (action === "saveObiettiviMensili")       return saveObiettiviMensili(body);
  if (action === "getObiettiviMensili")        return getObiettiviMensili();
  return respond({ error: "Azione non valida" }, 400);
}

// ── PARSING BODY ─────────────────────────────────────────────

function parseRequestBody(e) {
  var raw = "";
  try {
    raw = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
  } catch (err) { raw = ""; }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (err1) {}
  try {
    var paramPayload = e && e.parameter ? (e.parameter.payload || e.parameter.data || e.parameter.body || "") : "";
    if (paramPayload) return JSON.parse(paramPayload);
  } catch (err2) {}
  return { _raw: raw };
}

// ── SICUREZZA ────────────────────────────────────────────────

function securityCheck(params) {
  params = params || {};
  if ((params.token || "") !== SECRET_TOKEN) return { error: "Non autorizzato", status: 403 };
  var role = AUTHORIZED_USERS[params.email || ""];
  if (!role) return { error: "Utente non autorizzato", status: 403 };
  var rl = checkRateLimit(params.email);
  if (!rl.allowed) return { error: "Troppe richieste. Riprova tra " + rl.retryAfter + "s.", status: 429 };
  return { ok: true, email: params.email, role: role };
}

function checkRateLimit(email) {
  var props = PropertiesService.getScriptProperties();
  var safeEmail = (email || "unknown").replace(/[@.]/g, "_");
  var key   = "rl_" + safeEmail;
  var now   = Math.floor(Date.now() / 1000);
  var data  = JSON.parse(props.getProperty(key) || '{"count":0,"windowStart":' + now + '}');
  if (now - data.windowStart > RATE_LIMIT_WINDOW) data = { count: 0, windowStart: now };
  data.count++;
  props.setProperty(key, JSON.stringify(data));
  if (data.count > RATE_LIMIT_MAX) return { allowed: false, retryAfter: RATE_LIMIT_WINDOW - (now - data.windowStart) };
  return { allowed: true };
}

// ── RISPOSTA ─────────────────────────────────────────────────

function respond(data, statusCode) {
  if (statusCode && statusCode !== 200) data._status = statusCode;
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ── HELPERS ──────────────────────────────────────────────────

function getSheet(name) { return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name); }

function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    var r = sheet.getRange(1, 1, 1, headers.length);
    r.setFontWeight("bold");
    r.setBackground("#1c1c1c");
    r.setFontColor("#C8A96E");
  }
  return sheet;
}

function getHeaders(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; }
function rowToObject(h, row) { var o = {}; h.forEach(function(k, i) { o[k] = row[i]; }); return o; }
function objectToRow(h, obj) { return h.map(function(k) { return obj[k] !== undefined ? obj[k] : ""; }); }

function sanitize(val) {
  if (typeof val !== "string") return val || "";
  return val.replace(/[<>]/g, "").trim().substring(0, 500);
}

function parseJsonField(v) {
  if (!v || typeof v !== "string") return [];
  try { return JSON.parse(v); } catch(e) { return []; }
}

function ensureSheetHasHeaders(sheetName, requiredHeaders) {
  var s = getSheet(sheetName);
  if (!s) return;
  var headers = getHeaders(s);
  requiredHeaders.forEach(function(h) {
    if (headers.indexOf(h) === -1) {
      s.getRange(1, headers.length + 1).setValue(h);
      headers.push(h);
    }
  });
}

function getEffectiveProjectMovementDate(projectObj, tipo) {
  var direct = tipo === "ACCONTO" ? projectObj.Data_Acconto : projectObj.Data_Saldo;
  if (direct) return String(direct).split("T")[0];
  if (tipo === "SALDO" && projectObj.Deadline) return String(projectObj.Deadline).split("T")[0];
  if (projectObj.Data_Inizio) return String(projectObj.Data_Inizio).split("T")[0];
  if (projectObj.CreatedAt) return String(projectObj.CreatedAt).split("T")[0];
  return "";
}

function decorateProjectForResponse(o) {
  o = o || {};
  o.Voci_Bundle = parseJsonField(o.Voci_Bundle);
  o.Data_Acconto_Effettiva = getEffectiveProjectMovementDate(o, "ACCONTO");
  o.Data_Saldo_Effettiva   = getEffectiveProjectMovementDate(o, "SALDO");
  return o;
}

// ── CONTATORI CODICI ─────────────────────────────────────────

function nextCode(prefix) {
  var props = PropertiesService.getScriptProperties();
  var key   = "counter_" + prefix;
  var n     = parseInt(props.getProperty(key) || "0", 10) + 1;
  props.setProperty(key, String(n));
  return prefix + String(n).padStart(4, "0");
}

// ── CALC ─────────────────────────────────────────────────────

function calcDeadline(start, giorni) {
  if (!start || isNaN(parseInt(giorni, 10))) return start || "";
  var d = new Date(start);
  d.setDate(d.getDate() + parseInt(giorni, 10));
  return d.toISOString().split("T")[0];
}

function flagSconto(listino, pagato) { return listino > 0 && pagato < listino; }
function scontoPerc(listino, pagato) {
  if (!listino || pagato >= listino) return 0;
  return Math.round(((listino - pagato) / listino) * 100);
}

function updateClientLTV(clientId) {
  if (!clientId) return;
  var ps = getSheet("Progetti");
  if (!ps) return;
  var pd = ps.getDataRange().getValues();
  var ph = pd[0];
  var tot = 0;
  for (var i = 1; i < pd.length; i++) {
    var o = rowToObject(ph, pd[i]);
    if (o.ID_Cliente === clientId) tot += (parseFloat(o.Acconto) || 0) + (parseFloat(o.Saldo) || 0);
  }
  var cs = getSheet("Clienti");
  if (!cs) return;
  var ch = getHeaders(cs);
  var lc = ch.indexOf("LTV");
  if (lc === -1) { cs.getRange(1, ch.length + 1).setValue("LTV"); lc = ch.length; }
  var cd = cs.getDataRange().getValues();
  for (var j = 1; j < cd.length; j++) {
    if (cd[j][0] === clientId) { cs.getRange(j + 1, lc + 1).setValue(tot); break; }
  }
}

// ── SETUP ────────────────────────────────────────────────────

function setupSheets() {
  // Clienti
  var clientSheet = getOrCreateSheet("Clienti", [
    "ID_Cliente","ClientCode","Nome","Cognome","Nickname","Telefono","Instagram",
    "Città","Fonte","StatoLead","StatoPipeline","DataContatto","UltimoContatto",
    "ProssimaAzione","DataProssimaAzione","Note","LTV","CreatedAt"
  ]);
  var ch = getHeaders(clientSheet);
  if (ch.indexOf("LTV") === -1) clientSheet.getRange(1, ch.length + 1).setValue("LTV");

  // [v4-02] Progetti: aggiunti ID_Preventivo_Origine e PreventivoCode_Origine
  getOrCreateSheet("Progetti", [
    "ID_Progetto","ProjectCode","ID_Cliente","NomeCliente","Tipo","Servizio",
    "Voci_Bundle","Prezzo_Listino","Acconto","Data_Acconto","Saldo","Data_Saldo",
    "Flag_Sconto","Sconto_Percentuale","Assegnato_A","Stato","Data_Inizio",
    "Deadline","Giorni_Deadline","Note",
    "ID_Preventivo_Origine","PreventivoCode_Origine",
    "CreatedAt"
  ]);
  ensureSheetHasHeaders("Progetti", [
    "ID_Progetto","ProjectCode","ID_Cliente","NomeCliente","Tipo","Servizio",
    "Voci_Bundle","Prezzo_Listino","Acconto","Data_Acconto","Saldo","Data_Saldo",
    "Flag_Sconto","Sconto_Percentuale","Assegnato_A","Stato","Data_Inizio",
    "Deadline","Giorni_Deadline","Note",
    "ID_Preventivo_Origine","PreventivoCode_Origine","CreatedAt"
  ]);

  // Listino Servizi
  var ls = getOrCreateSheet("Listino_Servizi", [
    "ID_Servizio","Categoria","Nome_Servizio","Prezzo_Listino","Giorni_Deadline","Note_Servizio"
  ]);

  if (ls.getLastRow() <= 1) {
    [
      ["SRV-001","Registrazione Audio","Registrazione 1 ora",40,0,"Stesso giorno"],
      ["SRV-002","Registrazione Audio","Registrazione 2 ore",70,0,"Stesso giorno"],
      ["SRV-003","Registrazione Audio","Registrazione 4 ore",140,1,""],
      ["SRV-004","Registrazione Audio","Registrazione 8 ore",260,1,""],
      ["SRV-005","Mix & Master","Mix & Master Separate",170,7,""],
      ["SRV-006","Mix & Master","Mix & Master MP3/WAV",80,5,""],
      ["SRV-007","Mix & Master","Solo Mix Separate",150,7,""],
      ["SRV-008","Mix & Master","Solo Master",35,3,""],
      ["SRV-009","Mix & Master","Revisione Mix/Master",20,2,""],
      ["SRV-010","Beat","Beat da catalogo non esclusivo",40,1,""],
      ["SRV-011","Beat","Beat da catalogo esclusivo",75,2,""],
      ["SRV-012","Beat","Beat su misura esclusivo",180,10,""],
      ["SRV-013","Beat","Revisione Beat",20,2,""],
      ["SRV-014","Video","Reel max 30 secondi",150,5,""],
      ["SRV-015","Video","Reel max 1:30 minuti",250,7,""],
      ["SRV-016","Video","Official Video",400,14,"Da 400€"],
      ["SRV-017","Video","Montaggio Video",40,3,"40€/ora"],
      ["SRV-018","Video","Revisione Video",20,2,""],
      ["SRV-019","Servizi Creativi","Revisione Testi/Flow",40,1,"40€/ora"],
      ["SRV-020","Servizi Creativi","Dizione",40,1,"40€/ora"],
      ["SRV-021","Servizi Creativi","Coaching Vocale",40,1,"40€/ora"],
      // [v4-01] Nuova categoria Affitto Sala
      ["SRV-022","Affitto Sala","Affitto Sala",20,0,"20€/ora"]
    ].forEach(function(r) { ls.appendRow(r); });
  } else {
    // Aggiunge SRV-022 se non esiste già
    var lsData = ls.getDataRange().getValues();
    var hasSrv022 = false;
    for (var i = 1; i < lsData.length; i++) { if (lsData[i][0] === "SRV-022") { hasSrv022 = true; break; } }
    if (!hasSrv022) ls.appendRow(["SRV-022","Affitto Sala","Affitto Sala",20,0,"20€/ora"]);
  }

  // Listino Bundle
  var bs = getOrCreateSheet("Listino_Bundle", [
    "ID_Bundle","Categoria_Bundle","Nome_Bundle","Prezzo_Bundle_Listino","Giorni_Deadline",
    "Voce_1_Nome","Voce_1_Compenso_Team","Voce_2_Nome","Voce_2_Compenso_Team",
    "Voce_3_Nome","Voce_3_Compenso_Team","Voce_4_Nome","Voce_4_Compenso_Team",
    "Voce_5_Nome","Voce_5_Compenso_Team","Note_Bundle"
  ]);

  if (bs.getLastRow() <= 1) {
    [
      ["BND-001","Audio Bundles","Essential",149,5,"Registrazione in studio (2 ore)","","Mix & Master (MP3/WAV)","","Revisione con engineer","","","","",""],
      ["BND-002","Audio Bundles","Pro",219,7,"Registrazione in studio (2 ore)","","Mix & Master (Separate)","","Revisione con engineer","","","","",""],
      ["BND-003","Audio Bundles","Complete",299,8,"Beat da catalogo","","Registrazione in studio (2 ore)","","Mix & Master (Separate)","","Revisione con engineer","","",""],
      ["BND-004","Track Bundles","Focus",199,7,"Registrazione in studio (2 ore)","","Mix & Master (MP3/WAV)","","Revisione con engineer","","Shooting 10 foto","","",""],
      ["BND-005","Track Bundles","Vision",329,10,"Registrazione in studio (2 ore)","","Mix & Master (MP3/WAV)","","Revisione con engineer","","Shooting 10 foto","","Reel fino a 30 secondi",""],
      ["BND-006","Track Bundles","Release",419,14,"Registrazione in studio (2 ore)","","Mix & Master (MP3/WAV)","","Revisione con engineer","","Shooting 10 foto","","Reel fino a 1:30 minuti",""],
      ["BND-007","The Lab Bundles","Track Ready",329,10,"Beat da catalogo (non esclusivo)","","Registrazione in studio (2 ore)","","Mix & Master (Separate)","","Revisione con engineer","","Shooting 10 foto",""],
      ["BND-008","The Lab Bundles","Studio",489,14,"Beat da catalogo (esclusivo)","","Registrazione in studio (2 ore)","","Mix & Master (Separate)","","Revisione con engineer","","Shooting 10 foto","Reel fino a 30 secondi"],
      ["BND-009","The Lab Bundles","Journey",689,18,"Beat su misura (esclusivo)","","Registrazione in studio (2 ore)","","Mix & Master (Separate)","","Revisione con engineer","","Shooting 10 foto","Reel fino a 1:30 minuti"]
    ].forEach(function(r) { bs.appendRow(r); });
  }

  // [v4-03] Preventivi: aggiunto ID_Progetto_Collegato
  getOrCreateSheet("Preventivi", [
    "ID_Preventivo","PreventivoCode","ID_Cliente","NomeCliente","Nome_Bundle",
    "Tipo_Bundle","Voci","Prezzo_Totale","Prezzo_Listino_Riferimento","Flag_Sconto",
    "Sconto_Percentuale","Stato","Data_Scadenza","Note_Interne","Note_Cliente",
    "ID_Progetto_Collegato",
    "CreatedAt","UpdatedAt"
  ]);
  ensureSheetHasHeaders("Preventivi", [
    "ID_Preventivo","PreventivoCode","ID_Cliente","NomeCliente","Nome_Bundle",
    "Tipo_Bundle","Voci","Prezzo_Totale","Prezzo_Listino_Riferimento","Flag_Sconto",
    "Sconto_Percentuale","Stato","Data_Scadenza","Note_Interne","Note_Cliente",
    "ID_Progetto_Collegato","CreatedAt","UpdatedAt"
  ]);

  // Contatori
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("counter_CLI-")) props.setProperty("counter_CLI-", "0");
  if (!props.getProperty("counter_PRJ-")) props.setProperty("counter_PRJ-", "0");
  if (!props.getProperty("counter_PVT-")) props.setProperty("counter_PVT-", "0");

  return respond({ success: true, message: "Tutti i fogli configurati correttamente (v4.0)." });
}

// ── CLIENTI ──────────────────────────────────────────────────

function getClients() {
  var s = getSheet("Clienti"); if (!s) return respond([]);
  var d = s.getDataRange().getValues(); var h = d[0]; var r = [];
  for (var i = 1; i < d.length; i++) { var o = rowToObject(h, d[i]); if (o.ID_Cliente) r.push(o); }
  return respond(r);
}

function getClient(id) {
  if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Clienti"); if (!s) return respond({ error: "Sheet non trovata" }, 404);
  var d = s.getDataRange().getValues(); var h = d[0];
  for (var i = 1; i < d.length; i++) { var o = rowToObject(h, d[i]); if (o.ID_Cliente === id) return respond(o); }
  return respond({ error: "Cliente non trovato" }, 404);
}

function createClient(body) {
  var s = getSheet("Clienti"); if (!s) return respond({ error: "Sheet Clienti non trovata. Eseguire setupSheets prima." }, 500);
  var h = getHeaders(s);
  var c = {
    "ID_Cliente": Utilities.getUuid(), "ClientCode": nextCode("CLI-"),
    "Nome": sanitize(body.Nome), "Cognome": sanitize(body.Cognome),
    "Nickname": sanitize(body.Nickname), "Telefono": sanitize(body.Telefono),
    "Instagram": sanitize(body.Instagram), "Città": sanitize(body.Città),
    "Fonte": sanitize(body.Fonte),
    "StatoLead": sanitize(body.StatoLead) || "NEW",
    "StatoPipeline": sanitize(body.StatoPipeline) || "INITIAL_CONTACT",
    "DataContatto": sanitize(body.DataContatto), "UltimoContatto": sanitize(body.UltimoContatto),
    "ProssimaAzione": sanitize(body.ProssimaAzione), "DataProssimaAzione": sanitize(body.DataProssimaAzione),
    "Note": sanitize(body.Note), "LTV": 0, "CreatedAt": new Date().toISOString()
  };
  if (!c.Nome || !c.Cognome) return respond({ error: "Nome e Cognome obbligatori" }, 400);
  s.appendRow(objectToRow(h, c));
  return respond(c);
}

function updateClient(body) {
  var id = body.ID_Cliente; if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Clienti"); if (!s) return respond({ error: "Sheet non trovata" }, 500);
  var d = s.getDataRange().getValues(); var h = d[0];
  for (var i = 1; i < d.length; i++) {
    if (d[i][0] === id) {
      var ex = rowToObject(h, d[i]);
      var san = {};
      Object.keys(body).forEach(function(k) { san[k] = typeof body[k] === "string" ? sanitize(body[k]) : body[k]; });
      var up = Object.assign(ex, san);
      s.getRange(i + 1, 1, 1, h.length).setValues([objectToRow(h, up)]);
      return respond(up);
    }
  }
  return respond({ error: "Cliente non trovato" }, 404);
}

function deleteClient(body) {
  var id = body.ID_Cliente; if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Clienti"); if (!s) return respond({ error: "Sheet non trovata" }, 500);
  var d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) { if (d[i][0] === id) { s.deleteRow(i + 1); return respond({ success: true }); } }
  return respond({ error: "Cliente non trovato" }, 404);
}

// ── LISTINO ───────────────────────────────────────────────────

function getListinoServizi() {
  var s = getSheet("Listino_Servizi"); if (!s) return respond([]);
  var d = s.getDataRange().getValues(); var h = d[0]; var r = [];
  for (var i = 1; i < d.length; i++) { var o = rowToObject(h, d[i]); if (o.ID_Servizio) r.push(o); }
  return respond(r);
}

function getListinoBundles() {
  var s = getSheet("Listino_Bundle"); if (!s) return respond([]);
  var d = s.getDataRange().getValues(); var h = d[0]; var r = [];
  for (var i = 1; i < d.length; i++) {
    var o = rowToObject(h, d[i]); if (!o.ID_Bundle) continue;
    var voci = [];
    for (var vv = 1; vv <= 5; vv++) { var n = o["Voce_" + vv + "_Nome"]; var c = o["Voce_" + vv + "_Compenso_Team"]; if (n) voci.push({ nome: n, compenso: c || "" }); }
    o.Voci = voci; r.push(o);
  }
  return respond(r);
}

// ── PROGETTI ──────────────────────────────────────────────────

function getProjects() {
  var s = getSheet("Progetti"); if (!s) return respond([]);
  var d = s.getDataRange().getValues(); if (d.length <= 1) return respond([]);
  var h = d[0]; var r = [];
  for (var i = 1; i < d.length; i++) {
    var o = rowToObject(h, d[i]);
    if (o.ID_Progetto) { r.push(decorateProjectForResponse(o)); }
  }
  return respond(r);
}

function getProject(id) {
  if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Progetti"); if (!s) return respond({ error: "Sheet non trovata" }, 404);
  var d = s.getDataRange().getValues(); var h = d[0];
  for (var i = 1; i < d.length; i++) {
    var o = rowToObject(h, d[i]);
    if (o.ID_Progetto === id) { return respond(decorateProjectForResponse(o)); }
  }
  return respond({ error: "Progetto non trovato" }, 404);
}

function createProject(body) {
  var s = getSheet("Progetti"); if (!s) return respond({ error: "Sheet non trovata. Eseguire setupSheets prima." }, 500);
  var h = getHeaders(s);
  var di = body.Data_Inizio || new Date().toISOString().split("T")[0];
  var gi = parseInt(body.Giorni_Deadline, 10) || 0;
  var acc = parseFloat(body.Acconto) || 0;
  var sal = parseFloat(body.Saldo) || 0;
  var lst = parseFloat(body.Prezzo_Listino) || 0;
  var pag = acc + sal;
  var vs = "";
  if (body.Voci_Bundle && typeof body.Voci_Bundle === "object") { try { vs = JSON.stringify(body.Voci_Bundle); } catch(e) {} }

  var p = {
    "ID_Progetto": Utilities.getUuid(), "ProjectCode": nextCode("PRJ-"),
    "ID_Cliente": sanitize(body.ID_Cliente || ""), "NomeCliente": sanitize(body.NomeCliente || ""),
    "Tipo": sanitize(body.Tipo || "SINGOLO"), "Servizio": sanitize(body.Servizio || ""),
    "Voci_Bundle": vs, "Prezzo_Listino": lst,
    "Acconto": acc, "Data_Acconto": sanitize(body.Data_Acconto || ""),
    "Saldo": sal, "Data_Saldo": sanitize(body.Data_Saldo || ""),
    "Flag_Sconto": flagSconto(lst, pag) ? "SI" : "NO", "Sconto_Percentuale": scontoPerc(lst, pag),
    "Assegnato_A": sanitize(Array.isArray(body.Assegnato_A) ? body.Assegnato_A.join(", ") : (body.Assegnato_A || "")),
    "Stato": sanitize(body.Stato || "IN_LAVORAZIONE"), "Data_Inizio": di,
    "Deadline": body.Deadline || calcDeadline(di, gi), "Giorni_Deadline": gi,
    "Note": sanitize(body.Note || ""),
    // [v4-02]
    "ID_Preventivo_Origine": sanitize(body.ID_Preventivo_Origine || ""),
    "PreventivoCode_Origine": sanitize(body.PreventivoCode_Origine || ""),
    "CreatedAt": new Date().toISOString()
  };
  if (!p.ID_Cliente) return respond({ error: "Cliente obbligatorio" }, 400);
  if (!p.Servizio)   return respond({ error: "Servizio obbligatorio" }, 400);
  s.appendRow(objectToRow(h, p));
  updateClientLTV(p.ID_Cliente);
  return respond(decorateProjectForResponse(p));
}

function updateProject(body) {
  var id = body.ID_Progetto; if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Progetti"); if (!s) return respond({ error: "Sheet non trovata" }, 500);
  var d = s.getDataRange().getValues(); var h = d[0];
  for (var i = 1; i < d.length; i++) {
    if (d[i][0] === id) {
      var ex = rowToObject(h, d[i]);
      if (body.Voci_Bundle && typeof body.Voci_Bundle === "object") { try { body.Voci_Bundle = JSON.stringify(body.Voci_Bundle); } catch(e) {} }
      if (Array.isArray(body.Assegnato_A)) body.Assegnato_A = body.Assegnato_A.join(", ");
      var san = {};
      Object.keys(body).forEach(function(k) { if (k === "Voci_Bundle") san[k] = body[k]; else san[k] = typeof body[k] === "string" ? sanitize(body[k]) : body[k]; });
      var up = Object.assign(ex, san);
      var lst2 = parseFloat(up.Prezzo_Listino) || 0;
      var pag2 = (parseFloat(up.Acconto) || 0) + (parseFloat(up.Saldo) || 0);
      up.Flag_Sconto = flagSconto(lst2, pag2) ? "SI" : "NO";
      up.Sconto_Percentuale = scontoPerc(lst2, pag2);
      if (body.Data_Inizio || body.Giorni_Deadline) up.Deadline = calcDeadline(up.Data_Inizio, up.Giorni_Deadline);
      s.getRange(i + 1, 1, 1, h.length).setValues([objectToRow(h, up)]);
      updateClientLTV(up.ID_Cliente);
      return respond(decorateProjectForResponse(up));
    }
  }
  return respond({ error: "Progetto non trovato" }, 404);
}

function deleteProject(body) {
  var id = body.ID_Progetto; if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Progetti"); if (!s) return respond({ error: "Sheet non trovata" }, 500);
  var d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (d[i][0] === id) { var cid = d[i][2]; s.deleteRow(i + 1); if (cid) updateClientLTV(cid); return respond({ success: true }); }
  }
  return respond({ error: "Progetto non trovato" }, 404);
}

// ── [v4-04] CREATE PROJECT FROM PREVENTIVO (atomica) ─────────

function createProjectFromPreventivo(body) {
  var prevId = body.ID_Preventivo;
  if (!prevId) return respond({ error: "ID_Preventivo obbligatorio" }, 400);

  // 1. Legge il preventivo
  var ps = getSheet("Preventivi"); if (!ps) return respond({ error: "Sheet Preventivi non trovata" }, 500);
  var pd = ps.getDataRange().getValues(); var ph = pd[0];
  var prevRow = -1; var prev = null;
  for (var i = 1; i < pd.length; i++) {
    var o = rowToObject(ph, pd[i]);
    if (o.ID_Preventivo === prevId) { prevRow = i + 1; prev = o; break; }
  }
  if (!prev) return respond({ error: "Preventivo non trovato" }, 404);
  if (prev.Stato !== "ACCETTATO") return respond({ error: "Il preventivo deve essere in stato ACCETTATO" }, 400);
  if (prev.ID_Progetto_Collegato) return respond({ error: "Progetto già creato per questo preventivo" }, 400);

  // 2. Crea il progetto con dati dal preventivo
  var gs = getSheet("Progetti"); if (!gs) return respond({ error: "Sheet Progetti non trovata" }, 500);
  var gh = getHeaders(gs);
  var vociRaw = parseJsonField(prev.Voci);
  var vs = "";
  try { vs = JSON.stringify(vociRaw); } catch(e) {}
  var di = body.Data_Inizio || new Date().toISOString().split("T")[0];
  var gi = parseInt(body.Giorni_Deadline, 10) || 0;
  var acc = parseFloat(body.Acconto) || 0;
  var lst = parseFloat(prev.Prezzo_Totale) || 0;

  var prj = {
    "ID_Progetto": Utilities.getUuid(), "ProjectCode": nextCode("PRJ-"),
    "ID_Cliente": prev.ID_Cliente, "NomeCliente": prev.NomeCliente,
    "Tipo": "BUNDLE", "Servizio": sanitize(prev.Nome_Bundle || ""),
    "Voci_Bundle": vs, "Prezzo_Listino": lst,
    "Acconto": acc, "Data_Acconto": sanitize(body.Data_Acconto || ""),
    "Saldo": 0, "Data_Saldo": "",
    "Flag_Sconto": "NO", "Sconto_Percentuale": 0,
    "Assegnato_A": sanitize(Array.isArray(body.Assegnato_A) ? body.Assegnato_A.join(", ") : (body.Assegnato_A || "")),
    "Stato": "IN_LAVORAZIONE", "Data_Inizio": di,
    "Deadline": body.Deadline || calcDeadline(di, gi), "Giorni_Deadline": gi,
    "Note": sanitize(body.Note || ""),
    "ID_Preventivo_Origine": prev.ID_Preventivo,
    "PreventivoCode_Origine": prev.PreventivoCode,
    "CreatedAt": new Date().toISOString()
  };

  gs.appendRow(objectToRow(gh, prj));
  updateClientLTV(prj.ID_Cliente);

  // 3. Aggiorna il preventivo con ID_Progetto_Collegato
  var pcol = ph.indexOf("ID_Progetto_Collegato");
  var ucol = ph.indexOf("UpdatedAt");
  if (pcol !== -1) ps.getRange(prevRow, pcol + 1).setValue(prj.ID_Progetto);
  if (ucol !== -1) ps.getRange(prevRow, ucol + 1).setValue(new Date().toISOString());

  prev.ID_Progetto_Collegato = prj.ID_Progetto;
  prev.Voci = vociRaw;

  return respond({ progetto: decorateProjectForResponse(prj), preventivo: prev });
}

// ── PREVENTIVI ────────────────────────────────────────────────

function getPreventivi() {
  var s = getSheet("Preventivi"); if (!s) return respond([]);
  var d = s.getDataRange().getValues(); if (d.length <= 1) return respond([]);
  var h = d[0]; var r = [];
  for (var i = 1; i < d.length; i++) {
    var o = rowToObject(h, d[i]);
    if (o.ID_Preventivo) { o.Voci = parseJsonField(o.Voci); r.push(o); }
  }
  return respond(r);
}

function getPreventivo(id) {
  if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Preventivi"); if (!s) return respond({ error: "Sheet non trovata" }, 404);
  var d = s.getDataRange().getValues(); var h = d[0];
  for (var i = 1; i < d.length; i++) {
    var o = rowToObject(h, d[i]);
    if (o.ID_Preventivo === id) { o.Voci = parseJsonField(o.Voci); return respond(o); }
  }
  return respond({ error: "Preventivo non trovato" }, 404);
}

function createPreventivo(body) {
  var s = getSheet("Preventivi"); if (!s) return respond({ error: "Sheet non trovata. Eseguire setupSheets prima." }, 500);
  var h = getHeaders(s);
  var voci = Array.isArray(body.Voci) ? body.Voci : [];
  if (!voci.length) return respond({ error: "Almeno un servizio è obbligatorio" }, 400);
  if (!body.ID_Cliente) return respond({ error: "Cliente obbligatorio" }, 400);
  var tot = parseFloat(body.Prezzo_Totale) || voci.reduce(function(acc, v) { return acc + (parseFloat(v.prezzo) || 0); }, 0);
  var lr  = parseFloat(body.Prezzo_Listino_Riferimento) || 0;
  var vs  = ""; try { vs = JSON.stringify(voci); } catch(e) {}
  var p = {
    "ID_Preventivo": Utilities.getUuid(), "PreventivoCode": nextCode("PVT-"),
    "ID_Cliente": sanitize(body.ID_Cliente), "NomeCliente": sanitize(body.NomeCliente || ""),
    "Nome_Bundle": sanitize(body.Nome_Bundle || "Bundle su misura"),
    "Tipo_Bundle": sanitize(body.Tipo_Bundle || "CUSTOM"),
    "Voci": vs, "Prezzo_Totale": tot, "Prezzo_Listino_Riferimento": lr,
    "Flag_Sconto": flagSconto(lr, tot) ? "SI" : "NO", "Sconto_Percentuale": scontoPerc(lr, tot),
    "Stato": sanitize(body.Stato || "BOZZA"),
    "Data_Scadenza": sanitize(body.Data_Scadenza || ""),
    "Note_Interne": sanitize(body.Note_Interne || ""),
    "Note_Cliente": sanitize(body.Note_Cliente || ""),
    "ID_Progetto_Collegato": "",
    "CreatedAt": new Date().toISOString(), "UpdatedAt": new Date().toISOString()
  };
  s.appendRow(objectToRow(h, p));
  p.Voci = voci;
  return respond(p);
}

function updatePreventivo(body) {
  var id = body.ID_Preventivo; if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Preventivi"); if (!s) return respond({ error: "Sheet non trovata" }, 500);
  var d = s.getDataRange().getValues(); var h = d[0];
  for (var i = 1; i < d.length; i++) {
    if (d[i][0] === id) {
      var ex = rowToObject(h, d[i]);
      var vociRaw = body.Voci;
      if (vociRaw && typeof vociRaw === "object") { try { body.Voci = JSON.stringify(vociRaw); } catch(e) { body.Voci = ""; } }
      var san = {};
      Object.keys(body).forEach(function(k) { if (k === "Voci") san[k] = body[k]; else san[k] = typeof body[k] === "string" ? sanitize(body[k]) : body[k]; });
      var up = Object.assign(ex, san);
      var voci2 = parseJsonField(up.Voci);
      var tot2  = parseFloat(up.Prezzo_Totale) || voci2.reduce(function(acc, v) { return acc + (parseFloat(v.prezzo) || 0); }, 0);
      var lr2   = parseFloat(up.Prezzo_Listino_Riferimento) || 0;
      up.Prezzo_Totale = tot2; up.Flag_Sconto = flagSconto(lr2, tot2) ? "SI" : "NO";
      up.Sconto_Percentuale = scontoPerc(lr2, tot2); up.UpdatedAt = new Date().toISOString();
      s.getRange(i + 1, 1, 1, h.length).setValues([objectToRow(h, up)]);
      up.Voci = voci2;
      return respond(up);
    }
  }
  return respond({ error: "Preventivo non trovato" }, 404);
}

function updateStatoPreventivo(body) {
  var id = body.ID_Preventivo; var stato = body.Stato;
  if (!id || !stato) return respond({ error: "ID e Stato obbligatori" }, 400);
  var s = getSheet("Preventivi"); if (!s) return respond({ error: "Sheet non trovata" }, 500);
  var d = s.getDataRange().getValues(); var h = d[0];
  var sc = h.indexOf("Stato"); var uc = h.indexOf("UpdatedAt");
  for (var i = 1; i < d.length; i++) {
    if (d[i][0] === id) {
      var statoAttuale = d[i][sc] || "";
      if (statoAttuale === "ACCETTATO" && stato === "INVIATO") {
        var current = rowToObject(h, d[i]); current.Voci = parseJsonField(current.Voci); return respond(current);
      }
      if (sc !== -1) s.getRange(i + 1, sc + 1).setValue(stato);
      if (uc !== -1) s.getRange(i + 1, uc + 1).setValue(new Date().toISOString());
      var obj = rowToObject(h, d[i]); obj.Stato = stato; obj.UpdatedAt = new Date().toISOString();
      obj.Voci = parseJsonField(obj.Voci);
      return respond(obj);
    }
  }
  return respond({ error: "Preventivo non trovato" }, 404);
}

function deletePreventivo(body) {
  var id = body.ID_Preventivo; if (!id) return respond({ error: "ID mancante" }, 400);
  var s = getSheet("Preventivi"); if (!s) return respond({ error: "Sheet non trovata" }, 500);
  var d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) { if (d[i][0] === id) { s.deleteRow(i + 1); return respond({ success: true }); } }
  return respond({ error: "Preventivo non trovato" }, 404);
}

// ── OBIETTIVI MENSILI ─────────────────────────────────────────

function saveObiettiviMensili(body) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty("obiettivo_studio", String(parseFloat(body.obiettivo_studio) || 0));
  props.setProperty("obiettivo_mussi",  String(parseFloat(body.obiettivo_mussi)  || 0));
  return respond({ success: true, obiettivo_studio: parseFloat(body.obiettivo_studio) || 0, obiettivo_mussi: parseFloat(body.obiettivo_mussi) || 0 });
}

function getObiettiviMensili() {
  var props = PropertiesService.getScriptProperties();
  return respond({
    obiettivo_studio: parseFloat(props.getProperty("obiettivo_studio") || "0"),
    obiettivo_mussi:  parseFloat(props.getProperty("obiettivo_mussi")  || "0")
  });
}
