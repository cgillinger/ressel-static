# Underhåll – så uppdaterar du tidtabellerna

> Praktisk checklista för att lägga in en ny säsong. Skriven 2026-06-14 i samband med Sommar 2026.
> Läs den här innan du börjar – då går det fort och inget glöms.

## Snabbväg: synk mot Ressels webbtabeller (båda linjerna)

Ressels webbtabeller (`ressel.se/emelie-trafiken/`, `ressel.se/sjostadstrafiken/`) är primär källa.
`tools/sync_ressel.py` (Python 3, stdlib; `pdftotext` för Emelies PDF) upptäcker nya perioder
**och** tysta ändringar i befintliga tider.

**Flöde:** Action körs måndagar -> öppnar PR `auto/ressel-sync-<datum>` om `data/` ändrats
(finns redan en öppen sådan PR skapas ingen ny) -> du granskar sammanfattningen -> merge.
Aldrig auto-merge. Manuellt lokalt:

```bash
python3 tools/sync_ressel.py            # sammanfattning, skriver inget
python3 tools/sync_ressel.py --write    # skriver och kör validatorn
python3 tools/validate.py && python3 -m unittest
```

Flaggor: `--emelie-html F`, `--sjo-html F`, `--pdf URL|F` (kan upprepas), `--no-pdf`.
Exit 0 även när ändringar finns, exit 1 vid tolkningsfel (t.ex. ogiltig tid som "12:80" i en
tabell som inte passerat; passerade perioder hoppas över). Idempotent.

- **city:** per period: samma period som en säsong -> tider jämförs mot filerna; skiljer de
  skrivs filen om, men en fil som delas med andra säsonger ändras aldrig (ny fil skapas).
  Ny period -> ny säsong (identiska filer återanvänds). Röda dagar finns bara i PDF:en och
  hämtas ur den PDF som har samma period. Saknas PDF skapas säsongen **utan helgregler** och
  en VARNING visas: lägg in dem (`tools/import_emelie.py <pdf> --write` när PDF:en kommit). Varje
  skillnad PDF mot webb är en VARNING (webben vinner). Avvikande turer (10:14) flaggas.
- **sjo:** den öppna sista säsongen (2099) behålls. Matchar webbtiderna filerna görs inget.
  Ny/ändrad period kapar öppna säsongen, lägger in den nya och **återöppnar** efter den med
  föregående säsongs filer. Det är ett **antagande**, och varnas för i sammanfattningen.
  Filer som delas med säsonger utanför perioden ändras aldrig (ny fil). Dubblettrader hos Ressel
  (`22:` två gånger) dedupliceras.
- **Röda dagar sjo:** synken lägger till svenska röda dagar (nyårsdagen, trettondedagen,
  långfredag, påskdagen, annandag påsk, 1 maj, Kristi himmelsfärd, nationaldagen,
  midsommardagen, alla helgons dag, juldagen, annandag jul) för innevarande + nästa år,
  från och med idag, i `holiday_rules.weekend_schedule`. Tar aldrig bort något. **Aftnarna**
  (jul-, nyårs-, midsommarafton) läggs inte till automatiskt; de är obekräftade tills Ressel
  publicerat dem, lägg in dem manuellt.

## Snabbväg: enbart Emelie-PDF (import_emelie.py)

Ressels PDF läses in av `tools/import_emelie.py` (Python 3 + `pdftotext` från poppler-utils).
Inga handskrivna JSON-filer.

```bash
python3 tools/import_emelie.py https://ressel.se/wp-content/uploads/…/Tidtabell-Emelie-A4-<SÄSONG>.pdf
# granska sammanfattningen, sedan:
python3 tools/import_emelie.py <samma PDF> --write
python3 tools/validate.py && python3 -m unittest
```

1. **Kör utan `--write`** och granska: period, antal turer per dagtyp, avstigning (`*`),
   helgregler och vilka filer som skapas eller återanvänds (identiskt innehåll → befintlig fil).
2. **Läs varningarna.** Turer som avviker från de vanliga restiderna importeras *som PDF:en säger*
   och flaggas (t.ex. vinter 2026/27: 10:14-turen har Masthamnen 10:32 och Djurgården 10:40, vanligen
   10:28/10:38 — kolla mot tryckt tabell). Okända noter eller rader ger också varning.
3. **`--write`** skapar `ressel-city-<säsong>-<dagtyp>.json`, lägger säsongen i `season_mapping`
   (idempotent, matchar på `period.start`), skriver `source_pdf`, lägger PDF-namnet i
   `_metadata.data_sources`, sätter `last_updated`, bumpar `_metadata.version` (minor) och kör validatorn.
