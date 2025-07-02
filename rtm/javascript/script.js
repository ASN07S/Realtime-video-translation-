'use strict';

let isReady = false;
let isHost = false;
let activeCall = false;
let localMedia;
let remoteMedia;
let peerConn;
let translatePayload;

const inputLang = $('#input_language');
const outputLang = $('#output_language');
const voiceChoice = $('#voice_number');

const session = 'rtm';
const connection = io.connect();

if (session !== '') {
  connection.emit('create or join', session);
}

connection.on('created', () => {
  isHost = true;
});

connection.on('engaged', () => {
  console.log('Room is engaged.');
});

connection.on('join', () => {
  isReady = true;
});

connection.on('joined', () => {
  isReady = true;
});

connection.on('log', (arr) => {
  console.log(...arr);
});

function send(data) {
  connection.emit('message', data);
}

function translateText(text) {
  translatePayload = { lang: outputLang.val(), text };
  connection.emit('test', JSON.stringify(translatePayload));
}

function sendRaw(text) {
  connection.emit('send_to_server_raw', text);
}

connection.on('message', (msg) => {
  if (msg === 'got user media') {
    initCall();
  } else if (msg.type === 'offer') {
    if (!isHost && !activeCall) initCall();
    peerConn.setRemoteDescription(new RTCSessionDescription(msg));
    answer();
  } else if (msg.type === 'answer' && activeCall) {
    peerConn.setRemoteDescription(new RTCSessionDescription(msg));
  } else if (msg.type === 'candidate' && activeCall) {
    const cand = new RTCIceCandidate({
      sdpMLineIndex: msg.label,
      candidate: msg.candidate
    });
    peerConn.addIceCandidate(cand);
  } else if (msg === 'See you soon ' && activeCall) {
    shutdown();
  }
});

connection.on('to_client_raw', (msg) => {
  translateText(msg);
});

connection.on('translated', (msg) => {
  speak(msg);
});

const cam1 = document.querySelector('#localVideo');
const cam2 = document.querySelector('#remoteVideo');

navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  .then((stream) => {
    localMedia = stream;
    cam1.srcObject = stream;
    send('got user media');
    if (isHost) initCall();
  })
  .catch((err) => alert('Camera  denied: ' + err.name));

function initCall() {
  if (!activeCall && localMedia && isReady) {
    peerConn = new RTCPeerConnection(null);
    peerConn.onicecandidate = handleIce;
    peerConn.onaddstream = showRemote;
    peerConn.onremovestream = () => {};
    peerConn.addStream(localMedia);
    activeCall = true;
    if (isHost) createOffer();
  }
}

window.onbeforeunload = () => send('bye');

function handleIce(event) {
  if (event.candidate) {
    send({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  }
}

function createOffer() {
  peerConn.createOffer()
    .then(applyLocal)
    .catch(console.log);
}

function answer() {
  peerConn.createAnswer()
    .then(applyLocal)
    .catch(console.log);
}

function applyLocal(desc) {
  peerConn.setLocalDescription(desc);
  send(desc);
}

function showRemote(e) {
  remoteMedia = e.stream;
  cam2.srcObject = remoteMedia;
}

function shutdown() {
  activeCall = false;
  peerConn.close();
  peerConn = null;
  isHost = false;
}

// ---- Voice Output ----

function speak(text) {
  const voice = new SpeechSynthesisUtterance();
  const options = speechSynthesis.getVoices();
  voice.lang = outputLang.val();
  if (voiceChoice.val() !== '-1') {
    voice.voice = options[voiceChoice.val()];
  }
  voice.text = text;
  voice.volume = 1;
  voice.rate = 1;
  voice.pitch = 1;
  window.speechSynthesis.speak(voice);
}

// ---- Speech Recognition ----

let mic;
try {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  mic = new SpeechRecognition();
} catch (e) {
  $('.no-browser-support').show();
  $('.app').hide();
}

const recorderUI = $('#note-textarea');
const recorderInfo = $('#recording-instructions');
const noteList = $('ul#notes');
let recordedText = '';

const saved = getNotes();
renderNotes(saved);

mic.continuous = true;

mic.onresult = (event) => {
  mic.lang = inputLang.val();
  const index = event.resultIndex;
  const phrase = event.results[index][0].transcript;
  const bug = (index === 1 && phrase === event.results[0][0].transcript);
  if (!bug) {
    sendRaw(phrase);
    recordedText += phrase;
    recorderUI.val(recordedText);
  }
};

mic.onstart = () => {
  recorderInfo.text('Listening...');
};

mic.onspeechend = () => {
  recorderInfo.text('Paused.');
};

mic.onerror = (e) => {
  if (e.error === 'no-speech') {
    recorderInfo.text('No voice detected.');
  }
};

// ---- Buttons ----

$('#start-record-btn').on('click', () => {
  if (recordedText.length) recordedText += ' ';
  mic.start();
});

$('#pause-record-btn').on('click', () => {
  mic.stop();
  recorderInfo.text('Stopped.');
});

recorderUI.on('input', function () {
  recordedText = $(this).val();
});

$('#save-note-btn').on('click', () => {
  mic.stop();
  if (!recordedText.length) {
    recorderInfo.text('Empty note not saved.');
  } else {
    saveNote(new Date().toLocaleString(), recordedText);
    recordedText = '';
    renderNotes(getNotes());
    recorderUI.val('');
    recorderInfo.text('Saved!');
  }
});

noteList.on('click', (e) => {
  const btn = $(e.target);
  if (btn.hasClass('listen-note')) {
    const note = btn.closest('.note').find('.content').text();
    speak(note);
  }
  if (btn.hasClass('delete-note')) {
    const time = btn.siblings('.date').text();
    deleteNote(time);
    btn.closest('.note').remove();
  }
});

// ---- Notes (Local Storage) ----

function renderNotes(notes) {
  let html = '';
  if (notes.length) {
    notes.forEach(n => {
      html += `<li class="note">
        <p class="header">
          <span class="date">${n.date}</span>
          <a href="#" class="listen-note">Listen to Note</a>
          <a href="#" class="delete-note">Delete</a>
        </p>
        <p class="content">${n.content}</p>
      </li>`;
    });
  } else {
    html = `<li><p class="content">No notes saved.</p></li>`;
  }
  noteList.html(html);
}

function saveNote(date, content) {
  localStorage.setItem('note-' + date, content);
}

function getNotes() {
  const list = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('note-')) {
      list.push({
        date: key.replace('note-', ''),
        content: localStorage.getItem(key)
      });
    }
  }
  return list;
}

function deleteNote(time) {
  localStorage.removeItem('note-' + time);
}
