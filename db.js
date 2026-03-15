var sqlite3 = require('sqlite3');
var mkdirp = require('mkdirp');
var path = require('path');
var os = require('os');

// FIX: Use /tmp on Vercel, otherwise use local var/db
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const dbDir = isVercel ? '/tmp' : path.join(__dirname, 'var', 'db');
const dbPath = path.join(dbDir, 'users.db');

// Only try to create the directory if we aren't on Vercel 
// (Vercel's /tmp already exists)
if (!isVercel) {
    mkdirp.sync(dbDir);
}

var db = new sqlite3.Database(dbPath);

db.serialize(function() {
  db.run("CREATE TABLE IF NOT EXISTS users ( \
    email TEXT UNIQUE, \
    id INTEGER PRIMARY KEY, \
    username TEXT UNIQUE, \
    email_verified TEXT, \
    hashed_password BLOB, \
    salt BLOB, \
    watchlist TEXT, \
    currentlyWatchingTitle TEXT, \
    currentlyWatchingTime TEXT, \
    currentlyWatchingThumbnail TEXT \
  )");
});

module.exports = db;
const sqlite3 = require('sqlite3');
const path = require('path');
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';

// Redirect database to /tmp if on Vercel
const dbPath = isVercel ? '/tmp/users.db' : path.join(__dirname, 'var', 'db', 'users.db');

const db = new sqlite3.Database(dbPath);
// ... keep the rest of your db.serialize code ...