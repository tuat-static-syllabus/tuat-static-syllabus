// syllabus scraper

import puppeteer from "puppeteer";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const browser = await puppeteer.launch({
  headless: false,
});
const page = await browser.newPage();

page.on("requestfailed", async (request) => {
  console.log(`url: ${request.url()}, errText: ${request.failure().errorText}, method: ${request.method()}`);
  if ("net::ERR_CACHE_MISS" === request.failure().errorText) {
    await page.reload();
  }
});

function attr(ee, name) {
  return page.evaluate((nk, tu) => nk.getAttribute(tu), ee, name);
}
function inner(ee) {
  return page.evaluate((at) => at.innerText, ee);
}

// open the database
const db = await open({
  filename: ":memory:",
  driver: sqlite3.Database,
});

async function findDropdowns() {
  const dd = await page.$$("select");
  const dropDowns = {};
  for (const elem of dd) {
    dropDowns[await attr(elem, "name")] = [];
    for (const le of await elem.$$("option")) {
      dropDowns[await attr(elem, "name")].push({
        value: await attr(le, "value"),
        selected: !!(await attr(le, "selected")),
        name: await inner(le),
      });
    }
  }

  return dropDowns;
}

function waitNav() {
  return page.waitForNavigation();
}

async function click(tagId, wait = false) {
  // clicks button
  await page.click(`input[name=${tagId}]`);
  if (wait) await waitNav();
}

async function dropdown(tagId, value, wait = false) {
  // only use when page refreshes if changed, else not needed
  await page.select(`select[name=${tagId}]`, value);
  if (wait) await waitNav();
}

async function typeInput(tagId, value, wait = false) {
  await page.type(`input[name=${tagId}]`, value);
  if (wait) await waitNav();
}

function init() {
  console.log("Wiping all states");
  return page.goto("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  // start the session; beginning of our fight with the insanely and unnecessarily stateful website
  await page.goto("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx");
  // response.request.res.responseUrl
  const initialDDs = await findDropdowns();
  // console.log(initialDDs);
  for (const year of initialDDs.ddl_year) {
    // console.log(`Working ${year.name}`);
    for (const faculty of initialDDs.ddl_fac.slice(1)) {
      console.log(`Clicking ${year.name} and ${faculty.name}`);
      await dropdown("ddl_fac", faculty.value);
      await dropdown("ddl_year", year.value, true);
      await click("btnSearch", true);

      // now subject list page was shown, let's do scrape each subjects and paging
      let currentPage = 1,
        knownMax = 2;
      do {
        console.log(`Now at page ${currentPage}`);
        // iterate through 詳細 buttons, in weird way!
        let itemsInPage = await page.$$("input[type=submit][value=詳細]");
        const totalInPage = itemsInPage.length;
        for (let i = 0; i < totalInPage; i++) {
          await itemsInPage[i].click();

          // scrape the page and put it into database
          console.log(`Clicking row ${i}`);
          await sleep(1000);

          // we're allowed to go back by browser's Back button!
          await page.goBack();
          // grab handle again...
          // eslint-disable-next-line no-constant-condition
          while (true) {
            itemsInPage = await page.$$("input[type=submit][value=詳細]");
            if (itemsInPage.length === totalInPage) break;

            await sleep(10);
            continue;
          }
        }

        const pager = await page.$$("tr[align=center]:not([style]) a");
        // get maximum number of pages
        for (const pageElem of [...pager].reverse()) {
          const num = parseInt((await inner(pageElem)).trim());
          // failed to parse (次へ or ...)
          if (num !== num) continue;
          // we're already on last page
          if (num <= knownMax) break;
          if (num !== knownMax) console.log(`Updating known maximum: ${knownMax} => ${num}`);

          knownMax = num;
          break;
        }

        // try to go to the next page
        for (const pageElem of pager) {
          const num = parseInt((await inner(pageElem)).trim());
          // failed to parse
          if (num !== num) continue;
          // not worth to click (goes back to previous page)
          if (num <= currentPage) continue;

          // voila!
          currentPage = num;
          await pageElem.click();
          await waitNav();
          break;
        }
      } while (currentPage <= knownMax);

      await init();
    }
  }
} catch (e) {
  console.log(e);
} finally {
  await db.close();
  await browser.close();
}
