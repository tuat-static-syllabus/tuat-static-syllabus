# TUAT Static Syllabus
This project aims to give each syllabus  for each course an unique, permanent URL.

It comes with crawler, page generator, and some other tools to maintain database.


# Background
[The syllabus search page for TUAT is a very stateful website](https://spica.gakumu.tuat.ac.jp/syllabus/SearchMain.aspx), which always require you to search to pick up one specific course. This is always problematic as you're sometimes required by the instructor(s) to check syllabus all the time.
This is also a reason why we need puppeteer (and bundled Chromium) to crawl.

# Development
## Setting up development environments
After cloning this repository, 

```
npm i
```

This will also download Chromium for crawler.

## Run crawler manually

```
node src/scraper.mjs
```

The database will be initialized, if needed.
It can resume from where it was previously stopped, using a table to record its status.

## Generate pages

```
./build_pages.sh
```

Pages are generated at `generated/` directory. You have to pass them to Jekyll [with the template here](https://github.com/Lesmiscore/tuat-static-syllabus-template).
