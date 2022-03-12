// syllabus scraper

import puppeteer from "puppeteer";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const browser = await puppeteer.launch({
  headless: false,
});
const page = await browser.newPage();

function attr(ee, name) {
  return page.evaluate((ee, name) => ee.getAttribute(name), ee, name);
}
function inner(ee) {
  return page.evaluate((ee) => ee.innerText, ee);
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

async function click(tagId) {
  // clicks button
  await page.click(`input[name=${tagId}]`);
  // await page.waitForNavigation({waitUntil: 'networkidle2'});
}

async function dropdown(tagId, value, wait = false) {
  // only use when page refreshes if changed, else not needed
  await page.select(`select[name=${tagId}]`, value);
  if (wait) await page.waitForNavigation({ waitUntil: "networkidle2" });
}

async function typeInput(tagId, value) {
  await page.type(`input[name=${tagId}]`, value);
  // await page.waitForNavigation({waitUntil: 'networkidle2'});
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
      await click("btnSearch");

      // now subject page was shown, let's do paging

      await init();
    }
  }
} catch (e) {
  console.log(e);
} finally {
  await db.close();
  await browser.close();
}
