// ===============================
// admin.js - AUTH + PAGE SWITCH
// ===============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";


// ------------------
// FIREBASE CONFIG
// ------------------
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


// ------------------
// DOM SELECTORS
// ------------------
const $ = (id) => document.getElementById(id);

const loginView = $("login-view");
const dashboardView = $("dashboard-view");
const errorMsg = $("error-msg");
const logoutLink = $("logout-link");

const navLinks = document.querySelectorAll(".sidebar a[data-page]");
const pages = document.querySelectorAll(".main-content section");


// ------------------
// PAGE SWITCHER
// ------------------
function showPage(page) {
  pages.forEach(p => p.classList.add("hidden"));
  const target = document.getElementById(`${page}-page`);
  if (target) target.classList.remove("hidden");

  navLinks.forEach(n => n.classList.remove("active"));
  const active = document.querySelector(`a[data-page="${page}"]`);
  if (active) active.classList.add("active");

  document.dispatchEvent(new CustomEvent("admin:pageChange", { detail: page }));
}

function showLogin() {
  loginView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
}

function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  showPage("overview"); // default view
}


// ------------------
// CHECK ADMIN ROLE
// ------------------
async function isAdmin(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return false;

    const role = snap.data().role;
    return role === "admin" || role === "superadmin";
  } catch {
    return false;
  }
}


// ------------------
// LOGIN BUTTON
// ------------------
$("admin-login-btn").addEventListener("click", async (e) => {
  e.preventDefault();

  const email = $("admin-email").value.trim();
  const pass = $("admin-pass").value;

  if (!email || !pass) {
    errorMsg.textContent = "Enter email and password";
    return;
  }

  errorMsg.textContent = "Checking...";
  errorMsg.style.color = "#6b7280";

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);

    const ok = await isAdmin(cred.user);
    if (!ok) {
      await signOut(auth);
      errorMsg.textContent = "Access denied: Admin only";
      errorMsg.style.color = "red";
      return;
    }

    errorMsg.textContent = "";
    showDashboard();

  } catch (err) {
    errorMsg.style.color = "red";
    errorMsg.textContent = "Invalid admin credentials";
  }
});


// ------------------
// LOGOUT
// ------------------
logoutLink.addEventListener("click", async () => {
  await signOut(auth);
  showLogin();
});


// ------------------
// SIDE NAV CLICK
// ------------------
navLinks.forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    showPage(page);
  });
});


// ------------------
// AUTH GUARD
// ------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) return showLogin();

  const ok = await isAdmin(user);
  if (!ok) {
    await signOut(auth);
    return showLogin();
  }

  showDashboard();
});
