<div align="center">

<img src="images/screenshot.png" alt="Sjöstadsfärjetrafiken – realtidstidtabell för Sjöstadstrafiken och M/S Emelie i Hammarby Sjöstad, Stockholm" width="600">

# Sjöstadsfärjetrafiken

**Realtidstidtabell för Sjöstadstrafiken och M/S Emelie i Hammarby Sjöstad, Stockholm**

[![Version](https://img.shields.io/badge/version-5.0.2-blue?style=flat-square)](https://github.com/cgillinger/ressel-static/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://cgillinger.github.io/ressel-static/)
[![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-222?style=flat-square&logo=github)](https://cgillinger.github.io/ressel-static/)
[![Offline](https://img.shields.io/badge/offline-supported-success?style=flat-square)](https://cgillinger.github.io/ressel-static/)
[![Made in Stockholm](https://img.shields.io/badge/made%20in-Stockholm%20🇸🇪-yellow?style=flat-square)](https://cgillinger.github.io/ressel-static/)

[**Live Demo**](https://cgillinger.github.io/ressel-static/) · [Rapportera bugg](https://github.com/cgillinger/ressel-static/issues) · [Bidra](https://github.com/cgillinger/ressel-static/pulls)

</div>

---

Sjöstadsfärjetrafiken är en **progressiv webbapp (PWA)** med realtidstidtabeller för båtlinjerna i Hammarby Sjöstad – **Sjöstadstrafiken** och **M/S Emelie**. Appen fungerar offline, installeras som native app på mobil och desktop, och uppdaterar avgångarna automatiskt. Perfekt för daglig pendling, digital skyltning på bryggor och kioskanvändning.

> Inofficiell tjänst – inte affilierad med Ressel Rederi.

## Innehåll

- [Demo](#demo)
- [Funktioner](#funktioner)
- [Kom igång](#kom-igång)
- [Installera som app](#installera-som-app-iphoneandroid)
- [Anpassa applikationen](#anpassa-applikationen)
- [Hur det fungerar](#hur-det-fungerar)
- [Uppdatera tidtabeller](#uppdatera-tidtabeller)
- [Projektstruktur](#projektstruktur)
- [Teknisk information](#teknisk-information)
- [Felsökning](#felsökning)
- [Bidra](#bidra)

## Demo

**Live:** https://cgillinger.github.io/ressel-static/

| Tidtabellsvy | Inställningsvy |
|:---:|:---:|
| ![Sjöstadsfärjetrafiken – realtidsavgångar för Sjöstadstrafiken och M/S Emelie](images/screenshot.png) | ![Sjöstadsfärjetrafiken – personliga inställningar för brygga och linjer](images/screenshot2.png) |

## Funktioner

| Funktion | Beskrivning |
|----------|-------------|
| ⚡ Realtidsuppdatering | Avgångar uppdateras automatiskt varje minut |
| 🟢 Smart tidmarkering | Grön ram = mer än 10 min · Gul ram = under 10 min · Kursiv = morgondagens första |
| 📱 PWA – installeras som app | Lägg till på hemskärmen som en native app på iOS/Android/desktop |
| 🌙 Mörkt tema | Optimerat för digital skyltning och mörka miljöer |
| 📡 Offline-stöd | Fungerar utan internetuppkoppling via Service Worker |
| 🗓 Helgdagshantering | Byter automatiskt till rätt tidtabell på helgdagar |
| 🔗 URL-parametrar | Konfigurera vyn via URL – perfekt för kiosker |
| ⚓ Brygganpassning | Markera din hemmabrygga för snabb översikt |
| ↩️ Riktningsvisning | Visa/dölj returresor för M/S Emelie |

## Kom igång

### Enkel start – ingen installation krävs

Appen är hostad på **GitHub Pages** och kräver ingen installation – öppna bara länken i webbläsaren:

**https://cgillinger.github.io/ressel-static/**

### Lokal installation

```bash
git clone https://github.com/cgillinger/ressel-static.git
cd ressel-static
python3 -m http.server 8000
# Öppna http://localhost:8000
```

### Hosting på egen server

<details>
<summary><strong>Apache</strong></summary>

```bash
# Kopiera filerna till webbroot
sudo cp -r ressel-static /var/www/html/farjetrafiken
sudo chmod -R 755 /var/www/html/farjetrafiken

# Besök: http://din-server/farjetrafiken
```
</details>

<details>
<summary><strong>Nginx</strong></summary>

```nginx
server {
    listen 80;
    server_name farjetrafiken.example.com;
    root /var/www/farjetrafiken;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Ingen cache på tidtabellsfiler
    location ~* \.json$ {
        add_header Cache-Control "no-cache, must-revalidate";
    }
}
```
</details>

<details>
<summary><strong>Docker</strong></summary>

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t farjetrafiken .
docker run -p 8080:80 farjetrafiken
```
</details>

<details>
<summary><strong>Node.js (http-server)</strong></summary>

```bash
npm install -g http-server
cd ressel-static
http-server -p 8000
```
</details>

> **OBS:** Service Worker kräver HTTPS i produktion. Lokalt fungerar HTTP.

### Digital skyltning och kioskanvändning

```bash
# Raspberry Pi – helskärmsläge
chromium-browser --kiosk --noerrdialogs --disable-infobars index.html

# Windows – Chrome helskärm
chrome.exe --kiosk --app=file:///C:/path/to/index.html
```

## Installera som app (iPhone/Android)

Appen är en PWA och kan installeras direkt från webbläsaren – utan App Store eller Google Play. Den fungerar sedan precis som en vanlig app med egen ikon på hemskärmen.

### iPhone (Safari)

> Fungerar bara i **Safari** – inte Chrome eller Firefox på iOS.

1. Öppna **https://cgillinger.github.io/ressel-static/** i Safari
2. Tryck på **dela-knappen** (fyrkanten med pilen uppåt) längst ner i skärmen
3. Scrolla ner i listan och tryck **"Lägg till på hemskärmen"**
4. Ändra namn om du vill, tryck sedan **"Lägg till"** uppe till höger
5. Appen finns nu på hemskärmen och öppnas i helskärmsläge utan webbläsarens adressfält

### Android (Chrome)

1. Öppna **https://cgillinger.github.io/ressel-static/** i Chrome
2. Tryck på **menyn** (de tre punkterna ⋮) uppe till höger
3. Tryck **"Lägg till på startskärmen"** eller **"Installera app"**
4. Bekräfta genom att trycka **"Installera"** eller **"Lägg till"**
5. Appen finns nu på hemskärmen och i applådan

> På vissa Android-enheter visas en installationsbanner automatiskt längst ner på skärmen – tryck på den för snabbinstallation.

## Anpassa applikationen

### Via inställningsmenyn

Klicka på **Inställningar** längst ner i appen:

1. **Tidtabeller** – välj vilka linjer som visas (Sjöstadstrafiken / M/S Emelie)
2. **Visning** – antal avgångar att visa (3–15)
3. **Bryggor** – markera din hemmabrygga
4. **Riktningar** – visa/dölj returresor för M/S Emelie

*Dina val sparas automatiskt i webbläsarens localStorage.*

### Via URL-parametrar

Perfekt för kiosker och digital skyltning med fasta inställningar:

```
https://cgillinger.github.io/ressel-static/?sjo=1&emelie=1&highlight=Lumabryggan&maxdep=8
```

| Parameter | Värde | Beskrivning |
|-----------|-------|-------------|
| `sjo` | `1` / `0` | Visa/dölj Sjöstadstrafiken |
| `emelie` | `1` / `0` | Visa/dölj M/S Emelie |
| `bothdir` | `1` / `0` | Visa/dölj returresor |
| `highlight` | Bryggnamn | Markera brygga (Sjöstadstrafiken) |
| `cityhighlight` | Bryggnamn | Markera brygga till city (M/S Emelie) |
| `returnstop` | Bryggnamn | Markera brygga från city (M/S Emelie) |
| `maxdep` | `3`–`15` | Antal avgångar att visa |

**Vanliga kombinationer:**

```bash
# Endast Sjöstadstrafiken
?sjo=1&emelie=0

# Barnängsbryggan med 12 avgångar
?highlight=Barnängsbryggan&maxdep=12

# M/S Emelie utan returresor, mobiloptimerat
?sjo=0&emelie=1&bothdir=0&maxdep=5
```

## Hur det fungerar

### Datastruktur

Tidtabeller återanvänds smart mellan säsonger – ändra på ett ställe, påverkar alla säsonger som delar filen.

```
data/
├── ressel-sjo-config.json              ← Konfiguration Sjöstadstrafiken
├── ressel-city-config.json             ← Konfiguration M/S Emelie
├── ressel-sjo-weekday-standard.json    ← Vardagar (höst/vinter/vår)
├── ressel-sjo-weekday-summer.json      ← Sommarvardagar
├── ressel-sjo-weekend.json             ← Helger (alla säsonger)
├── ressel-city-weekday-winter.json     ← Vardagar (vinter/vår/höst)
├── ressel-city-weekend-winter.json     ← Helger (vinter/vår/höst)
└── ressel-city-maintenance-*.json      ← Tillfälliga trafikuppehåll
```

### Konfigurationsfiler

`ressel-sjo-config.json` och `ressel-city-config.json` styr säsongsmappning, helgdagsregler och specialdagar.

<details>
<summary>Visa exempelkonfiguration</summary>

```json
{
  "name": "Winter 2025-2026",
  "period": {
    "start": "2025-12-15",
    "end": "2026-04-19"
  },
  "files": {
    "weekday": "ressel-city-weekday-winter.json",
    "saturday": "ressel-city-weekend-winter.json",
    "sunday": "ressel-city-weekend-winter.json"
  },
  "holiday_rules": {
    "no_traffic": ["2025-12-24", "2025-12-25"],
    "weekend_schedule": ["2026-01-06"]
  }
}
```
</details>

<details>
<summary>Visa exempeltidtabellsfil</summary>

```json
{
  "metadata": {
    "valid_period": { "start": "2025-12-15", "end": "2026-04-19" },
    "day_type": "weekday"
  },
  "operating_hours": { "start": "06:00", "end": "00:00" },
  "departures": {
    "Barnängsbryggan":    ["06:00", "06:20", "06:40"],
    "Lumabryggan":        ["06:05", "06:25", "06:45"],
    "Henriksdalsbryggan": ["06:10", "06:30", "06:50"]
  }
}
```
</details>

## Uppdatera tidtabeller

### Lägg till ny säsong

I de flesta fall räcker det med att uppdatera config-filen med nya datum:

```json
{
  "name": "Summer 2026",
  "period": { "start": "2026-06-20", "end": "2026-08-17" },
  "files": {
    "weekday": "ressel-sjo-weekday-summer.json",
    "weekend": "ressel-sjo-weekend.json"
  }
}
```

Skapa en ny tidtabellsfil bara om avgångstiderna faktiskt avviker från befintliga filer.

### Trafikuppehåll (maintenance mode)

<details>
<summary>Visa hur maintenance mode konfigureras</summary>

**1. Skapa maintenance-fil:**

```json
{
  "metadata": {
    "valid_period": { "start": "2026-03-01", "end": "2026-03-15" },
    "day_type": "weekday",
    "maintenance_mode": true,
    "maintenance_message": "Trafiken är tillfälligt inställd. Välkomna åter 16 mars!"
  },
  "to_city": { "departures": {} },
  "from_city": { "departures": {} }
}
```

**2. Uppdatera config:**

```json
{
  "name": "Maintenance March 2026",
  "period": { "start": "2026-03-01", "end": "2026-03-15" },
  "files": {
    "weekday": "ressel-city-maintenance-2026-weekday.json",
    "saturday": "ressel-city-maintenance-2026-saturday.json",
    "sunday": "ressel-city-maintenance-2026-sunday.json"
  },
  "maintenance_mode": true
}
```

Istället för tidtabell visas meddelandet i appen.
</details>

## Projektstruktur

```
ressel-static/
├── index.html              Huvudsida
├── manifest.json           PWA-konfiguration
├── service-worker.js       Offline-stöd (Service Worker)
├── css/
│   └── styles.css          Alla stilar
├── js/
│   ├── app.js              Huvudlogik
│   ├── timehandler.js      Tidsberäkningar
│   └── renderer.js         UI-rendering
├── data/
│   └── *.json              Tidtabeller och konfiguration
└── icons/
    └── boat.png            App-ikon
```

## Teknisk information

### Versionshantering

Uppdatera versionsnumret på dessa fyra ställen vid ny release:

| Fil | Nyckel |
|-----|--------|
| `manifest.json` | `"version"` |
| `index.html` | `<meta name="version">` |
| `service-worker.js` | `APP_VERSION` |
| `js/app.js` | `version` |

### PWA & Service Worker

- Offline-stöd via Service Worker med cache-strategi
- Installeras som native app på mobil och desktop
- Ny cache-nyckel vid versionsökning rensar gamla cachar automatiskt
- Inbyggd notis när ny version finns tillgänglig

## Felsökning

<details>
<summary><strong>Uppdateringar visas inte</strong></summary>

1. Öppna DevTools (`F12`)
2. Application → Clear storage → Clear site data
3. Håll `Ctrl+Shift+R` (hard reload)
</details>

<details>
<summary><strong>Fel tidtabell visas</strong></summary>

Kontrollera datum i config-filerna: `period.start` och `period.end`. Kontrollera om perioderna överlappar.
</details>

<details>
<summary><strong>Appen fungerar inte offline</strong></summary>

DevTools → Application → Service Workers – status ska vara **"activated and running"**.
</details>

## Bidra

Pull requests är välkomna! Öppna gärna en issue först för större ändringar.

### Rapportera buggar

Gå till [GitHub Issues](https://github.com/cgillinger/ressel-static/issues) och inkludera:

- Webbläsare och version
- Steg för att återskapa felet
- Förväntad vs faktisk funktion
- Skärmdump (om relevant)

## Licens

Distribueras under [MIT-licensen](LICENSE).

---

<div align="center">

Utvecklad av **[Christian Gillinger](https://github.com/cgillinger)** · Stockholm, Sverige

[![GitHub](https://img.shields.io/badge/GitHub-cgillinger-black?style=flat-square&logo=github)](https://github.com/cgillinger)

*Sjöstadsfärjetrafiken – inofficiell realtidstidtabell för båtar i Hammarby Sjöstad*

</div>
