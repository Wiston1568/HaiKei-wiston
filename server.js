require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const helmet = require("helmet");
const SQLiteStore = require('connect-sqlite3')(session);
const { createServer } = require("http");
const { Server } = require("socket.io");
const ejs = require('ejs');

const app = express();
const port = process.env.PORT || 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// View Engine Fix - Telling Express your templates are in /public
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.engine('ejs', ejs.renderFile);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, frameguard: false }));

// Session Fix for Vercel Read-Only System
let sessionStore;
try {
    sessionStore = new SQLiteStore({ db: 'sessions.db', dir: '/tmp' });
} catch (e) {
    sessionStore = null; 
}

app.use(session({
    name : '.HKSECURITY',
    secret: process.env.AUTH_SECRET || "tacocat", // MAKE SURE TO ADD AUTH_SECRET IN VERCEL SETTINGS
    resave: false,
    saveUninitialized: false,
    store: sessionStore || undefined 
}));

app.use(flash());
app.use(passport.authenticate('session'));

// --- ROUTES (Verify these filenames exist in your 'routers' folder!) ---
app.use('/', require('./routers/index.js'));
app.use('/', require('./routers/auth.js'));
app.use('/w2g', require('./routers/w2g.js'));
app.use('/api', require('./routers/api.js'));
app.use('/watchlist', require('./routers/watchlist.js'));
app.use('/search', require('./routers/search.js'));
app.use('/trending', require('./routers/trending.js'));
app.use('/watch', require("./routers/watch/watch.js"));

// Socket.io (Simplified for stability)
const roomData = {};
io.on("connection", (socket) => {
    socket.on("init", (data) => {
        socket.join(data.roomID);
        if (!roomData[data.roomID]) roomData[data.roomID] = { users: {} };
        roomData[data.roomID].users[socket.id] = { id: socket.id };
    });
});

// Vercel only needs the 'app' or 'httpServer' exported
if (process.env.NODE_ENV !== 'production') {
    httpServer.listen(port, () => console.log(`Dev server on ${port}`));
}

module.exports = app;