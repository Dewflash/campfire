#!/usr/bin/env bash
set -euo pipefail

script_path="${BASH_SOURCE:-$0}"
root_dir="$(cd "$(dirname "$script_path")/.." && pwd)"
cd "$root_dir"

version="$(node -p "require('./package.json').version")"
app_name="Campfire"
out_app="out/Campfire-darwin-arm64/${app_name}.app"
release_dir="release"
stage_dir="${release_dir}/stage"
staged_app="${stage_dir}/${app_name}.app"
dmg_path="${release_dir}/${app_name}-${version}.dmg"

if [[ ! -d "4k loops" ]]; then
  echo "missing required media folder: 4k loops" >&2
  exit 1
fi

if [[ ! -d "sounds" ]]; then
  echo "missing required sound folder: sounds" >&2
  exit 1
fi

npm run package

rm -rf "$stage_dir"
mkdir -p "$stage_dir"
ditto "$out_app" "$staged_app"

resources_dir="${staged_app}/Contents/Resources"
mkdir -p "$resources_dir"
ditto "assets" "${resources_dir}/assets"
ditto "4k loops" "${resources_dir}/4k loops"
ditto "sounds" "${resources_dir}/sounds"
ln -s /Applications "${stage_dir}/Applications"

rm -f "$dmg_path"
hdiutil create \
  -volname "$app_name" \
  -srcfolder "$stage_dir" \
  -ov \
  -format UDZO \
  "$dmg_path"

hdiutil verify "$dmg_path"
echo "release ready: $dmg_path"
