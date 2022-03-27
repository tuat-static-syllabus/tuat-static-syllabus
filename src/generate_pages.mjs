// generate pages to be processed by Jekyll from database

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";
import util from "util";
import printf from "printf";

import pageLangs from "./page_langs.json";

// open the database
const db = await open({
  filename: "./syllabus.sqlite",
  driver: sqlite3.Database,
  // open DB in R/O to ensure safety
  mode: sqlite3.OPEN_READONLY,
});
{
  const old = db.get;
  db.get = async function () {
    try {
      return await old.apply(db, arguments);
    } catch (e) {
      throw new Error(e);
    }
  }
}
{
  const old = db.run;
  db.run = async function () {
    try {
      return await old.apply(db, arguments);
    } catch (e) {
      throw new Error(e);
    }
  }
}
{
  const old = db.exec;
  db.exec = async function () {
    try {
      return await old.apply(db, arguments);
    } catch (e) {
      throw new Error(e);
    }
  }
}


function betterEach() {
  return new Promise((resolve, reject) => {
    const rows = [];
    db.each(...arguments, (err, row) => {
      if (err) {
        return reject(err);
      }
      rows.push(row);
    }).then(rowsCount => {
      if (rowsCount !== rows.length) {
        return reject(new Error(`rowsCount (${rowsCount}) != rows.length (${rows.length})`));
      }
      resolve(rows)
    }, reject);
  });
}

async function countRows(table, filter = "", params = []) {
  return (await db.get(`SELECT COUNT(*) FROM ${table} ${filter};`, params))['COUNT(*)'];
}

async function* enumerateRows(table, pageSize = 30, filter = "", params = [], expand = true) {
  const total = await countRows(table, filter, params);
  for (let offset = 0; offset < total; offset += pageSize) {
    if (expand) {
      yield* await betterEach(`SELECT * FROM ${table} ${filter} LIMIT ${pageSize} OFFSET ${offset};`, params);
    } else {
      yield await betterEach(`SELECT * FROM ${table} ${filter} LIMIT ${pageSize} OFFSET ${offset};`, params);
    }
  }
}

function createDir(dir) {
  return util.promisify(fs.mkdir)(dir, { recursive: true, });
}

async function inlineVars(obj, keys) {
  for (const k of keys) {
    obj[k] = await db.get(`SELECT * FROM ${k}_table WHERE id = ?;`, [obj[`${k}_id`]]);
    delete obj[`${k}_id`];
  }
  return obj;
}

async function inlineMonolingual(obj, lang) {
  for (let k of Object.keys(obj)) {
    if (!k.endsWith("_id")) {
      continue;
    }
    if (typeof obj[k] !== "number") {
      continue;
    }
    k = k.substring(0, k.length - 3);
    obj[k] = (await db.get(`SELECT ${lang} FROM ${k}_table WHERE id = ?;`, [obj[`${k}_id`]]))[lang];
    delete obj[`${k}_id`];
  }
  return obj;
}

function sanitizeGrades(gr){
  if(!gr.min){
    delete gr.min;
  }
  if(!gr.max){
    delete gr.max;
  }
  return gr;
}

async function publish(dest, lang, layout, contents, textOverride = {}) {
  await createDir(path.dirname(`generated/${dest}`));
  const output = `---
${JSON.stringify({
    title: pageLangs.__[lang][`${layout}_title`] || textOverride.__title,
    permalink: `/${dest}`,
    layout,
    texts: Object.assign({}, pageLangs[layout][lang], textOverride),
    contents,
  })}
---`;
  await util.promisify(fs.writeFile)(`generated/${dest}`, output);
}

// generate subjects pages
const years = new Set([]);
// const years = new Set([2017, 2018, 2019, 2020, 2021, 2022]);
console.log(await countRows("subjects"));
for await (const row of enumerateRows("subjects")) {
  // break;
  const nDepId = row.neutral_department_id;
  // inline entries
  await inlineVars(row, ["name", "instructor", "present_lang", "grades"]);
  await inlineMonolingual(row, "ja");
  // _references -> references
  row.references = row._references;
  delete row._references;
  // sanitize grades key
  sanitizeGrades(row.grades);

  console.log(`Generating ${row.name[row.present_lang.lang_code]} (${row.present_lang.lang_code})`);
  await publish(
    `${row.present_lang.lang_code}/${row.year}/${printf("%02d", nDepId)}/${row.course_code}.html`,
    row.present_lang.lang_code,
    "syllabus_details",
    row,
    {
      __title: row.name[row.present_lang.lang_code],
    });

  years.add(row.year);
}
console.log(years);

