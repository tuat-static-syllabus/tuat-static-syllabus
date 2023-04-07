// recreate resume information for scraper

const argv = process.argv.slice(2);
// faculty must be taken from dropdown value of search page
let [lang, year, faculty, pageNum, row] = argv;

if (lang === undefined || year == undefined || faculty == undefined) {
  console.log("usage: node edit_resume.mjs ja/en year faculty [pageNum row]");
  process.exit(1);
}
if (pageNum === undefined) {
  console.log("assuming pageNum=1, row=0");
  pageNum = 1; row = 0;
} else if (row === undefined) {
  console.log("assuming row=0");
  row = 0;
}
// parse page number and row into integer
pageNum = +pageNum; row = +row;

import { openDB } from "./utils.mjs";

// open the database
const db = await openDB("./syllabus.sqlite");
try {
  await db.run("INSERT INTO resume_info(lang, year, faculty, page, row) VALUES (?,?,?,?,?)", lang, year, faculty, pageNum, row);
} finally {
  await db.close();
}