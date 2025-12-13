#!/bin/bash

##############################################################################
# Zone.Identifier Cleanup Script
# 
# Rensar alla Zone.Identifier-filer från Git-repot
# Version: 1.0.0
# Datum: 2025-12-13
##############################################################################

echo "=========================================="
echo "Zone.Identifier Cleanup"
echo "=========================================="
echo ""

# Färgkoder
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Kontrollera att vi är i rätt katalog
if [ ! -f "index.html" ] || [ ! -d "data" ]; then
    echo -e "${RED}Error: Kör detta script från ressel-static huvudkatalog${NC}"
    exit 1
fi

echo "Söker efter Zone.Identifier-filer..."
echo ""

# Hitta alla Zone.Identifier-filer
ZONE_FILES=$(find . -name "*:Zone.Identifier" -o -name "*.Zone.Identifier")

if [ -z "$ZONE_FILES" ]; then
    echo -e "${GREEN}✓ Inga Zone.Identifier-filer hittades${NC}"
    echo ""
    exit 0
fi

# Räkna antal filer
FILE_COUNT=$(echo "$ZONE_FILES" | wc -l)

echo -e "${YELLOW}Hittade $FILE_COUNT Zone.Identifier-filer:${NC}"
echo "$ZONE_FILES"
echo ""

# Fråga användaren
read -p "Vill du ta bort dessa filer? (j/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[JjYy]$ ]]; then
    echo "Avbruten av användaren"
    exit 0
fi

# Ta bort filerna från filsystemet
echo ""
echo "Tar bort filer från filsystemet..."
find . -name "*:Zone.Identifier" -delete
find . -name "*.Zone.Identifier" -delete

# Ta bort från Git index om de är trackade
echo "Rensar från Git..."
git ls-files | grep -i "zone.identifier" | while read -r file; do
    echo "  Tar bort från Git: $file"
    git rm --cached "$file" 2>/dev/null || true
done

echo ""
echo -e "${GREEN}✓ Zone.Identifier-filer borttagna${NC}"
echo ""
echo "Nästa steg:"
echo "1. Committa ändringarna:"
echo "   git add .gitignore"
echo "   git commit -m 'Clean up Zone.Identifier files'"
echo "2. Pusha till GitHub:"
echo "   git push"
echo ""
