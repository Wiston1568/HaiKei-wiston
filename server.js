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

// --- REDIS & SESSION STORE SETUP ---
const redis = require('redis');
// For connect-redis v9+, this is the correct way to import
const RedisStore = require('connect-redis').default; 

const app = express();
const port = process.env.PORT || 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- REDIS CLIENT CONNECTION ---
const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

redisClient.connect()
    .then(() => console.log("✅ Cloud Redis Connected"))
    .catch((err) => console.error("❌ Redis Connection Error:", err));

// Initialize the store
const redisStore = new RedisStore({
    client: redisClient,
    prefix: "haikei:",
});

// --- VIEW ENGINE & STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.engine('ejs', ejs.renderFile);

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, frameguard: false }));

// --- SESSION STORAGE ---
app.use(session({
    name : '.HKSECURITY',
    secret: process.env.AUTH_SECRET || "tacocat", 
    resave: false,
    saveUninitialized: false,
    store: redisStore, // Using the initialized redisStore
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 1 day session
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
app.use('/watch', require("./routers/watch/watch.js"));

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

if (process.env.NODE_ENV !== 'production') {
    httpServer.listen(port, () => console.log(`Dev server on ${port}`));
}

module.exports = app;