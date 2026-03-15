var sqlite3 = require('sqlite3');
var mkdirp = require('mkdirp');
var path = require('path');

// 1. Determine the correct path (Vercel uses /tmp, Local uses var/db)
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const dbDir = isVercel ? '/tmp' : path.join(__dirname, 'var', 'db');
const dbPath = path.join(dbDir, 'users.db');

// 2. Only create directories if we are NOT on Vercel
if (!isVercel) {
    mkdirp.sync(dbDir);
}

// 3. Initialize the database
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

console.log("Database initialized at: " + dbPath);

module.exports = db;