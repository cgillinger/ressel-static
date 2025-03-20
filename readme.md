# Sjöstadsfärjetrafiken

![Sjöstadsfärjetrafiken Screenshot](images/screenshot.png)

En digital skyltlösning för att visa aktuella tidtabeller för båtlinjerna i Hammarby Sjöstad: Sjöstadstrafiken och M/S Emelie.

*[English instructions available below](#english)*

## Huvudfunktioner

- Realtidsvisning av båtavgångar
- Tydliga färgkodade indikatorer:
  - Grön ram: Nästa avgång (>10 minuter)
  - Gul ram: Snar avgång (<10 minuter)
  - Kursiv text: Morgondagens avgångar
- Automatisk hantering av svenska helgdagar
- Uppdateras varje minut
- Fungerar på alla skärmstorlekar
- Mörkt tema som standard (perfekt för digitala skyltar)
- Kan installeras som app på mobil/surfplatta
- Fungerar även offline
- Omfattande felhantering
- Möjlighet att visa/dölja olika linjer

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

## Anpassning

### Ändra visningsalternativ via URL
Du kan anpassa visningen genom att lägga till parametrar i URL:en:

```
index.html?sjo=1&emelie=1&bothdir=1&highlight=Lumabryggan
```

Tillgängliga parametrar:
- `sjo=1` eller `sjo=0`: Visa/dölj Sjöstadstrafiken
- `emelie=1` eller `emelie=0`: Visa/dölj M/S Emelie
- `bothdir=1` eller `bothdir=0`: Visa/dölj returresor
- `highlight=Bryggnamn`: Markera specifik brygga för Sjöstadstrafiken
- `cityhighlight=Bryggnamn`: Markera specifik brygga för M/S Emelie
- `returnstop=Bryggnamn`: Markera specifik brygga för returtrafik

### Exempel på URL-konfigurationer

1. **Endast Sjöstadstrafiken**  
   `index.html?sjo=1&emelie=0`

2. **Endast M/S Emelie utan returresor**  
   `index.html?sjo=0&emelie=1&bothdir=0`

3. **Båda linjerna med Barnängsbryggan markerad**  
   `index.html?sjo=1&emelie=1&highlight=Barnängsbryggan`

### Avancerade konfigurationsalternativ i app.js
För mer permanenta anpassningar kan du redigera `config`-objektet i `js/app.js`. Här är de viktigaste konfigurationsalternativen:

```javascript
const config = {
    updateInterval: 60000,           // Uppdateringsintervall (ms)
    showBothDirections: true,        // Visa båda riktningarna (till/från city)
    showSjostadstrafiken: true,      // Visa/dölj Sjöstadstrafiken tidtabell
    showEmelietrafiken: true,        // Visa/dölj M/S Emelie tidtabell
    highlightStop: "Lumabryggan",    // Brygga att markera för Sjöstadstrafiken
    cityHighlightStop: "Lumabryggan", // Brygga att markera för M/S Emelie (till city)
    cityReturnStop: "Nybroplan",     // Brygga att markera för returresor
    maxVisibleDepartures: 9,         // Max antal avgångar som visas per brygga
    dataPaths: {                     // Sökvägar till tidtabellsdata
        sjo: './data/ressel-sjo.json',
        city: './data/ressel-city.json',
        citySpring: './data/ressel-city-spring-2025.json'
    },
    debug: false                     // Aktivera debug-loggning
};
```

Dessa inställningar gör att du kan:
- Ändra hur ofta tidtabellerna uppdateras
- Visa eller dölja specifika linjer som standard
- Välja vilka bryggor som ska markeras
- Justera antalet avgångar som visas per brygga
- Aktivera felsökningsläge om något inte fungerar som förväntat

## Tidsperioder och tidtabeller

Applikationen stödjer automatiskt säsongstidtabeller:

- **Vintertidtabell**: Gäller 4 november 2024 - 21 april 2025
- **Vårtidtabell**: Gäller 22 april - 19 juni 2025

Systemet väljer automatiskt rätt tidtabell baserat på aktuellt datum.

## Felsökning

### Vanliga problem
1. **Ingen data visas**: Kontrollera internetanslutning eller om datum är utanför giltighetsperioden
2. **Fel tid visas**: Kontrollera enhetens systemtid och tidszon
3. **Långsamma uppdateringar**: Minska antalet synliga avgångar i konfigurationen

### Tips
- För att testa att applikationen fungerar, öppna webbläsarens utvecklarverktyg och kontrollera konsolen för felmeddelanden
- Se till att filrättigheterna är korrekta om du använder en webbserver
- Aktivera debug-läget i konfigurationen för att se detaljerade loggmeddelanden i konsolen

## Utveckling

### Projektstruktur
```
sjostadsfärjetrafiken/
├── index.html              # Huvudsida
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Huvudlogik
│   ├── timehandler.js      # Tidshantering
│   └── renderer.js         # UI-rendering
├── data/
│   ├── ressel-sjo.json     # Sjöstadstrafiken-data
│   ├── ressel-city.json    # M/S Emelie-data (vinter)
│   └── ressel-city-spring-2025.json # M/S Emelie-data (vår)
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

## Key Features

- Real-time boat departure display
- Clear color-coded indicators:
  - Green border: Next departure (>10 minutes)
  - Yellow border: Imminent departure (<10 minutes)
  - Italic text: Next day departures
- Automatic Swedish holiday handling
- Updates every minute
- Works on all screen sizes
- Dark theme by default (perfect for digital signage)
- Can be installed as an app on mobile/tablet
- Works offline
- Comprehensive error handling
- Option to show/hide different lines

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

## Customization

### Change Display Options via URL
You can customize the display by adding parameters to the URL:

```
index.html?sjo=1&emelie=1&bothdir=1&highlight=Lumabryggan
```

Available parameters:
- `sjo=1` or `sjo=0`: Show/hide Sjöstadstrafiken
- `emelie=1` or `emelie=0`: Show/hide M/S Emelie
- `bothdir=1` or `bothdir=0`: Show/hide return trips
- `highlight=StopName`: Highlight specific stop for Sjöstadstrafiken
- `cityhighlight=StopName`: Highlight specific stop for M/S Emelie
- `returnstop=StopName`: Highlight specific stop for return traffic

### Example URL Configurations

1. **Sjöstadstrafiken Only**  
   `index.html?sjo=1&emelie=0`

2. **M/S Emelie Only Without Return Trips**  
   `index.html?sjo=0&emelie=1&bothdir=0`

3. **Both Lines with Barnängsbryggan Highlighted**  
   `index.html?sjo=1&emelie=1&highlight=Barnängsbryggan`

### Advanced Configuration Options in app.js
For more permanent customizations, you can edit the `config` object in `js/app.js`. Here are the key configuration options:

```javascript
const config = {
    updateInterval: 60000,           // Update interval (ms)
    showBothDirections: true,        // Show both directions (to/from city)
    showSjostadstrafiken: true,      // Show/hide Sjöstadstrafiken timetable
    showEmelietrafiken: true,        // Show/hide M/S Emelie timetable
    highlightStop: "Lumabryggan",    // Stop to highlight for Sjöstadstrafiken
    cityHighlightStop: "Lumabryggan", // Stop to highlight for M/S Emelie (to city)
    cityReturnStop: "Nybroplan",     // Stop to highlight for return trips
    maxVisibleDepartures: 9,         // Maximum number of departures to show per stop
    dataPaths: {                     // Paths to timetable data
        sjo: './data/ressel-sjo.json',
        city: './data/ressel-city.json',
        citySpring: './data/ressel-city-spring-2025.json'
    },
    debug: false                     // Enable debug logging
};
```

These settings allow you to:
- Change how often the timetables update
- Show or hide specific lines by default
- Choose which stops to highlight
- Adjust the number of departures shown per stop
- Enable debug mode if something isn't working as expected

## Time Periods and Timetables

The application supports automatic seasonal timetables:

- **Winter Timetable**: Valid November 4, 2024 - April 21, 2025
- **Spring Timetable**: Valid April 22 - June 19, 2025

The system automatically selects the correct timetable based on the current date.

## Troubleshooting

### Common Issues
1. **No data displayed**: Check internet connection or if date is outside validity period
2. **Wrong time displayed**: Check device system time and timezone
3. **Slow updates**: Reduce the number of visible departures in the configuration

### Tips
- To test that the application is working, open the browser's developer tools and check the console for error messages
- Make sure file permissions are correct if using a web server
- Enable debug mode in the configuration to see detailed log messages in the console

## Development

### Project Structure
```
sjostadsfärjetrafiken/
├── index.html              # Main page
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Main logic
│   ├── timehandler.js      # Time handling
│   └── renderer.js         # UI rendering
├── data/
│   ├── ressel-sjo.json     # Sjöstadstrafiken data
│   ├── ressel-city.json    # M/S Emelie data (winter)
│   └── ressel-city-spring-2025.json # M/S Emelie data (spring)
├── icons/
│   └── boat.png            # App icon
└── manifest.json           # PWA configuration
```

## License
MIT License

## Developer
Christian Gillinger  
[GitHub](https://github.com/cgillinger)