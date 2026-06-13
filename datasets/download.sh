#!/usr/bin/env bash
# Refresh the Visa Bulletin CSVs from DavidBellamy/visa_dates (public DoS data).
set -e
cd "$(dirname "$0")/visa_bulletin"
base="https://raw.githubusercontent.com/DavidBellamy/visa_dates/main/data"
for c in china india mexico philippines row; do
  curl -L -o "${c}_eb_backlog.csv" "$base/${c}_visa_backlog_timecourse.csv"
done
echo "done"
