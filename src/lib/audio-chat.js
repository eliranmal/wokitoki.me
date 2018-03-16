
import SimpleWebRTC from 'simplewebrtc';


const noop = () => void 0;

let room;
let localTrack;
let nick;

let started;
let webrtc;

const track = (name, info) => {
    if (webrtc && webrtc.connection) {
        webrtc.connection.emit('metrics', name, info || {});
    }
};

const start = () => {
    webrtc.startLocalVideo();
    started = true;
};

const createRoom = (roomName, onCreated) => {
    // todo - put a unique prefix here (app name? tab id? hashed roomName? all together?)
    // todo - i can use chrome.runtime.id here
    // room = 'wokitoki___' + roomName;
    room = roomName;
    doCreate(room, onCreated);
};

const leaveRoom = () => {
    doLeave();
    room = null;
};

const joinRoom = (roomName, done) => {
    room = roomName;
    doJoin(room, done);
};

const doCreate = (room, done) => {
    if (!started) {
        start();
    }
    webrtc.createRoom(room, (err, name) => {
        if (!err) {
            done(room);
        } else {
            console.debug('> audio-chat > error', err, room);
            if (err === 'taken') {
                console.debug('> audio-chat > room taken!');
                room = `${room}_${Date.now()}`;
                doCreate(room, done);
            }
        }
    });
};

const doLeave = () => {
    webrtc.leaveRoom();
    webrtc.stopLocalVideo();
    started = false;
};

const doJoin = (room, done) => {
    if (!started) {
        start();
    }
    webrtc.joinRoom(room, (err, res) => {
        if (err) {
            done();
            return;
        }
        window.setTimeout(() => {
            done();
        }, 1000);
    });
};

const toggleLocalEnabled = () => {
    if (!localTrack) {
        return;
    }
    localTrack.enabled = !localTrack.enabled;
};

const isLocalEnabled = () => {
    if (!localTrack) {
        return;
    }
    return localTrack.enabled;
};

const setLocalEnabled = (state) => {
    if (!localTrack) {
        return;
    }
    localTrack.enabled = !!state;
};

const broadcastNick = () => {
    if (webrtc && typeof nick === 'string') {
        console.debug('> audio-chat > broadcasting nickname to all peers', nick);
        webrtc.sendToAll('nickname', {nick});
    }
};

const unicastNick = (peer) => {
    if (peer && typeof nick === 'string') {
        console.debug('> audio-chat > unicasting nickname to peer', peer.id, nick);
        peer.send('nickname', {nick});
    }
};

const updateNick = (value) => {
    nick = value;
    broadcastNick();
};

const isPeerMuted = (peerId) => {
    var peer = webrtc.getPeers(peerId).shift();
    return peer && peer.videoEl && peer.videoEl.muted;
};

const setPeerMuted = (peerId, muted) => {
    var peer = webrtc.getPeers(peerId).shift();
    if (peer && peer.videoEl) {
        peer.videoEl.muted = !!muted;
    }
};

const GUM = ({
                 onReady = noop,
                 onConnectionReady = noop,
                 onLocalStream = noop,
                 onPeerConnectionStateChanged = noop,
                 onPeerCreated = noop,
                 onMessage = noop,
             }) => {

    webrtc = new SimpleWebRTC({
        // we don't do video
        localVideoEl: '',
        remoteVideosEl: '',
        autoRequestMedia: false,
        enableDataChannels: false,
        media: {
            audio: true,
            video: false
        },
    });

    webrtc.on('localStream', (stream) => {
        localTrack = stream.getAudioTracks()[0];
        // chrome.runtime.sendMessage({cmd: 'webrtcOnLocalStream'});
        onLocalStream(stream);
    });

    webrtc.on('readyToCall', () => {
        onReady();
    });

    webrtc.on('createdPeer', (peer) => {
        if (peer && peer.pc) {
            peer.firsttime = true;
            peer.pc.on('iceConnectionStateChange', (event) => {
                var state = peer.pc.iceConnectionState;

                onPeerConnectionStateChanged(peer.id, state);

                switch (state) {
                    case 'connected':
                    case 'completed':
                        if (peer.firsttime) {
                            peer.firsttime = false;
                            track('iceSuccess', {
                                session: peer.sid,
                                peerprefix: peer.browserPrefix,
                                prefix: webrtc.capabilities.prefix,
                                version: webrtc.capabilities.browserVersion
                            });
                        }
                        break;
                    case 'closed':
                        break;
                }
            });
        }

        onPeerCreated(peer.id);
    });

    webrtc.on('connectionReady', (sessionId) => {
        onConnectionReady(sessionId);
    });

    webrtc.connection.on('message', (message) => {
        var peers = webrtc.getPeers(message.from, message.roomType);
        if (!peers || !peers.length) return;
        var peer = peers[0];

        if (message.type === 'offer' || message.type === 'answer') {
            unicastNick(peer);
        }

        onMessage(peer.id, message);
    });

    // local p2p/ice failure
    webrtc.on('iceFailed', (peer) => {
        console.debug('> audio-chat > local fail', peer.sid);
        track('iceFailed', {
            source: 'local',
            session: peer.sid,
            peerprefix: peer.browserPrefix,
            prefix: webrtc.capabilities.prefix,
            version: webrtc.capabilities.browserVersion
        });
    });

    // remote p2p/ice failure
    webrtc.on('connectivityError', (peer) => {
        console.debug('> audio-chat > remote fail', peer.sid);
        track('iceFailed', {
            source: 'remote',
            session: peer.sid,
            peerprefix: peer.browserPrefix,
            prefix: webrtc.capabilities.prefix,
            version: webrtc.capabilities.browserVersion
        });
    });

};

const init = (options) => {
    GUM(options);
};


export default {
    init,
    start,
    createRoom,
    joinRoom,
    leaveRoom,
    updateNick,
    isPeerMuted,
    setPeerMuted,
    toggleLocalEnabled,
    setLocalEnabled,
    isLocalEnabled,
};

