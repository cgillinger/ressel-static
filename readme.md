# Sjöstadsfärjetrafiken

![Sjöstadsfärjetrafiken Screenshot](images/screenshot.png)

![Sjöstadsfärjetrafiken med meny för personliga inställningar](images/screenshot2.png)

En digital skyltlösning för att visa aktuella tidtabeller för båtlinjerna i Hammarby Sjöstad: Sjöstadstrafiken och M/S Emelie.

*[English instructions available below](#english)*

Demo: https://cgillinger.github.io/ressel-static/

## Huvudfunktioner

- Realtidsvisning av båtavgångar
- Korrekt hantering av byte mellan vardagstidtabell och helgtidtabell
- Tydliga färgkodade indikatorer:
  - Grön ram: Nästa avgång (>10 minuter)
  - Gul ram: Snar avgång (<10 minuter)
  - Kursiv text: Morgondagens avgångar
- Hamburger-meny med inställningar för anpassning
- Automatisk anpassning för mobilskärmar
- Automatisk hantering av svenska helgdagar
- Uppdateras varje minut
- Fungerar på alla skärmstorlekar
- Mörkt tema som standard (perfekt för digitala skyltar)
- Kan installeras som app på mobil/surfplatta
- Fungerar även offline
- Omfattande felhantering

## Installation för digital skyltlösning

### Grundinstallation
1. Ladda ner senaste versionen
2. Extrahera filerna till valfri mapp
3. Starta genom att öppna index.html i en webbläsare

### För digital skyltning
1. Installera en webbläsare på din skärmenhet (Chrome, Firefox, Edge)
2. Konfigurera webbläsaren för kioskmodus/fullskärm
3. Ställ in automatisk start av webbläsaren vid uppstart
4. Peka webbläsaren mot index.html, eller använd en lokal webbserver

### Rekommenderade webblösningar för digital signage
- **Raspberry Pi**: Använd Chromium i kioskmodus
- **Android-surfplatta**: Installera som PWA (lägg till på hemskärmen)
- **Windows-dator**: Använd Chrome i kioskmodus + automatisk start
- **Smart TV med webbläsare**: Öppna sidan direkt i TV:ns webbläsare

## Inställningar och anpassning

### Användning av inställningspanelen
Klicka på "Inställningar" längst ner på sidan för att öppna inställningspanelen. Här kan du:

1. **Tidtabeller**: Visa/dölj Sjöstadstrafiken och M/S Emelie
2. **Riktningar**: Visa/dölj returresor för M/S Emelie (synligt när M/S Emelie är aktiverad)
3. **Visning**: Ändra antal avgångar som visas (3-15)
4. **Bryggor**: Välja vilka bryggor som ska markeras för respektive linje

Dina inställningar sparas automatiskt mellan besök i webbläsaren.

### Anpassning via URL-parametrar
Du kan anpassa visningen genom att lägga till parametrar i URL:en:

```
index.html?sjo=1&emelie=1&bothdir=1&highlight=Lumabryggan&maxdep=6
```

Tillgängliga parametrar:
- `sjo=1` eller `sjo=0`: Visa/dölj Sjöstadstrafiken
- `emelie=1` eller `emelie=0`: Visa/dölj M/S Emelie
- `bothdir=1` eller `bothdir=0`: Visa/dölj returresor för M/S Emelie
- `highlight=Bryggnamn`: Markera specifik brygga för Sjöstadstrafiken
- `cityhighlight=Bryggnamn`: Markera specifik brygga för M/S Emelie
- `returnstop=Bryggnamn`: Markera specifik brygga för returtrafik
- `maxdep=X`: Ange antal avgångar som ska visas (X = 3 till 15)

### Exempel på URL-konfigurationer

1. **Endast Sjöstadstrafiken**  
   `index.html?sjo=1&emelie=0`

2. **Endast M/S Emelie utan returresor**  
   `index.html?sjo=0&emelie=1&bothdir=0`

3. **Båda linjerna med Barnängsbryggan markerad och fler avgångar**  
   `index.html?sjo=1&emelie=1&highlight=Barnängsbryggan&maxdep=12`

4. **Mobiloptimerad visning**  
   `index.html?maxdep=5`

## Tidtabeller och datastruktur

Applikationen använder en **förenklad filstruktur** (version 5.0.0) med generiska tidtabellsfiler som återanvänds över flera säsonger:

### Konfigurationsfiler
Dessa innehåller metadata och pekar mot rätt tidtabellsfiler:

- **`data/ressel-sjo-config.json`**: Huvudkonfiguration för Sjöstadstrafiken
- **`data/ressel-city-config.json`**: Huvudkonfiguration för M/S Emelie (City-linjen)

### Tidtabellsfiler
Version 5.0.0 använder endast **5 generiska filer** istället för 24:

#### Sjöstadstrafiken (3 filer)
- **`data/ressel-sjo-weekday-standard.json`**: Vardagar med rusningstidstrafik (används höst/vinter/vår)
- **`data/ressel-sjo-weekday-summer.json`**: Sommarvardagar utan rusningstidstrafik
- **`data/ressel-sjo-weekend.json`**: Helger (identisk för alla säsonger)

#### M/S Emelie City-linjen (2 filer)
- **`data/ressel-city-weekday-winter.json`**: Vardagar (återanvänds för vinter/vår/höst)
- **`data/ressel-city-weekend-winter.json`**: Helger (återanvänds för vinter/vår/höst)

**Fördelar med ny struktur:**
- 50% färre filer att underhålla
- Enklare uppdateringar - ändra en fil, påverkar flera säsonger
- Tydligare filnamn som beskriver innehåll istället för säsong
- Samma funktionalitet för användaren

### Metadatastruktur

#### Konfigurationsfiler
Konfigurationsfilerna innehåller:
- Versionsinformation och uppdateringsdatum
- Metadata om priser, anteckningar och särskilda regler
- Stationsordning och annan servicekonfiguration
- Säsongsmappning som knyter datum till rätt tidtabellsfiler
- Helgdagsregler

Exempel på säsongsmappning från `ressel-city-config.json`:
```json
"season_mapping": [
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
      "no_traffic": ["2025-12-24", "2025-12-25", "2025-12-26", "2025-12-31", "2026-01-01"],
      "weekend_schedule": ["2026-01-06"]
    }
  }
]
```

#### Tidtabellsfiler
Tidtabellsfilerna innehåller:
- Grundläggande metadata (giltighetsperiod, dagtyp)
- Avgångstider för olika hållplatser
- Eventuella särregler för specifika tider

## Uppdatering av tidtabeller

### Lägg till en ny säsong
Med den nya strukturen behöver du **inte skapa nya filer** för varje säsong, bara uppdatera konfigurationen:

1. Kontrollera om befintliga generiska filer kan återanvändas
2. Om tidtabellen är identisk med en tidigare säsong, **återanvänd samma fil**
3. Uppdatera endast `ressel-city-config.json` eller `ressel-sjo-config.json` med ny säsongsmappning

**Exempel - lägga till sommar 2026:**

```json
{
  "name": "Summer 2026",
  "period": {
    "start": "2026-06-20",
    "end": "2026-08-16"
  },
  "files": {
    "weekday": "ressel-city-weekday-summer.json",
    "saturday": "ressel-city-weekend-summer.json",
    "sunday": "ressel-city-weekend-summer.json"
  }
}
```

### När ska nya tidtabellsfiler skapas?

Skapa **bara** nya filer om:
- Avgångstiderna är **olika** från alla befintliga generiska filer
- Det är en helt ny trafiktyp (t.ex. nattbuss, expresslinje)

**Namnkonvention för nya filer:**
- `ressel-[linje]-[typ]-[variant].json`
- Exempel: `ressel-city-weekday-summer.json`

### Hantering av trafikuppehåll (Maintenance Mode)

För perioder då trafiken tillfälligt är inställd (t.ex. på grund av broarbeten, service, eller andra planerade uppehåll) kan du använda maintenance-läget:

#### Skapa maintenance-tidtabeller

1. Skapa tre JSON-filer med tomt innehåll:
   - `data/ressel-city-maintenance-ÅÅÅÅ-weekday.json`
   - `data/ressel-city-maintenance-ÅÅÅÅ-saturday.json`
   - `data/ressel-city-maintenance-ÅÅÅÅ-sunday.json`

2. Format för maintenance-filer:
   ```json
   {
     "metadata": {
       "valid_period": {
         "start": "ÅÅÅÅ-MM-DD",
         "end": "ÅÅÅÅ-MM-DD"
       },
       "day_type": "weekday",
       "maintenance_mode": true,
       "maintenance_message": "Ditt meddelande här. Välkomna åter DD månad ÅÅÅÅ!"
     },
     "to_city": {
       "operating_hours": {
         "start": "00:00",
         "end": "00:00"
       },
       "departures": {}
     },
     "from_city": {
       "operating_hours": {
         "start": "00:00",
         "end": "00:00"
       },
       "departures": {}
     },
     "disembark_only": {
       "from_city": {}
     }
   }
   ```

3. Uppdatera `data/ressel-city-config.json` med maintenance-perioden:
   ```json
   {
     "name": "Maintenance [Beskrivning]",
     "period": {
       "start": "ÅÅÅÅ-MM-DD",
       "end": "ÅÅÅÅ-MM-DD"
     },
     "files": {
       "weekday": "ressel-city-maintenance-ÅÅÅÅ-weekday.json",
       "saturday": "ressel-city-maintenance-ÅÅÅÅ-saturday.json",
       "sunday": "ressel-city-maintenance-ÅÅÅÅ-sunday.json"
     },
     "maintenance_mode": true
   }
   ```

**Resultat:** Under maintenance-perioden kommer Sjöstadstrafiken fortsätta visas normalt, medan M/S Emelie istället visar ditt anpassade meddelande istället för tidtabellen.

**Exempel:**
```
M/S Emelie → City
Linjen har tillfälligt uppehåll på grund av broarbeten. Välkomna åter 13 december 2025!
```

## Projektstruktur
```
sjostadsfärjetrafiken/
├── index.html              # Main page
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Main logic, loads configurations and timetables
│   ├── timehandler.js      # Handles time calculations and formatting
│   └── renderer.js         # Renders UI with departures
├── data/
│   ├── ressel-sjo-config.json              # Sjöstadstrafiken configuration
│   ├── ressel-city-config.json             # M/S Emelie configuration
│   ├── ressel-sjo-weekday-standard.json    # Sjöstadstrafiken weekdays (rush hour)
│   ├── ressel-sjo-weekday-summer.json      # Sjöstadstrafiken summer weekdays
│   ├── ressel-sjo-weekend.json             # Sjöstadstrafiken weekends (all seasons)
│   ├── ressel-city-weekday-winter.json     # M/S Emelie weekdays (winter/spring/fall)
│   ├── ressel-city-weekend-winter.json     # M/S Emelie weekends (winter/spring/fall)
│   └── [plus seasonal files for spring/summer/fall as needed]
├── icons/
│   └── boat.png            # App icon
└── manifest.json           # PWA configuration
```

## Licens
MIT License

## Utvecklare
Christian Gillinger  
[GitHub](https://github.com/cgillinger)

---

<a name="english"></a>
# Sjöstadsfärjetrafiken (Stockholm Harbor Ferry Timetables)

A digital signage solution for displaying current timetables for the boat lines in Hammarby Sjöstad, Stockholm: Sjöstadstrafiken and M/S Emelie.

![Settings menu for personal customization](images/screenshot2.png)

## Key Features

- Real-time boat departure display
- Correct handling of switching between weekday and weekend timetables
- Clear color-coded indicators:
  - Green border: Next departure (>10 minutes)
  - Yellow border: Imminent departure (<10 minutes)
  - Italic text: Next day departures
- Hamburger menu with settings for customization
- Automatic mobile screen adaptation
- Automatic Swedish holiday handling
- Updates every minute
- Works on all screen sizes
- Dark theme by default (perfect for digital signage)
- Can be installed as an app on mobile/tablet
- Works offline
- Comprehensive error handling

## Installation for Digital Signage

### Basic Installation
1. Download the latest version
2. Extract files to any folder
3. Start by opening index.html in a web browser

### For Digital Signage
1. Install a web browser on your display device (Chrome, Firefox, Edge)
2. Configure the browser for kiosk mode/fullscreen
3. Set up automatic browser launch at startup
4. Point the browser to index.html, or use a local web server

### Recommended Web Solutions for Digital Signage
- **Raspberry Pi**: Use Chromium in kiosk mode
- **Android tablet**: Install as PWA (add to home screen)
- **Windows PC**: Use Chrome in kiosk mode + auto-start
- **Smart TV with browser**: Open the page directly in the TV's browser

## Settings and Customization

### Using the Settings Panel
Click on "Settings" at the bottom of the page to open the settings panel. Here you can:

1. **Timetables**: Show/hide Sjöstadstrafiken and M/S Emelie
2. **Directions**: Show/hide return trips for M/S Emelie (visible when M/S Emelie is enabled)
3. **Display**: Change the number of departures shown (3-15)
4. **Stops**: Choose which stops to highlight for each line

Your settings are automatically saved between sessions in the browser.

### Customization via URL Parameters
You can customize the display by adding parameters to the URL:

```
index.html?sjo=1&emelie=1&bothdir=1&highlight=Lumabryggan&maxdep=6
```

Available parameters:
- `sjo=1` or `sjo=0`: Show/hide Sjöstadstrafiken
- `emelie=1` or `emelie=0`: Show/hide M/S Emelie
- `bothdir=1` or `bothdir=0`: Show/hide return trips for M/S Emelie
- `highlight=StopName`: Highlight specific stop for Sjöstadstrafiken
- `cityhighlight=StopName`: Highlight specific stop for M/S Emelie
- `returnstop=StopName`: Highlight specific stop for return traffic
- `maxdep=X`: Set number of departures to show (X = 3 to 15)

## Timetables and Data Structure

The application uses a **simplified file structure** (version 5.0.0) with generic timetable files that are reused across multiple seasons:

### Configuration Files
These contain metadata and point to the correct timetable files:

- **`data/ressel-sjo-config.json`**: Main configuration for Sjöstadstrafiken
- **`data/ressel-city-config.json`**: Main configuration for M/S Emelie (City line)

### Timetable Files
Version 5.0.0 uses only **5 generic files** instead of 24:

#### Sjöstadstrafiken (3 files)
- **`data/ressel-sjo-weekday-standard.json`**: Weekdays with rush hour (used fall/winter/spring)
- **`data/ressel-sjo-weekday-summer.json`**: Summer weekdays without rush hour
- **`data/ressel-sjo-weekend.json`**: Weekends (identical for all seasons)

#### M/S Emelie City Line (2 files)
- **`data/ressel-city-weekday-winter.json`**: Weekdays (reused for winter/spring/fall)
- **`data/ressel-city-weekend-winter.json`**: Weekends (reused for winter/spring/fall)

**Benefits of new structure:**
- 50% fewer files to maintain
- Easier updates - change one file, affects multiple seasons
- Clearer file names describing content instead of season
- Same functionality for users

### Metadata Structure

#### Configuration Files
Configuration files contain:
- Version information and update date
- Metadata about prices, notes, and special rules
- Station sequence and other service configuration
- Season mapping linking dates to the correct timetable files
- Holiday rules

Example of season mapping from `ressel-city-config.json`:
```json
"season_mapping": [
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
      "no_traffic": ["2025-12-24", "2025-12-25", "2025-12-26", "2025-12-31", "2026-01-01"],
      "weekend_schedule": ["2026-01-06"]
    }
  }
]
```

#### Timetable Files
Timetable files contain:
- Basic metadata (validity period, day type)
- Departure times for different stops
- Any special rules for specific times

## Updating Timetables

### Adding a New Season
With the new structure you **don't need to create new files** for each season, just update the configuration:

1. Check if existing generic files can be reused
2. If the timetable is identical to a previous season, **reuse the same file**
3. Only update `ressel-city-config.json` or `ressel-sjo-config.json` with new season mapping

**Example - adding summer 2026:**

```json
{
  "name": "Summer 2026",
  "period": {
    "start": "2026-06-20",
    "end": "2026-08-16"
  },
  "files": {
    "weekday": "ressel-city-weekday-summer.json",
    "saturday": "ressel-city-weekend-summer.json",
    "sunday": "ressel-city-weekend-summer.json"
  }
}
```

### When to Create New Timetable Files

Create new files **only** if:
- Departure times are **different** from all existing generic files
- It's a completely new traffic type (e.g., night bus, express line)

**Naming convention for new files:**
- `ressel-[line]-[type]-[variant].json`
- Example: `ressel-city-weekday-summer.json`

### Handling Service Interruptions (Maintenance Mode)

For periods when service is temporarily suspended (e.g., due to bridge work, maintenance, or other planned interruptions), you can use maintenance mode:

#### Create maintenance timetables

1. Create three JSON files with empty content:
   - `data/ressel-city-maintenance-YYYY-weekday.json`
   - `data/ressel-city-maintenance-YYYY-saturday.json`
   - `data/ressel-city-maintenance-YYYY-sunday.json`

2. Format for maintenance files:
   ```json
   {
     "metadata": {
       "valid_period": {
         "start": "YYYY-MM-DD",
         "end": "YYYY-MM-DD"
       },
       "day_type": "weekday",
       "maintenance_mode": true,
       "maintenance_message": "Your message here. Welcome back DD Month YYYY!"
     },
     "to_city": {
       "operating_hours": {
         "start": "00:00",
         "end": "00:00"
       },
       "departures": {}
     },
     "from_city": {
       "operating_hours": {
         "start": "00:00",
         "end": "00:00"
       },
       "departures": {}
     },
     "disembark_only": {
       "from_city": {}
     }
   }
   ```

3. Update `data/ressel-city-config.json` with the maintenance period:
   ```json
   {
     "name": "Maintenance [Description]",
     "period": {
       "start": "YYYY-MM-DD",
       "end": "YYYY-MM-DD"
     },
     "files": {
       "weekday": "ressel-city-maintenance-YYYY-weekday.json",
       "saturday": "ressel-city-maintenance-YYYY-saturday.json",
       "sunday": "ressel-city-maintenance-YYYY-sunday.json"
     },
     "maintenance_mode": true
   }
   ```

**Result:** During the maintenance period, Sjöstadstrafiken will continue to display normally, while M/S Emelie will show your custom message instead of the timetable.

**Example:**
```
M/S Emelie → City
Service temporarily suspended due to bridge work. Welcome back December 13, 2025!
```

## Project Structure
```
sjostadsfärjetrafiken/
├── index.html              # Main page
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Main logic, loads configurations and timetables
│   ├── timehandler.js      # Handles time calculations and formatting
│   └── renderer.js         # Renders UI with departures
├── data/
│   ├── ressel-sjo-config.json              # Sjöstadstrafiken configuration
│   ├── ressel-city-config.json             # M/S Emelie configuration
│   ├── ressel-sjo-weekday-standard.json    # Sjöstadstrafiken weekdays (rush hour)
│   ├── ressel-sjo-weekday-summer.json      # Sjöstadstrafiken summer weekdays
│   ├── ressel-sjo-weekend.json             # Sjöstadstrafiken weekends (all seasons)
│   ├── ressel-city-weekday-winter.json     # M/S Emelie weekdays (winter/spring/fall)
│   ├── ressel-city-weekend-winter.json     # M/S Emelie weekends (winter/spring/fall)
│   └── [plus seasonal files for spring/summer/fall as needed]
├── icons/
│   └── boat.png            # App icon
└── manifest.json           # PWA configuration
```

## License
MIT License

## Developer
Christian Gillinger  
[GitHub](https://github.com/cgillinger)
