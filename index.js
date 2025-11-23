// client.js - Full rewrite (User side)
// Features:
// - Register / Login / Logout
// - Admin-login redirect button (goes to admin.html)
// - Rooms load from /rooms (realtime)
// - Booking creation with timestamp fields, serverTimestamp, userId
// - Prevent selecting/submitting past dates/times
// - Booking status area (realtime, scrollable list of latest bookings)
// - Friendly error handling for permission-denied, etc.

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ======================
   FIREBASE CONFIG
   ====================== */
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

/* ======================
   DOM helpers & refs
   ====================== */
const $ = id => document.getElementById(id);

// Forms / views
const loginForm = $('login-form');         // container for login view
const registerForm = $('register-form');   // container for register view
const bookingDashboard = $('booking-dashboard'); // main booking view container

// login/register forms (inner <form> elements)
const loginFormData = $('login-form-data');        // <form id="login-form-data">
const registerFormData = $('register-form-data');  // <form id="register-form-data">

// Booking form fields
const roomSelect = $('room-type');
const checkinInput = $('checkin');
const checkoutInput = $('checkout');
const totalDisplay = $('total-display');
const confirmBookingBtn = $('confirm-booking-btn');
const bookAgainBtn = $('book-again-btn');

// Confirmation UI
const confirmationDisplay = $('confirmation-display');
const bookingFormDataEl = $('booking-form-data');

// Booking status area
const statusSection = $('booking-status-section');
const statusCard = $('booking-status-card');
const refreshStatusBtn = $('refresh-status-btn');

// Misc
const welcomeMsg = $('welcome-msg');
const adminLoginBtn = $('admin-login-btn'); // button that redirects to admin.html

/* ======================
   SAFETY: ensure required nodes exist
   ====================== */
if (!roomSelect) console.warn('Warning: #room-type missing in DOM');
if (!checkinInput || !checkoutInput) console.warn('Warning: datetime inputs missing');
if (!confirmBookingBtn) console.warn('Warning: confirm booking button missing');

// ──────────────────────────────────────────────────────────────
// ULTRA SMOOTH & BULLETPROOF VIEW SWITCHER (2025 Edition)
// ──────────────────────────────────────────────────────────────
const views = {
    login:      document.getElementById('login-form'),
    register:   document.getElementById('register-form'),
    booking:    document.getElementById('booking-dashboard')
};

function showView(target) {
    // Hide lahat muna (with transition support)
    Object.values(views).forEach(view => {
        if (view) view.classList.add('hidden');
    });

    // Show yung target after a tiny delay para smooth ang transition
    requestAnimationFrame(() => {
        if (views[target]) {
            views[target].classList.remove('hidden');
        }
    });
}

// ──────────────────────────────────────────────────────────────
// SWITCH LINKS — ONE-LINER NA, SURE NA GUMAGANA
// ──────────────────────────────────────────────────────────────
document.getElementById('show-register')?.addEventListener('click', (e) => {
    e.preventDefault();
    showView('register');
});

document.getElementById('show-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    showView('login');
});

// Optional: Kung gusto mo ring ma-trigger sa keyboard (Enter/Space)
['show-register', 'show-login'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                el.click();
            }
        });
    }
});
/* ======================
   Date/time helpers — prevent past times
   ====================== */
function toLocalDatetimeString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function setMinDateTimeInputs() {
  const iso = toLocalDatetimeString();
  if (checkinInput) checkinInput.min = iso;
  if (checkoutInput) checkoutInput.min = iso;
  // if existing inputs are past, clear them
  try {
    const now = Date.now();
    if (checkinInput && checkinInput.value && new Date(checkinInput.value).getTime() < now) checkinInput.value = '';
    if (checkoutInput && checkoutInput.value && new Date(checkoutInput.value).getTime() < now) checkoutInput.value = '';
  } catch (e) { /* ignore parse errors */ }
}
setMinDateTimeInputs();

