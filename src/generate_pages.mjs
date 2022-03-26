// generate pages to be processed by Jekyll from database

import sqlite3 from "sqlite3";
import { open } from "sqlite";

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
    const { rowsCount, rows } = await betterEach(`SELECT * FROM ${table} LIMIT ${pageSize} OFFSET ${offset};`);
    console.log(rowsCount);
    yield* rows;
  }
}

// WIP

console.log(await countRows("subjects"));
for await (const row of enumerateRows("subjects")) {
  // inline bilingual entries
  // _references -> references
}