# Sjöstadsfärjetrafiken (ressel-static)

Statisk PWA med färjetidtabeller för Hammarby Sjöstad. Ingen byggkedja — rå
HTML/CSS/JS, `data/*.json` är innehållet.

## Läs först

- **[KNOWN-BUGS.md](KNOWN-BUGS.md)** — tre fel i tidsberäkningen, rättade i
  v5.4.0. Innehåller bakgrund och ett regressionstest. **Kör testet när du rör
  `timehandler.js`, `createEnhancedTimeObjects()` eller
  `determineTimetableFiles()`.** Nattturer (`00:05`) hör till föregående
  trafikdygn via `config.dayRolloverTime`; appen laddar igår, idag och imorgon.
- **[MAINTENANCE.md](MAINTENANCE.md)** — checklista för ny säsong. Versionen
  ska bumpas på **fem** ställen, annars pinnar gamla PWA-cachar klienterna på
  den gamla tidtabellen.
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Pages publicerar från `main`, **inte**
  `gh-pages`. `deploy.yml` matar en gren ingen läser. Lägg aldrig till ett
  byggsteg där utan att först läsa filen.

## Saker som är lätta att missa

- **Datafilerna är ett publikt kontrakt.** Hallskärmen (privata `pi-flask`)
  läser `data/*.json` direkt via GitHub Pages. Ändrar du nycklar eller struktur
  går det sönder där. Bumpa `_metadata.version` i configen vid formatändring.
- **Två linjer, två scheman.** `sjo` (gratis) har bara `files.weekday` /
  `files.weekend`; `city` (M/S Emelie, betald) har `weekday`/`saturday`/`sunday`
  plus `holiday_rules` **per säsong**. `sjo` har `holiday_rules` på **rotnivå**
  i configen (generiska säsonger) och listan måste fyllas på årligen. En
  gemensam `files[dagtyp]`-hjälpare kraschar på sjo.
- **`sjo` har en öppen period till 2099** och blir därför aldrig "utgången".
  `city` har avgränsade perioder — utgångsvarningen är *avsiktlig*, den är
  signalen att lägga in nästa säsong.
- **`ressel-city-weekday-winter.json` är nästlad** (`morning`/`lunch`/
  `afternoon`), övriga är platta. Vardagar under innevarande säsong använder
  den, så den kodvägen är normalfallet — inte ett kantfall.
- **Lunchturen visas alltid** trots att dess `note` säger "endast under loven".
  Inget läser `extra_departures_periods`. Känt och accepterat.
- **`disembark_only.from_city`** är en markering av tider som redan finns i
  `departures`, inte extra avgångar.

## Verifiera

```bash
for f in data/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" || echo "TRASIG $f"; done
python3 -m http.server 8000     # och öppna http://localhost:8000
```

Simulera alltid `determineTimetableFiles()` för hand på säsongsgränserna
(start, sista dagen, dagen efter) och på röda dagar när du lagt in en säsong.