/* Validate before calculation or submission:
   - checkin & checkout must be present
   - checkin >= now
   - checkout > checkin
*/
function validateDateInputs() {
  if (!checkinInput || !checkoutInput) return false;
  const cin = new Date(checkinInput.value);
  const cout = new Date(checkoutInput.value);
  const now = Date.now();

  if (!checkinInput.value || !checkoutInput.value) {
    // don't alert; caller may handle
    return false;
  }

  if (isNaN(cin.getTime()) || isNaN(cout.getTime())) {
    alert('Invalid check-in or check-out date/time.');
    return false;
  }

  if (cin.getTime() < now) {
    alert('Check-in cannot be in the past.');
    checkinInput.value = '';
    return false;
  }

  if (cout.getTime() <= cin.getTime()) {
    alert('Check-out must be after check-in.');
    checkoutInput.value = '';
    return false;
  }

  return true;
}

/* ======================
   Room loader (realtime)
   ====================== */
let roomsUnsub = null;
function loadRoomsRealtime() {
  if (!roomSelect) return;
  // show loading placeholder
  roomSelect.innerHTML = '<option>Loading rooms…</option>';

  if (roomsUnsub) roomsUnsub();

  const q = query(collection(db, 'rooms'), orderBy('name'));
  roomsUnsub = onSnapshot(q, snap => {
    roomSelect.innerHTML = '';
    if (snap.empty) {
      roomSelect.innerHTML = '<option disabled>No rooms available</option>';
      return;
    }
    snap.forEach(d => {
      const r = d.data();
      const opt = document.createElement('option');
      opt.value = String(r.rate ?? 0); // store price as value for quick calculation
      opt.dataset.roomId = d.id;
      opt.dataset.beds = r.beds ?? '';
      opt.dataset.description = r.description ?? '';
      opt.textContent = `${r.name} (₱${r.rate}/room)`;
      roomSelect.appendChild(opt);
    });
    // recalc total if dates already chosen
    calculateTotal();
  }, err => {
    console.error('Rooms listener error:', err);
    roomSelect.innerHTML = '<option disabled>Error loading rooms</option>';
  });
}

/* ======================
   FIXED PRICE PER BOOKING — WALANG PER NIGHT NA!
   ====================== */
function calculateTotal() {
    // Basic check: may dates ba?
    if (!checkinInput?.value || !checkoutInput?.value) {
        totalDisplay && (totalDisplay.textContent = "Please select check-in and check-out");
        return null;
    }

    const cin = new Date(checkinInput.value);
    const cout = new Date(checkoutInput.value);
    const now = Date.now();

    // Validation
    if (cin.getTime() < now) {
        totalDisplay && (totalDisplay.textContent = "Check-in cannot be in the past");
        return null;
    }
    if (cout.getTime() <= cin.getTime()) {
        totalDisplay && (totalDisplay.textContent = "Check-out must be after check-in");
        return null;
    }

    // FIXED PRICE — hindi na titingin sa nights
    const fixedPrice = parseFloat(roomSelect?.value || "0");

    if (!fixedPrice || fixedPrice <= 0) {
        totalDisplay && (totalDisplay.textContent = "Please select a room");
        return null;
    }

    // Optional: ipakita pa rin ilang nights para may info (pero hindi na kasama sa computation)
    const nights = Math.ceil((cout.getTime() - cin.getTime()) / 86400000);

    // EXACT NA DISPLAY NA GUSTO MO → walang "rooms", fixed price lang
    totalDisplay.textContent = `Total: ₱${fixedPrice.toLocaleString()}`;

    // Return data — total = fixed price na
    return {
        price: fixedPrice,
        nights: nights,       // pwede pa rin gamitin sa booking record
        total: fixedPrice,    // ← eto na yung isesave sa Firestore
        cin,
        cout
    };
}

