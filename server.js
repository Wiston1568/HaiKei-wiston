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
const ejs = require('ejs')

const httpServer = createServer(app);

// FIX 1: Attach Socket.io to the existing httpServer
const io = new Server(httpServer, {   
    cors: {
        origin: "*", // Changed for production deployment
        methods: ["GET", "POST"]
    } 
});

const roomData = {};

io.on("connection", (socket) => {
  let room;
  setInterval(() => {
    checkRoomMembers(roomData);
  }, 1000);

  function createRoom(roomID) {
    room = roomID
    socket.join(room)
    roomData[room] = {
      users: {},
      hostID: socket.id,
      currentTime: 0,
      roomID: roomID,
      isPublic: true,
      roomName: "Untitled Room",
      roomDescription: "No description provided.",
      playing: false,
      currentManifest: "",
      isVideoCurrentlyPlaying: false,
    }
    roomData[room].users[socket.id] = {
      ping: -1,
      id: socket.id,
      isHost: true,
    }
  }

  function joinRoom(roomID) {
    room = roomID
    socket.join(room)
    if (roomData[room]) {
        roomData[room].users[socket.id] = {
            ping: -1,
            id: socket.id,
            isHost: false,
        }
        if (roomData[room].isVideoCurrentlyPlaying == true) {
            if (roomData[room].currentManifest == "") return;
            socket.emit("receiveUserVideoFromHost", {videoData: roomData[room].currentManifest, currentTime: roomData[room].currentTime});
        }
    }
  }

  socket.on("init", (data) => {
    if(io.sockets.adapter.rooms.get(data.roomID) != undefined && io.sockets.adapter.rooms.get(data.roomID).size > 0){
      joinRoom(data.roomID)
    } else {
      createRoom(data.roomID)
    }
  })

  socket.on('disconnect', () => {
    let idToRemove = socket.id
    if (roomData[room] !== undefined) {
      delete roomData[room].users[idToRemove]
    }
  });

  function checkRoomMembers() {
    if (roomData[room] == undefined) return
    if (Object.keys(roomData[room].users).length < 1) {
      delete roomData[room]
    }
  }

  socket.on("ping", (callback) => {
      callback();
  });

  socket.on("updateUserPing", (data) => {
    if (roomData[room] === undefined) return;
    roomData[room].users[socket.id].ping = data.ping;
    socket.emit("receiveNewUserList", {users: roomData[room].users}) 
    let shouldRotateHost = true; 
    for (let userId in roomData[room].users) {
      if (roomData[room].users.hasOwnProperty(userId)) {
        const user = roomData[room].users[userId];
        if (user.id == roomData[room].hostID) shouldRotateHost = false;
      }
    }
    if (shouldRotateHost) {
      const potentialHostList = Object.keys(roomData[room].users);
      if (potentialHostList.length > 0) {
          const newHostId = potentialHostList[Math.floor(Math.random() * potentialHostList.length)];
          roomData[room].hostID = newHostId;
          const newHostSocket = io.sockets.sockets.get(newHostId);
          roomData[room].users[newHostId].isHost = true;
          if (newHostSocket) newHostSocket.emit("receiveNewHostMessage", {message: "You are now the host!"});
      }
    }
  });

  socket.on("updateRoomName", (data) => {
    if (roomData[room] === undefined) return;
    if (roomData[room].users[socket.id].isHost == false) return socket.emit("permissionDenied", {message: "You are not the host!"});
    let cleanRoomName = filter.clean(data.newRoomName);
    roomData[room].roomName = cleanRoomName;
  })

  socket.on("updateRoomDescription", (data) => {
    if (roomData[room] === undefined) return;
    if (roomData[room].users[socket.id].isHost == false) return socket.emit("permissionDenied", {message: "You are not the host!"});
    let cleanRoomDescription = filter.clean(data.newRoomDescription);
    roomData[room].roomDescription = cleanRoomDescription;
  });

  socket.on("playVideo", async (data) => {
    try {
      if (roomData[room] === undefined) return;
      if (roomData[room].users[socket.id].isHost == false) return socket.emit("permissionDenied", {message: "You are not the host!"});
      if (data.videoID == undefined) return;
      let videoID = data.videoID;
      let showInfo = await getShowInfo(videoID);
      let malID = showInfo.malId;
      let videoInfo = await getSources(malID);
      socket.emit("receiveNewVideo", {videoData: videoInfo, showInfo: showInfo});
    } catch {
      return socket.emit("permissionDenied", {message: "An error occured while trying to obtain video info!"});
    }
  });

  socket.on("playNewVideo", async (data) => {
    if (roomData[room] === undefined) return;
    if (roomData[room].users[socket.id].isHost == false) return socket.emit("permissionDenied", {message: "You are not the host!"});
    if (data.showID == undefined) return socket.emit("permissionDenied", {message: "No video ID provided!"});
    roomData[room].isVideoCurrentlyPlaying = false;
    if (data.source == "gogoanime") {
      try {
        let sources = await getVideoSourcesGogoanime(data.episodeID);
        roomData[room].isVideoCurrentlyPlaying = true;
        return io.to(data.roomID).emit("sendNewVideo", { source: sources })
      } catch {
        return io.to(data.roomID).emit("permissionDenied", {message: "An error occured while trying to obtain video info!"});
      }
    }
    if (data.source == "zoro") {
      try {
        let sources = await getVideoSourcesZoro(data.zoroID, data.episodeNumber);
        roomData[room].isVideoCurrentlyPlaying = true;
        return io.to(data.roomID).emit("sendNewVideoZoro", { source: sources })
      } catch {
        return io.to(data.roomID).emit("permissionDenied", {message: "An error occured while trying to obtain video info!"});
      }
    }
  })

  socket.on("serverUpdateManifest", (data) => {
    if (roomData[room] === undefined) return;
    if (roomData[room].users[socket.id].isHost == false) return socket.emit("permissionDenied", {message: "You are not the host!"});
    roomData[room].currentManifest = data.currentManifest;
  })

  socket.on("updateVideoStatus", async (data) => {
    if (roomData[room] === undefined) return;
    if (roomData[room].users[socket.id].isHost == false) return socket.emit("permissionDenied", {message: "You are not the host!"});
    roomData[room].playing = data.status;
    if (roomData[room].playing == true) {
      io.in(data.roomID).emit("receiveVideoStatus", {status: "play"})
    } else {
      io.in(data.roomID).emit("receiveVideoStatus", {status: "pause"})
    }
  })
  
  socket.on("updateCurrentTime", (data) => {
    if (roomData[room] === undefined) return;
    if (roomData[room].users[socket.id].isHost == false) return socket.emit("permissionDenied", {message: "You are not the host!"});
    roomData[room].currentTime = data.currentTime;
    io.in(data.roomID).emit("receiveCurrentTime", {currentTime: roomData[room].currentTime})
  });
});

// REMOVED: io.listen(8000) - This causes Vercel crashes.

app.locals.pluralize = require('pluralize');

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    originAgentCluster: false,
    frameguard: false,
}))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// FIX 2: SQLite Storage Path
// Vercel is read-only except for /tmp.
app.use(session({
  name : '.HKSECURITY',
  secret: process.env.AUTH_SECRET || "tacocat",
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.db', dir: '/tmp' }) 
}));

app.use(flash());
app.use(limit({max: 10, period: 5 * 1000, message: "Request Limit Exceeded!" }), passport.authenticate('session'));

app.engine('ejs', ejs.renderFile);
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

// FIX 3: Use httpServer.listen instead of app.listen
httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

function getRoomData() {
  return roomData;
}

module.exports = { getRoomData };