#!/bin/bash
#
# Cleanup script - Tar bort inaktuella tidtabellsfiler
# Kör detta INNAN du lägger till nya filer
#
# Användning: bash cleanup-old-files.sh
#

set -e  # Avbryt vid fel

echo "============================================================"
echo "RENSNING AV INAKTUELLA TIDTABELLSFILER"
echo "============================================================"
echo ""
echo "Detta script tar bort 9 gamla filer som ersätts av nya:"
echo "  - 6 Sjöstadstrafiken-filer"
echo "  - 3 M/S Emelie vinter 2024-2025 filer"
echo ""
read -p "Vill du fortsätta? (j/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[JjYy]$ ]]; then
    echo "Avbruten."
    exit 1
fi

# Skapa backup först
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
echo ""
echo "Skapar backup i: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp data/*.json "$BACKUP_DIR/" 2>/dev/null || echo "Inga JSON-filer att backa upp"
echo "✓ Backup skapad"

echo ""
echo "Rensar gamla Sjöstadstrafiken-filer..."

# Sjöstadstrafiken - ta bort 6 gamla filer
files_to_remove=(
    "data/ressel-sjo-2024-2025-weekday.json"
    "data/ressel-sjo-2024-2025-weekend.json"
    "data/ressel-sjo-summer-2025-weekday.json"
    "data/ressel-sjo-summer-2025-weekend.json"
    "data/ressel-sjo-fall-winter-spring-2025-2026-weekday.json"
    "data/ressel-sjo-fall-winter-spring-2025-2026-weekend.json"
)

for file in "${files_to_remove[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        echo "  ✓ Borttagen: $file"
    else
        echo "  ⊘ Finns inte: $file"
    fi
done

echo ""
echo "Rensar gamla M/S Emelie vinter 2024-2025 filer..."

# M/S Emelie - ta bort 3 gamla vinter-filer
city_files_to_remove=(
    "data/ressel-city-winter-2024-2025-weekday.json"
    "data/ressel-city-winter-2024-2025-saturday.json"
    "data/ressel-city-winter-2024-2025-sunday.json"
)

for file in "${city_files_to_remove[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        echo "  ✓ Borttagen: $file"
    else
        echo "  ⊘ Finns inte: $file"
    fi
done

echo ""
echo "============================================================"
echo "RENSNING KLAR!"
echo "============================================================"
echo ""
echo "Borttagna filer: 9 st"
echo "Backup finns i: $BACKUP_DIR"
echo ""
echo "Nästa steg:"
echo "  1. Kopiera de 5 nya tidtabellsfilerna till data/"
echo "  2. Kopiera de 2 nya config-filerna till data/"
echo "  3. Testa appen"
echo ""
