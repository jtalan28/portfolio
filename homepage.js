// homepage.js — Pelagic Beach Resort Public Homepage + User Menu + Realtime Bookings
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  where,
  orderBy,
  limit,
  serverTimestamp,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCTF9CrRbUvYxNTlI1r02LMgtJtEHfeBfY",
  authDomain: "pelagics-33950.firebaseapp.com",
  projectId: "pelagics-33950",
  storageBucket: "pelagics-33950.firebasestorage.app",
  messagingSenderId: "764984436106",
  appId: "1:764984436106:web:20323e7ce2b3fcfe1c5473"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Helper
const $ = (id) => document.getElementById(id);

// ==================== AUTH MODAL (Login/Register) ====================
const modalHTML = `
<div id="auth-modal" class="modal hidden">
  <div class="modal-content">
    <span id="close-modal" style="float:right;cursor:pointer;font-size:28px;font-weight:bold;">&times;</span>
    
    <div id="login-view">
      <h2>Welcome Back</h2>
      <form id="login-form">
        <input type="email" id="login-email" placeholder="Email" required />
        <div style="position:relative">
          <input type="password" id="login-pass" placeholder="Password" required />
          <span class="eye-toggle">Show</span>
        </div>
        <button type="submit">Log In</button>
        <p style="margin:12px 0;font-size:14px;text-align:center;">
          New here? <a href="#" id="switch-to-register" style="color:#0b7db0;font-weight:600;">Create an account</a>
        </p>
      </form>
    </div>

    <div id="register-view" class="hidden">
      <h2>Create Account</h2>
      <form id="register-form">
        <input type="text" id="reg-name" placeholder="Full Name" required />
        <input type="email" id="reg-email" placeholder="Email" required />
        <input type="tel" id="reg-phone" placeholder="Phone (optional)" />
        <div style="position:relative">
          <input type="password" id="reg-pass" placeholder="Password (6+ chars)" minlength="6" required />
          <span class="eye-toggle">Show</span>
        </div>
        <div style="position:relative">
          <input type="password" id="reg-conf" placeholder="Confirm Password" required />
          <span class="eye-toggle">Show</span>
        </div>
        <button type="submit">Create Account</button>
        <p style="margin:12px 0;font-size:14px;text-align:center;">
          Have an account? <a href="#" id="switch-to-login" style="color:#0b7db0;font-weight:600;">Log in</a>
        </p>
      </form>
    </div>
  </div>
</div>`;

document.body.insertAdjacentHTML('beforeend', modalHTML + `
<style>
  .modal{position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;pointer-events:none;transition:opacity .3s}
  .modal:not(.hidden){opacity:1;pointer-events:all}
  .modal-content{background:#fff;padding:32px;border-radius:16px;width:90%;max-width:420px;box-shadow:0 20px 40px rgba(0,0,0,0.2);position:relative;animation:modalIn .3s forwards}
  @keyframes modalIn{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}
  .modal input, .modal button{width:100%;padding:14px;margin:10px 0;border-radius:10px;border:1px solid #ddd;font-size:15px}
  .modal button{background:#0b7db0;color:white;font-weight:700;cursor:pointer;transition:background .2s}
  .modal button:hover{background:#095a80}
  .eye-toggle{position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;color:#666;font-size:14px;user-select:none}
  .hidden{display:none!important}
</style>`);

// Modal Elements
const modal = $('#auth-modal');
const loginView = $('#login-view');
const registerView = $('#register-view');

function openModal() { modal.classList.remove('hidden'); }
function closeAuthModal() { modal.classList.add('hidden'); }

// Modal Controls
$('#close-modal')?.addEventListener('click', closeAuthModal);
modal.addEventListener('click', (e) => e.target === modal && closeAuthModal());

$('#switch-to-register')?.addEventListener('click', (e) => { e.preventDefault(); loginView.classList.add('hidden'); registerView.classList.remove('hidden'); });
$('#switch-to-login')?.addEventListener('click', (e) => { e.preventDefault(); registerView.classList.add('hidden'); loginView.classList.remove('hidden'); });

// Eye Toggle
document.addEventListener('click', (e) => {
  if (!e.target.classList.contains('eye-toggle')) return;
  const input = e.target.previousElementSibling;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  e.target.textContent = isPass ? 'Hide' : 'Show';
});

// ==================== USER MENU + DROPDOWN BOOKINGS ====================
document.head.insertAdjacentHTML('beforeend', `
<style>
  #user-menu-item{position:relative}
  #user-dropdown{display:none;position:absolute;right:0;top:100%;background:#fff;border:1px solid #e0e0e0;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.15);min-width:240px;overflow:hidden;z-index:1000}
  .dropdown-item{display:block;padding:12px 18px;color:#333;text-decoration:none;font-size:14px;transition:background .2s}
  .dropdown-item:hover{background:#f0f8ff}
  .dropdown-item i{width:20px;margin-right:10px;color:#0b7db0}
  #user-name-display{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
  #dropdown-bookings-container .booking-item{padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:13px}
  #dropdown-bookings-container .booking-item:last-child{border-bottom:none}
</style>`);

