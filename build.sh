#!/bin/bash
# Build the Apps Script pages from src/ (edit src/*.html, never the built root files).
set -e
cd "$(dirname "$0")"
osascript -l JavaScript tools/compile.js "$PWD/tools/babel.min.js" \
  "$PWD/src/index.html" "$PWD/index.html" \
  "$PWD/src/master.html" "$PWD/master.html"
