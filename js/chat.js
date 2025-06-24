// Global variables
let currentChatRoom = null;
let chatPartner = null;
let currentUser = null;
let messagesListener = null;
let onlineStatusListener = null;

// Initialize chat page
async function initializeChat() {
    try {
        // Get data from localStorage with better validation
        const chatSessionData = localStorage.getItem('chatSession');
        currentChatRoom = localStorage.getItem('currentChatRoom');
        
        // Try to get data from the comprehensive chatSession first
        if (chatSessionData) {
            try {
                const sessionData = JSON.parse(chatSessionData);
                currentChatRoom = sessionData.chatRoomId;
                chatPartner = sessionData.chatPartner;
                currentUser = sessionData.currentUser;
            } catch (e) {
                console.error('Error parsing chat session data:', e);
            }
        }
        
        // Fallback to individual localStorage items
        if (!chatPartner || !currentUser) {
            const chatPartnerData = localStorage.getItem('chatPartner');
            const currentUserData = localStorage.getItem('currentUser');
            
            try {
                chatPartner = chatPartnerData ? JSON.parse(chatPartnerData) : null;
                currentUser = currentUserData ? JSON.parse(currentUserData) : null;
            } catch (e) {
                console.error('Error parsing localStorage data:', e);
                chatPartner = null;
                currentUser = null;
            }
        }
        
        // Enhanced validation with better error messages
        if (!currentChatRoom) {
            console.error('Missing chat room ID');
            showInvalidSessionError('No chat room found');
            return;
        }
        
        if (!chatPartner || !chatPartner.userId || !chatPartner.userName) {
            console.error('Missing or invalid chat partner data:', chatPartner);
            showInvalidSessionError('Chat partner information missing');
            return;
        }
        
        if (!currentUser || !currentUser.uid || !currentUser.displayName) {
            console.error('Missing or invalid current user data:', currentUser);
            showInvalidSessionError('User session invalid');
            return;
        }
        
        console.log('Chat session initialized:', {
            chatRoom: currentChatRoom,
            partner: chatPartner.userName,
            user: currentUser.displayName
        });
        
        // Set chat partner name
        const partnerNameElement = document.getElementById('chat-partner-name');
        if (partnerNameElement) {
            partnerNameElement.textContent = chatPartner.userName;
        }
        
        // Load existing messages
        await loadMessages();
        
        // Set up real-time listeners
        await setupMessageListener();
        await setupOnlineStatusListener();
        
        // Update user's online status
        await updateOnlineStatus(true);
        
        // Focus on message input
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.focus();
        }
        
        console.log('Chat initialization completed successfully');
        
    } catch (error) {
        console.error('Chat initialization error:', error);
        showInvalidSessionError('Failed to initialize chat');
    }
}

// Show invalid session error and redirect
function showInvalidSessionError(message) {
    console.error('Invalid chat session:', message);
    showNotification(`Invalid chat session: ${message}`, 'error');
    
    // Clear potentially corrupted session data
    localStorage.removeItem('chatSession');
    localStorage.removeItem('currentChatRoom');
    localStorage.removeItem('chatPartner');
    localStorage.removeItem('currentUser');
    
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 3000);
}

// Load existing messages
async function loadMessages() {
    try {
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const messagesRef = ref(window.database, `chats/${currentChatRoom}/messages`);
        const snapshot = await get(messagesRef);
        
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) {
            console.error('Messages container not found');
            return;
        }
        
        messagesContainer.innerHTML = '';
        
        if (snapshot.exists()) {
            const messages = snapshot.val();
            const messageArray = Object.entries(messages).map(([key, value]) => ({
                id: key,
                ...value
            }));
            
            // Sort messages by timestamp
            messageArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
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
async function setupMessageListener() {
    try {
        const { ref, onValue, off } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const messagesRef = ref(window.database, `chats/${currentChatRoom}/messages`);
        
        // Clean up existing listener
        if (messagesListener) {
            off(messagesRef, 'value', messagesListener);
        }
        
        messagesListener = onValue(messagesRef, (snapshot) => {
            if (snapshot.exists()) {
                const messages = snapshot.val();
                const messageArray = Object.entries(messages).map(([key, value]) => ({
                    id: key,
                    ...value
                }));
                
                // Sort messages by timestamp
                messageArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                
                // Get the last message
                if (messageArray.length > 0) {
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
            }
        });
        
    } catch (error) {
        console.error('Setup message listener error:', error);
    }
}

// Set up online status listener
async function setupOnlineStatusListener() {
    try {
        const { ref, onValue, off } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const userRef = ref(window.database, `users/${chatPartner.userId}`);
        
        // Clean up existing listener
        if (onlineStatusListener) {
            off(userRef, 'value', onlineStatusListener);
        }
        
        onlineStatusListener = onValue(userRef, (snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                updateOnlineStatusDisplay(userData.isOnline, userData.lastSeen);
            }
        });
        
    } catch (error) {
        console.error('Setup online status listener error:', error);
    }
}

// Update online status display
function updateOnlineStatusDisplay(isOnline, lastSeen) {
    const statusElement = document.getElementById('online-status');
    if (!statusElement) return;
    
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
    if (!messageInput) return;
    
    const messageText = messageInput.value.trim();
    
    if (!messageText) {
        return;
    }
    
    if (!currentUser || !currentUser.uid) {
        showNotification('User session invalid', 'error');
        return;
    }
    
    try {
        const { ref, push } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const messagesRef = ref(window.database, `chats/${currentChatRoom}/messages`);
        
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
    if (!messagesContainer) return;
    
    // Check if message already exists
    const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
    if (existingMessage) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.senderId === currentUser.uid ? 'own' : 'other'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    const isOwn = message.senderId === currentUser.uid;
    const senderName = isOwn ? 'You' : (message.senderName || chatPartner.userName);
    
    messageDiv.innerHTML = `
        <div class="message-content">
            ${!isOwn ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
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
    if (!currentUser || !currentUser.uid) return;
    
    try {
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        const updates = {
            isOnline: isOnline,
            lastSeen: Date.now()
        };
        
        await update(ref(window.database, `users/${currentUser.uid}`), updates);
        
    } catch (error) {
        console.error('Update online status error:', error);
    }
}

// Leave chat and return to main page
async function leaveChat() {
    try {
        // Clean up listeners
        if (messagesListener) {
            const { ref, off } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
            const messagesRef = ref(window.database, `chats/${currentChatRoom}/messages`);
            off(messagesRef, 'value', messagesListener);
            messagesListener = null;
        }
        
        if (onlineStatusListener) {
            const { ref, off } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
            const userRef = ref(window.database, `users/${chatPartner.userId}`);
            off(userRef, 'value', onlineStatusListener);
            onlineStatusListener = null;
        }
        
        // Update offline status
        await updateOnlineStatus(false);
        
        // Clear localStorage
        localStorage.removeItem('chatSession');
        localStorage.removeItem('currentChatRoom');
        localStorage.removeItem('chatPartner');
        localStorage.removeItem('currentUser');
        
        // Redirect to main page
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('Leave chat error:', error);
        // Still redirect even if there's an error
        window.location.href = 'index.html';
    }
}

// Utility functions
function formatTime(timestamp) {
    if (!timestamp) return 'Unknown time';
    
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
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function playNotificationSound() {
    try {
        // Create a simple notification sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        // Ignore audio errors
        console.log('Audio notification failed:', error);
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        transition: all 0.3s ease;
        ${type === 'success' ? 'background-color: #4CAF50;' : 'background-color: #f44336;'}
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
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

// Global functions for HTML access
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.leaveChat = leaveChat;

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', initializeChat);