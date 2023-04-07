// delete resume information created by scraper

import { openDB } from "./utils.mjs";

// open the database
const db = await openDB("./syllabus.sqlite");

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