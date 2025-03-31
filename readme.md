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

Applikationen använder en ny filstruktur som korrekt hanterar övergång mellan vardag och helg:

### Konfigurationsfiler
Dessa innehåller metadata och pekar mot rätt tidtabellsfiler:

- **`data/ressel-sjo-config.json`**: Huvudkonfiguration för Sjöstadstrafiken
- **`data/ressel-city-config.json`**: Huvudkonfiguration för M/S Emelie (City-linjen)

### Tidtabellsfiler
Separata filer per säsong och dagtyp:

#### Sjöstadstrafiken
- **`data/ressel-sjo-2024-2025-weekday.json`**: Vardagstidtabell
- **`data/ressel-sjo-2024-2025-weekend.json`**: Helgtidtabell (för både lördag och söndag)

#### M/S Emelie (City-linjen)
- **`data/ressel-city-winter-2024-2025-weekday.json`**: Vardagstidtabell för vinter
- **`data/ressel-city-winter-2024-2025-saturday.json`**: Lördagstidtabell för vinter
- **`data/ressel-city-winter-2024-2025-sunday.json`**: Söndagstidtabell för vinter
- **`data/ressel-city-spring-2025-weekday.json`**: Vardagstidtabell för vår
- **`data/ressel-city-spring-2025-saturday.json`**: Lördagstidtabell för vår
- **`data/ressel-city-spring-2025-sunday.json`**: Söndagstidtabell för vår

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
    "name": "Winter 2024-2025",
    "period": {
      "start": "2024-11-04",
      "end": "2025-04-21"
    },
    "files": {
      "weekday": "ressel-city-winter-2024-2025-weekday.json",
      "saturday": "ressel-city-winter-2024-2025-saturday.json",
      "sunday": "ressel-city-winter-2024-2025-sunday.json"
    },
    "holiday_rules": {
      "weekend_schedule": ["2025-01-06", "2025-04-18"]
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

### Lägg till en ny säsong (t.ex. höst 2025)
1. Skapa nya tidtabellsfiler:
   - `data/ressel-city-fall-2025-weekday.json`
   - `data/ressel-city-fall-2025-saturday.json`
   - `data/ressel-city-fall-2025-sunday.json`

2. Uppdatera konfigurationsfilen `data/ressel-city-config.json` med ny säsongsmappning:
   ```json
   {
     "name": "Fall 2025",
     "period": {
       "start": "2025-06-20",
       "end": "2025-11-03"
     },
     "files": {
       "weekday": "ressel-city-fall-2025-weekday.json",
       "saturday": "ressel-city-fall-2025-saturday.json",
       "sunday": "ressel-city-fall-2025-sunday.json"
     },
     "holiday_rules": {
       "weekend_schedule": ["2025-06-21", "2025-12-24"]
     }
   }
   ```

3. Se till att varje tidtabellsfil har korrekt metadata och avgångstider.

### Formatinstruktioner
Föra tt uppdatera eller skapa nya tidtabeller:

1. Identifiera rätt tidtabellsperiod och dagtyp (vardagar/lördag/söndag)
2. Skapa tidtabellsfiler med rätt namnkonvention: `ressel-[linje]-[säsong]-[dagtyp].json`
3. Uppdatera konfigurationsfilen med korrekt säsongsmappning
4. Se till att all metadata är korrekt uppdaterad i alla filer
5. Kontrollera att hållplatsnamn och avgångstider är formaterade exakt lika i alla filer

Exempel på formattering av tidtabellsfiler finns i avsnittet om datastruktur.

## Projektstruktur
```
sjostadsfärjetrafiken/
├── index.html              # Huvudsida
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Huvudlogik, laddar konfiguration och tidtabeller
│   ├── timehandler.js      # Hanterar tidberäkning och formattering
│   └── renderer.js         # Renderar UI med avgångar
├── data/
│   ├── ressel-sjo-config.json        # Sjöstadstrafiken konfiguration
│   ├── ressel-city-config.json       # M/S Emelie konfiguration
│   ├── ressel-sjo-2024-2025-weekday.json    # Sjöstadstrafiken vardagar
│   ├── ressel-sjo-2024-2025-weekend.json    # Sjöstadstrafiken helger
│   ├── ressel-city-winter-2024-2025-weekday.json  # M/S Emelie vinter vardagar
│   ├── ressel-city-winter-2024-2025-saturday.json # M/S Emelie vinter lördagar
│   ├── ressel-city-winter-2024-2025-sunday.json   # M/S Emelie vinter söndagar
│   ├── ressel-city-spring-2025-weekday.json       # M/S Emelie vår vardagar
│   ├── ressel-city-spring-2025-saturday.json      # M/S Emelie vår lördagar
│   └── ressel-city-spring-2025-sunday.json        # M/S Emelie vår söndagar
├── icons/
│   └── boat.png            # App-ikon
└── manifest.json           # PWA-konfiguration
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

The application uses a new file structure that correctly handles transitions between weekday and weekend schedules:

### Configuration Files
These contain metadata and point to the correct timetable files:

- **`data/ressel-sjo-config.json`**: Main configuration for Sjöstadstrafiken
- **`data/ressel-city-config.json`**: Main configuration for M/S Emelie (City line)

### Timetable Files
Separate files per season and day type:

#### Sjöstadstrafiken
- **`data/ressel-sjo-2024-2025-weekday.json`**: Weekday timetable
- **`data/ressel-sjo-2024-2025-weekend.json`**: Weekend timetable (for both Saturday and Sunday)

#### M/S Emelie (City Line)
- **`data/ressel-city-winter-2024-2025-weekday.json`**: Weekday winter timetable
- **`data/ressel-city-winter-2024-2025-saturday.json`**: Saturday winter timetable
- **`data/ressel-city-winter-2024-2025-sunday.json`**: Sunday winter timetable
- **`data/ressel-city-spring-2025-weekday.json`**: Weekday spring timetable
- **`data/ressel-city-spring-2025-saturday.json`**: Saturday spring timetable
- **`data/ressel-city-spring-2025-sunday.json`**: Sunday spring timetable

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
    "name": "Winter 2024-2025",
    "period": {
      "start": "2024-11-04",
      "end": "2025-04-21"
    },
    "files": {
      "weekday": "ressel-city-winter-2024-2025-weekday.json",
      "saturday": "ressel-city-winter-2024-2025-saturday.json",
      "sunday": "ressel-city-winter-2024-2025-sunday.json"
    },
    "holiday_rules": {
      "weekend_schedule": ["2025-01-06", "2025-04-18"]
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

### Adding a New Season (e.g., Fall 2025)
1. Create new timetable files:
   - `data/ressel-city-fall-2025-weekday.json`
   - `data/ressel-city-fall-2025-saturday.json`
   - `data/ressel-city-fall-2025-sunday.json`

2. Update the configuration file `data/ressel-city-config.json` with new season mapping:
   ```json
   {
     "name": "Fall 2025",
     "period": {
       "start": "2025-06-20",
       "end": "2025-11-03"
     },
     "files": {
       "weekday": "ressel-city-fall-2025-weekday.json",
       "saturday": "ressel-city-fall-2025-saturday.json",
       "sunday": "ressel-city-fall-2025-sunday.json"
     },
     "holiday_rules": {
       "weekend_schedule": ["2025-06-21", "2025-12-24"]
     }
   }
   ```

3. Ensure each timetable file has the correct metadata and departure times.

### Formatting Instructions
To update or creating new timetables:

1. Identify the correct timetable period and day type (weekday/Saturday/Sunday)
2. Create timetable files with the correct naming convention: `ressel-[line]-[season]-[daytype].json`
3. Update the configuration file with proper season mapping
4. Ensure all metadata is correctly updated in all files
5. Verify that stop names and departure times are formatted exactly the same across all files

Examples of timetable file formatting can be found in the data structure section.

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
│   ├── ressel-sjo-config.json        # Sjöstadstrafiken configuration
│   ├── ressel-city-config.json       # M/S Emelie configuration
│   ├── ressel-sjo-2024-2025-weekday.json    # Sjöstadstrafiken weekdays
│   ├── ressel-sjo-2024-2025-weekend.json    # Sjöstadstrafiken weekends
│   ├── ressel-city-winter-2024-2025-weekday.json  # M/S Emelie winter weekdays
│   ├── ressel-city-winter-2024-2025-saturday.json # M/S Emelie winter Saturdays
│   ├── ressel-city-winter-2024-2025-sunday.json   # M/S Emelie winter Sundays
│   ├── ressel-city-spring-2025-weekday.json       # M/S Emelie spring weekdays
│   ├── ressel-city-spring-2025-saturday.json      # M/S Emelie spring Saturdays
│   └── ressel-city-spring-2025-sunday.json        # M/S Emelie spring Sundays
├── icons/
│   └── boat.png            # App icon
└── manifest.json           # PWA configuration
```

## License
MIT License

## Developer
Christian Gillinger  
[GitHub](https://github.com/cgillinger)
