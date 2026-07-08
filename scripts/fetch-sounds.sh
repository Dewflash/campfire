#!/usr/bin/env bash
set -euo pipefail

base_url="https://raw.githubusercontent.com/remvze/moodist/main/public/sounds/"
sounds_dir="sounds"

mkdir -p "$sounds_dir"

fetch_sound() {
  local save_as="$1"
  local moodist_path="$2"
  local target="$sounds_dir/$save_as"
  local url="$base_url$moodist_path"

  if [[ -s "$target" ]]; then
    echo "skip $target"
    return
  fi

  echo "fetch $target"
  curl -fL --retry 3 --output "$target" "$url"

  if [[ ! -s "$target" ]]; then
    echo "downloaded file is empty: $target" >&2
    exit 1
  fi
}

fetch_sound "rain.mp3" "rain/light-rain.mp3"
fetch_sound "heavy rain.mp3" "rain/heavy-rain.mp3"
fetch_sound "rain on window.mp3" "rain/rain-on-window.mp3"
fetch_sound "thunder.mp3" "rain/thunder.mp3"
fetch_sound "fire.mp3" "nature/campfire.mp3"
fetch_sound "birds.mp3" "animals/birds.mp3"
fetch_sound "crickets.mp3" "animals/crickets.mp3"
fetch_sound "wind chimes.mp3" "things/wind-chimes.mp3"
fetch_sound "leaves.mp3" "nature/wind-in-trees.mp3"
fetch_sound "wind.mp3" "nature/wind.mp3"
fetch_sound "stream.mp3" "nature/river.mp3"
fetch_sound "waterfall.mp3" "nature/waterfall.mp3"
fetch_sound "waves.mp3" "nature/waves.mp3"
fetch_sound "street.mp3" "urban/busy-street.mp3"
fetch_sound "night village.mp3" "places/night-village.mp3"
fetch_sound "train.mp3" "transport/inside-a-train.mp3"
fetch_sound "temple.mp3" "places/temple.mp3"

echo "starter sounds ready"
