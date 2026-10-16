#!/usr/bin/env bash
# Daily copy of the family chart (data/store.json) with a date stamp.
# Keeps 30 days. secret.key is copied once, as it never changes (changing it
# would sign every phone out).
set -euo pipefail
SRC=/srv/projects/internal/puppy-training/data
DEST=/srv/backups/puppy-training
mkdir -p "$DEST"
if [ -f "$SRC/store.json" ]; then
  cp -p "$SRC/store.json" "$DEST/store-$(date +%Y-%m-%d).json"
fi
[ -f "$SRC/secret.key" ] && [ ! -f "$DEST/secret.key" ] && cp -p "$SRC/secret.key" "$DEST/secret.key" && chmod 600 "$DEST/secret.key"
find "$DEST" -name 'store-*.json' -mtime +30 -delete
echo "$(date -Is) backed up to $DEST ($(ls "$DEST" | grep -c '^store-') copies kept)"
