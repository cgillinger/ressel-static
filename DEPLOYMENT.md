# Deploy — hur sajten faktiskt publiceras

> Skriven 2026-08-24. Läs den här innan du rör `.github/workflows/deploy.yml`
> eller lägger till ett byggsteg — upplägget är inte det man tror.

## Läget

Sajten ligger på https://cgillinger.github.io/ressel-static/ och serverar
`main` — inte `gh-pages`.

```
GitHub Pages-inställning:  source = main, path = /, build_type = legacy
```

Vid varje push till `main` kör alltså **två** workflows:

| Körning | Vad den gör | Publicerar? |
|---|---|---|
| `pages build and deployment` | GitHubs egen, byggd ur Pages-inställningen | **Ja** — det är den här som syns |
| `Deploy to GitHub Pages` (`deploy.yml`) | Pushar hela repot till grenen `gh-pages` | Nej |

`gh-pages`-grenen uppdateras troget vid varje merge, men **ingen läser den**.

## Varför det ändå fungerar

`deploy.yml` kör `JamesIves/github-pages-deploy-action` med `folder: .` — den
deployar alltså hela repot rakt av. Resultatet blir att `gh-pages` i praktiken
är identisk med `main` (enda skillnaden: `.github/workflows/deploy.yml` saknas
där). Att sajten är rätt är alltså en lycklig slump, inte en design.

## Fällan

Lägger du någonsin till ett byggsteg i `deploy.yml` — minifiering, en
`dist/`-mapp, en genererad fil — **publiceras det inte**. Pages fortsätter
servera `main` orörd, och du felsöker en deploy som aldrig nådde fram.

## Två vägar (välj en, ingen brådska)

1. **Ta bort `deploy.yml` och grenen `gh-pages`.** Sajten är statisk, `main` är
   källan och GitHubs egen Pages-build räcker. Enklast, och ärligast mot hur det
   faktiskt fungerar.
2. **Peka om Pages till `gh-pages`** (Settings → Pages → Source). Gör det om du
   vill behålla möjligheten till ett byggsteg. Då blir `deploy.yml` meningsfull.

## Kontrollera vad som gäller

```bash
gh api repos/cgillinger/ressel-static/pages --jq '.source, .build_type'
gh run list --repo cgillinger/ressel-static --limit 5
curl -s https://cgillinger.github.io/ressel-static/manifest.json | head -6
```

## Datafilerna är ett läsbart API

Värt att veta: GitHub Pages serverar `data/*.json` med
`access-control-allow-origin: *`, `ETag` och `Last-Modified`
(`cache-control: max-age=600`). Andra appar kan alltså läsa tidtabellerna
direkt med conditional GET — hallskärmen (privata `pi-flask`) gör det, så en
ny säsong här slår igenom där utan extra handpåläggning.

Det betyder också: **datafilerna är ett publikt kontrakt.** Byter du nycklar
eller struktur i `data/*.json` går det sönder för konsumenter. Bumpa
`_metadata.version` i configfilerna när formatet ändras.
