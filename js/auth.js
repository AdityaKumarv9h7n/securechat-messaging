// auth.js (must use type="module")
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { ref, set, get, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// Global variables for session management
let currentUser = null;
let userPasscode = null;

// Generate unique passcode
function generatePasscode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Store user session data in localStorage
function storeUserSession(user, passcode, name) {
    const userData = {
        uid: user.uid,
        email: user.email,
        displayName: name || user.displayName,
        passcode: passcode
    };
    
    localStorage.setItem('currentUserSession', JSON.stringify(userData));
    localStorage.setItem('userPasscode', passcode);
}

// Show notification function
export function showNotification(message, type = 'success') {
    // Create notification element
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
        notification.remove();
    }, 3000);
}

// Handle authentication errors
function handleAuthError(error) {
    let errorMessage = 'Authentication failed';
    
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
        case 'auth/user-not-found':
            errorMessage = 'No account found with this email. Please sign up first.';
            break;
        case 'auth/wrong-password':
            errorMessage = 'Incorrect password. Please try again.';
            break;
        case 'auth/user-disabled':
            errorMessage = 'This account has been disabled.';
            break;
        case 'auth/too-many-requests':
            errorMessage = 'Too many failed attempts. Please try again later.';
            break;
        case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your internet connection.';
            break;
        case 'auth/operation-not-allowed':
            errorMessage = 'Email/password accounts are not enabled.';
            break;
        default:
            errorMessage = error.message || 'Authentication failed';
    }
    
    return errorMessage;
}