function range(start, end) {
  return Array(end - start + 1).fill().map((e, i) => start + i);
}

async function generatePages(pageDest, lang, visibleFilters, filter, params) {
  console.log("Generating subject list for", lang, visibleFilters);
  const pageSize = 50;
  const rowCount = await countRows("subjects", filter, params);
  const pageCount = Math.ceil(rowCount / pageSize);
  const filters = [];
  for (const { key, value } of visibleFilters) {
    filters.push({ title: pageLangs.__[lang][`filter_name_${key}`] || key, value });
  }
  let pageNum = 1;
  for await (const page of enumerateRows("subjects", pageSize, filter, params, false)) {
    const subjects = [];
    for (const row of page) {
      await inlineVars(row, ["semester", "name", "instructor", "day_period", "grades"]);
      subjects.push({
        href: `/${lang}/${row.year}/${printf("%02d", row.neutral_department_id)}/${row.course_code}.html`,
        semester: row.semester[lang],
        title: row.name[lang],
        instructor: row.instructor[lang],
        day_period: row.day_period[lang],
        year: sanitizeGrades(row.grades),
      });
    }
    const content = {
      pages: {
        now: pageNum,
        maximum: pageCount === pageNum,
        // TODO: want to use logarithm paging
        indices: range(Math.max(1, pageNum - 6), Math.min(pageCount, pageNum + 6)),
      },
      total: rowCount,
      filters,
      subjects,
    };
    // index is for selecting, not here
    // if (pageNum === 1) {
    //   await publish(`${pageDest}/index.html`, lang, "subject_list", content);
    // }
    await publish(
      `${pageDest}/page${pageNum}.html`,
      lang, "subject_list", content);
    pageNum++;
  }
  console.log(`${pageNum} pages generated.`);
}


const langSelection = [];
// generate subject list page, with some filters
for await (const lang of enumerateRows("present_lang_table")) {
  // filter by: language
  await generatePages(
    `${lang.lang_code}`, lang.lang_code,
    [
      { key: "present_lang", value: lang.lang_name },
    ],
    "WHERE present_lang_id = ?", [lang.id]);

  langSelection.push({
    href: `${lang.lang_code}/`, value: lang.lang_name
  });

  const yearSelection = [];
  for (const acYear of years) {
    yearSelection.push({
      href: `${acYear}/`, value: acYear
    });
    // filter by: language, year
    await generatePages(
      `${lang.lang_code}/${acYear}`, lang.lang_code,
      [
        { key: "present_lang", value: lang.lang_name },
        { key: "year", value: acYear },
      ],
      "WHERE present_lang_id = ? AND year = ?", [lang.id, acYear]);

    const facultySelection = [];
    for await (const faculty of enumerateRows("neutral_department_table")) {
      facultySelection.push({
        href: `${printf("%02d", faculty.id)}/page1.html`,
        value: faculty[lang.lang_code]
      });
      // filter by: language, year, faculty
      await generatePages(
        `${lang.lang_code}/${acYear}/${printf("%02d", faculty.id)}`, lang.lang_code,
        [
          { key: "present_lang", value: lang.lang_name },
          { key: "year", value: acYear },
          { key: "faculty", value: faculty[lang.lang_code] },
        ],
        "WHERE present_lang_id = ? AND year = ? AND neutral_department_id = ?", [lang.id, acYear, faculty.id]);
    }

    await publish(`${lang.lang_code}/${acYear}/index.html`, lang.lang_code, "listings", {
      items: [
        ...facultySelection,
        { href: "./page1.html", value: pageLangs.__[lang.lang_code].proceed_filtering },
      ],
    }, { __title: pageLangs.__[lang.lang_code].select_faculty });
  }

  await publish(`${lang.lang_code}/index.html`, lang.lang_code, "listings", {
    items: [
      ...yearSelection,
      { href: "./page1.html", value: pageLangs.__[lang.lang_code].proceed_filtering },
    ],
  }, { __title: pageLangs.__[lang.lang_code].select_year });
}

await publish("index.html", "ja", "listings", {
  items: [
    { value: "Select a language to display syllabus:" },
    ...langSelection,
  ]
}, {
  __title: "TUAT Static Syllabusへようこぞ / Welcome to TUAT Static Syllabus",
});
