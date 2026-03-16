require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const helmet = require("helmet");
const { createServer } = require("http");
const { Server } = require("socket.io");
const ejs = require('ejs');
const { createClient } = require('redis');

// --- REDIS STORE ---
const ConnectRedis = require('connect-redis');
const RedisStore = ConnectRedis.default || ConnectRedis;

const app = express();
// Render uses the PORT env var automatically
const port = process.env.PORT || 3000;

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- PING ROUTE (The "Keep-Alive" Target) ---
// This simple route gives cron-job.org something to hit
app.get('/ping', (req, res) => {
    res.status(200).send('System Awake');
});

// --- REDIS CLIENT ---
const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.connect()
    .then(() => console.log("✅ Cloud Redis Connected"))
    .catch((err) => console.error("❌ Redis Connection Error:", err));

const redisStore = new RedisStore({
    client: redisClient,
    prefix: "haikei:"
});

// --- VIEW ENGINE & MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.engine('ejs', ejs.renderFile);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, frameguard: false }));

// --- SESSION ---
app.use(session({
    name: ".HKSECURITY",
    secret: process.env.AUTH_SECRET || "tacocat",
    resave: false,
    saveUninitialized: false,
    store: redisStore,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(flash());
app.use(passport.authenticate('session'));

// --- ROUTES ---
app.use('/', require('./routers/index.js'));
app.use('/', require('./routers/auth.js'));
app.use('/w2g', require('./routers/w2g.js'));
app.use('/api', require('./routers/api.js'));
app.use('/watchlist', require('./routers/watchlist.js'));
app.use('/search', require('./routers/search.js'));
app.use('/trending', require('./routers/trending.js'));
app.use('/watch', require('./routers/watch/watch.js'));

// --- SOCKET.IO ---
const roomData = {};
io.on("connection", (socket) => {
    socket.on("init", (data) => {
        if (!data || !data.roomID) return;
        socket.join(data.roomID);
        if (!roomData[data.roomID]) roomData[data.roomID] = { users: {} };
        roomData[data.roomID].users[socket.id] = { id: socket.id };
    });
});

// --- START SERVER ---
// On Render, listening on 0.0.0.0 is best practice for host binding
httpServer.listen(port, "0.0.0.0", () => {
    console.log(`🚀 App live at http://0.0.0.0:${port}`);
});

module.exports = app;