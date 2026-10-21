#!/usr/bin/env bash
# Build hypo3d.js — the <hypo-3d> custom element — as ONE self-contained ES module.
#
#   bash tools/build-hypo3d.sh            # fetches three@0.186.1 with `npm pack` into a temp dir
#   THREE_PKG=/path/to/package bash tools/build-hypo3d.sh   # reuse an extracted three package
#
# Then audits the bundle: no storage / network APIs may appear (PHIPA route), and the three.js
# MIT notice must be present. Fails (exit 1) on any audit hit.
set -euo pipefail

ROUTE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROUTE"
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"

THREE_VERSION="0.186.1"
ESBUILD_VERSION="0.25.10"

if [[ -n "${THREE_PKG:-}" ]]; then
  PKG="$THREE_PKG"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  (cd "$TMP" && npm pack "three@${THREE_VERSION}" --silent >/dev/null && tar -xzf "three-${THREE_VERSION}.tgz")
  PKG="$TMP/package"
fi

got="$(node -p "require('$PKG/package.json').version")"
if [[ "$got" != "$THREE_VERSION" ]]; then
  echo "three package is $got, expected $THREE_VERSION" >&2
  exit 1
fi

npx --yes "esbuild@${ESBUILD_VERSION}" src/hypo3d.src.js \
  --bundle --minify --format=esm --target=es2020 --legal-comments=eof \
  --alias:three="$PKG/build/three.module.js" \
  --outfile=hypo3d.js --log-level=warning

echo "built hypo3d.js ($(wc -c < hypo3d.js | tr -d ' ') bytes)"

# ---- audit: zero network / storage at runtime
if grep -nE "localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|CacheStorage|fetch\(|XMLHttpRequest|sendBeacon|action=" hypo3d.js; then
  echo "AUDIT FAILED: forbidden API string in hypo3d.js" >&2
  exit 1
fi
if grep -nE "https?://[a-z]" hypo3d.js | grep -vE "threejs\.org|github\.com/mrdoob|opensource\.org|www\.w3\.org/(1999|2000)" ; then
  echo "AUDIT NOTE: absolute URLs above (review: none may be fetched)" >&2
fi
if ! grep -q "Three.js Authors" hypo3d.js || ! grep -q "SPDX-License-Identifier: MIT" hypo3d.js; then
  echo "AUDIT FAILED: three.js licence notice missing" >&2
  exit 1
fi
echo "audit: clean (no storage/network APIs; three.js MIT notice retained)"
