// syllabus scraper

import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import $ from "cheerio";
import sqlite3 from "sqlite3";
import { open } from "sqlite";


const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

// open the database
const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
});
try {
    // start the session
    await client("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx");
    
} finally {
    await db.close();
}