4. **Helgregler:** "Ingen trafik …" blir `no_traffic`. "Helgtrafik …" blir `weekend_schedule`, men bara
   mån–fre; lördag/sönd­ag har redan egna tabeller.
5. Testa lokalt (`python3 -m http.server 8000`) och simulera `determineTimetableFiles()` på säsongsgränserna.

**Ingen versionsbump behövs** — datafiler förcachas av service workern ur configerna. Inget
byggsteg.

**Automatik:** `.github/workflows/check-ressel-timetable.yml` kör `sync_ressel.py` varje måndag
(se ovan) och öppnar en PR. Den mergas aldrig automatiskt — granska varningarna.
`validate-timetables.yml` kör validatorn och testerna på PR:er mot `data/**` och `tools/**`.

`tools/validate.py` kontrollerar båda configerna (filer finns, perioder överlappar inte, luckor
mellan city-säsonger varnar, tider HH:MM och stigande per brygga, lika många tider per brygga,
`disembark_only` ⊆ `departures`, helgdatum inom perioden). Exit ≠ 0 vid fel.

Den manuella vägen nedan är kvar som fallback (webb och PDF går inte att tolka).

## Två linjer, två system

| Linje | Operatör | Betalning | Config | Mönster |
|-------|----------|-----------|--------|---------|
| **Sjöstadstrafiken** (`sjo`) | — | Gratis | `data/ressel-sjo-config.json` | Triangel Barnäng→Luma→Henriksdal, var 20:e min. Filerna är **generiska** och återanvänds år efter år. |
| **M/S Emelie** (`city`) | Ressel Rederi | Betald | `data/ressel-city-config.json` | Tur/retur Hammarbysjöstad ↔ Nybroplan via Masthamnen/Djurgården. Säsongsvisa datafiler. |

## Hur appen väljer rätt tidtabell

`js/app.js → determineTimetableFiles()`:

1. Bestämmer dagtyp av veckodagen: `saturday` / `sunday` / `weekday`.
2. Går igenom `season_mapping` och tar **första** säsong där dagens datum ligger i `period.start … period.end`.
3. För **city**: om datumet finns i säsongens `holiday_rules.weekend_schedule` används `files.sunday` (röda dagar/storhelger körs som söndag).
4. För **sjo**: om datumet finns i `holiday_rules.weekend_schedule` på **rotnivå** i `ressel-sjo-config.json` används `files.weekend`. Listan gäller alla säsonger och måste fyllas på årligen (röda dagar + jul-, nyårs- och midsommarafton).
5. Väljer datafil ur `files[dagtyp]`.

Appen laddar **gårdagens, dagens och morgondagens** fil. Gårdagen behövs för nattturer: tider före `config.dayRolloverTime` (`03:00`, i `js/app.js`) räknas till föregående trafikdygn, så kl 00:02 hämtas båten `00:05` ur gårdagens lista.

**Viktigt om perioderna:**
- **sjo** har en öppen sista period som slutar `2099-12-31` – den fångar alla framtida datum, så sjo blir aldrig "utgången". När en sommarsäsong läggs in måste man **kapa** den öppna perioden före sommaren och **lägga tillbaka** en ny öppen period efter (se sommar 2026 som exempel).
- **city** har **avgränsade** perioder utan öppet slut. När sista säsongen passerats visar appen senaste schemat med en **"utgången"-varning**. Det är meningen – varningen är signalen att det är dags att lägga in nästa säsong från ny PDF. Lägg alltid in nästa säsong i god tid.

## Datafilernas format

Två tillåtna strukturer (båda stöds av renderern):
- **Platt** (används av helg- och sommarfiler): `to_city.operating_hours` + `to_city.departures` per hållplats. Använd den här för nya filer – enklast.
- **Nästlad** (`ressel-city-weekday-winter.json`): `to_city.morning/lunch/afternoon` – behövs bara när en lunch­avgång ska kunna slås på/av villkorat (t.ex. lov). Slå inte på detta i onödan.

`disembark_only.from_city` listar de tider som är märkta `*Endast avstigning` i PDF:en (gäller bara Hammarby-bryggorna på vägen tillbaka). Glöm inte dessa – de står som fotnot i PDF:en och är lätta att missa.

Lunch-uppehåll i sommartidtabellen är bara ett **glapp** mellan avgångar – inga tomma poster behövs, hoppa bara över tiderna.

