#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
rm -rf ../starplus-frontend/core
mkdir -p ../starplus-frontend/core
cp -R core/. ../starplus-frontend/core/
rm -f ../starplus-frontend/core/core.sha256
(cd core && find . -type f ! -name "core.sha256" | sort | xargs shasum -a 256 | sed 's| \./| |' > core.sha256)
cp core/core.sha256 ../starplus-frontend/core/core.sha256
