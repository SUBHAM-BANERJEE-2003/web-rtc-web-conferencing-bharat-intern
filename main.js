import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  // your firebase configuration;
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};
document.addEventListener('DOMContentLoaded', function () {
  const togglevideobutton = document.getElementById('togglevideobtn')
  
  const togglemic = document.getElementById('togglemicbtn')

function toggleVideo() {
  console.log('Toggle Video Button Clicked'); // Debugging statement
  const videoTracks = localStream.getVideoTracks();
  videoTracks.forEach((track) => {
    track.enabled = !track.enabled;
  });
}

function toggleMicrophone() {
  console.log('Toggle Microphone Button Clicked'); // Debugging statement
  const audioTracks = localStream.getAudioTracks();
  audioTracks.forEach((track) => {
    track.enabled = !track.enabled;
  });
}

togglevideobutton.addEventListener('click', toggleVideo);
togglemic.addEventListener('click', toggleMicrophone);
});
let callId;
// 2. Create an offer
callButton.onclick = async () => {
  function generateCallId(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters.charAt(randomIndex);
    }
    return result;
  }
  const callId = generateCallId(10); 
  const callDoc = firestore.collection('calls').doc(callId);
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
    
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  // Generate the answer SDP
  const answerDescription = await pc.createAnswer();

  // Set the local description after creating the answer
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
const chatCollection = firestore.collection('chat');
const chatInput = document.querySelector('.chat-input');
const chatMessages = document.querySelector('.chat-messages');
const roomId = callId;

// Function to create a chat room with a subcollection for messages
const createChatRoom = async (roomId) => {
  // Check if the chat room already exists
  const chatRoomDoc = chatCollection.doc(roomId);
  const chatRoomDocSnapshot = await chatRoomDoc.get();

  if (!chatRoomDocSnapshot.exists) {
    // Create a new chat room document
    await chatRoomDoc.set({});

    // Create a subcollection called 'messages' within the chat room
    await chatRoomDoc.collection('messages').add({
      // You can add initial messages or other data if needed
      // For example: { message: 'Welcome to the chat!', sender: 'system', timestamp: firebase.firestore.FieldValue.serverTimestamp() }
    });
  }
};

// Function to send a chat message
const sendChatMessage = async (roomId, message) => {
  if (message && typeof message === 'string' && message.trim() !== '') {
    const messagesCollection = chatCollection.doc(roomId).collection('messages');

    const messageData = {
      message: message,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await messagesCollection.add(messageData);

    // Create a new div for the message
    const chatMessageElement = document.createElement('div');

    // Create a strong element for "Person-1" and append it to the div
    const strongElement = document.createElement('strong');
    strongElement.textContent = 'Person-1: ';
    chatMessageElement.appendChild(strongElement);

    // Append the message text to the div
    const messageText = document.createTextNode(message);
    chatMessageElement.appendChild(messageText);

    // Append the new div to the chat-messages element
    chatMessages.appendChild(chatMessageElement);

    chatInput.value = ''; // Clear the input field after sending the message
  }
};
// Event listener for the send button
const sendButton = document.querySelector('.send-button');
sendButton.addEventListener('click', () => {
  const message = chatInput.value.trim();
  const roomId = callId;
  console.log('clicked send button..')
  createChatRoom(roomId); // Create the chat room with a messages subcollection if it doesn't exist
  sendChatMessage(roomId, message); // Send the chat message
});
// Real-time listener for chat messages
chatCollection.doc(roomId).collection('messages')
  .orderBy('timestamp')
  .onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const chatMessage = change.doc.data();
          const chatMessageElement = document.createElement('div');
          chatMessageElement.textContent = chatMessage.message;
          chatMessages.appendChild(chatMessageElement);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      });
    },
    (error) => {
      console.error("Error getting chat messages:", error);
    }
  );

/// Add an event listener to the Hangup button
hangupButton.onclick = async () => {
  // Close the WebRTC PeerConnection
  pc.close();

  // Release the local media stream
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  // Remove video sources from video elements
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Disable the Hangup button
  hangupButton.disabled = true;

  // Reset other buttons or perform any necessary cleanup
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = false;

  // Remove the Firestore document and its subcollections
  const callDoc = firestore.collection('calls').doc(callId);
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

// Delete the documents within the "offerCandidates" subcollection
offerCandidates.get().then((querySnapshot) => {
  querySnapshot.forEach((doc) => {
    doc.ref.delete();
  });
}).then(() => {
  // After deleting the documents, delete the subcollection itself
  return firestore.collection('calls').doc(callId).collection('offerCandidates').delete();
}).catch((error) => {
  console.error("Error deleting offerCandidates subcollection: ", error);
});

// Repeat the same process for "answerCandidates"
answerCandidates.get().then((querySnapshot) => {
  querySnapshot.forEach((doc) => {
    doc.ref.delete();
  });
}).then(() => {
  return deleteCollection(firestore.collection('calls').doc(callId).collection('answerCandidates'));
}).catch((error) => {
  console.error("Error deleting answerCandidates subcollection: ", error);
});


// Select elements
const hamburgerButton = document.querySelector('.hamburger');
const chatBar = document.querySelector('.chat-bar');
const closeButton = document.querySelector('.close-button');

// Function to open the chat bar
function openChatBar() {
  chatBar.style.left = '0';
}

// Function to close the chat bar
function closeChatBar() {
  chatBar.style.left = '-300px'; // Move it off the screen to the left
}

// Toggle chat bar when hamburger button is clicked
hamburgerButton.addEventListener('click', () => {
  chatBar.classList.toggle('open'); // Toggle the 'open' class
  if (chatBar.classList.contains('open')) {
    openChatBar(); // Open the chat bar
  } else {
    closeChatBar(); // Close the chat bar
  }
});

// Close chat bar when close button is clicked
closeButton.addEventListener('click', () => {
  chatBar.classList.remove('open');
  closeChatBar();
});


}