# The Lab — Studio Management CRM

Web app CRM per studio di registrazione. Database su Google Sheets, frontend su GitHub Pages. Costo: zero.

## Stack

- **Frontend:** HTML + CSS + JS puro — GitHub Pages
- **Database:** Google Sheets
- **Backend API:** Google Apps Script (Web App)
- **Auth:** Google Identity Services (OAuth)

## Utenze

L'app prevede due ruoli:

| Ruolo | Permessi |
|-------|----------|
| `admin` | Legge, crea, modifica, **elimina** clienti |
| `base`  | Legge, crea, modifica — nessuna eliminazione |

Gli utenti autorizzati vanno configurati **in due posti** (devono corrispondere):
1. `USERS` in `Code.gs`
2. `ALLOWED_USERS` in `index.html`

---

## Setup — passo dopo passo

### 1. Crea il Google Spreadsheet

1. Vai su [sheets.google.com](https://sheets.google.com) → crea un nuovo foglio
2. Rinomina il foglio (tab in basso) da "Foglio1" a `Clienti`
3. Nella riga 1 inserisci esattamente queste intestazioni (una per cella, A1→Q1):

```
ID_Cliente | ClientCode | Nome | Cognome | Nickname | Telefono | Instagram | Città | Fonte | StatoLead | StatoPipeline | DataContatto | UltimoContatto | ProssimaAzione | DataProssimaAzione | Note | CreatedAt
```

4. Copia l'ID del foglio dall'URL: `https://docs.google.com/spreadsheets/d/**ID_QUI**/edit`

---

### 2. Configura e pubblica Apps Script

1. Nel foglio vai su **Estensioni → Apps Script**
2. Cancella il contenuto esistente e incolla tutto il contenuto di `Code.gs`
3. In cima al file imposta:
   - `SPREADSHEET_ID` = l'ID copiato al passo 1
   - `USERS` = le email reali con i rispettivi ruoli

```javascript
var SPREADSHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms";

var USERS = {
  "tuaemail@gmail.com": "admin",
  "collaboratore@gmail.com": "base"
};
```

4. Clicca **Salva** (icona dischetto)
5. Clicca **Distribuisci → Nuova distribuzione**
6. Tipo: **App web**
7. Imposta:
   - *Esegui come:* **Me**
   - *Chi ha accesso:* **Chiunque**
8. Clicca **Distribuisci** → copia la **URL dell'app web** (la userai dopo)

> ⚠️ Ogni volta che modifichi `Code.gs` devi fare una **nuova distribuzione** (non aggiorna quella esistente).

---

### 3. Configura il frontend

Apri `index.html` e modifica le variabili in cima:

```javascript
var SCRIPT_URL       = "https://script.google.com/macros/s/XXXXXXXXX/exec";  // URL Apps Script
var GOOGLE_CLIENT_ID = "123456789-abc.apps.googleusercontent.com";            // vedi passo 4

var ALLOWED_USERS = {
  "tuaemail@gmail.com":       "admin",
  "collaboratore@gmail.com":  "base"
};
```

---

### 4. Crea le credenziali Google OAuth

1. Vai su [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un progetto (es. `the-lab-crm`)
3. **API e servizi → Schermata consenso OAuth**
   - Tipo: Esterno → Crea
   - Nome app: `The Lab`
   - Email: la tua
   - Salva e continua su tutto
4. **API e servizi → Credenziali → + Crea credenziali → ID client OAuth**
   - Tipo: **Applicazione web**
   - Nome: `the-lab-frontend`
   - Origini JavaScript autorizzate: aggiungi `https://TUONOME.github.io`
   - (in locale aggiungi anche `http://localhost:8080`)
5. Clicca Crea → copia il **Client ID**
6. Incollalo in `index.html` come `GOOGLE_CLIENT_ID`

---

### 5. Pubblica su GitHub

1. Crea un repo su [github.com](https://github.com) (es. `the-lab`)
2. Carica i file: `index.html`, `Code.gs`, `README.md`, `.github/workflows/deploy.yml`
3. Vai in **Settings → Pages**
   - Source: **GitHub Actions**
4. Fai un commit/push su `main` → GitHub Actions pubblica automaticamente
5. L'app sarà disponibile su `https://TUONOME.github.io/the-lab`

---

### 6. Primo accesso

1. Apri l'URL GitHub Pages
2. Clicca "Accedi con Google"
3. Seleziona l'account configurato in `ALLOWED_USERS`
4. Sei dentro

---

## Sviluppo locale

Per testare in locale senza deploy:

```bash
# Qualsiasi http server va bene
npx serve .
# oppure
python -m http.server 8080
```

Poi apri `http://localhost:8080`

Ricorda di aggiungere `http://localhost:8080` tra le origini autorizzate nel Google Cloud Console.

---

## Struttura file

```
/
├── index.html                  ← intera app frontend
├── Code.gs                     ← backend Apps Script
├── README.md                   ← questa guida
└── .github/
    └── workflows/
        └── deploy.yml          ← auto-deploy su GitHub Pages
```

---

## Roadmap

- [x] CRM clienti con ruoli admin/base
- [ ] Sezione Progetti
- [ ] Gestione pagamenti e acconti
- [ ] Dashboard KPI
- [ ] Integrazione Google Calendar (booking sessioni)
