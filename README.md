# CoC Clan Dashboard – Setup

## Projektstruktur

```
api/
  coc.js          ← Vercel Serverless Function (API-Proxy)
index.html        ← Dashboard UI
app.js            ← Frontend-Logik
style.css         ← Styling
vercel.json       ← Vercel-Konfiguration
.env.example      ← Vorlage für Umgebungsvariablen
```

---

## 1. API-Token erstellen (Clash of Clans Developer Portal)

1. Gehe zu https://developer.clashofclans.com
2. Logge dich ein und klicke auf **"My Account"**
3. Klicke auf **"Create New Key"**
4. Gib einen Namen ein (z.B. `Vercel Dashboard`)
5. **IP-Adresse:** Trage zunächst eine Platzhalter-IP ein (z.B. `1.1.1.1`) – du änderst das nach dem ersten Deploy (siehe Schritt 4)
6. Kopiere den Token

---

## 2. Repository auf GitHub erstellen

```bash
git init
git add .
git commit -m "Initial CoC dashboard"
git remote add origin https://github.com/DEIN_USERNAME/coc-dashboard.git
git push -u origin main
```

---

## 3. Auf Vercel deployen

1. Gehe zu https://vercel.com und logge dich mit GitHub ein
2. Klicke **"Add New → Project"** und importiere das GitHub-Repo
3. Unter **"Environment Variables"** folgende Variablen eintragen:

   | Name              | Wert                        |
   |-------------------|-----------------------------|
   | `COC_API_TOKEN`   | (dein Token aus Schritt 1)  |

4. Klicke **"Deploy"**

---

## 4. Vercel-IP im CoC-Token eintragen

Nach dem ersten Deploy musst du die echte Vercel-IP eintragen:

1. Öffne dein Vercel-Dashboard → dein Projekt → **"Functions"** Tab
2. **Oder:** Gehe auf https://ipinfo.io und ruf einmal `/api/coc?path=/clans/%23TAG` auf – die ausgehende IP siehst du in den Vercel-Logs
3. Vercel nutzt verschiedene IPs (dynamisch). **Lösung:** Erstelle mehrere API-Keys mit verschiedenen Vercel-IPs, oder nutze den Workaround unten.

### Workaround: Alle IPs erlauben (Entwicklungszwecke)
Im CoC Developer Portal kannst du pro Key bis zu 10 IPs whitelisten.
Für Vercel können die IPs variieren. Eine bekannte Lösung ist die Verwendung von
[Vercel's Static Outbound IPs](https://vercel.com/docs/security/deployment-protection/methods-to-protect-all-deployments/ip-blocking)
(nur im Pro-Plan verfügbar).

**Kostenlose Alternative:** Nutze einen Cloudflare Worker als Zwischenschicht, der eine feste IP hat.

---

## 5. Clan-Tag konfigurieren

Öffne `app.js` und trage deinen Clan-Tag ein:

```js
const DEFAULT_CLAN_TAG = "#DEIN_TAG"; // z.B. "#2Y8P9L0CQ"
```

Oder gib den Tag in der URL an:
```
https://dein-dashboard.vercel.app/?tag=#2Y8P9L0CQ
```

---

## Features

- **Übersicht:** Clan-Statistiken, Level, Liga, Beschreibung
- **Mitglieder:** Sortierte Liste mit Rolle, TH-Level, Trophäen, Spenden
- **Krieg:** Aktueller Krieg mit Angriffs-Aufschlüsselung (wer hat angegriffen / nicht angegriffen)
- **Kriegslog:** Letzten 20 Kriege mit Ergebnissen
- **CWL:** Eingeteilte Mitglieder des aktuellen CWL-Monats
- **Überfallwochenende:** Letzte 5 Raid-Weekends mit Teilnahme-Aufschlüsselung

---

## Lokales Testen

```bash
npm install -g vercel
cp .env.example .env.local
# .env.local bearbeiten und echten Token eintragen
vercel dev
```

Dann öffne http://localhost:3000