// REGISTER — 100% WORKING (no terms, no required issues)
document.getElementById('register-form-data')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('register-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');

    const name = document.getElementById('reg-name').value.trim() || 'Guest';
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const phone = document.getElementById('reg-phone').value.trim() || '';
    const pass = document.getElementById('reg-pass').value;
    const conf = document.getElementById('reg-conf').value;

    // Simple validation
    if (!email || !pass || !conf) return alert('Please fill in all required fields');
    if (pass !== conf) return alert('Passwords do not match');
    if (pass.length < 6) return alert('Password must be at least 6 characters');

    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, 'users', cred.user.uid), {
            name, email, phone, role: 'user', createdAt: serverTimestamp()
        });

        alert('Account created successfully!');
        showView('booking'); // auto go to dashboard
    } catch (err) {
        console.error(err);
        let msg = 'Registration failed. Please try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'Email is already registered';
        if (err.code === 'auth/invalid-email') msg = 'Invalid email address';
        if (err.code === 'auth/weak-password') msg = 'Password too weak';
        alert(msg);
    } finally {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
});
// Login
loginFormData?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('login-email')?.value?.trim();
  const pass = $('login-pass')?.value || '';
  if (!email || !pass) return alert('Enter email and password');

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged will show booking view
  } catch (err) {
    console.error('Login failed:', err);
    alert('Invalid email or password');
  }
});

// Forgot password
$('forgot-pass')?.addEventListener('click', async (ev) => {
  ev?.preventDefault();
  const email = prompt('Enter your registered email:');
  if (!email) return;
  try {
    await sendPasswordResetEmail(auth, email);
    alert('Reset email sent.');
  } catch (err) {
    console.error('Reset error:', err);
    alert('Failed to send reset email.');
  }
});

// Logout link (within booking view)
$('logout-link')?.addEventListener('click', async (ev) => {
  ev?.preventDefault();
  try {
    await signOut(auth);
    showView('login');
  } catch (err) {
    console.error('Logout error:', err);
    alert('Logout failed.');
  }
});

// Admin login redirect button (keeps admin auth on admin.html)
adminLoginBtn?.addEventListener('click', (ev) => {
  ev?.preventDefault();
  window.location.href = 'admin.html';
});

/* ======================
   BOOKING SUBMIT — FINAL, CLEAN & BULLETPROOF (2025 EDITION)
   ====================== */
confirmBookingBtn?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return alert('Please log in to book a room.');

    const data = calculateTotal();
    if (!data) return; // calculateTotal already shows error message

    // Final validation (past dates)
    const now = Date.now();
    if (data.cin.getTime() < now) return alert('Check-in cannot be in the past.');
    if (data.cout.getTime() <= data.cin.getTime()) return alert('Check-out must be after check-in.');

    // Get selected room safely
    const selectedOption = roomSelect?.selectedOptions?.[0];
    const roomName = selectedOption?.textContent?.trim() || 'Room';
    const roomId = selectedOption?.dataset?.roomId || null;

    // Final payload — clean, correct, no duplicates
    const payload = {
        userId: user.uid,
        userEmail: user.email || null,
        room: roomName,                    // e.g. "Ocean View Suite"
        roomId: roomId,
        nights: data.nights,               // e.g. 5
        total: data.total,                 // fixed price (e.g. 15000)
        checkin: Timestamp.fromDate(data.cin),
        checkout: Timestamp.fromDate(data.cout),
        status: 'pending',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'bookings'), payload);
        
        alert(`Booking confirmed!\n${roomName}\n₱${data.total.toLocaleString()} • ${data.nights} night${data.nights > 1 ? 's' : ''}`);

        // Auto-refresh status list
        loadBookingStatus();

        // Optional: reset form or keep dates
        bookingFormDataEl?.reset();
        setMinDateTimeInputs();
        calculateTotal();

    } catch (err) {
        console.error('Booking failed:', err);
        const msg = err.code === 'permission-denied'
            ? 'Permission denied. Check Firestore rules.'
            : 'Failed to submit booking. Please try again.';
        alert(msg);
    }
});


let statusUnsub = null;

