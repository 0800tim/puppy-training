#!/usr/bin/env bash
# Daily copy of each slot's chart (store.json) and photo with a date stamp. Keeps 30 days.
# secret.key is copied once per slot, as it never changes (changing it would sign every phone out).
# vapid.json is copied every run (it is tiny and must match the phones' subscriptions). Restore steps: docs/RESTORE.md.
set -euo pipefail
DEST=/srv/backups/puppy-training
mkdir -p "$DEST"
for slot in prod demo dev; do
  case $slot in prod) SRC=/srv/projects/internal/puppy-training-prod/data;; demo) SRC=/srv/projects/internal/puppy-training-demo/data;; dev) SRC=/srv/projects/internal/puppy-training/data;; esac
  [ -d "$SRC" ] || continue
  [ -f "$SRC/store.json" ] && cp -p "$SRC/store.json" "$DEST/store-$slot-$(date +%Y-%m-%d).json"
  [ -f "$SRC/photo.jpg" ] && cp -p "$SRC/photo.jpg" "$DEST/photo-$slot.jpg"
  [ -f "$SRC/secret.key" ] && [ ! -f "$DEST/secret-$slot.key" ] && cp -p "$SRC/secret.key" "$DEST/secret-$slot.key" && chmod 600 "$DEST/secret-$slot.key"
  # vapid.json holds the push keys; without it every phone's reminder subscription dies on restore
  [ -f "$SRC/vapid.json" ] && cp -p "$SRC/vapid.json" "$DEST/vapid-$slot.json" && chmod 600 "$DEST/vapid-$slot.json"
done
find "$DEST" -name 'store-*.json' -mtime +30 -delete
echo "$(date -Is) backed up to $DEST ($(ls "$DEST" | grep -c '^store-') copies kept)"
