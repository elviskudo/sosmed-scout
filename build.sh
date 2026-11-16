#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
BUILD_FOLDER="$DIST_DIR/onboss-scout-extension"
ZIP_FILE="$DIST_DIR/onboss-scout-extension.zip"
ROOT_ZIP="$ROOT_DIR/onboss-scout-extension.zip"

rm -rf "$DIST_DIR" "$ROOT_ZIP"
mkdir -p "$BUILD_FOLDER"

# Copy extension files cleanly without macOS .DS_Store or git metadata
cp "$ROOT_DIR/manifest.json" "$BUILD_FOLDER/"
cp "$ROOT_DIR/README.md" "$BUILD_FOLDER/"
cp -R "$ROOT_DIR/background" "$BUILD_FOLDER/"
cp -R "$ROOT_DIR/content" "$BUILD_FOLDER/"
cp -R "$ROOT_DIR/lib" "$BUILD_FOLDER/"
cp -R "$ROOT_DIR/sidepanel" "$BUILD_FOLDER/"
cp -R "$ROOT_DIR/assets" "$BUILD_FOLDER/"

find "$BUILD_FOLDER" -name ".DS_Store" -delete

# Create distributable ZIP archive
cd "$DIST_DIR"
zip -r -q "$ZIP_FILE" "onboss-scout-extension"
cp "$ZIP_FILE" "$ROOT_ZIP"

echo "Build selesai:"
echo "1. Folder siap pakai : $BUILD_FOLDER"
echo "2. File ZIP di dist  : $ZIP_FILE"
echo "3. File ZIP di root  : $ROOT_ZIP"
ls -lh "$ROOT_ZIP"
