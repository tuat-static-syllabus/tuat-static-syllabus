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
try{
	await db.run("DELETE FROM resume_info; VACUUM;")
}finally{
	await db.close();
}