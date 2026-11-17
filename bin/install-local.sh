#!/bin/sh
# Install (or re-install) dsh-r-runner into a DSH profile by hand.
#
# The official desktop app owns its profile: `dsh plugin --profile desktop add`
# refuses with "managed exclusively by the Electron application", so this script
# does the two things that command would have done — place the package in the
# profile's node_modules and list it in the profile manifest — and then nudges
# the loader so the new bundle layer is composed.
#
#   ./bin/install-local.sh              # default profile: $DSH_HOME/profiles/desktop
#   DSH_PROFILE_DIR=/path/to/profile ./bin/install-local.sh
set -eu

SRC=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DSH_HOME_DIR=${DSH_HOME:-"$HOME/.dsh"}
PROFILE=${DSH_PROFILE_DIR:-"$DSH_HOME_DIR/profiles/desktop"}

if [ ! -f "$PROFILE/package.json" ]; then
  echo "no DSH profile at $PROFILE" >&2
  exit 1
fi

DEST="$PROFILE/node_modules/dsh-r-runner"
mkdir -p "$DEST"
# Copy the payload only; the client bundle server will not serve from outside
# the profile directory.
rsync -a --delete "$SRC/lib/" "$DEST/lib/"
cp "$SRC/package.json" "$SRC/cordis.patch.yml" "$DEST/"
[ -f "$SRC/README.md" ] && cp "$SRC/README.md" "$DEST/"
[ -f "$SRC/LICENSE" ] && cp "$SRC/LICENSE" "$DEST/"
echo "installed payload -> $DEST"

DSH_R_PLUGIN_SRC="$SRC" node - "$PROFILE/package.json" <<'JS'
const fs = require('node:fs')
const path = process.argv[2]
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'))
manifest.dependencies = manifest.dependencies ?? {}
manifest.dependencies['dsh-r-runner'] = 'link:' + process.env.DSH_R_PLUGIN_SRC
const profile = (manifest.dsh = manifest.dsh ?? {})
profile.profile = profile.profile ?? {}
const bundles = (profile.profile.bundles = profile.profile.bundles ?? [])
if (!bundles.includes('dsh-r-runner')) bundles.push('dsh-r-runner')
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
console.log('profile manifest: dependency + bundle row ready')
JS

CONFIG="$DSH_HOME_DIR/r-runner.json"
if [ ! -f "$CONFIG" ]; then
  WORKSPACE=${DSH_R_WORKDIR:-"$HOME/Documents/deepseek-harness/default-workspace"}
  cat > "$CONFIG" <<JSON
{
  "rBinary": "/usr/local/bin/R",
  "rscriptBinary": "/usr/local/bin/Rscript",
  "sessionArgs": "--vanilla",
  "workdir": "$WORKSPACE",
  "autoDetect": true,
  "scriptDirAuto": true,
  "timeoutMs": 600000,
  "env": {}
}
JSON
  echo "config -> $CONFIG"
else
  echo "config kept -> $CONFIG"
fi

echo
echo "Reloading the host (the app watches the profile manifest):"
sh "$(dirname "$0")/reload-host.sh" "$PROFILE" || true
echo
echo "Then reload the page (Cmd/Ctrl+R) and open the right sidebar -> add control"
echo "-> the R runner card. Verify the host half with:"
echo "  node plugins/dsh-r-runner/bin/check.mjs <gui-url>"
