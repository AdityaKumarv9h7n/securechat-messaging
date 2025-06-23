// auth.js (must use type="module")
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

export async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    await signInWithEmailAndPassword(window.auth, email, password);
    alert('✅ Login successful!');
    window.location.href = 'chat.html'; // or your post-login page
  } catch (err) {
    alert('❌ Login failed: ' + err.message);
  }
}
