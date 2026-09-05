# Kända fel i tidsberäkningen

> Skriven 2026-08-24 efter att hallskärmen (privata `pi-flask`) kopplades mot
> den här datan. **Alla tre felen rättades i v5.4.0 (2026-09-05).** Beskrivningarna
> nedan står kvar som bakgrund — de förklarar varför koden ser ut som den gör och
> vad regressionstestet längst ned bevakar.

## Status

| # | Fel | Rättat i | Var |
|---|-----|----------|-----|
| 1 | Turer efter midnatt räknades till fel dygn | 5.4.0 | `js/app.js` `createEnhancedTimeObjects()` + `config.dayRolloverTime`, gårdagens fil laddas |
| 2 | Passerade avgångar visades som kommande | 5.4.0 | `js/timehandler.js` returnerar `[]`, renderern visar "Inga fler avgångar" |
| 3 | Sjöstadstrafiken saknade helgdagslogik | 5.4.0 | `holiday_rules.weekend_schedule` på rotnivå i `ressel-sjo-config.json`, läses i sjo-grenen |

## 1. Turer efter midnatt (rättat)

Sjöstadstrafikens filer slutar med en tur efter midnatt lagrad som ett litet tal
i *dagens* lista: `"Lumabryggan": [..., "23:25", "23:45", "00:05"]`. Tidigare
kom `dayOffset` enbart från vilken **fil** tiden lästes ur, så `00:05` blev
5 minuter efter midnatt idag och klassades som passerad hela dagen. Det såg rätt
ut bara för att morgondagens fil råkade ha samma svans — så fort två dygn i rad
hade olika sista tur (säsongsgräns, helg) försvann sista båten.

**Lösning:** tider före `config.dayRolloverTime` (`03:00`) tillhör nästa
kalenderdygn oavsett vilken fil de lästes ur. Fast gräns i stället för
`operating_hours.start`, eftersom det fältet inte underhålls strikt (säger
`end: 00:00` medan sista turen går `00:10`). Konsekvens: kl 00:02 ligger båten
som går om tre minuter i **gårdagens** fil, så appen laddar nu igår, idag och
imorgon. Gårdagen är icke-kritisk precis som morgondagen.

`processScheduleTimes()` returnerar dessutom `minutesUntil`, så renderern kan
gulmarkera och läsa upp "snar avgång" för `00:05` kl 23:58 trots att turen
kalendermässigt är morgondagens.

## 2. Passerade avgångar utan markering (rättat)

När alla turer passerat returnerade `processScheduleTimes()` de sista
passerade tiderna, som då såg ut som kommande. Nåddes när morgondagens hämtning
misslyckades **och** varje kväll före en trafikfri city-dag (jul, nyår), då
morgondagens tider medvetet inte flätas in.

**Lösning:** tom lista, och renderern skriver "Inga fler avgångar".

## 3. Sjöstadstrafiken saknade helgdagslogik (rättat)

`determineTimetableFiles()` läste `holiday_rules` bara för city, trots att
sjo-configens egna `metadata.notes` säger *"Röda dagar trafikeras som helg"*.

**Lösning:** `holiday_rules.weekend_schedule` på **rotnivå** i
`ressel-sjo-config.json` (inte per säsong — sjo-säsongerna är generiska och
öppna). Listan innehåller röda dagar samt jul-, nyårs- och midsommarafton för
2026–2027 och **måste fyllas på årligen**, se MAINTENANCE.md. Saknas nyckeln
faller koden tillbaka på veckodag som förut.

## Regressionstest

Kör efter varje ändring i `timehandler.js`, `createEnhancedTimeObjects()`
eller `determineTimetableFiles()`:

```bash
node - <<'EOF'
const fs=require("fs");
const TimeHandler=eval(fs.readFileSync("js/timehandler.js","utf8")+"; TimeHandler");
const th=new TimeHandler(), R=Date;
global.Date=class extends R{constructor(...a){if(a.length)return new R(...a);
  return new R(2026,7,24,23,50,0);} static now(){return new R(2026,7,24,23,50,0).getTime();}};
// Så som app.js nu bygger objekten: 00:05 i dagens fil har dayOffset 1
const idag=[{time:"23:25",day:1,dayOffset:0},{time:"23:45",day:1,dayOffset:0},{time:"00:05",day:2,dayOffset:1}];
const imorgon=[{time:"08:05",day:2,dayOffset:1},{time:"08:25",day:2,dayOffset:1}];   // ingen nattur imorgon
const r=th.processScheduleTimes([...idag,...imorgon],3);
console.log(r);                                            // -> 00:05 först, minutesUntil 15
console.assert(r[0].time==="00:05"&&r[0].minutesUntil===15,"FEL 1 har återkommit");
console.assert(th.processScheduleTimes(idag.slice(0,2),3).length===0,"FEL 2 har återkommit");
EOF
```

Webbläsartest: starta `python3 -m http.server 8000`, öppna sidan med en fejkad
klocka (Playwright `page.clock.install`) på 2026-08-24 23:58, 2026-08-25 00:02,
2025-12-23 23:00 (kväll före trafikfri city-dag) och 2026-12-24 07:00 (julafton,
sjo ska börja 08:00). Alla fyra verifierade 2026-09-05.

## Vem mer berörs

Hallskärmen i `pi-flask` läser den här datan via GitHub Pages men har **egen**
tidsberäkning (`app/ferry.py`), skriven för att undvika fel 1 och 2. Den kan nu
även läsa `holiday_rules.weekend_schedule` ur sjo-configen i stället för att
skriva ut en brasklapp på röda dagar. Datan, inte algoritmen, är det delade
kontraktet — se [DEPLOYMENT.md](DEPLOYMENT.md).
