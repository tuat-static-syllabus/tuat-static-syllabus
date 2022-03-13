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
async function innerByQuery(q) {
  return await inner(await page.$(q));
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
    // id = year-course_code-present_language.code
    // neutral_department_id is for putting department data selected on search page
    // department_id is for the department shown in single page
    // course_language is for what language being spoken for the lecture (e.g. lectures from McGahan is "English")
    // and taught_language is for what langage being taught in the lecture (e.g. for subject "フランス語I", it's "French")
    // using "Grades" for Year shown in DetailMain since it's confusing with annual year (e.g. 2021, 2022)

    // create tables
    await db.exec(`
      CREATE TABLE subjects
          (id string PRIMARY KEY, name_id integer, year integer, present_lang_id integer,
           neutral_department_id integer, category_id integer,
           requirement text, credits integer, department_id integer, grades_id integer,
           semester_id integer, course_type_id integer, course_code text,
           instructor_id integer, facility_affiliation_id integer, office_id integer, email text,

           course_description text, expected_learning text, course_schedule text, prerequisites text,
           texts_and_materials text, _references text, assessment text, message_from_instructor text,
           course_keywords text, office_hours text, remarks_1 text, remarks_2 text, related_url text,
           course_language text, taught_language text, last_update text);

      CREATE TABLE present_lang_table (id integer PRIMARY KEY AUTOINCREMENT, lang_name text, lang_code text);
      CREATE TABLE grades_table (id integer PRIMARY KEY AUTOINCREMENT, min integer, max integer);

      CREATE TABLE name_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE instructor_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE neutral_department_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE category_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE department_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE semester_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE course_type_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE facility_affiliation_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
      CREATE TABLE office_table (id integer PRIMARY KEY AUTOINCREMENT, jp text, en text);
    `);
    // add some data that are already known in tables
    await db.exec(`INSERT INTO present_lang_table(lang_name, lang_code) VALUES (?,?)`, "日本語", "ja");
    await db.exec(`INSERT INTO present_lang_table(lang_name, lang_code) VALUES (?,?)`, "English", "en");

    const japaneseDeps = [
      "農学部",
      "工学部",
      "農学府",
      "農学府（4年制博士課程）",
      "工学府博士前期",
      "工学府専門職学位",
      "工学府博士後期",
      "工学府博士",
      "生物システム応用科学府博士前期",
      "生物システム応用科学府博士後期",
      "生物システム応用科学府博士",
      "生物システム応用科学府一貫制博士",
      "連合農学研究科",
      "グローバル教育院",
      "資格科目",
      "教職科目",
      "グローバル・プロフェッショナルプログラム",
      "卓越大学院プログラム",
    ];
    const englishDeps = [
      "Faculty of Agriculture",
      "Faculty of Engineering",
      "Graduate School of Agriculture(Master)",
      "Graduate School of Agriculture(Doctor)",
      "Graduate School of Engineering(Master)",
      "Graduate School of Engineering",
      "Graduate School of Engineering(Doctor)",
      "Graduate School of Engineering(Doctor)",
      "Graduate School of Bio-Applications and Systems Engineering(Master)",
      "Graduate School of Bio-Applications and Systems Engineering(Doctor)",
      "Graduate School of Bio-Applications and Systems Engineering(Doctor)",
      "Graduate School of Bio-Applications and Systems Engineering",
      "United Graduate School of Agricultural Science(Doctor)",
      "Organization for the Advancement of Education and Global Learning",
      "License Course",
      "Teaching Course",
      "GLOBAL PROFESSIONAL PROGRAM",
      "WISE PROGRAM",
    ];
    for (let i = 0; i < japaneseDeps.length; i++) {
      await db.exec(`INSERT INTO neutral_department_table(jp, en) VALUES (?,?)`, japaneseDeps[i], englishDeps[i]);
      await db.exec(`INSERT INTO department_table(jp, en) VALUES (?,?)`, japaneseDeps[i], englishDeps[i]);
    }

    // add empty data since some (most?) of subjects don't set them
    for (const tbl of ["category_table", "department_table", "course_type_table", "facility_affiliation_table", "office_table"]) {
      await db.exec("INSERT INTO ?(jp, en) VALUES (?,?)", tbl, "", "");
    }

    // permit i==j, since there really are (e.g. 卒業論文 is 4〜4)
    for (let i = 1; i <= 4; i++) {
      for (let j = i; j <= 4; j++) {
        await db.exec("INSERT INTO grades_table(min, max) VALUES (?,?)", i, j);
      }
    }
    // also 0 to denote missing range (e.g. 2〜 is expressed to be 2,0)
    for (let i = 0; i <= 4; i++) {
      // start from 0 as there is a subject without range (応用化学セミナーⅡ)
      await db.exec("INSERT INTO grades_table(min, max) VALUES (?,?)", i, 0);
    }
  }
}