## Trafikuppehåll, varningar och tillfälliga tidtabeller (`exceptions`)

Lägg ett objekt i `exceptions` på rotnivå i linjens config — ingen ny säsong, inga tomma
datafiler. Tre typer: `notice` (tidtabell + meddelande), `no_traffic` (uppehåll, meddelandet
visas i stället) och `replace` (andra datafiler under perioden, ev. bara vissa `days`).
Format och exempel i README, avsnitt "Undantag".

**Ingen versionsbump behövs för `notice` och `no_traffic`** — se "Vad som kräver
versionsbump" nedan. Redigera JSON-filen direkt på `main` (t.ex. i GitHubs webbgränssnitt),
vänta 1–2 min på Pages-deployen, klart. Även `replace` med en ny datafil går utan bump.

Det gamla sättet (`maintenance_mode: true` på en säsong + maintenance-filer) stöds fortfarande.

## Vad som kräver versionsbump

Appen är en PWA med två cachestrategier i `service-worker.js`:

| Filer | Strategi | Kräver bump? |
|-------|----------|--------------|
| `data/*.json` | **Network-first** + `_nocache`-parameter i appen. Cachen används bara offline. | **Nej.** Ändringen når alla vid nästa appstart, och öppna appar hämtar om configen var 30:e minut samt när appen blir synlig igen efter minst 5 min (sedan 5.8.1). |
| `index.html`, `css/`, `js/`, `manifest.json`, ikoner | **Cache-first.** Bara en ny `APP_VERSION` ger ny cache. | **Ja, alltid.** Annars pinnar gamla cachar klienterna på gammal kod. |

Även **nya** datafiler (ny säsong, `replace`) kräver ingen bump: vid installation läser service
workern båda configerna och förcachar alla filer i `season_mapping[].files` och
`exceptions[].files` (enskilda fel fäller inte installationen). Det gamla undantaget med
`JSON_FILES` är borta. Samma gäller ändrade tider och nya `exceptions`.

### Så bumpar du

Bumpa **samma** versionsnummer på alla dessa ställen (sök på gamla numret):

| Fil | Var |
|-----|-----|
| `manifest.json` | `"version"` |
| `index.html` | `<meta name="version">`, `<meta name="app-version">` **och** versionstexten i `<footer>` |
| `service-worker.js` | `const APP_VERSION` (driver `CACHE_NAME`/`JSON_CACHE_NAME`) |
| `js/app.js` | `config.version`, JSDoc `@version`, samt en rad i versionshistoriken |
| `js/init.js` | `window.APP_VERSION` |

Datafiler behöver inte läggas in i service workern — de hittas via configerna.

## Källmaterial

Lägg PDF:er / skärmdumpar i `pdf/`. **Den mappen är gitignore:ad och ska aldrig pushas** – den är bara referens. Skriv in PDF-namnet i datafilens `metadata.note` så att källan går att spåra.

## Checklista – ny säsong (manuellt, fallback)

> Kör hellre `sync_ressel.py` ovan. Checklistan gäller när webbsidorna inte går att tolka.

1. [ ] Lägg käll-PDF/bilder i `pdf/`.
2. [ ] city: skapa nya datafiler `ressel-city-<säsong>-{weekday,saturday,sunday}.json` om tiderna avviker (annars återanvänd befintlig fil).
3. [ ] city: lägg till säsong i `season_mapping` (`period`, `files`, ev. `holiday_rules.weekend_schedule` för storhelger).
4. [ ] sjo: oftast räcker config – kapa den öppna `2099`-perioden, lägg in sommarsäsong, lägg tillbaka ny öppen period. Datafilerna återanvänds normalt.
   [ ] sjo: kontrollera att `holiday_rules.weekend_schedule` täcker nästa kalenderår (röda dagar + aftnar).
5. [ ] (Bara vid kodändring) bumpa versionen på alla **fem** ställena ovan (init.js glömdes i 5.3.0).
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

> Se även **[KNOWN-BUGS.md](KNOWN-BUGS.md)** — tre tidigare fel i tidsberäkningen,
> rättade i v5.4.0, med regressionstest. Kör det när du ändrar säsonger med andra
> nattturer än idag.

- **sjo-helgdagar är en lista** (`holiday_rules.weekend_schedule` på rotnivå i
  sjo-configen). `sync_ressel.py` fyller på röda dagar, aftnarna är manuella. Glöms påfyllningen visar Sjöstadstrafiken vardagstider
  på röda dagar igen — utan varning.