function loadBookingStatus() {
  const user = auth.currentUser;
  const section = $('#booking-status-section');
  const list    = $('#booking-status-list');      // ← the scrollable container
  const card    = $('#booking-status-card');      // fallback card (optional)

  // ------------------------------------------------------------------
  // 1. User not logged in → hide everything and stop listening
  // ------------------------------------------------------------------
  if (!user) {
    section?.classList.add('hidden');
    if (statusUnsub) { statusUnsub(); statusUnsub = null; }
    return;
  }

  // ------------------------------------------------------------------
  // 2. User is logged in → make sure the section is visible
  // ------------------------------------------------------------------
  if (section) section.classList.remove('hidden');

  // If the modern list container doesn't exist yet → do nothing more this time
  if (!list) {
    // Old fallback: maybe show single card only
    if (card) card.classList.remove('hidden');
    return;
  }

  // ------------------------------------------------------------------
  // 3. We have the list → hide the old card and start listening
  // ------------------------------------------------------------------
  if (card) card.classList.add('hidden');
  list.innerHTML = '<div class="status-empty">Loading...</div>';

  // Cancel previous listener if any
  if (statusUnsub) statusUnsub();

  const q = query(
    collection(db, 'bookings'),
    where('userId', '==', user.uid),
    orderBy('createdAt', 'desc'),
    limit(15)
  );

  statusUnsub = onSnapshot(q, (snap) => {
    if (snap.empty) {
      list.innerHTML = '<div class="status-empty">No bookings yet.</div>';
      return;
    }

    list.innerHTML = ''; // clear "Loading..."

    snap.docs.forEach(docSnap => {
      const d = docSnap.data();

      const checkin  = d.checkin?.toDate?.()  || new Date(d.checkin);
      const checkout = d.checkout?.toDate?.() || new Date(d.checkout);

      const statusColor = {
        pending: 'orange',
        confirmed: 'green',
        cancelled: 'red',
        completed: '#555'
      }[d.status || 'pending'];

      const item = document.createElement('div');
      item.className = 'booking-status-item';
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:1.1em;">${d.nights || 'Room'}</div>
            <div style="color:#666;font-size:0.9em;margin:4px 0;">
              ${checkin.toLocaleDateString()} → ${checkout.toLocaleDateString()}
            </div>
            <div style="color:#444;font-size:0.85em;">
              ₱${d.total || 0} • ${d.nights || 0} room${d.nights > 1 ? 's' : ''}
            </div>
          </div>
          <div style="text-align:right;min-width:90px;">
            <div style="font-weight:700;color:${statusColor};">
              ${(d.status || 'pending').toUpperCase()}
            </div>
            <div style="font-size:0.7em;color:#999;margin-top:4px;">
              ${docSnap.id.slice(-8)}
            </div>
          </div>
        </div>
      `;
      list.appendChild(item);
    });
  }, (err) => {
    console.error('Booking status error:', err);
    list.innerHTML = '<div class="status-empty">Failed to load bookings.</div>';
  });
}

// Refresh button
$('#refresh-status-btn')?.addEventListener('click', loadBookingStatus);

/* ======================
   Auth state watcher
   ====================== */
onAuthStateChanged(auth, async (user) => {
  setMinDateTimeInputs();

  if (!user) {
    showView('login');
    // unsubscribe listeners
    if (roomsUnsub) { roomsUnsub(); roomsUnsub = null; }
    if (statusUnsub) { statusUnsub(); statusUnsub = null; }
    welcomeMsg && (welcomeMsg.textContent = 'Welcome!');
    return;
  }

  // show user booking dashboard
  welcomeMsg && (welcomeMsg.textContent = `Welcome, ${user.email?.split('@')[0] || 'Guest'}!`);
  showView('booking');

  // start realtime listeners
  loadRoomsRealtime();
  loadBookingStatus();
});

/* ======================
   Initialize small UI defaults
   ====================== */
(function init() {
  setMinDateTimeInputs();
  // If you want booking status list container by id, create <div id="booking-status-list"></div> inside #booking-status-section
})();

// EYE TOGGLE — Works on ALL password fields (login + register)
document.addEventListener('click', (e) => {
    if (!e.target.closest('.eye-toggle')) return;

    const toggle = e.target.closest('.eye-toggle');
    const wrapper = toggle.parentElement;
    const input = wrapper.querySelector('input');
    const eye = toggle.querySelector('.fa-eye');
    const eyeSlash = toggle.querySelector('.fa-eye-slash');

    if (input.type === 'password') {
        input.type = 'text';
        eye?.classList.add('hidden');
        eyeSlash?.classList.remove('hidden');
    } else {
        input.type = 'password';
        eye?.classList.remove('hidden');
        eyeSlash?.classList.add('hidden');
    }
});