function sanitizeDepsAndYear(input, lang) {
  if (lang !== "ja") {
    // only trim spaces at the first and the end, as English uses spaces
    // eslint-disable-next-line no-irregular-whitespace
    return input.replace(/^[　\s[]+/g, "").replace(/[　\s\]]+$/g, "");
  }
  // remove all spaces, including full-width ones
  // eslint-disable-next-line no-irregular-whitespace
  return input.replace(/[　\s]+/g, "");
}

async function getItemId(table, idWoLang, inLang, inText) {
  // simply query the table
  const { id: queriedId } = await db.get(`SELECT id FROM ${table}_table WHERE ${inLang} = ?`, inText);
  if (typeof queriedId === "number") {
    return queriedId;
  }
  // find the opposite language from subjects table
  const oppositeLang = inLang === "ja" ? "en" : "ja";
  const response = (await db.get(`SELECT ${table}_id FROM subjects WHERE id = ?`, `${idWoLang}-${oppositeLang}`))[`${table}_id`];
  if (response === undefined) {
    // no such subject; insert with another language missing
    return (await db.run(`INSERT INTO ${table}_table(${inLang}) VALUES (?)`, inText)).lastID;
  } else {
    // update record to complement data
    await db.exec(`UPDATE ${table}_table SET ${inLang} = ? WHERE id = ?`, inText, response);
    return response;
  }
}

async function queryBilingual(table, ja, en) {
  let result;
  if (ja && en) {
    result = (await db.get(`SELECT id FROM ${table}_table WHERE ja = ? AND en = ?`, ja, en)).id;
  } else if (ja && !en) {
    result = (await db.get(`SELECT id FROM ${table}_table WHERE ja = ?`, ja)).id;
  } else if (!ja && en) {
    result = (await db.get(`SELECT id FROM ${table}_table WHERE en = ?`, en)).id;
  }
  if (result !== undefined) {
    return result;
  }
  return (await db.run(`INSERT INTO ${table}_table(ja, en) VALUES (?,?)`, ja, en)).lastID;
}

async function queryLang(langCode) {
  return (await db.get("SELECT id FROM present_lang_table WHERE lang_code = ?", langCode)).id;
}

async function queryGrades(min, max) {
  min = +min, max = +max;
  const result = (await db.get("SELECT id FROM grades_table WHERE min = ? AND max = ?", min, max)).id;
  if (result !== undefined) {
    return result;
  }
  return (await db.run("INSERT INTO grades_table(min, max) VALUES (?,?)", min, max)).lastID;
}

