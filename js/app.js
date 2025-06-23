// Global variables
let currentUser = null;
let userPasscode = null;

// Show/Hide form sections
function showLogin() {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('chat-access-form').classList.add('hidden');
}

function showSignup() {
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('chat-access-form').classList.add('hidden');
}

function showChatAccess() {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('chat-access-form').classList.remove('hidden');
}

// Generate unique passcode
function generatePasscode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Sign up function
async function signUp() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    
    if (!name || !email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        // Import Firebase auth functions
        const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const { ref, set, get } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        // Create user account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Generate unique passcode
        let passcode;
        let isUnique = false;
        
        // Ensure passcode is unique
        while (!isUnique) {
            passcode = generatePasscode();
            const passcodeRef = ref(database, `passcodes/${passcode}`);
            const snapshot = await get(passcodeRef);
            isUnique = !snapshot.exists();
        }
        
        // Update user profile
        await updateProfile(user, { displayName: name });
        
        // Store user data and passcode in database
        await set(ref(database, `users/${user.uid}`), {
            name: name,
            email: email,
            passcode: passcode,
            createdAt: Date.now(),
            isOnline: true
        });
        
        // Store passcode mapping
        await set(ref(database, `passcodes/${passcode}`), {
            userId: user.uid,
            userName: name
        });
        
        currentUser = user;
        userPasscode = passcode;
        
        showNotification('Account created successfully!');
        displayUserPasscode(passcode);
        showChatAccess();
        
    } catch (error) {
        console.error('Sign up error:', error);
        
        // Handle specific Firebase auth errors
        let errorMessage = 'Failed to create account';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'This email is already registered. Please login or use a different email.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak. Please use at least 6 characters.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Please enter a valid email address.';
                break;
            case 'auth/operation-not-allowed':
                errorMessage = 'Email/password accounts are not enabled.';
                break;
            case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your internet connection.';
                break;
            default:
                errorMessage = error.message || 'Failed to create account';
        }
        
        showNotification(errorMessage, 'error');
    }
}

// Login function
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const { ref, get, update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        // Sign in user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Get user data
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            currentUser = user;
            userPasscode = userData.passcode;
            
            // Update online status
            await update(ref(database, `users/${user.uid}`), {
                isOnline: true,
                lastSeen: Date.now()
            });
            
            showNotification('Login successful!');
            displayUserPasscode(userData.passcode);
            showChatAccess();
        } else {
            showNotification('User data not found', 'error');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed', 'error');
    }
}

// Display user's passcode
function displayUserPasscode(passcode) {
    document.getElementById('user-passcode').textContent = passcode;
}

// Copy passcode to clipboard
function copyPasscode() {
    const passcode = document.getElementById('user-passcode').textContent;
    navigator.clipboard.writeText(passcode).then(() => {
        showNotification('Passcode copied to clipboard!');
    }).catch(() => {
        showNotification('Failed to copy passcode', 'error');
    });
}

// Enter chat with passcode
async function enterChat() {
    const enteredPasscode = document.getElementById('enter-passcode').value.trim().toUpperCase();
    
    if (!enteredPasscode) {
        showNotification('Please enter a passcode', 'error');
        return;
    }
    
    if (enteredPasscode === userPasscode) {
        showNotification('You cannot chat with yourself', 'error');
        return;
    }
    
    try {
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        // Check if passcode exists
        const passcodeRef = ref(database, `passcodes/${enteredPasscode}`);
        const snapshot = await get(passcodeRef);
        
        if (snapshot.exists()) {
            const passcodeData = snapshot.val();
            
            // Create chat room ID (consistent for both users)
            const chatRoomId = [userPasscode, enteredPasscode].sort().join('-');
            
            // Store chat room info in localStorage
            localStorage.setItem('currentChatRoom', chatRoomId);
            localStorage.setItem('chatPartner', JSON.stringify({
                userId: passcodeData.userId,
                userName: passcodeData.userName,
                passcode: enteredPasscode
            }));
            localStorage.setItem('currentUser', JSON.stringify({
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                passcode: userPasscode
            }));
            
            // Redirect to chat page
            window.location.href = 'chat.html';
            
        } else {
            showNotification('Invalid passcode', 'error');
        }
        
    } catch (error) {
        console.error('Enter chat error:', error);
        showNotification('Failed to enter chat', 'error');
    }
}

// Logout function
async function logout() {
    try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        if (currentUser) {
            // Update offline status
            await update(ref(database, `users/${currentUser.uid}`), {
                isOnline: false,
                lastSeen: Date.now()
            });
        }
        
        await signOut(auth);
        currentUser = null;
        userPasscode = null;
        
        // Clear form fields
        document.getElementById('signup-name').value = '';
        document.getElementById('signup-email').value = '';
        document.getElementById('signup-password').value = '';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('enter-passcode').value = '';
        
        showNotification('Logged out successfully');
        showSignup();
        
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Logout failed', 'error');
    }
}

// Handle authentication state changes
auth.onAuthStateChanged(async (user) => {
    if (user && !currentUser) {
        try {
            const { ref, get, update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
            
            // Get user data
            const userRef = ref(database, `users/${user.uid}`);
            const snapshot = await get(userRef);
            
            if (snapshot.exists()) {
                const userData = snapshot.val();
                currentUser = user;
                userPasscode = userData.passcode;
                
                // Update online status
                await update(ref(database, `users/${user.uid}`), {
                    isOnline: true,
                    lastSeen: Date.now()
                });
                
                displayUserPasscode(userData.passcode);
                showChatAccess();
            }
        } catch (error) {
            console.error('Auth state change error:', error);
        }
    }
});

// Handle page visibility change for online status
document.addEventListener('visibilitychange', async () => {
    if (currentUser) {
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        if (document.hidden) {
            // User left the page
            await update(ref(database, `users/${currentUser.uid}`), {
                isOnline: false,
                lastSeen: Date.now()
            });
        } else {
            // User returned to the page
            await update(ref(database, `users/${currentUser.uid}`), {
                isOnline: true
            });
        }
    }
});

// Handle page unload
window.addEventListener('beforeunload', async () => {
    if (currentUser) {
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        await update(ref(database, `users/${currentUser.uid}`), {
            isOnline: false,
            lastSeen: Date.now()
        });
    }
});