// join databases from multiple instances

import sqlite3 from "sqlite3";
import { open } from "sqlite";


export async function openDB(filename, mode) {
  // open the database
  const db = await open({
    filename, mode,
    driver: sqlite3.Database,
  }).catch(e => Promise.reject(new Error(e)));
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
  return db;
}