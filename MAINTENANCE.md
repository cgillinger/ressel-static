# Underhåll – så uppdaterar du tidtabellerna

> Praktisk checklista för att lägga in en ny säsong. Skriven 2026-06-14 i samband med Sommar 2026.
> Läs den här innan du börjar – då går det fort och inget glöms.

## Två linjer, två system

| Linje | Operatör | Betalning | Config | Mönster |
|-------|----------|-----------|--------|---------|
| **Sjöstadstrafiken** (`sjo`) | — | Gratis | `data/ressel-sjo-config.json` | Triangel Barnäng→Luma→Henriksdal, var 20:e min. Filerna är **generiska** och återanvänds år efter år. |
| **M/S Emelie** (`city`) | Ressel Rederi | Betald | `data/ressel-city-config.json` | Tur/retur Hammarbysjöstad ↔ Nybroplan via Masthamnen/Djurgården. Säsongsvisa datafiler. |

## Hur appen väljer rätt tidtabell

`js/app.js → determineTimetableFiles()`:

1. Bestämmer dagtyp av veckodagen: `saturday` / `sunday` / `weekday`.
2. Går igenom `season_mapping` och tar **första** säsong där dagens datum ligger i `period.start … period.end`.
3. För **city**: om datumet finns i `holiday_rules.weekend_schedule` används `files.sunday` (röda dagar/storhelger körs som söndag).
4. Väljer datafil ur `files[dagtyp]`.

**Viktigt om perioderna:**
- **sjo** har en öppen sista period som slutar `2099-12-31` – den fångar alla framtida datum, så sjo blir aldrig "utgången". När en sommarsäsong läggs in måste man **kapa** den öppna perioden före sommaren och **lägga tillbaka** en ny öppen period efter (se sommar 2026 som exempel).
- **city** har **avgränsade** perioder utan öppet slut. När sista säsongen passerats visar appen senaste schemat med en **"utgången"-varning**. Det är meningen – varningen är signalen att det är dags att lägga in nästa säsong från ny PDF. Lägg alltid in nästa säsong i god tid.

## Datafilernas format

Två tillåtna strukturer (båda stöds av renderern):
- **Platt** (används av helg- och sommarfiler): `to_city.operating_hours` + `to_city.departures` per hållplats. Använd den här för nya filer – enklast.
- **Nästlad** (`ressel-city-weekday-winter.json`): `to_city.morning/lunch/afternoon` – behövs bara när en lunch­avgång ska kunna slås på/av villkorat (t.ex. lov). Slå inte på detta i onödan.

`disembark_only.from_city` listar de tider som är märkta `*Endast avstigning` i PDF:en (gäller bara Hammarby-bryggorna på vägen tillbaka). Glöm inte dessa – de står som fotnot i PDF:en och är lätta att missa.

Lunch-uppehåll i sommartidtabellen är bara ett **glapp** mellan avgångar – inga tomma poster behövs, hoppa bara över tiderna.

## Trafikuppehåll / arbeten (maintenance mode)

Separat mekanism, dokumenterad i README (avsnitt "Trafikuppehåll"). En datafil med
`metadata.maintenance_mode: true` + `maintenance_message`, plus `maintenance_mode: true`
på säsongen i config. Då visas meddelandet i stället för tidtabell.

## Versionsbump (PWA-cache) – OBLIGATORISKT vid varje ändring av utdata

Appen är en PWA. Utan ny version riskerar klienter att ligga kvar på cachad gammal tidtabell.
Bumpa **samma** versionsnummer på alla dessa ställen (sök på gamla numret):

| Fil | Var |
|-----|-----|
| `manifest.json` | `"version"` |
| `index.html` | `<meta name="version">` **och** `<meta name="app-version">` |
| `service-worker.js` | `const APP_VERSION` (driver `CACHE_NAME`/`JSON_CACHE_NAME`) |
| `js/app.js` | `config.version`, JSDoc `@version`, samt en rad i versionshistoriken |

Lägg dessutom till nya datafiler i `service-worker.js → JSON_FILES` (annars cachas de inte för offline).

## Källmaterial

Lägg PDF:er / skärmdumpar i `pdf/`. **Den mappen är gitignore:ad och ska aldrig pushas** – den är bara referens. Skriv in PDF-namnet i datafilens `metadata.note` så att källan går att spåra.

## Checklista – ny säsong

1. [ ] Lägg käll-PDF/bilder i `pdf/`.
2. [ ] city: skapa nya datafiler `ressel-city-<säsong>-{weekday,saturday,sunday}.json` om tiderna avviker (annars återanvänd befintlig fil).
3. [ ] city: lägg till säsong i `season_mapping` (`period`, `files`, ev. `holiday_rules.weekend_schedule` för storhelger).
4. [ ] sjo: oftast räcker config – kapa den öppna `2099`-perioden, lägg in sommarsäsong, lägg tillbaka ny öppen period. Datafilerna återanvänds normalt.
5. [ ] Lägg nya datafiler i `service-worker.js → JSON_FILES`.
6. [ ] Bumpa versionen på alla 4 ställena ovan.
7. [ ] Uppdatera `_metadata.version` + `last_updated` i berörd config, och fil-listan i README.
8. [ ] Validera JSON och simulera datumval (se nedan).
9. [ ] Testa lokalt: `python3 -m http.server 8000`.

## Snabb verifiering

```bash
# JSON-validering
for f in data/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" && echo "OK $f"; done
```

Simulera filval för gränsdatum (säsongsstart, midsommar/storhelg, säsongsslut, dagen efter)
genom att spegla logiken i `determineTimetableFiles()` – kontrollera särskilt att inga
**glapp** uppstår mellan perioderna och att storhelger pekar på söndagsfilen.

## Kända begränsningar

- **sjo har ingen holiday_rules-logik i koden** (bara city har det). Midsommarafton och röda
  dagar hanteras därför inte automatiskt för Sjöstadstrafiken – den visar vardagstidtabell
  även om operatören kör helgtidtabell. Att åtgärda kräver kodändring i `determineTimetableFiles()`,
  inte bara data. Lämnat orört tills vidare.
