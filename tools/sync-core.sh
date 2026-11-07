#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
rm -rf ../starplus-frontend/core
mkdir -p ../starplus-frontend/core
cp core/package.json ../starplus-frontend/core/package.json
cp core/tsconfig.json ../starplus-frontend/core/tsconfig.json
cp -R core/src ../starplus-frontend/core/src
(cd core && find package.json tsconfig.json src -type f | sort | xargs shasum -a 256 > core.sha256)
cp core/core.sha256 ../starplus-frontend/core/core.sha256
