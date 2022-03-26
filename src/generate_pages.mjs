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
      if (rowsCount != rows.length) {
        return reject(new Error(`rowsCount (${rowsCount}) != rows.length (${rows.length})`));
      }
      resolve(rows)
    }, reject);
  });
}

async function countRows(table, filter = "", params = []) {
  return (await db.get(`SELECT COUNT(*) FROM ${table} ${filter};`), params)['COUNT(*)'];
}

async function* enumerateRows(table, pageSize = 30, filter = "", params = []) {
  const total = await countRows(table);
  for (let offset = 0; offset < total; offset += pageSize) {
    yield* await betterEach(`SELECT * FROM ${table} ${filter} LIMIT ${pageSize} OFFSET ${offset};`, params);
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

async function publish(dest, lang, layout, contents) {
  await createDir(path.dirname(`generated/${dest}`));
  const output = `---
${JSON.stringify({
    title: pageLangs.__[lang][`${layout}_title`],
    layout,
    texts: pageLangs[layout][lang],
    contents,
  })}
---`;
  await util.promisify(fs.writeFile)(`generated/${dest}`, output);
}

// generate subjects pages
const years = new Set();
console.log(await countRows("subjects"));
for await (const row of enumerateRows("subjects")) {
  const nDepId = row.neutral_department_id;
  // inline entries
  await inlineVars(row, ["name", "instructor", "present_lang", "grades"]);
  await inlineMonolingual(row, "ja");
  // _references -> references
  row.references = row._references;
  delete row._references;
  // surprisingly (and luckily in this time), Jekyll emits empty for 0 number literal.
  // so there won't be sanitization for grades key. ("| textilize" is needed to show 0 instead)

  console.log(`Generating ${row.name.ja} for ${row.present_lang.lang_code}`);
  await publish(
    `${row.present_lang.lang_code}/${row.year}/${printf("%02d", nDepId)}/${row.course_code}.html`,
    row.present_lang.lang_code,
    "syllabus_details",
    row);

  years.add(row.year);
  break;
}


async function generatePages(pageDest, filter, params) {

}

// generate subject list page, with some filters
for await (const lang of enumerateRows("present_lang_table")) {
  // filter by: language
  await generatePages("pageDest", "WHERE present_lang_id = ?", [lang.id]);

  for (const acYear of years) {
    // filter by: language, year
    await generatePages("pageDest", "WHERE present_lang_id = ? AND year = ?", [lang.id, acYear]);

    for await (const faculty of enumerateRows("neutral_department_table")) {
      // filter by: language, year, faculty
      await generatePages("pageDest", "WHERE present_lang_id = ? AND year = ? AND neutral_department_id = ?", [lang.id, acYear, faculty.id]);
    }
  }
}