// Inject User Menu (safe)
if (!$('user-icon-link') && document.querySelector('nav ul')) {
  document.querySelector('nav ul').insertAdjacentHTML('beforeend', `
    <li id="user-menu-item">
      <a href="#" id="user-icon-link" style="display:flex;align-items:center;gap:8px;font-weight:600;">
        <i class="fas fa-user-circle" style="font-size:22px;color:#0b7db0;"></i>
        <span id="user-name-display">Guest</span>
        <i class="fas fa-chevron-down" style="font-size:12px;color:#888;margin-left:4px;"></i>
      </a>
      <div id="user-dropdown">
        <div id="dropdown-bookings-container" style="display:none;">
          <div style="padding:14px 18px;font-weight:700;font-size:13px;color:#0b7db0;background:#f8fbff;border-bottom:1px solid #eee;">
            Recent Bookings
          </div>
          <div id="dropdown-bookings-list">
            <div style="padding:20px;text-align:center;color:#999;font-size:13px;">Loading...</div>
          </div>
        </div>
        <a href="profile.html" class="dropdown-item"><i class="fas fa-user"></i> My Profile</a>
        <a href="profile.html" class="dropdown-item"><i class="fas fa-calendar-check"></i> My Bookings</a>
        <hr style="margin:6px 0;border:none;border-top:1px solid #eee;">
        <a href="#" id="menu-logout" class="dropdown-item" style="display:none;color:#e74c3c;">
          <i class="fas fa-sign-out-alt"></i> Logout
        </a>
        <a href="#" id="menu-login" class="dropdown-item">
          <i class="fas fa-sign-in-alt"></i> Sign In / Register
        </a>
      </div>
    </li>
  `);
}

// User Menu Elements
const userLink = $('#user-icon-link');
const userDropdown = $('#user-dropdown');
const userDisplay = $('#user-name-display');
const menuLogin = $('#menu-login');
const menuLogout = $('#menu-logout');
const bookingsContainer = $('#dropdown-bookings-container');
const bookingsList = $('#dropdown-bookings-list');

userLink?.addEventListener('click', (e) => {
  e.preventDefault();
  userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
});

document.addEventListener('click', (e) => {
  if (userLink && !userLink.contains(e.target) && userDropdown && !userDropdown.contains(e.target)) {
    userDropdown.style.display = 'none';
  }
});

menuLogin?.addEventListener('click', (e) => { e.preventDefault(); openModal(); userDropdown.style.display = 'none'; });
menuLogout?.addEventListener('click', async (e) => { e.preventDefault(); await signOut(auth); userDropdown.style.display = 'none'; });

// ==================== BOOK NOW BUTTONS → profile.html ====================
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    auth.currentUser ? window.location.href = "profile.html" : openModal();
  });
});

// ==================== REALTIME BOOKINGS SA DROPDOWN ====================
let bookingsUnsub = null;

function loadUserBookings(user) {
  if (!bookingsList || !bookingsContainer) return;
  bookingsContainer.style.display = 'block';

  if (bookingsUnsub) bookingsUnsub();

  const q = query(
    collection(db, 'bookings'),
    where('userId', '==', user.uid),
    orderBy('createdAt', 'desc'),
    limit(5)
  );

  bookingsUnsub = onSnapshot(q, (snap) => {
    if (snap.empty) {
      bookingsList.innerHTML = `<div style="padding:16px;text-align:center;color:#999;font-size:13px;">No bookings yet</div>`;
      return;
    }

    bookingsList.innerHTML = '';
    snap.docs.forEach(doc => {
      const d = doc.data();
      const checkin = d.checkin?.toDate?.() || new Date();
      const checkout = d.checkout?.toDate?.() || new Date();
      const statusColor = { pending: '#e67e22', confirmed: '#27ae60', cancelled: '#e74c3c', completed: '#95a5a6' }[d.status || 'pending'];

      bookingsList.insertAdjacentHTML('beforeend', `
        <div class="booking-item">
          <div style="font-weight:600;color:#2c3e50;">${d.room || 'Room'}</div>
          <div style="color:#7f8c8d;font-size:12px;margin:3px 0;">
            ${checkin.toLocaleDateString()} → ${checkout.toLocaleDateString()}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <span style="font-weight:700;color:#0b7db0;">₱${(d.total || 0).toLocaleString()}</span>
            <span style="font-size:10px;padding:3px 8px;background:${statusColor};color:white;border-radius:4px;">
              ${(d.status || 'pending').toUpperCase()}
            </span>
          </div>
        </div>
      `);
    });
  });
}

// ==================== AUTH STATE (MAIN LOGIC) ====================
onAuthStateChanged(auth, (user) => {
  if (user) {
    const name = user.displayName || user.email.split('@')[0];
    userDisplay.textContent = name.length > 14 ? name.substring(0, 14) + '..' : name;
    menuLogin.style.display = 'none';
    menuLogout.style.display = 'block';
    loadUserBookings(user);
  } else {
    userDisplay.textContent = 'Guest';
    menuLogin.style.display = 'block';
    menuLogout.style.display = 'none';
    bookingsContainer.style.display = 'none';
    if (bookingsUnsub) { bookingsUnsub(); bookingsUnsub = null; }
  }
});

// ==================== LOGIN & REGISTER HANDLERS ====================
$('#login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass = $('#login-pass').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    closeAuthModal();
  } catch (err) {
    alert('Invalid email or password');
  }
});

$('#register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#reg-name').value.trim() || 'Guest';
  const email = $('#reg-email').value.trim().toLowerCase();
  const phone = $('#reg-phone').value.trim();
  const pass = $('#reg-pass').value;
  const conf = $('#reg-conf').value;

  if (pass !== conf) return alert("Passwords don't match");
  if (pass.length < 6) return alert("Password too short");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), { name, email, phone, role: 'user', createdAt: serverTimestamp() });
    alert('Welcome to Pelagic Beach Resort!');
    closeAuthModal();
  } catch (err) {
    alert(err.code === 'auth/email-already-in-use' ? 'Email already registered' : 'Registration failed');
  }
});

console.log("Pelagic Homepage Fully Loaded — Professional & Ready!");