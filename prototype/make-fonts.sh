#!/usr/bin/env bash
# Regenerate fonts/fontfaces.css — the inlined @font-face rules build.py needs.
#
# Downloads the three faces the mockups use, subsets them to the glyphs the
# pages actually contain, and emits base64 data URIs. Subsetting matters: the
# full TTFs are ~900 KB together, the subsets ~100 KB, and every published page
# carries a full copy.
#
# Requires: curl, python3, fonttools + brotli (pip install fonttools brotli).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/fonts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT_DIR"

CSS_URL="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;1,500&family=Work+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"

# Google serves different formats by User-Agent; this one yields TTFs.
curl -sS -A "Mozilla/5.0" "$CSS_URL" -o "$WORK/fonts.css"

# Latin, punctuation, arrows and the few symbols the pages use.
UNICODES="U+0020-007E,U+00A0,U+00B0,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2190-2193,U+2196-2199"

i=0
declare -a FACES=()
while read -r url; do
  i=$((i + 1))
  curl -sS -A "Mozilla/5.0" "$url" -o "$WORK/f$i.ttf"
  # Derive family/weight/style from the font's own name table rather than
  # trusting URL order, which is not stable.
  # Split on '|' only: family names contain spaces ("IBM Plex Mono"), and
  # default word-splitting would shear them across the three variables.
  IFS='|' read -r family weight style < <(python3 - "$WORK/f$i.ttf" <<'PY'
import sys
from fontTools.ttLib import TTFont
n = TTFont(sys.argv[1])['name']
family = (n.getDebugName(16) or n.getDebugName(1) or '').strip()
sub = (n.getDebugName(17) or n.getDebugName(2) or 'Regular').strip()
weights = {'Thin':100,'ExtraLight':200,'Light':300,'Regular':400,'Medium':500,
           'SemiBold':600,'Bold':700,'ExtraBold':800,'Black':900}
weight = 400
style = 'normal'
for token in sub.replace('Italic', ' Italic').split():
    if token == 'Italic':
        style = 'italic'
    elif token in weights:
        weight = weights[token]
# Some families encode weight in the family name instead (e.g. "Fraunces SemiBold").
parts = family.split()
if len(parts) > 1 and parts[-1] in weights:
    weight = weights[parts[-1]]
    family = ' '.join(parts[:-1])
print('%s|%s|%s' % (family, weight, style))
PY
)
  pyftsubset "$WORK/f$i.ttf" --output-file="$WORK/f$i.woff2" --flavor=woff2 \
    --unicodes="$UNICODES" --layout-features='*' --no-hinting --desubroutinize
  FACES+=("$family|$weight|$style|$WORK/f$i.woff2")
  echo "  subset $family $weight $style -> $(stat -c%s "$WORK/f$i.woff2") bytes" >&2
done < <(grep -oE "https://fonts.gstatic.com/[^)]+\.ttf" "$WORK/fonts.css" | sort -u)

: > "$OUT_DIR/fontfaces.css"
for face in "${FACES[@]}"; do
  IFS='|' read -r family weight style path <<< "$face"
  {
    printf "@font-face { font-family:'%s'; font-weight:%s; font-style:%s; font-display:swap; src:url(data:font/woff2;base64," \
      "$family" "$weight" "$style"
    base64 -w0 "$path"
    printf ") format('woff2'); }\n"
  } >> "$OUT_DIR/fontfaces.css"
done

echo "wrote $OUT_DIR/fontfaces.css ($(stat -c%s "$OUT_DIR/fontfaces.css") bytes, ${#FACES[@]} faces)" >&2
