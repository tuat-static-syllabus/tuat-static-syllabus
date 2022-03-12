// syllabus scraper

import axios from "axios";
import { HttpCookieAgent, HttpsCookieAgent } from 'http-cookie-agent';
import { CookieJar } from "tough-cookie";
import cheerio from "cheerio";
import sqlite3 from "sqlite3";
import { open } from "sqlite";


const jar = new CookieJar();
const client = axios.create({
    headers: {
        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:97.0) Gecko/20100101 Firefox/97.0",
    },
    withCredentials: true,
    httpAgent: new HttpCookieAgent({ jar }),
    httpsAgent: new HttpsCookieAgent({ jar }),
    // we never treat binary files
    responseType: "text",
});

// open the database
const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
});

function findDropdowns(page) {
    const $ = cheerio.load(page);
    const dd = $("select");
    const dropDowns = {};
    dd.each((_, elem) => {
        elem = $(elem);
        dropDowns[elem.attr("name")] = [];
        elem.find("option").each((_, le) => {
            le = $(le);
            dropDowns[elem.attr("name")].push({
                value: le.val(),
                selected: !!le.attr("selected"),
                name: le.text(),
            });
        })
    });
    return dropDowns;
}

async function click(url, tagId, otherFields) {
    // clicks button
    const { data: page } = await client(url);
    const $ = cheerio.load(page);
    const form = $("form#Form1");
    const inputs = form.find("input");
    const formValues = {};
    inputs.each((_, elem) => {
        const l = $(elem);
        formValues[l.attr("name")] = l.val();
    });
    if (otherFields && typeof otherFields === "object") {
        // update things when needed (user filled some fields before changing dropdown)
        Object.assign(formValues, otherFields);
    }
    formValues[tagId] = value;
    return await client({
        url: form.attr("action"),
        baseURL: url,
        params: formValues,
        method: "POST",
    });
}

async function dropdown(url, tagId, value, otherFields) {
    // only use when page refreshes if changed, else not needed
    const { data: page } = await client(url);
    const $ = cheerio.load(page);
    const form = $("form#Form1");
    const inputs = form.find("input");
    const formValues = {};
    inputs.each((_, elem) => {
        const l = $(elem);
        if (l.attr("type") == "button") return;
        formValues[l.attr("name")] = l.val();
    });
    if (otherFields && typeof otherFields === "object") {
        // update things when needed (user filled some fields before changing dropdown)
        Object.assign(formValues, otherFields);
    }
    formValues.__EVENTTARGET = tagId;
    formValues[tagId] = value;
    return await client({
        url: form.attr("action"),
        baseURL: url,
        params: formValues,
        method: "POST",
    });
}

async function init() {
    console.log("Wiping all states");
    return await client("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx");
}

try {
    // start the session; beginning of our fight with the insanely and unnecessarily stateful website
    const { data: initialPage } = await client("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx");
    // response.request.res.responseUrl
    const initialDDs = findDropdowns(initialPage);
    for (const year of initialDDs.ddl_year) {
        // console.log(`Working ${year.name}`);
        for (const faculty of initialDDs.ddl_fac.slice(1)) {
            console.log(`Clicking ${year.name} and ${faculty.name}`);
            await dropdown("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx", "ddl_year", year.value);
            const subjectPage1 = await click("https://spica.gakumu.tuat.ac.jp/Syllabus/SearchMain.aspx", "btnSearch");
            const dest = subjectPage1.request.res.responseUrl;
            console.log(dest);
        }
        await init();
    }
}catch(e){
    console.log(e.message);
} finally {
    await db.close();
}