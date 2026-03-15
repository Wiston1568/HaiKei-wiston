require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const helmet = require("helmet");
const SQLiteStore = require('connect-sqlite3')(session);
const limit = require('express-limit').limit;
const { createServer } = require("http");
const { Server } = require("socket.io");
const filter = require('leo-profanity');
const { getSources, getShowInfo, getVideoSourcesGogoanime, getVideoSourcesZoro } = require('./utils/getSources');

const app = express();
const port = process.env.PORT || 3000;
const ejs = require('ejs');

const httpServer = createServer(app);
const io = new Server(httpServer, {   
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    } 
});

const roomData = {};

// Socket logic remains the same...
io.on("connection", (socket) => {
    let room;
    setInterval(() => { if (roomData[room]) checkRoomMembers(roomData); }, 1000);
    function createRoom(roomID) {
        room = roomID;
        socket.join(room);
        roomData[room] = { users: {}, hostID: socket.id, currentTime: 0, roomID: roomID, isPublic: true, roomName: "Untitled Room", roomDescription: "No description provided.", playing: false, currentManifest: "", isVideoCurrentlyPlaying: false };
        roomData[room].users[socket.id] = { ping: -1, id: socket.id, isHost: true };
    }
    function joinRoom(roomID) {
        room = roomID;
        socket.join(room);
        if (roomData[room]) {
            roomData[room].users[socket.id] = { ping: -1, id: socket.id, isHost: false };
            if (roomData[room].isVideoCurrentlyPlaying && roomData[room].currentManifest !== "") {
                socket.emit("receiveUserVideoFromHost", {videoData: roomData[room].currentManifest, currentTime: roomData[room].currentTime});
            }
        }
    }
    socket.on("init", (data) => {
        if(io.sockets.adapter.rooms.get(data.roomID) && io.sockets.adapter.rooms.get(data.roomID).size > 0) joinRoom(data.roomID);
        else createRoom(data.roomID);
    });
    socket.on('disconnect', () => { if (roomData[room]) delete roomData[room].users[socket.id]; });
    function checkRoomMembers() { if (roomData[room] && Object.keys(roomData[room].users).length < 1) delete roomData[room]; }
    socket.on("ping", (cb) => cb());
    // ... (rest of your socket listeners)
});

app.locals.pluralize = require('pluralize');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, frameguard: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// FIX: Safer Session Handling for Vercel
let sessionStore;
try {
    sessionStore = new SQLiteStore({ db: 'sessions.db', dir: '/tmp' });
} catch (e) {
    console.log("SQLite Store failed, using memory store");
    sessionStore = null; 
}

app.use(session({
    name : '.HKSECURITY',
    secret: process.env.AUTH_SECRET || "tacocat",
    resave: false,
    saveUninitialized: false,
    store: sessionStore || undefined // Fallback to memory if SQLite fails
}));

app.use(flash());
app.use(limit({max: 10, period: 5 * 1000, message: "Limit Exceeded!" }), passport.authenticate('session'));

app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');
// Point to the root of the project where your EJS files actually are
app.set('views', path.join(__dirname, 'public')); 

// Set up app routes
app.use('/', require('./routers/index.js'));
app.use('/', require('./routers/auth.js'));
app.use('/w2g', require('./routers/w2g.js'));
app.use('/api', require('./routers/api.js'));
app.use('/ajax', require('./routers/ajax.js'));
app.use('/watchlist', require('./routers/watchlist.js'));
app.use('/search', require('./routers/search.js'));
app.use('/trending', require('./routers/trending.js'));
app.use('/releases', require('./routers/releases.js'));
app.use('/genres', require('./routers/genre/genres.js'));
app.use('/genre/', require('./routers/genre/genre.js'));
app.use("/status", require("./routers/status/status.js"));
app.use('/watch', require("./routers/watch/watch.js"));

httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

function getRoomData() { return roomData; }
module.exports = { getRoomData };