'use strict';
const os = require('os');
const http = require('http');
const static = require('node-static');
const { Server } = require('socket.io');
const { Translate } = require('@google-cloud/translate').v2;


process.env.GOOGLE_APPLICATION_CREDENTIALS = ' '; //complete path of google json file
const translateClient = new Translate();


const staticServer = new static.Server();
const httpServer = http.createServer((req, res) => {
  staticServer.serve(req, res);
});
const PORT = 8080;

httpServer.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});


const io = new Server(httpServer);

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  
  const logToClient = (...messages) => {
    socket.emit('log', ['[Server]', ...messages]);
  };

  
  socket.on('translate', async (payload) => {
    try {
      const { text, lang } = JSON.parse(payload);
      console.log(`Translating "${text}" → ${lang}`);

      const [translatedText] = await translateClient.translate(text, lang);
      socket.emit('translated', translatedText);
    } catch (error) {
      console.error('Translation failed:', error.message);
      socket.emit('translation_error', 'Could not translate. Try again.');
    }
  });

  
  socket.on('send_to_server_raw', (data) => {
    console.log('Forwarding raw message');
    socket.broadcast.emit('to_client_raw', data);
  });

  
  socket.on('message', (msg) => {
    logToClient('Client sent:', msg);
    socket.broadcast.emit('message', msg);
  });


  socket.on('create or join', (room) => {
    const roomData = io.sockets.adapter.rooms.get(room);
    const numClients = roomData ? roomData.size : 0;

    console.log(`Room "${room}" has ${numClients} client(s)`);

    if (numClients === 0) {
      socket.join(room);
      socket.emit('created', room, socket.id);
      logToClient(`Created room: ${room}`);
    } else if (numClients === 1) {
      socket.join(room);
      io.to(room).emit('join', room);
      socket.emit('joined', room, socket.id);
      io.to(room).emit('ready');
      logToClient(`Joined room: ${room}`);
    } else {
      socket.emit('full', room);
      logToClient(`Room "${room}" is full`);
    }
  });

  

  socket.on('ipaddr', () => {
    const interfaces = os.networkInterfaces();
    Object.values(interfaces).flat().forEach((iface) => {
      if (iface.family === 'IPv4' && iface.address !== '127.0.0.1') {
        socket.emit('ipaddr', iface.address);
      }
    });
  });



  socket.on('bye', () => {
    console.log(`Client ${socket.id} said bye.`);
  });




  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

