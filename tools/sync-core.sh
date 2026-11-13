#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
rm -rf ../starplus-frontend/core
mkdir -p ../starplus-frontend/core
rsync -a --exclude='.*' core/ ../starplus-frontend/core/
rm -f ../starplus-frontend/core/core.sha256
(cd core && find . -type f ! -name "core.sha256" ! -name ".*" | sort | xargs shasum -a 256 | sed 's| \./| |' > core.sha256)
cp core/core.sha256 ../starplus-frontend/core/core.sha256
