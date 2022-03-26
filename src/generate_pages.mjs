// generate pages to be processed by Jekyll from database

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";
import util from "util";

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
      resolve({ rowsCount, rows })
    }, reject);
  });
}

async function countRows(table) {
  return (await db.get(`SELECT COUNT(*) FROM ${table};`))['COUNT(*)'];
}

async function* enumerateRows(table, pageSize = 30) {
  const total = await countRows(table);
  for (let offset = 0; offset < total; offset += pageSize) {
    const { rows } = await betterEach(`SELECT * FROM ${table} LIMIT ${pageSize} OFFSET ${offset};`);
    yield* rows;
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
    texts: pageLangs[layout],
    contents,
  })}
---`;
  await util.promisify(fs.writeFile)(`generated/${dest}`, output);
}

console.log(await countRows("subjects"));
for await (const row of enumerateRows("subjects")) {
  // inline entries
  await inlineVars(row, ["name", "instructor", "present_lang", "grades"]);
  await inlineMonolingual(row, "ja");
  // _references -> references
  row.references = row._references;
  delete row._references;

  console.log(`Generating ${row.name.ja} for ${row.present_lang.lang_code}`);
  await publish(
    `${row.present_lang.lang_code}/${row.year}/${row.course_code}.html`,
    row.present_lang.lang_code,
    "syllabus_details",
    row);
  // break;
}
