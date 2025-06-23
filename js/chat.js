// Global variables
let currentChatRoom = null;
let chatPartner = null;
let currentUser = null;
let messagesListener = null;
let onlineStatusListener = null;

// Initialize chat page
async function initializeChat() {
    // Get data from localStorage
    currentChatRoom = localStorage.getItem('currentChatRoom');
    chatPartner = JSON.parse(localStorage.getItem('chatPartner') || '{}');
    currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    
    if (!currentChatRoom || !chatPartner.userId || !currentUser.uid) {
        showNotification('Invalid chat session', 'error');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }
    
    // Set chat partner name
    document.getElementById('chat-partner-name').textContent = chatPartner.userName;
    
    // Load existing messages
    await loadMessages();
    
    // Set up real-time listeners
    setupMessageListener();
    setupOnlineStatusListener();
    
    // Update user's online status
    await updateOnlineStatus(true);
    
    // Focus on message input
    document.getElementById('message-input').focus();
}

// Load existing messages
async function loadMessages() {
    try {
        const { ref, get, orderByKey } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const messagesRef = ref(database, `chats/${currentChatRoom}/messages`);
        const snapshot = await get(messagesRef);
        
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        if (snapshot.exists()) {
            const messages = snapshot.val();
            const messageArray = Object.entries(messages).map(([key, value]) => ({
                id: key,
                ...value
            }));
            
            // Sort messages by timestamp
            messageArray.sort((a, b) => a.timestamp - b.timestamp);
            
            messageArray.forEach(message => {
                displayMessage(message);
            });
            
            // Scroll to bottom
            scrollToBottom();
        }
        
    } catch (error) {
        console.error('Load messages error:', error);
        showNotification('Failed to load messages', 'error');
    }
}

// Set up real-time message listener
function setupMessageListener() {
    const { ref, onValue, orderByKey } = import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js').then(module => {
        const messagesRef = module.ref(database, `chats/${currentChatRoom}/messages`);
        
        messagesListener = module.onValue(messagesRef, (snapshot) => {
            if (snapshot.exists()) {
                const messages = snapshot.val();
                const messageArray = Object.entries(messages).map(([key, value]) => ({
                    id: key,
                    ...value
                }));
                
                // Sort messages by timestamp
                messageArray.sort((a, b) => a.timestamp - b.timestamp);
                
                // Get the last message
                const lastMessage = messageArray[messageArray.length - 1];
                
                // Check if this is a new message (not already displayed)
                const existingMessage = document.querySelector(`[data-message-id="${lastMessage.id}"]`);
                if (!existingMessage) {
                    displayMessage(lastMessage);
                    scrollToBottom();
                    
                    // Play notification sound for received messages
                    if (lastMessage.senderId !== currentUser.uid) {
                        playNotificationSound();
                    }
                }
            }
        });
    });
}

// Set up online status listener
function setupOnlineStatusListener() {
    const { ref, onValue } = import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js').then(module => {
        const userRef = module.ref(database, `users/${chatPartner.userId}`);
        
        onlineStatusListener = module.onValue(userRef, (snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                updateOnlineStatusDisplay(userData.isOnline, userData.lastSeen);
            }
        });
    });
}

// Update online status display
function updateOnlineStatusDisplay(isOnline, lastSeen) {
    const statusElement = document.getElementById('online-status');
    
    if (isOnline) {
        statusElement.textContent = 'Online';
        statusElement.className = 'status-online';
    } else {
        statusElement.textContent = lastSeen ? `Last seen ${formatTime(lastSeen)}` : 'Offline';
        statusElement.className = 'status-offline';
    }
}

// Send message
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const messageText = messageInput.value.trim();
    
    if (!messageText) {
        return;
    }
    
    try {
        const { ref, push, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const messagesRef = ref(database, `chats/${currentChatRoom}/messages`);
        
        const messageData = {
            text: messageText,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            timestamp: Date.now()
        };
        
        await push(messagesRef, messageData);
        
        // Clear input
        messageInput.value = '';
        messageInput.focus();
        
    } catch (error) {
        console.error('Send message error:', error);
        showNotification('Failed to send message', 'error');
    }
}

// Display message in chat
function displayMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.senderId === currentUser.uid ? 'own' : 'other'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    messageDiv.innerHTML = `
        <div class="message-content">
            ${message.senderId !== currentUser.uid ? `<div class="message-sender">${message.senderName}</div>` : ''}
            <div class="message-text">${escapeHtml(message.text)}</div>
            <div class="message-time">${formatTime(message.timestamp)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
}

// Handle Enter key press in message input
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Update user's online status
async function updateOnlineStatus(isOnline) {
    try {
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const updates = {
            isOnline: isOnline,
            lastSeen: Date.now()
        };
        
        await update(ref(database, `users/${currentUser.uid}`), updates);
        
    } catch (error) {
        console.error('Update online status error:', error);
    }
}

// Leave chat and return to main page
async function leaveChat() {
    // Clean up listeners
    if (messagesListener) {
        messagesListener();
    }
    if (onlineStatusListener) {
        onlineStatusListener();
    }
    
    // Update offline status
    await updateOnlineStatus(false);
    
    // Clear localStorage
    localStorage.removeItem('currentChatRoom');
    localStorage.removeItem('chatPartner');
    localStorage.removeItem('currentUser');
    
    // Redirect to main page
    window.location.href = 'index.html';
}

// Utility functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'just now';
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function playNotificationSound() {
    // Create a simple notification sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Handle page visibility for online status
document.addEventListener('visibilitychange', async () => {
    if (currentUser && currentUser.uid) {
        await updateOnlineStatus(!document.hidden);
    }
});

// Handle page unload
window.addEventListener('beforeunload', async () => {
    if (currentUser && currentUser.uid) {
        await updateOnlineStatus(false);
    }
});

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', initializeChat);