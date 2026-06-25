#!/usr/bin/env bash
# Refresh the Visa Bulletin CSVs from DavidBellamy/visa_dates (public DoS data).
set -e
set -o pipefail
cd "$(dirname "$0")/visa_bulletin"
base="https://raw.githubusercontent.com/DavidBellamy/visa_dates/main/data"
for c in china india mexico philippines row; do
  # -f: fail (non-zero exit) on HTTP errors so a 404/partial never overwrites the CSV
  # with an HTML error body; --retry handles transient network failures.
  curl -fL --retry 3 -o "${c}_eb_backlog.csv" "$base/${c}_visa_backlog_timecourse.csv"
done
echo "done"
