// join databases from multiple instances

import { openDB } from "./utils.mjs";

// open the database
const db = await openDB("./syllabus.sqlite");
