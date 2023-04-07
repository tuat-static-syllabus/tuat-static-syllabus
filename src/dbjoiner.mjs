// join databases from multiple instances

import { hideBin } from "yargs/helpers";
import { openDB } from "./utils.mjs";

const argv = hideBin(process.argv);
const sources = argv.slice(0, argv.length - 1);
const output = argv[argv.length - 1];

// open the database
const sourceDb = await Promise.all(sources.map(openDB));
const destDb = await openDB(output);

function betterEach(db) {
  return new Promise((resolve, reject) => {
    const rows = [];
    db.each(...Array.from(arguments).slice(1), (err, row) => {
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

async function countRows(db, table, filter = "", params = []) {
  return (await db.get(`SELECT COUNT(*) FROM ${table} ${filter};`, params))['COUNT(*)'];
}

async function* enumerateRows(db, table, pageSize = 30, filter = "", params = []) {
  const total = await countRows(db, table, filter, params);
  for (let offset = 0; offset < total; offset += pageSize) {
    yield* await betterEach(db, `SELECT * FROM ${table} ${filter} LIMIT ${pageSize} OFFSET ${offset};`, params);
  }
}

try {
  for (const s of sourceDb) {
    console.log(`Copying from ${s.config.filename}, ${await countRows(s, "subjects")} total`);
    for await (const {
      id, name_id, year, present_lang_id,//
      neutral_department_id, category_id,//
      requirement, credits, department_id, grades_id,//
      semester_id, course_type_id, course_code,//
      instructor_id, facility_affiliation_id, office_id, email,//

      course_description, expected_learning, course_schedule, prerequisites,//
      texts_and_materials, _references, assessment, message_from_instructor,//
      course_keywords, office_hours, remarks_1, remarks_2, related_url,//
      course_language, taught_language, last_update,//

      day_period_id,//
    } of enumerateRows(s, "subjects")) {
      await destDb.run(//
        `INSERT OR REPLACE INTO subjects VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, //
        id, name_id, year, present_lang_id,//
        neutral_department_id, category_id,//
        requirement, credits, department_id, grades_id,//
        semester_id, course_type_id, course_code,//
        instructor_id, facility_affiliation_id, office_id, email,//
  
        course_description, expected_learning, course_schedule, prerequisites,//
        texts_and_materials, _references, assessment, message_from_instructor,//
        course_keywords, office_hours, remarks_1, remarks_2, related_url,//
        course_language, taught_language, last_update,//
  
        day_period_id,//
      );
    }
  }

  console.log("Removing resume info from the output DB");
  await destDb.run("DELETE FROM resume_info; VACUUM;");
} finally {
  await Promise.allSettled(
    destDb.close(),
    ...sourceDb.map(a => a.close()),
  );
}
