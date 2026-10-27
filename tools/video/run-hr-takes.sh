#!/usr/bin/env bash
# Seeds, records and assembles every take of the HR video, in order. Needs PW_DIR, CHROME, API.
set -eo pipefail
cd "$(dirname "$0")"
# One run at a time: two runs would write into the same frame folders.
mkdir .hr-takes.lock 2>/dev/null || { echo "another run is in progress (.hr-takes.lock)"; exit 1; }
trap 'rmdir .hr-takes.lock' EXIT
for take in "$@"; do
  lang=${take%-*}; format=${take#*-}
  echo "== $lang $format"
  LANG_VIDEO=$lang node seed-hr.mjs | tail -2
  node video-record-hr.mjs record "$lang" "$format" | tail -1
  node assemble-hr.mjs "$lang" "$format" | tail -1
done