async function lookupNeutralDep(value) {
  return (await db.get("SELECT id FROM neutral_department_table WHERE ja = ? OR en = ?", value, value)).id;
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

async function processPage(lang, year, faculty) {
  // for subject name and instructor, both JPN and ENG exist in the page
  // except them requires to be extracted individually
  // mispelling of the following variables are made intentional
  const jpnSubjectName = sanitizeDepsAndYear(await innerByQuery("span#Detail_lbl_sbj_name"), "en");
  const engSubjectName = sanitizeDepsAndYear(await innerByQuery("span#Detail_lbl_sbj_name_e"), "en");
  const courseCateg = await innerByQuery("span#Detail_lbl_sbj_area_name");
  const requiem = await innerByQuery("span#Detail_lbl_req_name");
  const credits = +(await innerByQuery("span#Detail_lbl_credits")).trim();
  const departm = await innerByQuery("span#Detail_lbl_org_name");
  const yearMin = await innerByQuery("span#Detail_lbl_grad_min");
  const yearMax = await innerByQuery("span#Detail_lbl_grad_max");
  const semest = await innerByQuery("span#Detail_lbl_lct_term_name");
  const courseType = await innerByQuery("span#Detail_lbl_lct_term_name");
  const timetableId = await innerByQuery("span#Detail_lbl_lct_cd");
  const jpnInstr = sanitizeDepsAndYear(await innerByQuery("span#Detail_lbl_staff_name"), "en");
  const engInstr = sanitizeDepsAndYear(await innerByQuery("span#Detail_lbl_staff_name_e"), "en");
  const affili = await innerByQuery("span#Detail_lbl_section_name");
  const office = await innerByQuery("span#Detail_lbl_room_name");
  const emial = await innerByQuery("span#Detail_lbl_e_mail");

  const cDesc = await innerByQuery("span#Detail_lbl_outline");
  const expLea = await innerByQuery("span#Detail_lbl_standard");
  const schedule = await innerByQuery("span#Detail_lbl_schedule");
  const prereq = await innerByQuery("span#Detail_lbl_requirements");
  const tekst = await innerByQuery("span#Detail_lbl_text_book");
  const refer = await innerByQuery("span#Detail_lbl_reference_book");
  const ases = await innerByQuery("span#Detail_lbl_grading");
  const instrMessage = await innerByQuery("span#Detail_lbl_something");
  const kewada = await innerByQuery("span#Detail_lbl_keyword");
  const ofiseHours = await innerByQuery("span#Detail_lbl_office_hours");
  const remarks1 = await innerByQuery("span#Detail_lbl_note1");
  const remarks2 = await innerByQuery("span#Detail_lbl_note2");
  const relaURL = await innerByQuery("span#Detail_lbl_url");
  const courseLang = await innerByQuery("span#Detail_lbl_num_language_name");
  const taughtLang = await innerByQuery("span#Detail_lbl_num_sbj_name");
  const lastUpda = await innerByQuery("span#Detail_lbl_update_dt");

  // query DB
  const idNoLang = `${year.value}-${timetableId}`;
  const pLangId = await queryLang(lang);
  const nameId = await queryBilingual("subject", jpnSubjectName, engSubjectName);
  const neutralDepId = await lookupNeutralDep(sanitizeDepsAndYear(faculty.name, lang));
  const categoryId = await getItemId("category", idNoLang, lang, courseCateg);
  const departmentId = await getItemId("department", idNoLang, lang, departm);
  const gradesId = await queryGrades(yearMin, yearMax);
  const semesterId = await getItemId("semester", idNoLang, lang, semest);
  const courseTypeId = await getItemId("course_type", idNoLang, lang, courseType);
  const instructorId = await queryBilingual("instructor", jpnInstr, engInstr);
  const facilityAffiliationId = await getItemId("facility_affiliation", idNoLang, lang, affili);
  const officeId = await getItemId("office", idNoLang, lang, office);

  // let's insert
  await db.exec( //
    `INSERT INTO subjects VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, //
    `${idNoLang}-${lang}`, nameId, +year.value, pLangId, //
    neutralDepId, categoryId, //
    requiem, credits, departmentId, gradesId, //
    semesterId, courseTypeId, timetableId, //
    instructorId, facilityAffiliationId, officeId, emial, //

    cDesc, expLea, schedule, prereq, //
    tekst, refer, ases, instrMessage, //
    kewada, ofiseHours, remarks1, remarks2, relaURL, //
    courseLang, taughtLang, lastUpda, //
  );
  console.log(`Inserted ${jpnSubjectName} [${engSubjectName}] for ${lang}`);
}

try {
  // start the session; beginning of our fight with the insanely and unnecessarily stateful website
  await page.goto("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx");
  // response.request.res.responseUrl
  const initialDDs = await findDropdowns();
  const syllabusLanguage = "ja";
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
          const displayingPage = await innerByQuery("tr[align=center]:not([style]) span");
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
          const displayingPage = await innerByQuery("tr[align=center]:not([style]) span");
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
          await processPage(syllabusLanguage, year, faculty);

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
