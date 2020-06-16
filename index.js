if (!location.hash) {
    location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
let pc;
let drone;
const onSuccess = (msg) => { console.log(msg) };
const onError = (error) => {
    console.error(error);
};
const sendMessage = (msg) => {
    drone.publish({
        room: roomName,
        message: msg
    });
};

const roomHash = location.hash.substring(1);
const roomName = 'observable-' + roomHash;
// Room name needs to be prefixed with 'observable-'
const configuration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302' // Google's public STUN server
    }]
};

const startSignalingServer = (roomName) => {
    const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
    drone.on('open', error => {
        if (error) {
            return onError(error);
        }
        const room = drone.subscribe(roomName);
        room.on('open', error => {
            if (error) {
                onError(error);
            }
        });
        // We're connected to the room and received an array of 'members'
        // connected to the room (including us). Signaling server is ready.
        room.on('members', members => {
            if (members.length >= 3) {
                return alert('The room is full');
            }
            // If we are the second user to connect to the room we will be creating the offer
            const isOfferer = members.length === 2;
            startWebRTC(isOfferer);
            startListentingToSignals(room, drone);
        });
    });

    return drone;
}

const startWebRTC = (isOfferer) => {
    pc = new RTCPeerConnection(configuration);

    // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
    // message to the other peer through the signaling server
    pc.onicecandidate = event => {
        if (event.candidate) {
            sendMessage({ 'candidate': event.candidate });
        }
    };

    // If user is offerer let the 'negotiationneeded' event create the offer
    if (isOfferer) {
        pc.onnegotiationneeded = () => {
            pc.createOffer().then(localDescCreated).catch(onError);
        }
    }

    // When a remote stream arrives display it in the #remoteVideo element
    pc.onaddstream = event => {
        remoteVideo.srcObject = event.stream;
    };

    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    }).then(stream => {
        // Display your local video in #localVideo element
        localVideo.srcObject = stream;
        // Add your stream to be sent to the conneting peer
        pc.addStream(stream);
    }, onError);
}

const startListentingToSignals = (room, drone) => {
    // Listen to signaling data from Scaledrone
    room.on('data', (message, client) => {
        // Message was sent by us
        if (!client || client.id === drone.clientId) {
            return;
        }
        if (message.sdp) {
            // This is called after receiving an offer or answer from another peer
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                // When receiving an offer lets answer it
                if (pc.remoteDescription.type === 'offer') {
                    pc.createAnswer().then(localDescCreated).catch(onError);
                }
            }, onError);
        } else if (message.candidate) {
            // Add the new ICE candidate to our connections remote description
            pc.addIceCandidate(
                new RTCIceCandidate(message.candidate), () => { onSuccess('ICE candidate') }, onError
            );
        }
    });
}

const localDescCreated = (desc) => {
    pc.setLocalDescription(
        desc,
        () => sendMessage({ 'sdp': pc.localDescription }),
        onError
    );
}

drone = startSignalingServer(roomName);