// Login function with proper session management
export async function login() {
    const email = document.getElementById('email')?.value || document.getElementById('login-email')?.value;
    const password = document.getElementById('password')?.value || document.getElementById('login-password')?.value;

    if (!email || !password) {
        showNotification('Please fill in all fields', 'error');
        return false;
    }

    try {
        // Sign in user
        const userCredential = await signInWithEmailAndPassword(window.auth, email, password);
        const user = userCredential.user;

        // Get user data from database
        const userRef = ref(window.database, `users/${user.uid}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            currentUser = user;
            userPasscode = userData.passcode;

            // Update online status
            await update(ref(window.database, `users/${user.uid}`), {
                isOnline: true,
                lastSeen: Date.now()
            });

            // Store user session data
            storeUserSession(user, userData.passcode, userData.name);

            showNotification('Login successful!');
            
            // Check if we should redirect to chat or main page
            const urlParams = new URLSearchParams(window.location.search);
            const redirect = urlParams.get('redirect');
            
            if (redirect === 'chat') {
                // Redirect to main page to show passcode interface
                window.location.href = 'index.html';
            } else {
                // Stay on current page or redirect to main interface
                if (window.location.pathname.includes('login.html')) {
                    window.location.href = 'index.html';
                }
            }
            
            return true;
        } else {
            showNotification('User data not found. Please contact support.', 'error');
            return false;
        }

    } catch (error) {
        console.error('Login error:', error);
        const errorMessage = handleAuthError(error);
        showNotification(errorMessage, 'error');
        return false;
    }
}

// Signup function with passcode generation
export async function signup() {
    const name = document.getElementById('signup-name')?.value || document.getElementById('name')?.value;
    const email = document.getElementById('signup-email')?.value || document.getElementById('email')?.value;
    const password = document.getElementById('signup-password')?.value || document.getElementById('password')?.value;

    if (!name || !email || !password) {
        showNotification('Please fill in all fields', 'error');
        return false;
    }

    if (password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return false;
    }

    try {
        // Create user account
        const userCredential = await createUserWithEmailAndPassword(window.auth, email, password);
        const user = userCredential.user;

        // Generate unique passcode
        let passcode;
        let isUnique = false;

        // Ensure passcode is unique
        while (!isUnique) {
            passcode = generatePasscode();
            const passcodeRef = ref(window.database, `passcodes/${passcode}`);
            const snapshot = await get(passcodeRef);
            isUnique = !snapshot.exists();
        }

        // Update user profile
        await updateProfile(user, { displayName: name });

        // Store user data and passcode in database
        await set(ref(window.database, `users/${user.uid}`), {
            name: name,
            email: email,
            passcode: passcode,
            createdAt: Date.now(),
            isOnline: true
        });

        // Store passcode mapping
        await set(ref(window.database, `passcodes/${passcode}`), {
            userId: user.uid,
            userName: name
        });

        currentUser = user;
        userPasscode = passcode;

        // Store user session data
        storeUserSession(user, passcode, name);

        showNotification('Account created successfully! Your passcode: ' + passcode);
        
        // Redirect to main page
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        
        return true;

    } catch (error) {
        console.error('Signup error:', error);
        const errorMessage = handleAuthError(error);
        showNotification(errorMessage, 'error');
        return false;
    }
}

// Logout function
export async function logout() {
    try {
        if (currentUser) {
            // Update offline status
            await update(ref(window.database, `users/${currentUser.uid}`), {
                isOnline: false,
                lastSeen: Date.now()
            });
        }

        await signOut(window.auth);

        // Clear all session data
        currentUser = null;
        userPasscode = null;
        localStorage.removeItem('currentUserSession');
        localStorage.removeItem('userPasscode');
        localStorage.removeItem('chatSession');
        localStorage.removeItem('currentChatRoom');
        localStorage.removeItem('chatPartner');
        localStorage.removeItem('currentUser');

        showNotification('Logged out successfully');
        
        // Redirect to login page
        window.location.href = 'login.html';
        
        return true;

    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Logout failed', 'error');
        return false;
    }
}

// Check if user is authenticated and has valid session
export function checkAuthState() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(window.auth, async (user) => {
            unsubscribe(); // Stop listening after first check
            
            if (user) {
                try {
                    // Get user data from database
                    const userRef = ref(window.database, `users/${user.uid}`);
                    const snapshot = await get(userRef);

                    if (snapshot.exists()) {
                        const userData = snapshot.val();
                        currentUser = user;
                        userPasscode = userData.passcode;

                        // Update online status
                        await update(ref(window.database, `users/${user.uid}`), {
                            isOnline: true,
                            lastSeen: Date.now()
                        });

                        // Store session data
                        storeUserSession(user, userData.passcode, userData.name);

                        resolve({
                            isAuthenticated: true,
                            user: user,
                            passcode: userData.passcode,
                            userData: userData
                        });
                    } else {
                        resolve({ isAuthenticated: false, error: 'User data not found' });
                    }
                } catch (error) {
                    console.error('Auth state check error:', error);
                    resolve({ isAuthenticated: false, error: error.message });
                }
            } else {
                resolve({ isAuthenticated: false });
            }
        });
    });
}

// Enter chat with passcode
export async function enterChat(enteredPasscode) {
    if (!enteredPasscode) {
        showNotification('Please enter a passcode', 'error');
        return false;
    }

    if (!currentUser || !userPasscode) {
        showNotification('Please login first', 'error');
        return false;
    }

    enteredPasscode = enteredPasscode.trim().toUpperCase();

    if (enteredPasscode === userPasscode) {
        showNotification('You cannot chat with yourself', 'error');
        return false;
    }

    try {
        // Check if passcode exists
        const passcodeRef = ref(window.database, `passcodes/${enteredPasscode}`);
        const snapshot = await get(passcodeRef);

        if (snapshot.exists()) {
            const passcodeData = snapshot.val();

            // Create chat room ID (consistent for both users)
            const chatRoomId = [userPasscode, enteredPasscode].sort().join('-');

            // Store complete chat session data
            const chatSessionData = {
                chatRoomId: chatRoomId,
                currentUser: {
                    uid: currentUser.uid,
                    displayName: currentUser.displayName,
                    passcode: userPasscode
                },
                chatPartner: {
                    userId: passcodeData.userId,
                    userName: passcodeData.userName,
                    passcode: enteredPasscode
                },
                timestamp: Date.now()
            };

            localStorage.setItem('chatSession', JSON.stringify(chatSessionData));

            // Also store individual items for backward compatibility
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

            showNotification('Connecting to chat...');

            // Redirect to chat page
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 500);

            return true;

        } else {
            showNotification('Invalid passcode', 'error');
            return false;
        }

    } catch (error) {
        console.error('Enter chat error:', error);
        showNotification('Failed to enter chat', 'error');
        return false;
    }
}

// Get current user session
export function getCurrentUser() {
    return {
        user: currentUser,
        passcode: userPasscode
    };
}

// Initialize auth state listener
export function initAuthListener() {
    onAuthStateChanged(window.auth, async (user) => {
        if (user && !currentUser) {
            try {
                const userRef = ref(window.database, `users/${user.uid}`);
                const snapshot = await get(userRef);

                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    currentUser = user;
                    userPasscode = userData.passcode;

                    // Update online status
                    await update(ref(window.database, `users/${user.uid}`), {
                        isOnline: true,
                        lastSeen: Date.now()
                    });

                    // Store session data
                    storeUserSession(user, userData.passcode, userData.name);
                }
            } catch (error) {
                console.error('Auth listener error:', error);
            }
        } else if (!user) {
            currentUser = null;
            userPasscode = null;
        }
    });
}

// Handle page visibility change for online status
function handleVisibilityChange() {
    if (currentUser) {
        if (document.hidden) {
            // User left the page
            update(ref(window.database, `users/${currentUser.uid}`), {
                isOnline: false,
                lastSeen: Date.now()
            }).catch(err => console.error('Visibility update error:', err));
        } else {
            // User returned to the page
            update(ref(window.database, `users/${currentUser.uid}`), {
                isOnline: true
            }).catch(err => console.error('Visibility update error:', err));
        }
    }
}

// Handle page unload
function handlePageUnload() {
    if (currentUser) {
        update(ref(window.database, `users/${currentUser.uid}`), {
            isOnline: false,
            lastSeen: Date.now()
        }).catch(() => {
            // Ignore errors on page unload
        });
    }
}

// Initialize event listeners
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', handlePageUnload);

// Export the current user variables for other modules
export { currentUser, userPasscode };