#!/bin/bash
node src/scraper.mjs --no-resume "$@" || node src/scraper.mjs "$@" || node src/scraper.mjs "$@"
