// syllabus scraper

import puppeteer from "puppeteer";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const browser = await puppeteer.launch({
  headless: false,
  args: ["-disable-prompt-on-repost"],
});
const page = await browser.newPage();
// DO NOT TURN THIS TO TRUE; or chromium break with ERR_CACHE_MISS error which can't be countered
const useBack = false;

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

// prepare tables
{
  const { "count(name)": tableCount } = await db.get("SELECT count(name) FROM sqlite_master WHERE type=? AND name=?", "table", "subjects");
  if (!tableCount) {
    // id = year-course_code-present_language_id
    // create tables
    await db.exec(`
      CREATE TABLE subjects
          (id string PRIMARY KEY, name text, year integer, present_language_id integer,
           neutral_department_id integer, category_id integer,
           requirement text, credits integer, department_id integer, grades_id integer,
           semester_id integer, course_type_id integer, course_code text,
           instructor text, facility_affiliation_id integer, office_id integer, email text,
           course_description text, expected_learning text, course_schedule text, prerequisites text,
           texts_and_materials text, _references text, assessment text, message_from_instructor text,
           course_keywords text, office_hours text, remarks_1 text, remarks_2 text, related_url text,
           course_language text)
    `);
    await db.exec(`
      CREATE TABLE present_lang_table (id integer PRIMARY KEY, lang_name text, lang_code text)
    `);
    await db.exec(`
      CREATE TABLE category_table (id integer PRIMARY KEY, jp text, en text)
    `);
    await db.exec(`
      CREATE TABLE department_table (id integer PRIMARY KEY, jp text, en text)
    `);
    await db.exec(`
      CREATE TABLE grades_table (id integer PRIMARY KEY, jp text, en text)
    `);
    await db.exec(`
      CREATE TABLE semester_table (id integer PRIMARY KEY, jp text, en text)
    `);
    await db.exec(`
      CREATE TABLE course_type_table (id integer PRIMARY KEY, jp text, en text)
    `);
    await db.exec(`
      CREATE TABLE facility_affiliation_table (id integer PRIMARY KEY, jp text, en text)
    `);
    await db.exec(`
      CREATE TABLE office_table (id integer PRIMARY KEY, jp text, en text)
    `);
    // add some more data in it
  }
}

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

async function processPage() {
  await sleep(1000);
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
      console.log(`Selecting ${year.name} and ${faculty.name}`);
      await dropdown("ddl_year", year.value, true);
      await dropdown("ddl_fac", faculty.value);
      await click("btnSearch", true);

      // now subject list page was shown, let's do scrape each subjects and paging
      let currentPage = 1,
        knownMax = 2;

      // eslint-disable-next-line no-inner-declarations
      async function reopenPage() {
        // check current page number
        {
          const displayingPage = await inner(await page.$("tr[align=center]:not([style]) span"));
          if (displayingPage === `${currentPage}`) {
            return;
          }
        }
        // try to go to the next page
        let pages;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          pages = await page.$$("tr[align=center]:not([style]) a");
          const pageLinks = [];
          for (const pageElem of pages) {
            pageLinks.push((await inner(pageElem)).trim());
          }
          const exLink = pageLinks.indexOf("...");
          // eslint-disable-next-line eqeqeq
          if (exLink != -1 && parseInt(pageLinks[exLink - 1]) < currentPage) {
            // the target page is beyond the maximum shown
            const mk = parseInt(pageLinks[exLink - 1]);
            console.log(`Expanding more pages... now: ${mk}`);
            if (mk > knownMax) {
              console.log(`Updating known maximum: ${knownMax} => ${mk}`);
              knownMax = mk;
            }
            await pages[exLink].click();
            await waitNav();
          } else {
            break;
          }
        }
        // await sleep(10000);

        for (const pageElem of pages) {
          const num = parseInt((await inner(pageElem)).trim());
          // failed to parse
          if (num !== num) continue;
          // not worth to click (goes back to previous page)
          if (num !== currentPage) continue;

          // voila!
          console.log(`Clicking page ${num}`);
          await pageElem.click();

          await waitNav();
          break;
        }
        {
          const displayingPage = await inner(await page.$("tr[align=center]:not([style]) span"));
          if (displayingPage !== `${currentPage}`) {
            console.log(`WARN: Opening wrong page. ${displayingPage} vs ${currentPage}`);
          }
        }
      }

      do {
        await reopenPage();
        console.log(`Now at page ${currentPage}`);
        // iterate through 詳細 buttons, in weird way!
        let itemsInPage = await page.$$("input[type=submit][value=詳細]");
        const totalInPage = itemsInPage.length;
        for (let i = 0; i < totalInPage; i++) {
          await itemsInPage[i].click();

          // scrape the page and put it into database
          console.log(`Clicking row ${i}`);
          await processPage();

          // go back to previous list page
          if (!useBack) {
            await page.goto("https://spica.gakumu.tuat.ac.jp/syllabus/SearchList.aspx");
            await reopenPage();
          } else {
            await page.goBack();
          }
          // grab handle again...
          // eslint-disable-next-line no-constant-condition
          while (true) {
            itemsInPage = await page.$$("input[type=submit][value=詳細]");
            if (itemsInPage.length === totalInPage) break;

            await sleep(10);
            continue;
          }
        }

        // get maximum number of pages
        for (const pageElem of (await page.$$("tr[align=center]:not([style]) a")).reverse()) {
          const num = parseInt((await inner(pageElem)).trim());
          // failed to parse (次へ or ...)
          if (num !== num) continue;
          // we're already on last page
          if (num <= knownMax) break;
          if (num !== knownMax) console.log(`Updating known maximum: ${knownMax} => ${num}`);

          knownMax = num;
          break;
        }
        currentPage++;
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
