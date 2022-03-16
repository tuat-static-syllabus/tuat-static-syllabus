// delete resume information created by scraper


import sqlite3 from "sqlite3";
import { open } from "sqlite";

// open the database
const db = await open({
  filename: "./syllabus.sqlite",
  driver: sqlite3.Database,
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

async function readResumeInfo() {
  const resp = await db.get("SELECT lang, year, faculty, page, row FROM resume_info ORDER BY id DESC LIMIT 1;");
  if (!resp) {
    return [false, null, null, null, null, null];
  }
  // eslint-disable-next-line no-shadow
  const { lang, year, faculty, page, row } = resp;
  return [true, lang, year, faculty, page, row];
}

try {
  console.log(`was: ${(await readResumeInfo()).slice(1).join(" ")}`);
  await db.run("DELETE FROM resume_info; VACUUM;")
} finally {
  await db.close();
}