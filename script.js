
const GH_SUPABASE_URL = 'https://okisjizcyidvvwdwehaa.supabase.co';
const GH_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9raXNqaXpjeWlkdnZ3ZHdlaGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTYzNjMsImV4cCI6MjA5ODM5MjM2M30.O_0EeK297a07B7FLunpWr6HDlqrfP5Z8Owyp3qE4hQE';

if (!window.supabase) {
  console.error('script.js: supabase-js must be loaded before script.js');
}
const ghSupabase = window.supabase.createClient(GH_SUPABASE_URL, GH_SUPABASE_ANON_KEY);


async function ghTrackQuery(query) {
  const q = (query || '').trim();
  if (!q) throw new Error('Enter a container, booking ref, truck reg, or driver name');
  const { data, error } = await ghSupabase.rpc('public_track_lookup', { p_query: q });
  if (error) throw new Error(error.message || 'Lookup failed');
  if (!data) throw new Error('No matching record found');
  return data;
}


async function ghFleetStatus() {
  const { data, error } = await ghSupabase.rpc('public_fleet_status');
  if (error) throw new Error(error.message || 'Could not load fleet status');
  return { trucks: data || [] };
}


async function ghSubmitBooking(payload) {
  const id = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
  const { error } = await ghSupabase.from('public_bookings').insert(Object.assign({ id }, payload));
  if (error) throw new Error(error.message || 'Booking failed — please try again');
  return { booking: { id } };
}


async function ghSubmitContact(payload) {
  const { error } = await ghSupabase.from('public_contact_messages').insert(payload);
  if (error) throw new Error(error.message || 'Message failed — please try again');
  return { ok: true };
}


function ghMapAuthUser(u) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    name: meta.name || u.email,
    email: u.email,
    phone: meta.phone || '',
    company: meta.company || '',
    role: meta.role || '',
    created: u.created_at ? new Date(u.created_at).toLocaleDateString() : '—',
  };
}

async function ghAuthRegister({ name, email, phone, company, role, password }) {
  const { data, error } = await ghSupabase.auth.signUp({
    email, password,
    options: { data: { name, phone, company, role } },
  });
  if (error) throw new Error(error.message || 'Could not create account. Please try again.');
  
  return { user: ghMapAuthUser(data.user), needsEmailConfirmation: !data.session };
}

async function ghAuthLogin({ email, password }) {
  const { data, error } = await ghSupabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message || 'Incorrect email or password. Please try again.');
  return { user: ghMapAuthUser(data.user) };
}

async function ghAuthLogout() {
  const { error } = await ghSupabase.auth.signOut();
  if (error) throw new Error(error.message || 'Could not sign out. Please try again.');
}


async function ghAuthCurrentUser() {
  const { data, error } = await ghSupabase.auth.getSession();
  if (error || !data.session) return null;
  return ghMapAuthUser(data.session.user);
}

window.bridge = {
  trackQuery: ghTrackQuery,
  fleetStatus: ghFleetStatus,
  submitBooking: ghSubmitBooking,
  submitContact: ghSubmitContact,
  authRegister: ghAuthRegister,
  authLogin: ghAuthLogin,
  authLogout: ghAuthLogout,
  authCurrentUser: ghAuthCurrentUser,
};


(function () {
'use strict';


const state = {
  currentPage: 'home',
  bookingRefNumber: null,
  selectedCargoType: 'Depot Storage',
  faqFilter: 'all',
  trackInterval: null,
  heroSlideIndex: 0,
  heroSlideInterval: null
};


const ROUTE_FACTOR = {
  'Mombasa Port (KPA)': 0,
  'APM Terminals': 1,
  'APM Terminals Mombasa': 1,
  'Gargo Haven Depot': 2,
  'Consolebase ICD': 3,
  'Hakika Depot': 3.2,
  'Hakika Container Depot': 3.2,
  'Kibarani Depot': 2.6,
  'Fortune Container Depot': 3.6,
  'Client Yard / Factory': 4.2
};

const CONTAINER_SIZE_RATE = {
  '20ft Standard': 8500,
  '40ft Standard': 11000,
  '40ft High Cube': 12500,
  '45ft High Cube': 13500,
  '20ft Reefer': 15500,
  '40ft Reefer': 18500,
  'Flat-Rack / Open Top': 14000
};

const STORAGE_RATE_PER_TEU_DAY = 350;


const FAQ_DATA = [
 { cat: 'depot', q: 'What are your depot storage rates?', a: 'Our standard depot storage rate is KES 350 per TEU per day, which includes CCTV-monitored yard storage, gate-in/gate-out service, and EIR documentation. Bulk and long-term rates are available on request.' },
  { cat: 'depot', q: 'Do you store both empty and laden containers?', a: 'Gargo Haven primarily specialises in empty container storage and depot management. We do not store laden cargo containers, but we can arrange short-term holding for containers awaiting stuffing or de-stuffing through our partner facilities.' },
  { cat: 'depot', q: 'What is your gate-in / gate-out turnaround time?', a: 'Our digital gate management system processes containers in under 30 minutes on average. With 4 gate lanes and biometric access control, we keep queues to a minimum even during peak vessel discharge periods.' },
  { cat: 'tracking', q: 'How do I track my container?', a: 'Visit the Track page and search by container number, booking reference, truck registration, or EIR number. You will see real-time GPS location, current status, and a full movement timeline.' },
  { cat: 'tracking', q: 'How often is GPS location updated?', a: 'All trucks in our fleet are fitted with GPS telematics that update location every 60 seconds while in transit. Depot yard positions are updated in real time as containers are moved by our reach stackers.' },
  { cat: 'tracking', q: 'Can I get SMS or email alerts on container status?', a: 'Yes. Clients with a registered account can opt in to SMS and email notifications for key milestones — gate-in, gate-out, dispatch, and delivery. Contact our support team to enable alerts on your account.' },
  { cat: 'transport', q: 'Which routes do you cover in Mombasa?', a: 'We cover all major Mombasa container corridors, including Mombasa Port (KPA), APM Terminals, Consolebase ICD, Hakika Depot, Kibarani Depot, and Fortune Container Depot, plus direct delivery to client yards.' },
  { cat: 'transport', q: 'How much does port haulage cost?', a: 'Port haulage starts from KES 8,500 per move depending on origin, destination, and container size. Use the Cost Estimator on our homepage or the live quote calculator on the Booking page for an instant estimate.' }, 
  { cat: 'transport', q: 'Do you offer reefer truck transport?', a: 'Yes, we operate genset-equipped reefer trucks capable of maintaining temperatures as low as -25°C, suitable for pharmaceutical and perishable cargo movements across all our service corridors.' },
  { cat: 'docs', q: 'What documentation do I receive after a move?', a: 'You will receive a digital Equipment Interchange Receipt (EIR), a gate pass, and a movement/delivery receipt for every transaction. All documents are paperless and accessible through your client portal.' },
  { cat: 'docs', q: 'Are you KPA licensed and IICL certified?', a: 'Yes. Gargo Haven is a KPA-licensed depot operator, IICL-certified for container inspection and repair, KRA-compliant for customs documentation, and ISO 9001 certified for quality management.' },
  { cat: 'docs', q: 'How do I file a claim for container damage?', a: 'Damage claims can be filed through our Claims Portal or by contacting our support team directly with your EIR number and supporting photos. Our team will respond with an assessment within 48 hours.' }
];


const TICKER_ITEMS = [
  '🚢 KPA LICENSED DEPOT OPERATOR',
  '📦 5,000+ TEU CAPACITY AT MIRITINI',
  '🚛 120+ GPS-TRACKED TRUCKS',
  '⚡ 30-MINUTE GATE TURNAROUND',
  '❄️ 200+ REEFER PLUG-IN POINTS',
  '🛡 IICL CERTIFIED · ISO 9001',
  '📡 LIVE CONTAINER & TRUCK TRACKING',
  '🕐 24/7 DEPOT OPERATIONS'
];



const TRACK_SAMPLES = {
  container: {
    'MSCU1234567': {
      route: 'APM Terminals → Gargo Haven Depot', eta: 'Today, 14:30', status: 'On Truck — In Transit', statusClass: 'status-transit',
      truckReg: 'KCB 421G', driver: 'Ali Hassan Mwangi', phone: '+254 700 111 222', location: 'Moi Ave, approaching Makupa Causeway', speed: '48 km/h', gps: '2 minutes ago',
      timeline: [
        { t: 'Today, 12:05', e: 'Gate-out from APM Terminals', done: true },
        { t: 'Today, 12:20', e: 'Departed on truck KCB 421G', done: true },
        { t: 'Today, 13:10', e: 'Passed Makupa Causeway checkpoint', done: true },
        { t: 'Today, 14:30 (Est.)', e: 'Gate-in at Gargo Haven Depot', done: false }
      ]
    },
    'TCKU9876543': {
      route: 'Mombasa Port (KPA) → Gargo Haven Depot', eta: 'Today, 16:00', status: 'In Depot Yard', statusClass: 'status-pending',
      truckReg: '—', driver: '—', phone: '—', location: 'Zone A — General Storage, Gargo Haven Depot', speed: '0 km/h', gps: '5 minutes ago',
      timeline: [
        { t: 'Yesterday, 09:15', e: 'Gate-in at Mombasa Port (KPA)', done: true },
        { t: 'Yesterday, 11:40', e: 'Loaded onto truck for transfer', done: true },
        { t: 'Yesterday, 13:55', e: 'Gate-in at Gargo Haven Depot', done: true },
        { t: 'Yesterday, 14:10', e: 'Placed in Zone A — General Storage', done: true }
      ]
    },
    'GHTU0001234': {
      route: 'Gargo Haven Depot → Consolebase ICD', eta: 'Tomorrow, 09:00', status: 'Scheduled — Awaiting Dispatch', statusClass: 'status-pending',
      truckReg: 'KDB 889T', driver: 'Fatma Said Omar', phone: '+254 700 333 555', location: 'Gargo Haven Depot — Gate 2 staging area', speed: '0 km/h', gps: '12 minutes ago',
      timeline: [
        { t: 'Today, 10:00', e: 'Booking confirmed', done: true },
        { t: 'Today, 10:30', e: 'Truck assigned — KDB 889T', done: true },
        { t: 'Tomorrow, 09:00 (Est.)', e: 'Scheduled dispatch from depot', done: false },
        { t: 'Tomorrow, 10:15 (Est.)', e: 'Gate-in at Consolebase ICD', done: false }
      ]
    }
  },
  truck: {
    'KCB 421G': { reg: 'KCB 421G', driver: 'Ali Hassan Mwangi', loc: 'Makupa Causeway, Mombasa' },
    'KDB 889T': { reg: 'KDB 889T', driver: 'Fatma Said Omar', loc: 'Gargo Haven Depot, Gate 2' },
    'ALI HASSAN': { reg: 'KCB 421G', driver: 'Ali Hassan Mwangi', loc: 'Makupa Causeway, Mombasa' }
  }
};


function fmt(num) {
  return Math.round(num).toLocaleString('en-US');
}
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }


function initLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  window.setTimeout(function () {
    loader.classList.add('hidden');
    window.setTimeout(function () {
      loader.style.display = 'none';
    }, 600);
  }, 1100);
}


function showNotification(title, sub, icon) {
  const notif = document.getElementById('notification');
  const textEl = document.getElementById('notif-text');
  const subEl = document.getElementById('notif-sub');
  const iconEl = notif ? notif.querySelector('.notif-icon') : null;
  if (!notif) return;
  if (textEl) textEl.textContent = title;
  if (subEl) subEl.textContent = sub;
  if (iconEl && icon) iconEl.textContent = icon;
  notif.classList.add('show');
  window.clearTimeout(notif._hideTimer);
  notif._hideTimer = window.setTimeout(function () {
    notif.classList.remove('show');
  }, 4200);
}



function openModal(title, html) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  if (!overlay) return;
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = html;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}
window.closeModal = closeModal;
function initModal() {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
}


function initTicker() {
  const inner = document.getElementById('tickerInner');
  if (!inner) return;
  const doubled = TICKER_ITEMS.concat(TICKER_ITEMS);
  inner.innerHTML = doubled.map(function (item) {
    return '<span class="ticker-item">' + item + '</span>';
  }).join('<span class="ticker-sep">  •  </span>');
}


function initHeroSlideshow() {
  const slides = $$('.hero-slide-content');
  const indicators = $$('.indicator');
  if (!slides.length) return;

  const totalSlides = slides.length;
  const SLIDE_DURATION = 6000; 

  function goToSlide(index) {
    
    slides.forEach(function(slide) {
      slide.classList.remove('active');
    });
    indicators.forEach(function(ind) {
      ind.classList.remove('active');
    });

    
    slides[index].classList.add('active');
    if (indicators[index]) indicators[index].classList.add('active');

    state.heroSlideIndex = index;
  }


  state.heroSlideInterval = window.setInterval(function() {
    const nextIndex = (state.heroSlideIndex + 1) % totalSlides;
    goToSlide(nextIndex);
  }, SLIDE_DURATION);

  
  indicators.forEach(function(indicator, idx) {
    indicator.addEventListener('click', function() {
      window.clearInterval(state.heroSlideInterval);
      goToSlide(idx);
     
      state.heroSlideInterval = window.setInterval(function() {
        const nextIndex = (state.heroSlideIndex + 1) % totalSlides;
        goToSlide(nextIndex);
      }, SLIDE_DURATION);
    });
  });

  
  goToSlide(0);
}


function navigateToPage(pageId) {
  const pages = $$('.page');
  pages.forEach(function (p) { p.classList.remove('active-page'); });
  const target = document.getElementById(pageId + '-page');
  if (target) {
    target.classList.add('active-page');
  } else if (document.getElementById('home-page')) {
    document.getElementById('home-page').classList.add('active-page');
    pageId = 'home';
  }
  state.currentPage = pageId;

 
  $$('.nav-link, .mobile-nav-link').forEach(function (link) {
    link.classList.remove('active-link');
  });

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  
  if (pageId === 'booking') initBookingPage();
  if (pageId === 'track') initTrackPage();
  if (pageId === 'fleet') initFleetLivePanel();
  if (pageId === 'home' || pageId === undefined) {
    runCalc();
  }

  if (typeof window.closeMobileMenu === 'function') {
    window.closeMobileMenu();
}
}
window.navigateToPage = navigateToPage;

function initScrollTop() {
  const btn = document.getElementById('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', function () {
    if (window.scrollY > 480) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });
}


function initChatbot() {
  const btn = document.getElementById('chatbotBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    openModal('Gargo Haven Support', [
      '<p style="margin-bottom:14px;color:var(--gray-pale);line-height:1.7;">Hi there 👋 Need help with a booking, tracking, or a general enquiry? Reach our 24/7 team directly, or jump to the right page below.</p>',
      '<div style="display:flex;flex-direction:column;gap:10px;">',
      '<a href="tel:+254116307751" style="color:var(--gold);font-weight:600;">📞 Call 24/7 Operations: +254 7116307751</a>',
      '<a href="https://wa.me/254108613789" target="_blank" rel="noopener" style="color:var(--gold);font-weight:600;">💬 WhatsApp: +254 108613789</a>',
      '<a href="mailto:info@gargo.co.ke" style="color:var(--gold);font-weight:600;">📧 info@gargo.co.ke</a>',
      '</div>',
      '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">',
      '<button class="btn-primary" onclick="closeModal();navigateToPage(\'booking\')">Make a Booking</button>',
      '<button class="btn-secondary" onclick="closeModal();navigateToPage(\'track\')">Track a Container</button>',
      '</div>'
    ].join(''));
  });
}



function runCalc() {
  const originEl = document.getElementById('calcOrigin');
  const destEl = document.getElementById('calcDest');
  const qtyEl = document.getElementById('calcWeight');
  const sizeEl = document.getElementById('calcService');
  const routeOut = document.getElementById('calcRoute');
  const totalOut = document.getElementById('calcTotal');
  if (!originEl || !destEl || !sizeEl) return;

  const origin = originEl.value;
  const dest = destEl.value;
  const qty = Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1);
  const baseRate = parseFloat(sizeEl.value) || 11000;
  const sizeLabel = sizeEl.options[sizeEl.selectedIndex].textContent.replace(' Standard', '').replace(' Cube', 'Cube');

  let factor = 1;
  if (origin === dest) {
    factor = 0.4;
  } else {
    const fOrigin = ROUTE_FACTOR[origin] !== undefined ? ROUTE_FACTOR[origin] : 2;
    const fDest = ROUTE_FACTOR[dest] !== undefined ? ROUTE_FACTOR[dest] : 2;
    factor = Math.max(0.6, 1 + Math.abs(fOrigin - fDest) * 0.18);
  }

  const total = baseRate * factor * qty;

  if (routeOut) {
    routeOut.textContent = origin + ' → ' + dest + ' · ' + sizeLabel.replace('40ft Standard', '40ft').replace('20ft Standard', '20ft');
  }
  if (totalOut) totalOut.textContent = fmt(total);
}
window.runCalc = runCalc;


function renderFaq() {
  const list = document.getElementById('faqList');
  if (!list) return;
  const items = state.faqFilter === 'all' ? FAQ_DATA : FAQ_DATA.filter(function (f) { return f.cat === state.faqFilter; });
  list.innerHTML = items.map(function (item, i) {
    return (
      '<div class="faq-item">' +
        '<div class="faq-q" onclick="window.__toggleFaq(this)">' +
          '<span>' + item.q + '</span>' +
          '<span class="faq-arrow">›</span>' +
        '</div>' +
        '<div class="faq-a">' + item.a + '</div>' +
      '</div>'
    );
  }).join('');
}
function toggleFaq(qEl) {
  const isOpen = qEl.classList.contains('open');
  $$('.faq-q').forEach(function (q) {
    q.classList.remove('open');
    const ans = q.parentElement.querySelector('.faq-a');
    if (ans) ans.classList.remove('visible');
  });
  if (!isOpen) {
    qEl.classList.add('open');
    const ans = qEl.parentElement.querySelector('.faq-a');
    if (ans) ans.classList.add('visible');
  }
}
window.__toggleFaq = toggleFaq;
function faqFilter(cat, btnEl) {
  state.faqFilter = cat;
  $$('.faq-tab-btn').forEach(function (b) { b.classList.remove('faq-active'); });
  if (btnEl) btnEl.classList.add('faq-active');
  renderFaq();
}
window.faqFilter = faqFilter;


function generateBookingRef() {
  const num = Math.floor(1000 + Math.random() * 8999);
  return 'GH-2024-' + num;
}
function initBookingPage() {
  const refEl = document.getElementById('bookingRef');
  if (refEl && (!state.bookingRefNumber || refEl.textContent.indexOf('PENDING') !== -1)) {
    state.bookingRefNumber = generateBookingRef();
    refEl.textContent = state.bookingRefNumber;
  }
  const dateEl = document.getElementById('fDate');
  if (dateEl && !dateEl.value) {
    const today = new Date().toISOString().split('T')[0];
    dateEl.min = today;
  }
  calcQuote();
}
function selectCargoType(el) {
  $$('.cargo-type-btn').forEach(function (b) { b.classList.remove('selected'); });
  el.classList.add('selected');
  state.selectedCargoType = el.textContent.trim();
  calcQuote();
}
window.selectCargoType = selectCargoType;
function calcQuote() {
  const quoteOut = document.getElementById('liveQuote');
  if (!quoteOut) return;
  const sizeEl = document.getElementById('fContainerSize');
  const qtyEl = document.getElementById('fPackages');
  const durationEl = document.getElementById('fDuration');
  const originEl = document.getElementById('fOrigin');
  const destEl = document.getElementById('fDest');

  const qty = Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 0);
  const duration = Math.max(0, parseInt(durationEl && durationEl.value, 10) || 0);
  const sizeLabel = sizeEl ? sizeEl.value : '40ft Standard';
  const haulageBase = CONTAINER_SIZE_RATE[sizeLabel] || 11000;

  let total = 0;

  if (state.selectedCargoType === 'Depot Storage') {
    const teu = sizeLabel.indexOf('40ft') !== -1 || sizeLabel.indexOf('45ft') !== -1 ? 2 : 1;
    total = STORAGE_RATE_PER_TEU_DAY * teu * Math.max(duration, 1) * qty;
  } else if (state.selectedCargoType === 'Port Haulage' || state.selectedCargoType === 'Full Transport Package') {
    const origin = originEl ? originEl.value : 'Mombasa Port (KPA)';
    const dest = destEl ? destEl.value : 'Gargo Haven Depot';
    const fOrigin = ROUTE_FACTOR[origin] !== undefined ? ROUTE_FACTOR[origin] : 2;
    const fDest = ROUTE_FACTOR[dest] !== undefined ? ROUTE_FACTOR[dest] : 2;
    const factor = origin === dest ? 0.4 : Math.max(0.6, 1 + Math.abs(fOrigin - fDest) * 0.18);
    total = haulageBase * factor * qty;
    if (state.selectedCargoType === 'Full Transport Package') {
      total += STORAGE_RATE_PER_TEU_DAY * Math.max(duration, 1) * qty;
    }
  } else if (state.selectedCargoType === 'Container Repair') {
    total = 6500 * qty;
  } else if (state.selectedCargoType === 'Container Washing') {
    total = 3200 * qty;
  } else if (state.selectedCargoType === 'Reefer Management') {
    total = 950 * Math.max(duration, 1) * qty + haulageBase * 0.3 * qty;
  } else {
    total = haulageBase * qty;
  }

  quoteOut.textContent = 'KES ' + fmt(total);
}
window.calcQuote = calcQuote;
function submitBooking() {
  const required = [
    { id: 'fName', label: 'Full Name' },
    { id: 'fEmail', label: 'Email Address' },
    { id: 'fPhone', label: 'Phone / WhatsApp' }
  ];
  let missing = [];
  required.forEach(function (f) {
    const el = document.getElementById(f.id);
    if (!el || !el.value.trim()) missing.push(f.label);
  });
  if (missing.length) {
    showNotification('Missing Information', 'Please fill in: ' + missing.join(', '), '⚠️');
    const firstMissingEl = document.getElementById(required[0].id);
    if (firstMissingEl) firstMissingEl.focus();
    return;
  }

  const emailEl = document.getElementById('fEmail');
  if (emailEl && !/^\S+@\S+\.\S+$/.test(emailEl.value.trim())) {
    showNotification('Invalid Email', 'Please enter a valid email address.', '⚠️');
    emailEl.focus();
    return;
  }

  const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const quoteText = (document.getElementById('liveQuote') || {}).textContent || '';
  const quoteAmount = parseInt(quoteText.replace(/[^\d]/g, ''), 10) || null;

  const payload = {
    full_name: get('fName'),
    email: get('fEmail'),
    phone: get('fPhone'),
    company: get('fCompany'),
    service_type: state.selectedCargoType || 'Depot Storage',
    cargo_type: get('fContainerSize'),
    container: get('fContainerNo'),
    pickup_location: get('fOrigin'),
    dropoff_location: get('fDest'),
    pickup_date: get('fDate'),
    quote_amount: quoteAmount,
    notes: get('fNotes')
  };

  const btn = document.querySelector('.form-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'SUBMITTING…'; }

  window.bridge.submitBooking(payload)
    .then(function (data) {
      const ref = data.booking.id;
      state.bookingRefNumber = ref;
      const refEl = document.getElementById('bookingRef');
      if (refEl) refEl.textContent = ref;

      showNotification('Booking Submitted', 'Reference #' + ref + ' created', '✅');

      openModal('Booking Confirmed', [
        '<p style="color:var(--gray-pale);line-height:1.7;margin-bottom:14px;">Thank you! Your booking request has been received.</p>',
        '<div style="background:rgba(201,162,39,0.08);border:1px solid var(--gold-dark);border-radius:8px;padding:16px;margin-bottom:14px;">',
        '<div style="font-size:13px;color:var(--gray-pale);">Booking Reference</div>',
        '<div style="font-size:22px;font-weight:700;color:var(--gold);">' + ref + '</div>',
        '</div>',
        '<p style="color:var(--gray-pale);line-height:1.7;">Service: <strong style="color:#fff;">' + state.selectedCargoType + '</strong><br>Our team will confirm your booking within 2 hours via the contact details provided.</p>',
        '<button class="btn-primary" style="margin-top:16px;width:100%;" onclick="closeModal()">Got It</button>'
      ].join(''));
    })
    .catch(function (err) {
      showNotification('Booking Failed', err.message || 'Please try again', '❌');
    })
    .finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT BOOKING →'; }
    });
}
window.submitBooking = submitBooking;



function renderTimeline(events) {
  return events.map(function (ev, idx) {
    const isNextPending = !ev.done && (idx === 0 || events[idx - 1].done);
    const dotClass = ev.done ? 'done' : (isNextPending ? 'active' : '');
    return (
      '<div class="timeline-event">' +
      '<div class="te-time">' + ev.t + '</div>' +
      '<div class="te-dot-wrap"><div class="te-dot ' + dotClass + '"></div></div>' +
      '<div><div class="te-event">' + ev.e + '</div></div>' +
      '</div>'
    );
  }).join('');
}
function doTrack() {
  const inputEl = document.getElementById('trackInput');
  const query = (inputEl ? inputEl.value : '').trim();
  const resultEl = document.getElementById('trackResult');
  if (!query) {
    showNotification('Enter a Container, Booking Ref, Truck Reg, or Driver Name', 'e.g. MSCU1234567, GH-2024-0001, KDA 221C', 'ℹ️');
    return;
  }

  window.bridge.trackQuery(query)
    .then(function (details) {
      renderTrackResult(details, query);
      if (resultEl) resultEl.classList.add('visible');
      showNotification('Record found', 'Trip ' + details.trip.id + ' – ' + details.trip.status, '✅');
      startLiveSimulation(query);
    })
    .catch(function (err) {
      showNotification('No matching record found', err.message || 'Please check the number and try again', '❌');
      window.clearInterval(state.trackInterval);
    });
}

window.doTrack = doTrack;

/** Closes the results panel — the only thing that should ever hide it once shown. */
function closeTrackResult() {
  const resultEl = document.getElementById('trackResult');
  if (resultEl) resultEl.classList.remove('visible');
  window.clearInterval(state.trackInterval);
}
window.closeTrackResult = closeTrackResult;

/**
 * Reads the first present, non-empty value for any of `keys` off `obj`.
 * Used because we don't control the exact column names public_track_lookup
 * returns (snake_case DB columns vs camelCase vs UK/US spelling, etc.) —
 * this way rendering doesn't silently go blank on a naming mismatch.
 */
function pick(obj, keys) {
  if (!obj) return null;
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function renderTrackResult(details, query) {

  const { trip, truck, driver, events, gps } = details;

  // Populate basic fields
  setText('res-id', trip.container || trip.id);
  setText('res-route', (trip.origin || '—') + ' → ' + (trip.destination || '—'));
  setText('res-eta', trip.status === 'active' ? 'In transit' : (trip.status === 'completed' ? 'Delivered' : '—'));
  setText('res-booked', trip.created || '—');

  const statusEl = document.getElementById('res-status');
  if (statusEl) {
    statusEl.textContent = trip.status.charAt(0).toUpperCase() + trip.status.slice(1);
    statusEl.className = 'status-badge ' + (trip.status === 'active' ? 'status-transit' : trip.status === 'completed' ? 'status-delivered' : 'status-pending');
  }

  // Truck info — tolerant of reg/registration/licence_plate/plate naming,
  // and falls back to flat fields on the trip itself (e.g. truck_reg)
  // in case the RPC doesn't nest a `truck` object at all.
  setText('truckReg', pick(truck, ['reg', 'registration', 'licence_plate', 'licencePlate', 'plate', 'vehicle_reg'])
    || pick(trip, ['truck_reg', 'truckReg', 'vehicle_reg']) || '—');
  setText('truckType', pick(truck, ['type', 'truck_type', 'vehicle_type', 'make'])
    || pick(trip, ['truck_type', 'truckType']) || '—');
  setText('truckFuel', pick(truck, ['status', 'truck_status', 'vehicle_status'])
    || pick(trip, ['truck_status', 'truckStatus']) || '—');

  // Driver info — tolerant of name/phone/licence naming (UK "licence" vs
  // US "license"), and falls back to flat fields on the trip itself.
  const driverName = pick(driver, ['name', 'driver_name', 'full_name']) || pick(trip, ['driver_name', 'driverName']) || '—';
  setText('driverName', driverName);

  const driverPhone = pick(driver, ['phone', 'mobile', 'phone_number', 'contact']) || pick(trip, ['driver_phone', 'driverPhone']);
  const phoneEl = document.getElementById('driverPhone');
  if (phoneEl) {
    phoneEl.textContent = driverPhone || '—';
    phoneEl.parentElement.href = driverPhone ? 'tel:' + String(driverPhone).replace(/\s/g, '') : '#';
  }

  const driverLicence = pick(driver, ['licence', 'license', 'licence_no', 'license_no', 'licenceNo', 'licenseNo'])
    || pick(trip, ['driver_licence', 'driver_license']) || '—';
  setText('driverLicence', driverLicence);

  // Location & speed
  let locationText = '—';
  if (trip.status === 'active' && gps) {
    locationText = `GPS: ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`;
  } else if (trip.status === 'completed') {
    locationText = trip.destination || '—';
  } else {
    locationText = trip.origin || '—';
  }
  setText('truckLocation', locationText);
  setText('truckSpeed', gps ? `${gps.speed} km/h` : '—');

  // GPS update time
  setText('gpsUpdate', new Date().toLocaleTimeString());

  // Timeline
  const timelineEl = document.getElementById('trackTimeline');
  if (timelineEl && events && events.length) {
    const mapped = events.map(function (ev, idx) {
      return { t: ev.ts || '—', e: ev.label + (ev.detail ? ' — ' + ev.detail : ''), done: idx < events.length - 1 || trip.status === 'completed' };
    });
    timelineEl.innerHTML = renderTimeline(mapped);
  } else if (timelineEl) {
    timelineEl.innerHTML = '<div class="empty-state">No timeline events yet</div>';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function startLiveSimulation(query) {
  window.clearInterval(state.trackInterval);
  if (!query) return;
  state.trackInterval = window.setInterval(function () {
    window.bridge.trackQuery(query)
      .then(function (details) {
        if (details.trip.status !== 'active') {
          window.clearInterval(state.trackInterval);
          return;
        }
        const speedEl = document.getElementById('truckSpeed');
        const locEl = document.getElementById('truckLocation');
        const gpsEl = document.getElementById('gpsUpdate');
        if (speedEl && details.gps) speedEl.textContent = details.gps.speed + ' km/h';
        if (locEl && details.gps) locEl.textContent = `GPS: ${details.gps.lat.toFixed(4)}, ${details.gps.lng.toFixed(4)}`;
        if (gpsEl) gpsEl.textContent = 'Just now';
      })
      .catch(function () { /* silent — keep last known values on a transient error */ });
  }, 8000);
}
function initTrackPage() {
  const resultEl = document.getElementById('trackResult');
  const inputEl = document.getElementById('trackInput');
  if (resultEl && resultEl.classList.contains('visible') && inputEl && inputEl.value.trim()) {
    startLiveSimulation(inputEl.value.trim());
  }
}


function initFleetLivePanel() {
  const grid = document.getElementById('fleetLiveGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="empty-state">Loading fleet status…</div>';
  window.bridge.fleetStatus()
    .then(function (data) {
      if (!data.trucks || !data.trucks.length) {
        grid.innerHTML = '<div class="empty-state">No trucks in the fleet yet</div>';
        return;
      }
      grid.innerHTML = data.trucks.map(function (t) {
        const statusLabel = { on_trip: 'En Route', available: 'Available', maintenance: 'Maintenance', breakdown: 'Breakdown', off_duty: 'Off Duty' }[t.status] || t.status;
        return (
          '<div class="fleet-live-item">' +
          '<strong>' + t.reg + '</strong>' +
          '<div>' + statusLabel + '</div>' +
          '<div style="opacity:.7;font-size:12px;">' + (t.type || '') + '</div>' +
          '</div>'
        );
      }).join('');
    })
    .catch(function () {
      grid.innerHTML = '<div class="empty-state">Could not load fleet status</div>';
    });
}


function sendContact() {
  const name = document.getElementById('cName');
  const email = document.getElementById('cEmail');
  const message = document.getElementById('cMessage');
  if (!name || !name.value.trim() || !email || !email.value.trim() || !message || !message.value.trim()) {
    showNotification('Missing Information', 'Please fill in your name, email, and message.', '⚠️');
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) {
    showNotification('Invalid Email', 'Please enter a valid email address.', '⚠️');
    email.focus();
    return;
  }

  const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const payload = {
    full_name: get('cName'),
    company: get('cCompany'),
    email: get('cEmail'),
    phone: get('cPhone'),
    subject: get('cSubject'),
    contact_method: get('cContactMethod'),
    message: get('cMessage')
  };

  window.bridge.submitContact(payload)
    .then(function () {
      showNotification('Message Sent', 'Our team will respond within 2 hours', '✅');
      ['cName', 'cCompany', 'cEmail', 'cPhone', 'cMessage'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const subjectEl = document.getElementById('cSubject');
      if (subjectEl) subjectEl.selectedIndex = 0;
    })
    .catch(function (err) {
      showNotification('Message Failed', err.message || 'Please try again', '❌');
    });
}
window.sendContact = sendContact;


function init() {
  initLoader();
  initTicker();
  initModal();
  if (typeof initMobileMenu === "function") {
    initMobileMenu();
}
  initScrollTop();
  initChatbot();
  initHeroSlideshow();
  renderFaq();
  runCalc();
  initFleetLivePanel();

  const calcInputs = ['calcOrigin', 'calcDest', 'calcWeight', 'calcService'];
  calcInputs.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', runCalc);
      el.addEventListener('input', runCalc);
    }
  });

  if (document.getElementById('booking-page') && document.getElementById('booking-page').classList.contains('active-page')) {
    initBookingPage();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();


const SUBPAGES = {

  'company-overview': {
    parent: 'about',
    title: 'Company Overview',
    hero: 'images/gargo1.png',
    tag: ' ✦ Who We Are',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">A <span style="font-size:50px;"> 2+ </span> Years of Container Excellence</h2>
              <p>Gargo Haven Ltd is Mombasa's premier empty container depot and transport company, incorporated in 2024 and its headquarters is located at Changamwe, Mombasa. We serve shipping lines, freight forwarders, customs agents, importers, and exporters operating through Mombasa Port — East Africa's largest and busiest gateway.</p>
              <p>Our core business spans two pillars: <strong>Empty Container Depot Operations</strong> and <strong>Port Haulage & Transport</strong>. The depot business provides secure, digitally managed yard storage, repairs, washing, and reefer management. The transport business connects containers between Mombasa Port (KPA), APM Terminals, and all inland container depots (ICDs) using our GPS-tracked truck fleet.</p>
              <p>Today, Gargo Haven processes over 5,000 TEUs per month, operates 120+ trucks, and maintains depot alliance agreements with Consolebase ICD, Hakika Depot, Kibarani, and Fortune Container Depot — giving our clients the widest container movement coverage in Mombasa.</p>
              <p>We are KPA-licensed, IICL-certified, ISO 9001:2015 certified, and fully KRA-compliant. Our proprietary digital platform provides clients with real-time container and truck GPS tracking, digital EIR issuance, online booking, and live depot capacity dashboards.</p>
              <div style="display:flex;gap:16px;margin-top:28px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="navigateToSubpage('mission-vision')">Our Mission & Vision →</button>
                <button class="btn-secondary" onclick="navigateToSubpage('certifications')">Certifications →</button>
              </div>
            </div>
            <div class="sidebar-box">
              <h4>Company Snapshot</h4>
              <div class="sidebar-item"><div class="sidebar-label">Incorporated</div><p>2024 — Mombasa, Kenya</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Registration</div><p>RC No. 2024/XXXXX</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Business Lines</div><p>Empty Container Depot · Port Haulage · Container Repair · Reefer Management</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Depot Locations</div><p>Changamwe Main · Consolebase ICD · Hakika · Kibarani · Fortune Depot</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Fleet Size</div><p>120+ GPS-tracked trucks · 6 reach stackers · 20 forklifts</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Monthly Volume</div><p>5,000+ TEUs</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Clients Served</div><p>400+ active clients</p></div>
            </div>
          </div>
        </div>
      </section>
      <section class="stats-band">
        <div class="stats-inner">
          <div class="stat-block"><div class="stat-num">2+</div><div class="stat-lbl">Years Operating</div><div class="stat-desc">Since 2024</div></div>
          <div class="stat-block"><div class="stat-num">5,000+</div><div class="stat-lbl">TEUs / Month</div><div class="stat-desc">Storage & Transport</div></div>
          <div class="stat-block"><div class="stat-num">120+</div><div class="stat-lbl">Truck Fleet</div><div class="stat-desc">All GPS tracked</div></div>
          <div class="stat-block"><div class="stat-num">400+</div><div class="stat-lbl">Clients</div><div class="stat-desc">Lines to SMEs</div></div>
        </div>
      </section>

        <section class="cta-band-img" style="background-image:url('images/depot8.png')">
    <div class="cta-band-overlay"></div>
    <div class="cta-band-content">
      <h2>Ready to Move Your Containers?</h2>
      <p>Get an instant quote for depot storage or port haulage in seconds.</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:24px;">
        <button class="btn-primary" onclick="navigateToPage('booking')">Start a Booking →</button>
        <a href="tel:+254116307751" class="cta-secondary" style="text-decoration:none;display:inline-flex;align-items:center;">CALL NOW →</a>
      </div>
    </div>
  </section>`,
  },

  'mission-vision': {
    parent: 'about',
    title: 'Mission & Vision',
    hero: 'images/gargo2.png',
    tag: ' ✦ Our Purpose',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div style="max-width:780px;margin:0 auto;text-align:center;margin-bottom:56px;">
            <div class="section-tag" style="margin:0 auto 16px;"> ✦ What Drives Us</div>
            <h2 class="section-title" style="font-size:clamp(26px,4vw,38px);">Built Around a <span>Promise</span></h2>
            <p class="section-sub">Every decision at Gargo Haven traces back to a simple commitment: make container logistics in Mombasa more reliable, more transparent, and more professional than anything the market has seen before.</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:56px;">
            <div style="background:var(--dark-card);border:1px solid var(--border);border-radius:12px;padding:40px;">
              <div class="section-tag" style="margin-bottom:20px;"> ✦ Our Mission</div>
              <h3 style="font-family:var(--font-main);font-size:18px;color:var(--white);margin-bottom:16px;">Reliable. Transparent. Professional.</h3>
              <p style="color:var(--gray-light);line-height:1.8; font-size:14px;">To provide Mombasa's port community with Africa's most reliable and transparent empty container depot and transport service — combining world-class infrastructure, digital innovation, and a people-first culture that delivers for every client, every move, every day.</p>
            </div>
            <div style="background:var(--dark-card);border:1px solid var(--border);border-radius:12px;padding:40px;">
              <div class="section-tag" style="margin-bottom:20px;"> ✦ Our Vision</div>
              <h3 style="font-family:var(--font-main);font-size:18px;color:var(--white);margin-bottom:16px;">The First Name in Mombasa Depots</h3>
              <p style="color:var(--gray-light);line-height:1.8; font-size:14px;">To be the preferred empty container management partner for every major shipping line and freight forwarder operating through Mombasa Port by 2030 — and to set the operational benchmark for container depots across East Africa.</p>
            </div>
          </div>
          <div class="values-grid">
            <div class="value-card"><div class="value-icon"></div><h5>Accountability</h5><p>Every container movement is documented, tracked, and reported. If something goes wrong, we own it and fix it — no excuses.</p></div>
            <div class="value-card"><div class="value-icon"></div><h5>Innovation</h5><p>We were the first Mombasa depot to offer real-time GPS tracking in 2024-2025. We keep investing in technology that makes your job easier.</p></div>
            <div class="value-card"><div class="value-icon"></div><h5>Integrity</h5><p>Honest pricing, accurate documentation, and clear communication at every step. No hidden charges, no surprises.</p></div>
            <div class="value-card"><div class="value-icon"></div><h5>Excellence</h5><p>IICL-standard repairs, ISO 9001-certified processes, and KPA-compliant operations — we meet the highest bar, always.</p></div>
          </div>
        </div>
      </section>
      
      <section class="cta-band-img" style="background-image:url('images/depot8.png')">
    <div class="cta-band-overlay"></div>
    <div class="cta-band-content">
      <h2>Ready to Move Your Containers?</h2>
      <p>Get an instant quote for depot storage or port haulage in seconds.</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:24px;">
        <button class="btn-primary" onclick="navigateToPage('booking')">Start a Booking →</button>
        <a href="tel:+254116307751" class="cta-secondary" style="text-decoration:none;display:inline-flex;align-items:center;">CALL NOW →</a>
      </div>
    </div>
  </section>`,
  },

  'team': {
    parent: 'about',
    title: 'Leadership Team',
    hero: 'images/gargo1.png',
    tag: ' ✦ The People',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦ Leadership</div>
            <h2 class="section-title">The People Behind <span>Gargo Haven</span></h2>
            <p class="section-sub">Our leadership team brings deep expertise in Mombasa port operations, container logistics, and transport technology.</p>
          </div>
          <div class="team-grid" style="margin-bottom:60px;">
            <div class="team-card">
              <div class="team-avatar" style="font-size:32px;display:flex;align-items:center;justify-content:center;">👤</div>
              <div class="team-info">
                <h4>Ben Wamae</h4>
                <span class="role">Director & Founder</span>
                <p>Visionary behind Gargo Haven's founding in 2014. Ben has over 15 years of experience in Mombasa port logistics, formerly managing container operations at KPA. He established Gargo Haven's foundational partnerships with APM Terminals and shaped the company's technology-first approach to depot management.</p>
              </div>
            </div>

            <!--<div class="team-card">
              <div class="team-avatar" style="font-size:32px;display:flex;align-items:center;justify-content:center;">👤</div>
              <div class="team-info">
                <h4>Operations Director</h4>
                <span class="role">Head of Depot & Fleet Operations</span>
                <p>Oversees day-to-day operations across all five depot locations and the 120+ truck fleet. Specialist in yard management systems and container throughput optimization. Led the expansion into Consolebase ICD and the Hakika and Fortune depot alliance agreements.</p>
              </div>
            </div>-->

            <!--<div class="team-card">
              <div class="team-avatar" style="font-size:32px;display:flex;align-items:center;justify-content:center;">👤</div>
              <div class="team-info">
                <h4>Head of Technology</h4>
                <span class="role">Chief Technology Officer</span>
                <p>Built Gargo Haven's GPS tracking and depot management platform from the ground up in 2018 — making Gargo the first Mombasa depot to offer real-time container and truck tracking. Manages the client portal, gate system, and EIR digitisation infrastructure.</p>
              </div>
            </div>-->

           <!--<div class="team-card">
              <div class="team-avatar" style="font-size:32px;display:flex;align-items:center;justify-content:center;">👤</div>
              <div class="team-info">
                <h4>Compliance & Customs Manager</h4>
                <span class="role">Head of Documentation & Compliance</span>
                <p>Manages all KRA customs documentation, KPA compliance, and EIR processing. Former KRA Customs Officer with deep knowledge of port regulations and bonded transport requirements. Ensures Gargo Haven's full regulatory compliance across all depot and transport operations.</p>
              </div>
            </div>-->


          </div>
          <div style="background:var(--dark-card);border:1px solid var(--border);border-radius:12px;padding:40px;text-align:center;">
            <h3 style="font-family:var(--font-main);font-size:22px;color:var(--white);margin-bottom:12px;">Join the Gargo Haven Team</h3>
            <p style="color:var(--gray-light);margin-bottom:24px;">We are always looking for experienced drivers, yard operators, and logistics professionals in Mombasa. Send your CV to <a href="mailto:careers@gargo.co.ke" style="color:var(--gold);">careers@gargo.co.ke</a></p>
            <button class="btn-secondary" onclick="navigateToPage('contact')">Contact HR →</button>
          </div>
        </div>
      </section>
      
        <section class="cta-band-img" style="background-image:url('images/depot8.png')">
    <div class="cta-band-overlay"></div>
    <div class="cta-band-content">
      <h2>Ready to Move Your Containers?</h2>
      <p>Get an instant quote for depot storage or port haulage in seconds.</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:24px;">
        <button class="btn-primary" onclick="navigateToPage('booking')">Start a Booking →</button>
        <a href="tel:+254116307751" class="cta-secondary" style="text-decoration:none;display:inline-flex;align-items:center;">CALL NOW →</a>
      </div>
    </div>
  </section>`,
  },

  'about-gargo': {
    parent: 'about',
    title: 'About Gargo Haven',
    hero: 'images/gargo1.png',
    tag: ' ✦ Our Story',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">From a Single Yard to One of Mombasa's Largest Private Depot Network</h2>
              <p>The story of Gargo Haven begins in 2024, when founder Ben Wamae identified a critical gap in Mombasa's container market; shipping lines and freight forwarders; which needed a professionally managed, technology-enabled empty container depot that could match the speed and standards demanded by modern global supply chains.</p>
              <p>Starting with a 500-TEU yard in Changamwe and a fleet of over 8 trucks, Gargo Haven grew steadily by earning the trust of Mombasa's port community, which earned, one container movement at a time. By 2025, the company had secured its KPA depot operator licence and established a formal partnership with APM Terminals — a landmark moment that cemented Gargo Haven's position as a serious player in Mombasa's container ecosystem.</p>
              <p>The 2025 launch of our proprietary GPS tracking platform marked a turning point. Then in 2026, Gargo Haven became the first Mombasa depot to give clients real-time visibility of both their containers in the yard and the trucks carrying them — a capability that transformed how shipping lines manage empty container repositioning in the port.</p>
              <p>Today, with 5,000+ TEU monthly throughput, 120+ trucks, and depot alliances spanning Mombasa's key container corridors, Gargo Haven is the partner of choice for shipping lines, freight forwarders, and importers who demand more than just a yard to park boxes.</p>
            </div>
            <div class="sidebar-box">
              <h4>Key Milestones</h4>
              <div class="sidebar-item"><div class="sidebar-label">2024</div><p>Founded · 500 TEU yard · 8 trucks</p></div>
              <div class="sidebar-item"><div class="sidebar-label">2024</div><p>KPA Licence · APM Terminals partnership</p></div>
              <div class="sidebar-item"><div class="sidebar-label">2025</div><p>GPS tracking launch · Fleet grows to 60 trucks</p></div>
              <div class="sidebar-item"><div class="sidebar-label">2025</div><p>IICL Certification · 10-bay repair workshop opens</p></div>
              <div class="sidebar-item"><div class="sidebar-label">2025</div><p>Consolebase ICD alliance · Network expansion</p></div>
              <div class="sidebar-item"><div class="sidebar-label">2026</div><p>5,000+ TEU · 120+ trucks · 400+ clients</p></div>
            </div>
          </div>
        </div>
      </section>
      <section class="timeline-section section-dark">
        <div class="section-inner">
          <div class="timeline">
            <div class="tl-item"><div class="tl-year">2024</div><div class="tl-dot"></div><div class="tl-content"><h4>Gargo Haven Founded</h4><p>Ben Wamae incorporates Gargo Haven Ltd. Operations begin with a 500-TEU Changamwe yard and 8 trucks. First clients: three local freight forwarders.</p></div></div>
            <div class="tl-item"><div class="tl-year">2024</div><div class="tl-dot"></div><div class="tl-content"><h4>KPA Licence & APM Partnership</h4><p>Received the Kenya Ports Authority depot operator licence. Established formal container handling agreement with APM Terminals Mombasa. Fleet grows to 30 trucks.</p></div></div>
            <div class="tl-item"><div class="tl-year">2025</div><div class="tl-dot"></div><div class="tl-content"><h4>GPS Tracking Platform Launch</h4><p>Launched Mombasa's first real-time container and truck GPS tracking platform. Fleet expanded to 60 units. Maersk and MSC sign as anchor clients.</p></div></div>
            <div class="tl-item"><div class="tl-year">2025</div><div class="tl-dot"></div><div class="tl-content"><h4>IICL Certification & Repair Bay</h4><p>Achieved IICL certification for container inspection and repair. Opened 10-bay M&R workshop. Reefer yard with 200+ plug-in points commissioned.</p></div></div>
            <div class="tl-item"><div class="tl-year">2025</div><div class="tl-dot"></div><div class="tl-content"><h4>Network Expansion</h4><p>Alliance agreements signed with Consolebase ICD, Hakika Depot, Kibarani, and Fortune Container Depot. ISO 9001:2015 certification achieved.</p></div></div>
            <div class="tl-item"><div class="tl-year">2026</div><div class="tl-dot"></div><div class="tl-content"><h4>Mombasa's Premier Depot</h4><p>5,000+ TEU monthly throughput. 120+ truck fleet. 400+ active clients. Digital EIR system serving all five depot locations.</p></div></div>
          </div>
        </div>
      </section>
      
        <section class="cta-band-img" style="background-image:url('images/depot8.png')">
    <div class="cta-band-overlay"></div>
    <div class="cta-band-content">
      <h2>Ready to Move Your Containers?</h2>
      <p>Get an instant quote for depot storage or port haulage in seconds.</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:24px;">
        <button class="btn-primary" onclick="navigateToPage('booking')">Start a Booking →</button>
        <a href="tel:+254116307751" class="cta-secondary" style="text-decoration:none;display:inline-flex;align-items:center;">CALL NOW →</a>
      </div>
    </div>
  </section>`,
  },

  'certifications': {
    parent: 'about',
    title: 'Certifications & Accreditations',
    hero: 'images/gargo2.png',
    tag: ' ✦ Standards',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦ Accreditations</div>
            <h2 class="section-title">Certified to the <span>Highest Standard</span></h2>
            <p class="section-sub">Gargo Haven holds all major certifications required to serve Mombasa Port's international shipping community.</p>
          </div>
          <div class="cert-grid" style="margin-bottom:60px;">
            <div class="cert-card" style="padding:36px 24px;">
              <div class="ci" style="font-size:28px;margin-bottom:16px;">🏅</div>
              <h5>IICL Certified</h5>
              <span>Container Inspection & Repair</span>
              <p style="color:var(--gray-light);font-size:13px;margin-top:12px;line-height:1.7;">Our M&R workshop and inspection team hold full IICL (Institute of International Container Lessors) certification — the gold standard for container condition assessment and repair globally. All damage surveys, repair estimates, and completed work meet IICL methodology.</p>
            </div>
            <div class="cert-card" style="padding:36px 24px;">
              <div class="ci" style="font-size:28px;margin-bottom:16px;">🏛️</div>
              <h5>KPA Licensed</h5>
              <span>Kenya Ports Authority Depot Operator</span>
              <p style="color:var(--gray-light);font-size:13px;margin-top:12px;line-height:1.7;">Gargo Haven holds an active Kenya Ports Authority depot operator licence, authorising us to accept and release containers linked to KPA-managed port operations. Our licence covers all container types including dry, reefer, OOG, and tank containers.</p>
            </div>
            <div class="cert-card" style="padding:36px 24px;">
              <div class="ci" style="font-size:28px;margin-bottom:16px;">📋</div>
              <h5>KRA Compliant</h5>
              <span>Kenya Revenue Authority — Customs</span>
              <p style="color:var(--gray-light);font-size:13px;margin-top:12px;line-height:1.7;">Full KRA compliance for all customs documentation, bonded transport, and container release processes. Our compliance team manages all KRA declarations, fumigation certificates, and customs-cleared container movements.</p>
            </div>
            <div class="cert-card" style="padding:36px 24px;">
              <div class="ci" style="font-size:28px;margin-bottom:16px;">✅</div>
              <h5>ISO 9001:2015</h5>
              <span>Quality Management System</span>
              <p style="color:var(--gray-light);font-size:13px;margin-top:12px;line-height:1.7;">ISO 9001:2015 certification covers all depot and transport operations — gate-in/gate-out procedures, EIR issuance, truck dispatch, container repair, and client documentation. Annual audits ensure continued conformance.</p>
            </div>
            <div class="cert-card" style="padding:36px 24px;">
              <div class="ci" style="font-size:28px;margin-bottom:16px;">❄️</div>
              <h5>Reefer Certified</h5>
              <span>Refrigerated Container Management</span>
              <p style="color:var(--gray-light);font-size:13px;margin-top:12px;line-height:1.7;">Our reefer yard team is trained and certified in pre-trip inspection, temperature monitoring, and reefer unit repair for all major brands. 200+ plug-in points. 24/7 temperature alarm monitoring. Genset hire available.</p>
            </div>
            <div class="cert-card" style="padding:36px 24px;">
              <div class="ci" style="font-size:28px;margin-bottom:16px;">📍</div>
              <h5>GPS Fleet Certified</h5>
              <span>Real-Time Fleet Tracking</span>
              <p style="color:var(--gray-light);font-size:13px;margin-top:12px;line-height:1.7;">Every Gargo Haven truck is fitted with a certified GPS tracking unit. Live position, speed, route history, and geofencing alerts are available to clients through our tracking portal at all times.</p>
            </div>
          </div>
          <div style="background:var(--dark-card);border:1px solid var(--border);border-radius:12px;padding:40px;text-align:center;">
            <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin-bottom:12px;">Need Compliance Documentation?</h3>
            <p style="color:var(--gray-light);margin-bottom:24px;">Our compliance team can provide copies of all certificates and accreditation documents for your shipping line or auditor on request.</p>
            <button class="btn-primary" onclick="navigateToPage('contact')">Request Documents →</button>
          </div>
        </div>
      </section>`,
  },

  'partners': {
    parent: 'about',
    title: 'Partners & Alliances',
    hero: 'images/gargo2.png',
    tag: ' ✦ Our Network',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦Partners</div>
            <h2 class="section-title">A Network Built on <span>Trust</span></h2>
            <p class="section-sub">Gargo Haven's value to clients comes in large part from the strength of our partnerships across Mombasa's container ecosystem.</p>
          </div>


          <!-- CLIENTS -->
          <section class="clients-section">
          <div class="clients">
            <div class="ticker-label">Our Trusted Partners</div>


          <div class="ticker-track" id="ticker">
          
            <!--Original-->
          <div style="text-align: center;">
            <a  href="https://www.kpa.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KPA Logo.png" alt="KPA Logo" style="width: 90px; height: 80px; margin-left: 6px;">
              </div>
              <p class="client-link">Kenya Ports Authority</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://www.kra.go.ke/" target="_blank">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KRA.png" alt="KRA Logo" style="width: 140px; height: 50px; margin-left: 0px;">
              </div>
              <p class="client-link"> Kenya Revenue Authority</p>
            </a>
          </div>
   
            <div style="text-align: center;">
              <a href="https://www.maersk.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/MAERSK.png" alt="MAERSK Logo" style="width: 100px; height: 60px; margin-left: 15px;">
                </div>
                <p class="client-link">MAERSK</p>
              </a>
            </div>
   
            <div style="text-align: center;">
              <a href="https://www.msc.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/msc.png" alt="MSC Logo" style="width: 78px; height: 50px; margin-left: 25px;">
                </div>
                <p class="client-link" >Mediterenian Shipping Company</p>
              </a>
            </div>
        
          <div style="text-align: center;">
            <a  href="https://hakikatransport.com//" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Hakika TS logo.png" alt="Hakika TS Logo" style="width: 160px; height: 60px;">
              </div>
              <p class="client-link">Hakika Transport Services</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a href="https://www.consolbase.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/consolbase.png" alt="Consolbase Logo" style="width: 100px; height: 40px; margin-left: 0px;">
              </div>
              <p class="client-link"> Consolbase Limited</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://jastarlogisticslimited.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Jastar logo.png" alt="Jastar Logo" style="width: 70px; height: 60px; margin-left: 0px;">
              </div>
              <p class="client-link">Jastar Logistics</p>
            </a>
          </div>


          <!--Duplicate logos for smooth scrolling--> 
          <div style="text-align: center;">
            <a  href="https://www.kpa.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KPA Logo.png" alt="KPA Logo" style="width: 90px; height: 80px; margin-left: 6px;">
              </div>
              <p class="client-link">Kenya Ports Authority</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://www.kra.go.ke/" target="_blank">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KRA.png" alt="KRA Logo" style="width: 140px; height: 50px; margin-left: 0px;">
              </div>
              <p class="client-link"> Kenya Revenue Authority</p>
            </a>
          </div>
   
            <div style="text-align: center;">
              <a href="https://www.maersk.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/MAERSK.png" alt="MAERSK Logo" style="width: 100px; height: 60px; margin-left: 15px;">
                </div>
                <p class="client-link">MAERSK</p>
              </a>
            </div>
   
            <div style="text-align: center;">
              <a href="https://www.msc.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/msc.png" alt="MSC Logo" style="width: 78px; height: 50px; margin-left: 25px;">
                </div>
                <p class="client-link" >Mediterenian Shipping Company</p>
              </a>
            </div>
        
          <div style="text-align: center;">
            <a  href="https://hakikatransport.com//" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Hakika TS logo.png" alt="Hakika TS Logo" style="width: 160px; height: 60px;">
              </div>
              <p class="client-link">Hakika Transport Services</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a href="https://www.consolbase.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/consolbase.png" alt="Consolbase Logo" style="width: 100px; height: 40px; margin-left: 0px;">
              </div>
              <p class="client-link"> Consolbase Limited</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://jastarlogisticslimited.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Jastar logo.png" alt="Jastar Logo" style="width: 70px; height: 60px; margin-left: 0px;">
              </div>
              <p class="client-link">Jastar Logistics</p>
            </a>
          </div>
    

          <!--Additional duplicates for continuous scroll-->
          <div style="text-align: center;">
            <a  href="https://www.kpa.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KPA Logo.png" alt="KPA Logo" style="width: 90px; height: 80px; margin-left: 6px;">
              </div>
              <p class="client-link">Kenya Ports Authority</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://www.kra.go.ke/" target="_blank">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KRA.png" alt="KRA Logo" style="width: 140px; height: 50px; margin-left: 0px;">
              </div>
              <p class="client-link"> Kenya Revenue Authority</p>
            </a>
          </div>
   
            <div style="text-align: center;">
              <a href="https://www.maersk.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/MAERSK.png" alt="MAERSK Logo" style="width: 100px; height: 60px; margin-left: 15px;">
                </div>
                <p class="client-link">MAERSK</p>
              </a>
            </div>
   
            <div style="text-align: center;">
              <a href="https://www.msc.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/msc.png" alt="MSC Logo" style="width: 78px; height: 50px; margin-left: 25px;">
                </div>
                <p class="client-link" >Mediterenian Shipping Company</p>
              </a>
            </div>
        
          <div style="text-align: center;">
            <a  href="https://hakikatransport.com//" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Hakika TS logo.png" alt="Hakika TS Logo" style="width: 160px; height: 60px;">
              </div>
              <p class="client-link">Hakika Transport Services</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a href="https://www.consolbase.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/consolbase.png" alt="Consolbase Logo" style="width: 100px; height: 40px; margin-left: 0px;">
              </div>
              <p class="client-link"> Consolbase Limited</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://jastarlogisticslimited.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Jastar logo.png" alt="Jastar Logo" style="width: 70px; height: 60px; margin-left: 0px;">
              </div>
              <p class="client-link">Jastar Logistics</p>
            </a>
          </div>


          <!--Additional duplicates for continuous scroll-->
          <div style="text-align: center;">
            <a  href="https://www.kpa.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KPA Logo.png" alt="KPA Logo" style="width: 90px; height: 80px; margin-left: 6px;">
              </div>
              <p class="client-link">Kenya Ports Authority</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://www.kra.go.ke/" target="_blank">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/KRA.png" alt="KRA Logo" style="width: 140px; height: 50px; margin-left: 0px;">
              </div>
              <p class="client-link"> Kenya Revenue Authority</p>
            </a>
          </div>
   
            <div style="text-align: center;">
              <a href="https://www.maersk.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/MAERSK.png" alt="MAERSK Logo" style="width: 100px; height: 60px; margin-left: 15px;">
                </div>
                <p class="client-link">MAERSK</p>
              </a>
            </div>
   
            <div style="text-align: center;">
              <a href="https://www.msc.com/" target="_blank" class="client-block">
                <div class="client-logo">
                  <span class="cl-sep"></span>
                  <img src="images/msc.png" alt="MSC Logo" style="width: 78px; height: 50px; margin-left: 25px;">
                </div>
                <p class="client-link" >Mediterenian Shipping Company</p>
              </a>
            </div>
        
          <div style="text-align: center;">
            <a  href="https://hakikatransport.com//" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Hakika TS logo.png" alt="Hakika TS Logo" style="width: 160px; height: 60px;">
              </div>
              <p class="client-link">Hakika Transport Services</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a href="https://www.consolbase.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/consolbase.png" alt="Consolbase Logo" style="width: 100px; height: 40px; margin-left: 0px;">
              </div>
              <p class="client-link"> Consolbase Limited</p>
            </a>
          </div>

          <div style="text-align: center;">
            <a  href="https://jastarlogisticslimited.co.ke/" target="_blank" class="client-block">
              <div class="client-logo">
                <span class="cl-sep"></span>
                <img src="images/Jastar logo.png" alt="Jastar Logo" style="width: 70px; height: 60px; margin-left: 0px;">
              </div>
              <p class="client-link">Jastar Logistics</p>
            </a>
          </div>

  </div>
</div>
</section>



          <div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;margin-bottom:56px;">
            ${[
              { name:'Kenya Ports Authority (KPA)', type:'Regulatory & Operational', desc:'As a KPA-licensed depot operator, Gargo Haven works directly with the port authority on container gate management, documentation, and compliance across all movements at Kilindini Harbour.' },
              { name:'APM Terminals Mombasa', type:'Port Terminal Partner', desc:'A formal container handling agreement with APM Terminals enables Gargo Haven to provide seamless pickup and delivery services directly from the terminal, reducing dwell time for our clients.' },
              { name:'Maersk', type:'Shipping Line Partner', desc:'Gargo Haven is an approved empty container depot for Maersk in Mombasa, providing storage, repair, and repositioning services for Maersk-owned containers.' },
              { name:'MSC', type:'Shipping Line Partner', desc:'Mediterranean Shipping Company vessels discharge containers at Mombasa that are repositioned, stored, and managed through Gargo Haven\'s depot network.' },
              { name:'Consolebase ICD', type:'ICD Alliance Partner', desc:'A depot alliance agreement with Consolebase ICD enables container shuttle and transfer services between the two facilities, expanding coverage for clients using the Mombasa Road corridor.' },
              { name:'Hakika Container Depot', type:'Depot Alliance Partner', desc:'The Hakika partnership provides additional TEU capacity during peak periods and enables cross-depot container repositioning services for clients managing large volumes.' },
              { name:'Kenya Revenue Authority (KRA)', type:'Customs Compliance', desc:'Full KRA compliance for bonded transport and customs documentation, with a dedicated compliance desk staffed by former KRA officers.' },
              { name:'Fortune Container Depot', type:'Alliance Partner', desc:'Fortune Container Depot provides additional yard capacity and specialised storage for out-of-gauge containers at the Mombasa Industrial Area location.' },
            ].map(p => `
              <div style="background:var(--dark-card);border:1px solid var(--border);border-radius:10px;padding:28px;">
                <div class="section-tag" style="margin-bottom:10px;">${p.type}</div>
                <h4 style="font-family:var(--font-main);font-size:18px;color:var(--white);margin-bottom:12px;">${p.name}</h4>
                <p style="color:var(--gray-light);font-size:13px;line-height:1.7;">${p.desc}</p>
              </div>`).join('')}
          </div>
          </div>

          
          <div style="background:var(--dark-card);border:1px solid var(--gold);border-radius:12px;padding:40px;text-align:center;">
            <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin-bottom:12px;">Interested in a Partnership?</h3>
            <p style="color:var(--gray-light);margin-bottom:24px;">We work with depots, ICDs, shipping agents, and transport companies across the East Africa corridor. Contact our partnerships team to explore how we can work together.</p>
            <button class="btn-primary" onclick="navigateToPage('contact')">Discuss Partnership →</button>
          </div>         
        </div>
      </section>`,
  },

  /* ══ SERVICES ════════════════════════════════════════════════════ */

  'container-storage': {
    parent: 'services',
    title: 'Container Storage',
    hero: 'images/gargo4.png',
    tag: ' ✦ Container Storage — 01',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Secure Empty Container Storage</h2>
              <p>Gargo Haven's main Changamwe depot offers over 5,000 TEU of secure storage capacity for 20ft, 40ft, and 40ft High Cube dry containers, as well as reefer units, flat-racks, open-tops, and out-of-gauge cargo.</p>
              <p>Our yard uses a digital slot management system that assigns every container a specific position on arrival, enabling instant location retrieval and fast gate-out. All containers are scanned with our gate camera system on entry, with condition photos recorded in our EIR system.</p>
              <p>The yard operates 24/7, with CCTV coverage across all zones, armed perimeter security, and biometric gate access for all staff. Average gate-in turnaround is under 30 minutes for standard containers.</p>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin:28px 0 16px;">What's Included in Storage</h3>
              <ul class="rate-features" style="list-style:none;padding:0;">
                <li>Gate-in, stacking, and gate-out operations</li>
                <li>Digital EIR issuance and storage (accessible online)</li>
                <li>Condition photography on arrival</li>
                <li>Position tracking in our client portal</li>
                <li>Basic security and insurance coverage</li>
                <li>24/7 CCTV and security patrol</li>
              </ul>
              <div style="display:flex;gap:16px;margin-top:28px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="navigateToPage('booking')">Book Storage →</button>
                <button class="btn-secondary" onclick="navigateToPage('contact')">Get a Quote →</button>
              </div>
            </div>
            <div class="sidebar-box">
              <h4>Storage Specifications</h4>
              <div class="sidebar-item"><div class="sidebar-label">Total Capacity</div><p>5,000+ TEU across all zones</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Container Types</div><p>20ft · 40ft · 40HC · Reefer · Flat-rack · Open-top · OOG</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Gate Hours</div><p>Mon–Sat: 6AM–10PM<br>Sun: 8AM–4PM<br>Emergency: 24/7</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Gate Turnaround</div><p>Under 30 minutes standard · Priority lanes available</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Security</div><p>24/7 CCTV · Armed guards · Biometric access</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Documentation</div><p>Digital EIR · Condition report · Gate pass</p></div>
            </div>
          </div>
        </div>
      </section>
      <section class="section-dark">
        <div class="section-inner">
          <div class="section-header"><div class="section-tag">✦ Yard Zones</div>
          <h2 class="section-title">Storage <span>Zones</span></h2></div>
          <div class="depot-zones-grid">
            <div class="zone-card"><div class="zone-label">Zone A — General Dry Storage</div><div class="zone-desc">Standard 20ft and 40ft dry containers. Double-stacked racking. Capacity: 3,000 TEU. Covered staging area for priority containers.</div></div>
            <div class="zone-card"><div class="zone-label">Zone B — Reefer Yard</div><div class="zone-desc">200+ plug-in points. 24/7 temperature monitoring. Pre-trip inspection pits. Capacity: 800 TEU.</div></div>
            <div class="zone-card"><div class="zone-label">Zone C — M&R Holding</div><div class="zone-desc">Containers awaiting or undergoing repair. Separate from general stock for damage containment. Capacity: 500 TEU.</div></div>
            <div class="zone-card"><div class="zone-label">Zone E — OOG & Specials</div><div class="zone-desc">Flat-racks, open-tops, tank containers, and oversized cargo. Ground-level laydown area with heavy vehicle access.</div></div>
          </div>
        </div>
      </section>`,
  },

  'port-haulage': {
    parent: 'services',
    title: 'Port Haulage',
    hero: 'images/gargo4.png',
    tag: '✦ Port Haulage — 02',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">GPS-Tracked Container Transport</h2>
              <p>Gargo Haven operates Mombasa's most connected container haulage network — linking Mombasa Port (KPA), APM Terminals, and all major ICDs and depots along the Mombasa container corridor. Our 120+ truck fleet is available for same-day movements across all routes.</p>
              <p>Every truck in our fleet is fitted with a live GPS unit. Clients can track their container's truck in real-time through our tracking portal, including driver contact details and ETA. Dispatch confirmation is sent by SMS and email within 30 minutes of booking.</p>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin:28px 0 16px;">Routes We Cover</h3>
              <ul class="rate-features" style="list-style:none;padding:0;">
                <li>Mombasa Port (KPA) ↔ Gargo Haven Depot</li>
                <li>APM Terminals ↔ All ICD locations</li>
                <li>Depot-to-depot transfers</li>
                <li>Port to client yard / factory gate</li>
                <li>Cross-depot repositioning</li>
                <li>SGR Inland Container Depot connections</li>
              </ul>
              <div style="display:flex;gap:16px;margin-top:28px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="navigateToPage('booking')">Book Transport →</button>
                <button class="btn-secondary" onclick="navigateToPage('track')">Track a Truck →</button>
              </div>
            </div>
            <div class="sidebar-box">
              <h4>Fleet & Service Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Fleet Size</div><p>120+ container tractor units</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Container Capacity</div><p>20ft · 40ft · 40HC · Reefer · Flat-rack</p></div>
              <div class="sidebar-item"><div class="sidebar-label">GPS Tracking</div><p>100% of fleet · Live client portal access</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Service Hours</div><p>6AM–10PM standard · Emergency 24/7</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Dispatch Time</div><p>Confirmation within 30 minutes of booking</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Documentation</div><p>Gate pass · EIR · Delivery receipt · GPS log</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'reefer-monitoring': {
    parent: 'services',
    title: 'Reefer Monitoring',
    hero: 'images/gargo2.png',
    tag: ' ✦ Reefer Monitoring — 03',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">24/7 Refrigerated Container Management</h2>
              <p>Gargo Haven's dedicated reefer yard features 200+ plug-in points with 24/7 automated temperature monitoring. Our reefer team is certified for pre-trip inspections (PTI), temperature setting, defrost cycles, and first-line reefer unit repairs.</p>
              <p>All reefer containers are monitored continuously with alarm alerts sent to our operations team and the client's designated contact if temperature deviates from the set point. A full log of temperature readings is available for every reefer unit on request.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:24px;">
                <li>200+ plug-in points (380V/440V/460V)</li>
                <li>Continuous automated temperature monitoring</li>
                <li>Pre-trip inspections (PTI) to IICL standard</li>
                <li>Reefer unit repairs: Carrier, Thermo King, Daikin</li>
                <li>Temperature log export for client records</li>
                <li>Genset hire for off-power transport</li>
              </ul>
              <div style="display:flex;gap:16px;margin-top:28px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="navigateToPage('booking')">Book Reefer Slot →</button>
                <button class="btn-secondary" onclick="navigateToPage('contact')">Enquire →</button>
              </div>
            </div>
            <div class="sidebar-box">
              <h4>Reefer Specs</h4>
              <div class="sidebar-item"><div class="sidebar-label">Plug-in Points</div><p>200+ (380V / 440V / 460V)</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Temperature Range</div><p>-25°C to +25°C</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Monitoring</div><p>24/7 automated · Alarm alerts to ops team & client</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Supported Brands</div><p>Carrier · Thermo King · Daikin · StarCool</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Genset Hire</div><p>Available for road transport · All sizes</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Capacity</div><p>800 TEU reefer capacity</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'container-repairs': {
    parent: 'services',
    title: 'Container Repairs',
    hero: 'images/gargo4.png',
    tag: ' ✦ Container Repairs — 04',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">IICL-Certified Container Repair</h2>
              <p>Our 10-bay M&R workshop at the Changamwe depot handles everything from minor panel dents to full structural repairs and floor replacements. All inspections follow IICL methodology and all repair work is documented with before-and-after photography.</p>
              <p>We provide full repair estimates (M&R surveys) for shipping lines, including labour, materials, and time estimates. Completed repairs are signed off by our IICL-certified inspector and documented in the container's EIR record.</p>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin:28px 0 16px;">Repair Capabilities</h3>
              <ul class="rate-features" style="list-style:none;padding:0;">
                <li>IICL damage surveys and repair estimates</li>
                <li>Structural repairs: corner castings, rails, crossmembers</li>
                <li>Panel repairs: walls, roof, floor panels</li>
                <li>Wooden floor replacement (hardwood and bamboo)</li>
                <li>Door seals, hinges, locking rods</li>
                <li>Exterior painting and rust treatment</li>
                <li>Reefer unit first-line repair and PTI</li>
                <li>Sandblasting and protective coatings</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('booking')">Book a Repair →</button>
            </div>
            <div class="sidebar-box">
              <h4>Workshop Specs</h4>
              <div class="sidebar-item"><div class="sidebar-label">Repair Bays</div><p>10 bays · 20ft and 40ft capable</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Certification</div><p>IICL Certified Inspector on site</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Turnaround</div><p>Minor repairs: same day<br>Major structural: 2–5 days</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Documentation</div><p>Repair estimate · Before/after photos · Completion certificate</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'container-washing': {
    parent: 'services',
    title: 'Container Washing',
    hero: 'images/gargo4.png',
    tag: ' ✦ Container Washing — 05',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Industrial Container Washing & Fumigation</h2>
              <p>Gargo Haven's 6-lane washing bay provides high-pressure interior and exterior washing for all container types. Our fumigation chamber issues KEBS-compliant fumigation certificates for agricultural and food-grade cargo.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>High-pressure exterior washing</li>
                <li>Interior steam cleaning</li>
                <li>Food-grade sanitisation</li>
                <li>Fumigation (methyl bromide / phosphine)</li>
                <li>Fumigation certificates issued (KEBS compliant)</li>
                <li>Odour treatment for contaminated units</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('booking')">Book Washing →</button>
            </div>
            <div class="sidebar-box">
              <h4>Washing Specs</h4>
              <div class="sidebar-item"><div class="sidebar-label">Washing Lanes</div><p>6 lanes · 20ft and 40ft</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Fumigation</div><p>Methyl bromide · Phosphine<br>KEBS certificates issued</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Turnaround</div><p>Washing: 2–4 hours<br>Fumigation: 24–48 hours</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'iicl-inspection': {
    parent: 'services',
    title: 'IICL Inspection',
    hero: 'images/gargo4.png',
    tag: ' ✦ IICL Inspection — 01',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">IICL Container Condition Surveys</h2>
              <p>All container inspections at Gargo Haven follow the IICL (Institute of International Container Lessors) standard — the globally accepted methodology for assessing container condition and estimating repair costs. Our IICL-certified inspector conducts surveys for gate-in, gate-out, pre-lease, and damage claim purposes.</p>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin:28px 0 16px;">Survey Types</h3>
              <ul class="rate-features" style="list-style:none;padding:0;">
                <li><strong>Gate-In Survey</strong> — Condition recorded on arrival at the depot</li>
                <li><strong>Gate-Out Survey</strong> — Condition confirmed on departure</li>
                <li><strong>Pre-Lease Survey</strong> — Condition assessment before container is leased to a shipper</li>
                <li><strong>Damage Survey</strong> — Assessment of damage for insurance or liability claims</li>
                <li><strong>M&R Estimate</strong> — Full repair cost estimate following IICL methodology</li>
                <li><strong>Annual Survey</strong> — Periodic condition reporting for shipping lines</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('booking')">Request Survey →</button>
            </div>
            <div class="sidebar-box">
              <h4>Inspection Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Standard</div><p>IICL 6th Edition</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Deliverables</div><p>Photo report · Damage codes · Repair estimate</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Turnaround</div><p>Report issued within 4 hours of survey</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Digital Access</div><p>Reports accessible via client portal</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'eir-processing': {
    parent: 'services',
    title: 'EIR Processing',
    hero: 'images/gargo2.png',
    tag: ' ✦ EIR Processing — 02',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Digital Equipment Interchange Receipts</h2>
              <p>Gargo Haven's EIR system is fully digital. Every container gate-in and gate-out at our depots generates an Equipment Interchange Receipt (EIR) that is stored in our system and accessible to clients instantly via the online portal. No more paper EIRs, no lost documents.</p>
              <p>EIRs include container number, ISO type, condition status, damage codes, condition photos, gate time, truck registration, and driver details. All EIRs are timestamped and tamper-proof.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>Digital EIR issued on gate-in and gate-out</li>
                <li>Condition photos embedded in EIR</li>
                <li>Accessible via client portal 24/7</li>
                <li>PDF download and email delivery</li>
                <li>Full damage code record (IICL format)</li>
                <li>Historical EIR archive — searchable by container</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('track')">Access EIR Portal →</button>
            </div>
            <div class="sidebar-box">
              <h4>EIR System Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Format</div><p>Digital · PDF · Email</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Issuance Time</div><p>Within 15 minutes of gate-in/out</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Access</div><p>Client portal · Email · API (on request)</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Archive</div><p>Full history since 2018 · Searchable</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'customs-documentation': {
    parent: 'services',
    title: 'Customs Documentation',
    hero: 'images/gargo2.png',
    tag: ' ✦ Value Added — 03',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Full Customs & KRA Documentation</h2>
              <p>Our compliance team manages all KRA customs documentation for bonded container movements, customs-cleared releases, and fumigation certification. Led by a former KRA Customs Officer, our team ensures every document is correct, complete, and compliant.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>KRA customs declarations</li>
                <li>Bonded transport documentation</li>
                <li>Container release authorisation</li>
                <li>Fumigation certificates (KEBS compliant)</li>
                <li>Phytosanitary certification assistance</li>
                <li>Delivery orders and gate passes</li>
                <li>Container handover certificates</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Talk to Our Compliance Team →</button>
            </div>
            <div class="sidebar-box">
              <h4>Compliance Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">KRA Compliance</div><p>Full — bonded transport & customs releases</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Fumigation</div><p>KEBS-compliant certificates issued</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Team</div><p>Former KRA officer on staff</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'container-leasing': {
    parent: 'services',
    title: 'Container Leasing',
    hero: 'images/gargo2.png',
    tag: ' ✦ Container Leasing — 04',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Container Leasing & Hire</h2>
              <p>Gargo Haven facilitates container leasing arrangements for clients who need containers for storage, office use, site facilities, or export loading — both short-term hire and long-term lease agreements are available.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>20ft and 40ft dry containers for hire</li>
                <li>Short-term (weekly) and long-term (annual) lease</li>
                <li>Container delivery to client site included</li>
                <li>IICL-inspected units — condition guaranteed</li>
                <li>Modification available: doors, vents, shelving</li>
                <li>Reefer containers for cold storage hire</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Enquire About Leasing →</button>
            </div>
            <div class="sidebar-box">
              <h4>Leasing Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Types Available</div><p>20ft · 40ft · 40HC · Reefer</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Lease Terms</div><p>Weekly · Monthly · Annual</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Delivery</div><p>To client site — all Mombasa locations</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'corporate-logistics': {
    parent: 'services',
    title: 'Corporate Logistics',
    hero: 'images/gargo1.png',
    tag: ' ✦ Corporate Logistics — 05',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">End-to-End Corporate Container Logistics</h2>
              <p>For businesses with regular, high-volume container movements, Gargo Haven offers dedicated corporate logistics packages — combining storage, transport, repairs, documentation, and a dedicated account manager under a single monthly agreement.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>Dedicated account manager</li>
                <li>Priority gate access at all depots</li>
                <li>Guaranteed truck availability</li>
                <li>Monthly volume pricing</li>
                <li>Consolidated invoicing and reporting</li>
                <li>24/7 operations support line</li>
                <li>Custom SLA agreements</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Request Corporate Proposal →</button>
            </div>
            <div class="sidebar-box">
              <h4>Corporate Package Highlights</h4>
              <div class="sidebar-item"><div class="sidebar-label">Minimum Volume</div><p>50+ TEUs per month</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Account Manager</div><p>Dedicated single point of contact</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Reporting</div><p>Weekly and monthly volume reports</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Billing</div><p>Consolidated monthly invoice</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  /* ══ DEPOT ════════════════════════════════════════════════════════ */

  'changamwe-depot': {
    parent: 'depot',
    title: 'Changamwe Main Depot',
    hero: 'images/gargo4.png',
    tag: '✦ Main Facility',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Gargo Haven Changamwe — Main Depot</h2>
              <p>Our Changamwe facility is the operational heart of Gargo Haven — the largest and most fully equipped depot in our network. Located directly off the Mombasa–Nairobi Highway with direct access to Mombasa Port and APM Terminals, the depot offers the fastest container turnaround in the region.</p>
              <p>The facility spans over 10 acres and includes a general storage yard, dedicated reefer zone with 200+ plug-in points, a 10-bay M&R repair workshop, a 6-lane washing bay, a fumigation chamber, and a full client services centre.</p>
              <div class="depot-stats-mega" style="margin:32px 0;">
                <div class="dsm"><strong>5,000+</strong><span>TEU Capacity</span></div>
                <div class="dsm"><strong>200+</strong><span>Reefer Plugs</span></div>
                <div class="dsm"><strong>10</strong><span>Repair Bays</span></div>
                <div class="dsm"><strong>24/7</strong><span>Operations</span></div>
                <div class="dsm"><strong>4</strong><span>Gate Lanes</span></div>
                <div class="dsm"><strong>30min</strong><span>Gate Turnaround</span></div>
              </div>
            </div>
            <div class="sidebar-box">
              <h4>Changamwe Depot Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Address</div><p>Off Mombasa–Nairobi Highway<br>Changamwe, Mombasa 80100</p></div>
              <div class="sidebar-item"><div class="sidebar-label">GPS Coordinates</div><p>-4.0435° S, 39.6682° E</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Gate Hours</div><p>Mon–Sat: 6AM–10PM<br>Sun: 8AM–4PM<br>Emergency: 24/7</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Phone</div><p>+254 700 000 000</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Email</div><p>depot@gargohaven.co.ke</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Gate-In Requirements</div><p>Container number · EIR · Driver ID · Booking reference</p></div>
            </div>
          </div>
        </div>
      </section>
      <section class="section-dark">
        <div class="section-inner">
          <div class="section-header">
          <div class="section-tag"> ✦ Yard Layout</div><h2 class="section-title">Depot <span>Zones</span></h2></div>
          <div class="depot-zones-grid">
            <div class="zone-card"><div class="zone-label">Zone A — General Storage</div><div class="zone-desc">20ft and 40ft dry containers. Double-stacked racking. Capacity: 3,000 TEU.</div></div>
            <div class="zone-card"><div class="zone-label">Zone B — Reefer Yard</div><div class="zone-desc">200+ plug-in points. 24/7 temp monitoring. PTI pits. Capacity: 800 TEU.</div></div>
            <div class="zone-card"><div class="zone-label">Zone C — M&R Workshop</div><div class="zone-desc">10-bay IICL-certified repair workshop. Structural, floor, and panel repairs.</div></div>
            <div class="zone-card"><div class="zone-label">Zone D — Washing Bay</div><div class="zone-desc">6-lane high-pressure washing. Fumigation chamber. KEBS certificates.</div></div>
            <div class="zone-card"><div class="zone-label">Zone E — OOG & Specials</div><div class="zone-desc">Flat-racks, open-tops, tank containers, out-of-gauge cargo laydown.</div></div>
            <div class="zone-card"><div class="zone-label">Client Services Centre</div><div class="zone-desc">Documentation desk, self-service kiosk, relationship manager workspace.</div></div>
          </div>
        </div>
      </section>`,
  },

  'consolebase-icd': {
    parent: 'depot',
    title: 'Consolebase ICD',
    hero: 'images/gargo4.png',
    tag: ' ✦ Alliance Depot',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Consolebase ICD — Alliance Depot</h2>
              <p>Gargo Haven maintains a formal depot alliance agreement with Consolebase Inland Container Depot, strategically located on the Mombasa Road corridor. The alliance enables seamless container shuttle and transfer services between Consolebase and Gargo Haven's Changamwe main depot.</p>
              <p>Clients with containers at Consolebase can utilise Gargo Haven's truck fleet for repositioning, haulage, and transport services. Our operations team liaises directly with Consolebase gate management to coordinate movements.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:24px;">
                <li>Container shuttle: Consolebase ↔ Changamwe Depot</li>
                <li>Container pickup from Consolebase for client delivery</li>
                <li>Transfer to Mombasa Port (KPA) or APM Terminals</li>
                <li>Direct booking through Gargo Haven — no separate Consolebase account needed</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('booking')">Book a Consolebase Movement →</button>
            </div>
            <div class="sidebar-box">
              <h4>Consolebase ICD Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Location</div><p>Mombasa Road, Mombasa</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Gargo Haven Service</div><p>Shuttle · Transfer · Port haulage</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Booking</div><p>Via Gargo Haven — single point of contact</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'hakika-depot': {
    parent: 'depot',
    title: 'Hakika Depot',
    hero: 'images/gargo4.png',
    tag: ' ✦ Alliance Depot',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Hakika Container Depot — Alliance Partner</h2>
              <p>Located in Changamwe, Hakika Container Depot is a key alliance partner in the Gargo Haven network. The partnership provides additional storage capacity during peak periods and enables overflow management for large-volume clients.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:24px;">
                <li>Overflow capacity during peak periods</li>
                <li>Container repositioning: Hakika ↔ Changamwe</li>
                <li>Port haulage from Hakika via Gargo Haven fleet</li>
                <li>Cross-depot EIR management</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Enquire About Hakika Movements →</button>
            </div>
            <div class="sidebar-box">
              <h4>Hakika Depot Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Location</div><p>Jomvu Miknjuni, Mombasa</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Gargo Haven Role</div><p>Overflow storage · Transport partner</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Access</div><p>Booked via Gargo Haven</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'kibarani-depot': {
    parent: 'depot',
    title: 'Kibarani Depot',
    hero: 'images/gargo4.png',
    tag: ' ✦ Alliance Depot',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Kibarani Depot — Repair & Overflow Partner</h2>
              <p>Kibarani Depot serves as an overflow and specialised repair partner in the Gargo Haven network, located in the Kibarani area of Mombasa. The facility handles containers requiring extended repair work and provides additional yard space for large-volume movements.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:24px;">
                <li>Extended repair and refurbishment work</li>
                <li>Overflow yard capacity for large shipments</li>
                <li>Container repositioning via Gargo Haven fleet</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Enquire →</button>
            </div>
            <div class="sidebar-box">
              <h4>Kibarani Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Location</div><p>Kibarani, Mombasa</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Speciality</div><p>Overflow storage · Extended M&R</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'fortune-depot': {
    parent: 'depot',
    title: 'Fortune Depot',
    hero: 'images/gargo4.png',
    tag: ' ✦ Alliance Depot',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Fortune Container Depot — Alliance Partner</h2>
              <p>Fortune Container Depot is located in the Mombasa Industrial Area and provides specialised storage and overflow capacity as a Gargo Haven alliance partner. The facility is particularly well-suited for OOG and heavy industrial containers.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:24px;">
                <li>OOG container laydown and storage</li>
                <li>Industrial area proximity — ideal for factory deliveries</li>
                <li>Overflow container storage</li>
                <li>Repositioning via Gargo Haven fleet</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Enquire About Fortune Movements →</button>
            </div>
            <div class="sidebar-box">
              <h4>Fortune Depot Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Location</div><p>Mombasa Industrial Area</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Speciality</div><p>OOG · Industrial overflow</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'capacity-dashboard': {
    parent: 'depot',
    title: 'Capacity Dashboard',
    hero: 'images/gargo4.png',
    tag: ' ✦ Live Operations',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦ Live Capacity</div>
            <h2 class="section-title">Depot <span>Capacity Dashboard</span></h2>
            <p class="section-sub">Real-time capacity and occupancy across the Gargo Haven depot network.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-bottom:40px;">
            ${[
              { zone:'Changamwe — Zone A (Dry)', cap:3000, used:2140, label:'General Storage' },
              { zone:'Changamwe — Zone B (Reefer)', cap:800, used:312, label:'Reefer Yard' },
              { zone:'Changamwe — Zone C (M&R)', cap:500, used:88, label:'Repair Holding' },
              { zone:'Changamwe — Zone E (OOG)', cap:200, used:44, label:'Out-of-Gauge' },
            ].map(z => {
              const pct = Math.round((z.used/z.cap)*100);
              const color = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e';
              return `<div style="background:var(--dark-card);border:1px solid var(--border);border-radius:10px;padding:24px;">
                <div style="font-size:11px;color:var(--gray);letter-spacing:1px;margin-bottom:8px;">${z.label}</div>
                <div style="font-family:var(--font-main);font-size:18px;color:var(--white);margin-bottom:4px;">${z.zone}</div>
                <div style="display:flex;align-items:center;gap:12px;margin:16px 0 8px;">
                  <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 1s ease;"></div>
                  </div>
                  <span style="font-size:14px;color:${color};font-weight:600;">${pct}%</span>
                </div>
                <div style="font-size:12px;color:var(--gray-light);">${z.used.toLocaleString()} / ${z.cap.toLocaleString()} TEU occupied</div>
              </div>`;
            }).join('')}
          </div>
          <div style="background:var(--dark-card);border:1px solid var(--border);border-radius:10px;padding:24px;text-align:center;">
            <div style="font-size:12px;color:var(--gray);letter-spacing:1px;margin-bottom:8px;">LAST UPDATED</div>
            <div style="font-family:var(--font-main);font-size:20px;color:var(--gold);" id="dashboardTime">—</div>
            <p style="color:var(--gray-light);font-size:13px;margin-top:8px;">Dashboard updates every 15 minutes from our yard management system. For real-time availability, call our depot team on +254 108 613 789.</p>
          </div>
        </div>
      </section>`,
    afterRender: () => {
      const el = document.getElementById('dashboardTime');
      if (el) el.textContent = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) + ' EAT';
    }
  },

  'gate-in-requirements': {
    parent: 'depot',
    title: 'Gate-In Requirements',
    hero: 'images/gargo4.png',
    tag: ' ✦ Gate-In Process',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦ Gate-In Process</div>
            <h2 class="section-title">Gate-In <span>Requirements</span></h2>
            <p class="section-sub">What you need to bring and what to expect when depositing a container at Gargo Haven.</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:40px;">
            <div>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin-bottom:20px;">Required Documents</h3>
              ${['Booking reference number (from Gargo Haven)','Original Release Order / Delivery Order','Valid container EIR from originating depot','Driver national ID or passport','Truck registration documents','Container seal number (if applicable)','Shipping line authority letter (for third-party deposits)'].map(item => `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);"><span style="color:var(--gold);margin-top:2px;">✓</span><span style="color:var(--gray-light);font-size:14px;">${item}</span></div>`).join('')}
            </div>
            <div>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin-bottom:20px;">Gate-In Process Steps</h3>
              ${['Driver presents at Gate 1 with documents','Gate officer verifies booking reference and documents','Container scanned and photographed (all four sides + floor)','IICL condition check — damage noted and photographed','Container weighed at gate axle scale','Driver receives digital EIR confirmation via SMS','Container assigned to yard slot by digital yard management system','Full digital EIR available in client portal within 15 minutes'].map((step, i) => `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);"><span style="color:var(--gold);font-weight:700;font-size:13px;min-width:24px;">0${i+1}</span><span style="color:var(--gray-light);font-size:14px;">${step}</span></div>`).join('')}
            </div>
          </div>
          <div style="background:var(--dark-card);border:1px solid var(--gold);border-radius:10px;padding:28px;">
            <h4 style="font-family:var(--font-main);color:var(--gold);margin-bottom:12px;">Important Notes</h4>
            <ul style="list-style:none;padding:0;margin:0;">
              <li style="color:var(--gray-light);font-size:13px;padding:6px 0;">• Pre-booking is mandatory — walk-in gate-ins are subject to space availability and may be refused during peak hours.</li>
              <li style="color:var(--gray-light);font-size:13px;padding:6px 0;">• Container must arrive within the booking window. Late arrivals (>2 hours) require re-confirmation.</li>
              <li style="color:var(--gray-light);font-size:13px;padding:6px 0;">• Reefer containers must be pre-booked on the reefer booking channel to ensure plug-in availability.</li>
              <li style="color:var(--gray-light);font-size:13px;padding:6px 0;">• Damaged containers beyond standard IICL acceptance may be held pending M&R authorisation from the shipping line.</li>
            </ul>
          </div>
        </div>
      </section>`,
  },

  'gate-out-requirements': {
    parent: 'depot',
    title: 'Gate-Out Requirements',
    hero: 'images/gargo4.png',
    tag: ' ✦ Gate-Out Process',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦ Gate-Out Process</div>
            <h2 class="section-title">Gate-Out <span>Requirements</span></h2>
            <p class="section-sub">What you need to collect a container from Gargo Haven depot.</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:40px;">
            <div>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin-bottom:20px;">Required Documents</h3>
              ${['Gate-out booking reference (pre-booked via Gargo Haven)','Original Release Order or Delivery Order','Shipping line release authorisation (stamped)','Driver national ID or passport','Truck registration documents','Any outstanding storage fee settlement','Container number and size confirmation'].map(item => `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);"><span style="color:var(--gold);margin-top:2px;">✓</span><span style="color:var(--gray-light);font-size:14px;">${item}</span></div>`).join('')}
            </div>
            <div>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--white);margin-bottom:20px;">Gate-Out Process Steps</h3>
              ${['Pre-book gate-out slot (minimum 2 hours in advance)','Driver presents at Gate 1 with all documents','Gate officer verifies release authorisation and identity','Container located and extracted from yard by reach stacker','Final condition check and photos taken at gate','EIR gate-out issued — shows condition on departure','Seal applied (if required by shipping line)','Driver receives gate pass and departs'].map((step, i) => `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);"><span style="color:var(--gold);font-weight:700;font-size:13px;min-width:24px;">0${i+1}</span><span style="color:var(--gray-light);font-size:14px;">${step}</span></div>`).join('')}
            </div>
          </div>
        </div>
      </section>`,
  },

  /* ══ BOOKING ══════════════════════════════════════════════════════ */

  'bulk-bookings': {
    parent: 'booking',
    title: 'Bulk Bookings',
    hero: 'images/gargo1.png',
    tag: ' ✦ Bulk Container Bookings',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Bulk Container Bookings</h2>
              <p>For shipping lines, freight forwarders, and logistics companies moving 10 or more containers in a single operation, Gargo Haven's bulk booking process streamlines scheduling, documentation, and billing into a single coordinated service.</p>
              <p>Bulk bookings receive priority scheduling, guaranteed truck allocation, and a dedicated operations coordinator for the duration of the movement. Volume discounts apply from 10+ TEUs.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>Priority truck scheduling — guaranteed availability</li>
                <li>Dedicated ops coordinator for the movement</li>
                <li>Consolidated documentation package</li>
                <li>Volume pricing from 10+ TEUs</li>
                <li>Real-time tracking for all trucks in the movement</li>
                <li>Single invoice for the entire operation</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Request Bulk Booking →</button>
            </div>
            <div class="sidebar-box">
              <h4>Bulk Booking Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Minimum Volume</div><p>10+ containers per movement</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Lead Time</div><p>24 hours for standard bulk · 48 hours for large operations</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Coordinator</div><p>Dedicated point of contact for the movement</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Billing</div><p>Single consolidated invoice post-movement</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'request-quotation': {
    parent: 'booking',
    title: 'Request Quotation',
    hero: 'images/gargo1.png',
    tag: ' ✦ Quotation Request',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="booking-layout">
            <div class="booking-form-container">
              <div class="form-header">
                <div class="form-header-title">Quotation Request</div>
                <div class="form-header-id">GH-QUOTE-PENDING</div>
              </div>
              <div class="form-body">
                <div class="form-section-title">01 — SERVICE REQUIRED</div>
                <div class="cargo-types">
                  <button class="cargo-type-btn selected" onclick="selectCargoType(this)">Depot Storage</button>
                  <button class="cargo-type-btn" onclick="selectCargoType(this)">Port Haulage</button>
                  <button class="cargo-type-btn" onclick="selectCargoType(this)">Container Repair</button>
                  <button class="cargo-type-btn" onclick="selectCargoType(this)">Reefer Management</button>
                  <button class="cargo-type-btn" onclick="selectCargoType(this)">Full Package</button>
                </div>
                <div class="form-section-title">02 — MOVEMENT DETAILS</div>
                <div class="form-grid">
                  <div class="form-group"><label class="form-label">Origin</label><select class="form-select"><option>Mombasa Port (KPA)</option><option>APM Terminals</option><option>Consolebase ICD</option><option>Hakika Depot</option><option>Client Yard</option></select></div>
                  <div class="form-group"><label class="form-label">Destination</label><select class="form-select"><option>Gargo Haven Depot</option><option>Mombasa Port (KPA)</option><option>APM Terminals</option><option>Client Yard</option></select></div>
                  <div class="form-group"><label class="form-label">Container Type</label><select class="form-select"><option>20ft Standard</option><option>40ft Standard</option><option>40ft High Cube</option><option>20ft Reefer</option><option>40ft Reefer</option></select></div>
                  <div class="form-group"><label class="form-label">Number of Containers</label><input type="number" class="form-input" value="1" min="1"></div>
                  <div class="form-group"><label class="form-label">Required Date</label><input type="date" class="form-input"></div>
                  <div class="form-group"><label class="form-label">Storage Duration (days)</label><input type="number" class="form-input" value="0" min="0"></div>
                  <div class="form-group full"><label class="form-label">Additional Requirements</label><textarea class="form-textarea" placeholder="Special cargo, reefer temperature settings, repair type, etc."></textarea></div>
                </div>
                <div class="form-section-title">03 — YOUR DETAILS</div>
                <div class="form-grid">
                  <div class="form-group"><label class="form-label">Full Name</label><input type="text" class="form-input" placeholder="Your name"></div>
                  <div class="form-group"><label class="form-label">Company</label><input type="text" class="form-input" placeholder="Company name"></div>
                  <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" placeholder="you@company.com"></div>
                  <div class="form-group"><label class="form-label">Phone / WhatsApp</label><input type="tel" class="form-input" placeholder="+254 700 000 000"></div>
                </div>
                <button class="form-submit" onclick="showNotification('Quote Requested','Our team will respond within 2 hours during business hours.')">REQUEST QUOTATION →</button>
              </div>
            </div>
            <div class="booking-info">
              <div class="info-feature-box">
                <div class="info-feature"><div class="info-icon"></div><div><div class="info-title">2-Hour Response</div><div class="info-text">All quotation requests receive a response within 2 business hours.</div></div></div>
                <div class="info-feature"><div class="info-icon"></div><div><div class="info-title">Transparent Pricing</div><div class="info-text">No hidden fees. All-inclusive quotes with full cost breakdown.</div></div></div>
                <div class="info-feature"><div class="info-icon"></div><div><div class="info-title">Volume Discounts</div><div class="info-text">Discounts available for 10+ container movements and monthly contracts.</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'dedicated-contracts': {
    parent: 'booking',
    title: 'Dedicated Contracts',
    hero: 'images/gargo1.png',
    tag: ' ✦ Dedicated Contract Services',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Dedicated Service Contracts</h2>
              <p>For shipping lines, freight forwarders, and corporate logistics teams with regular, recurring container movements, Gargo Haven offers dedicated service contracts that lock in truck availability, storage capacity, and pricing for 3, 6, or 12-month periods.</p>
              <p>Contract clients receive guaranteed truck allocation, priority gate access, a dedicated account manager, monthly reporting, and consolidated billing — eliminating the need to book each movement individually.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>Guaranteed truck availability — no last-minute shortages</li>
                <li>Locked-in pricing for the contract period</li>
                <li>Priority gate access at all Gargo Haven depots</li>
                <li>Dedicated account manager — single point of contact</li>
                <li>Monthly movement reporting and analysis</li>
                <li>Consolidated monthly invoicing</li>
                <li>24/7 dedicated operations support line</li>
              </ul>
              <button class="btn-primary" style="margin-top:28px;" onclick="navigateToPage('contact')">Discuss a Contract →</button>
            </div>
            <div class="sidebar-box">
              <h4>Contract Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Contract Terms</div><p>3 months · 6 months · 12 months</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Minimum Volume</div><p>50+ TEUs per month</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Pricing</div><p>Fixed rate for contract duration</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Billing</div><p>Monthly consolidated invoice</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  /* ══ FLEET ════════════════════════════════════════════════════════ */

  'fleet-overview': {
    parent: 'fleet',
    title: 'Fleet Overview',
    hero: 'images/gargo4.png',
    tag: '✦ Our Assets',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦ Fleet Overview</div>
            <h2 class="section-title">120+ Assets, <span>Zero Blind Spots</span></h2>
            <p class="section-sub">Every unit in the Gargo Haven fleet carries a live GPS tracker. Our client portal gives you real-time position, speed, and ETA for any truck carrying your container.</p>
          </div>
          <div class="depot-stats-mega" style="margin-bottom:48px;">
            <div class="dsm"><strong>120+</strong><span>Trucks</span></div>
            <div class="dsm"><strong>6</strong><span>Reach Stackers</span></div>
            <div class="dsm"><strong>20</strong><span>Forklifts</span></div>
            <div class="dsm"><strong>100%</strong><span>GPS Coverage</span></div>
            <div class="dsm"><strong>40T</strong><span>Max Payload</span></div>
            <div class="dsm"><strong>24/7</strong><span>Availability</span></div>
          </div>
          <div class="fleet-grid">
            <div class="fleet-card"><div class="fleet-visual"></div><div class="fleet-info"><div class="fleet-type">ROAD · HEAVY HAULAGE</div><div class="fleet-name">Container Tractor Units</div><div class="fleet-specs"><div class="spec-item"><div class="spec-label">Units</div><div class="spec-val">80</div></div><div class="spec-item"><div class="spec-label">Capacity</div><div class="spec-val">40 TON</div></div><div class="spec-item"><div class="spec-label">GPS</div><div class="spec-val">LIVE</div></div><div class="spec-item"><div class="spec-label">Coverage</div><div class="spec-val">ALL MOMBASA</div></div></div></div></div>
            <div class="fleet-card"><div class="fleet-visual"></div><div class="fleet-info"><div class="fleet-type">REEFER TRANSPORT</div><div class="fleet-name">Genset-Equipped Trucks</div><div class="fleet-specs"><div class="spec-item"><div class="spec-label">Units</div><div class="spec-val">20</div></div><div class="spec-item"><div class="spec-label">Temp</div><div class="spec-val">-25°C</div></div><div class="spec-item"><div class="spec-label">Monitoring</div><div class="spec-val">LIVE</div></div><div class="spec-item"><div class="spec-label">Genset</div><div class="spec-val">ON-BOARD</div></div></div></div></div>
            <div class="fleet-card"><div class="fleet-visual"></div><div class="fleet-info"><div class="fleet-type">YARD · LIFTING EQUIPMENT</div><div class="fleet-name">Reach Stackers</div><div class="fleet-specs"><div class="spec-item"><div class="spec-label">Units</div><div class="spec-val">6</div></div><div class="spec-item"><div class="spec-label">Capacity</div><div class="spec-val">45 TON</div></div><div class="spec-item"><div class="spec-label">Stack Height</div><div class="spec-val">5 HIGH</div></div><div class="spec-item"><div class="spec-label">Telematics</div><div class="spec-val">LIVE</div></div></div></div></div>
            <div class="fleet-card"><div class="fleet-visual"></div><div class="fleet-info"><div class="fleet-type">YARD · LIGHT EQUIPMENT</div><div class="fleet-name">Forklifts & Yard Tractors</div><div class="fleet-specs"><div class="spec-item"><div class="spec-label">Units</div><div class="spec-val">20</div></div><div class="spec-item"><div class="spec-label">Cap.</div><div class="spec-val">16 TON</div></div><div class="spec-item"><div class="spec-label">Type</div><div class="spec-val">DIESEL/ELEC</div></div><div class="spec-item"><div class="spec-label">Hours</div><div class="spec-val">24/7</div></div></div></div></div>
          </div>
        </div>
      </section>`,
  },

  'gps-monitoring': {
    parent: 'fleet',
    title: 'GPS Monitoring',
    hero: 'images/gargo4.png',
    tag: ' ✦ GPS Technology',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">Real-Time Fleet GPS Monitoring</h2>
              <p>Launched in 2018, Gargo Haven's proprietary GPS platform was the first of its kind in Mombasa — giving clients live visibility of their container's truck, updated every 60 seconds. Since then, we have expanded the platform to cover container yard positions, driver details, ETA calculations, and full trip history.</p>
              <h3 style="font-family:var(--font-main);font-size:20px;color:var(--gold);margin:28px 0 16px;">What You Can Track</h3>
              <ul class="rate-features" style="list-style:none;padding:0;">
                <li>Live truck location on map (updates every 60 seconds)</li>
                <li>Current speed and direction</li>
                <li>Driver name and phone number</li>
                <li>ETA to destination (calculated in real-time)</li>
                <li>Full trip history and route replay</li>
                <li>Geofence alerts — notified when truck enters/exits zones</li>
                <li>Container yard position at our depots</li>
              </ul>
              <div style="display:flex;gap:16px;margin-top:28px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="navigateToPage('track')">Open Tracking Portal →</button>
                <button class="btn-secondary" onclick="navigateToPage('contact')">Request API Access →</button>
              </div>
            </div>
            <div class="sidebar-box">
              <h4>GPS System Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Update Frequency</div><p>Every 60 seconds (live)</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Coverage</div><p>100% of fleet (120+ units)</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Client Access</div><p>Web portal · SMS alerts · API (enterprise)</p></div>
              <div class="sidebar-item"><div class="sidebar-label">History</div><p>Full trip replay — 90-day archive</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Alerts</div><p>SMS + Email: geofence · delay · breakdown</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'maintenance-center': {
    parent: 'fleet',
    title: 'Maintenance Center',
    hero: 'images/gargo4.png',
    tag: ' ✦ Fleet Operations',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="intro-grid">
            <div class="intro-body">
              <h2 style="font-family:var(--font-main);font-size:28px;color:var(--gold);margin-bottom:20px;">In-House Fleet Maintenance</h2>
              <p>Gargo Haven operates its own vehicle maintenance workshop at the Changamwe depot, ensuring our 120+ truck fleet is always in peak operational condition. In-house maintenance means faster turnaround, lower downtime, and full control over maintenance quality.</p>
              <ul class="rate-features" style="list-style:none;padding:0;margin-top:20px;">
                <li>Scheduled preventive maintenance programme</li>
                <li>Engine, transmission, and hydraulics servicing</li>
                <li>Tyre management and replacement</li>
                <li>Brake and suspension inspection</li>
                <li>Electrical and GPS system maintenance</li>
                <li>Reach stacker and forklift servicing</li>
                <li>24/7 breakdown response for on-road units</li>
              </ul>
            </div>
            <div class="sidebar-box">
              <h4>Workshop Details</h4>
              <div class="sidebar-item"><div class="sidebar-label">Location</div><p>Changamwe Main Depot</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Service Bays</div><p>8 heavy vehicle bays</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Hours</div><p>6AM–10PM daily<br>24/7 emergency breakdown</p></div>
              <div class="sidebar-item"><div class="sidebar-label">Fleet Uptime</div><p>Target 96%+ monthly fleet availability</p></div>
            </div>
          </div>
        </div>
      </section>`,
  },

  /* ══ TRACK ════════════════════════════════════════════════════════ */

  'container-tracking': {
    parent: 'track',
    title: 'Container Tracking',
    hero: 'images/gargo2.png',
    tag: ' ✦ Track Assets',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="tracking-container">
            <div class="section-header">
              <div class="section-tag"> ✦ Container Tracking</div>
              <h2 class="section-title">Track Your <span>Container</span></h2>
              <p class="section-sub">Enter a container number to see live status, yard position, truck location, and full movement history.</p>
            </div>
            <div class="tracking-tabs"><button class="track-tab active">By Container No.</button></div>
            <div class="tracking-body">
              <div class="tab-pane">
                <div class="track-search">
                  <input type="text" class="track-input" id="subTrackInput" placeholder="Enter container number (e.g. MSCU1234567)">
                  <button class="track-btn" onclick="
                    const v=document.getElementById('subTrackInput').value.trim();
                    if(v){document.getElementById('fakeTrackInput').value=v;navigateToPage('track');setTimeout(()=>{if(document.querySelector('.track-btn')){document.getElementById('trackInput').value=v;}},300);}
                  ">TRACK NOW →</button>
                </div>
                <div class="track-sample-hint">Try: MSCU1234567 · TCKU9876543 · GHTU0001234</div>
              </div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'truck-tracking': {
    parent: 'track',
    title: 'Truck Tracking',
    hero: 'images/gargo2.png',
    tag: ' ✦ Truck Tracking',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="tracking-container">
            <div class="section-header">
              <div class="section-tag"> ✦ Truck Tracking</div>
              <h2 class="section-title">Track Your <span>Truck</span></h2>
              <p class="section-sub">Find any Gargo Haven truck by registration number or driver name.</p>
            </div>
            <div class="tracking-tabs"><button class="track-tab active">By Truck Reg.</button></div>
            <div class="tracking-body">
              <div class="tab-pane">
                <div class="track-search">
                  <input type="text" class="track-input" placeholder="Enter truck reg or driver name (e.g. KCB 421G)">
                  <button class="track-btn" onclick="navigateToPage('track');setTimeout(()=>{document.querySelectorAll('.track-tab')[1]&&document.querySelectorAll('.track-tab')[1].click();},400);">TRACK TRUCK →</button>
                </div>
                <div class="track-sample-hint">Try: KCB 421G · KDB 889T · Ali Hassan</div>
              </div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'driver-tracking': {
    parent: 'track',
    title: 'Driver Tracking',
    hero: 'images/gargo2.png',
    tag: ' ✦ Driver Tracking',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="tracking-container">
            <div class="section-header">
              <div class="section-tag"> ✦ Driver Tracking</div>
              <h2 class="section-title">Find a <span>Driver</span></h2>
              <p class="section-sub">Search by driver name or employee number to get their live truck location and contact details.</p>
            </div>
            <div class="tracking-tabs"><button class="track-tab active">By Driver Name/ID.</button></div>
            <div class="tracking-body">
              <div class="tab-pane">
                <div class="track-search">
                  <input type="text" class="track-input" placeholder="Enter driver name or ID (e.g. Ali Hassan)">
                  <button class="track-btn" onclick="navigateToPage('track');">FIND DRIVER →</button>
                </div>
                <div class="track-sample-hint">Try: Ali Hassan · James Mwangi · GH-DRV-044</div>
              </div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'booking-status': {
    parent: 'track',
    title: 'Booking Status',
    hero: 'images/gargo2.png',
    tag: ' ✦ Track Documents',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="tracking-container">
            <div class="section-header">
              <div class="section-tag"> ✦ Track Documents</div>
              <h2 class="section-title">Track Your <span>Booking</span></h2>
              <p class="section-sub">Enter your booking reference to see current status, truck assignment, and estimated completion.</p>
            </div>
            <div class="tracking-body">
              <div class="tab-pane">
                <div class="track-search">
                  <input type="text" class="track-input" id="bkStatusInput" placeholder="Enter booking reference (e.g. GH-2024-1234)">
                  <button class="track-btn" onclick="navigateToPage('track');setTimeout(()=>{document.querySelectorAll('.track-tab')[2]&&document.querySelectorAll('.track-tab')[2].click();},400);">CHECK STATUS →</button>
                </div>
                <div class="track-sample-hint">Reference format: GH-YYYY-XXXX</div>
              </div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'eir-status': {
    parent: 'track',
    title: 'EIR Status',
    hero: 'images/gargo2.png',
    tag: ' ✦ EIR Status',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="tracking-container">
            <div class="section-header">
              <div class="section-tag"> ✦ EIR Status</div>
              <h2 class="section-title">Find Your <span>EIR</span></h2>
              <p class="section-sub">Search for an Equipment Interchange Receipt by EIR number or container number.</p>
            </div>
            <div class="tracking-body">
              <div class="tab-pane">
                <div class="track-search">
                  <input type="text" class="track-input" placeholder="Enter EIR number or container number">
                  <button class="track-btn" onclick="navigateToPage('track');setTimeout(()=>{document.querySelectorAll('.track-tab')[3]&&document.querySelectorAll('.track-tab')[3].click();},400);">FIND EIR →</button>
                </div>
                <div class="track-sample-hint">EIR format: GH-EIR-XXXXXXX</div>
              </div>
            </div>
          </div>
        </div>
      </section>`,
  },

  'gps-dashboard': {
    parent: 'track',
    title: 'GPS Dashboard',
    hero: 'images/gargo2.png',
    tag: ' ✦ Live Intelligence',
    render: () => `
      <section class="section-light">
        <div class="section-inner">
          <div class="section-header">
            <div class="section-tag"> ✦ Live Intelligence</div>
            <h2 class="section-title">Live GPS <span>Dashboard</span></h2>
            <p class="section-sub">An overview of Gargo Haven's fleet activity right now. For full live map access, log in to the client portal.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:40px;" id="gpsDashStats"></div>
          <div style="background:var(--dark-card);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
            <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;">
              <div style="width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite;"></div>
              <span style="font-size:12px;letter-spacing:1px;color:var(--gold);">LIVE TRUCK ACTIVITY — MOMBASA CORRIDOR</span>
            </div>
            <div style="padding:16px 24px;" id="gpsTruckList"></div>
          </div>
        </div>
      </section>`,
    afterRender: () => {
      const trucks = [
        { reg:'KCB 421G', driver:'Ali Hassan Mwangi', loc:'Makupa Causeway', container:'MSCU1234567', status:'transit', route:'APM Terminals → Changamwe' },
        { reg:'KDA 882T', driver:'James Kariuki', loc:'Changamwe Roundabout', container:'TCKU9876543', status:'transit', route:'KPA Port → Gargo Haven Depot' },
        { reg:'KDB 301K', driver:'Hassan Salim', loc:'Gargo Haven Depot', container:'GHTU0001234', status:'yard', route:'Gate-in processing' },
        { reg:'KCA 774M', driver:'Peter Odhiambo', loc:'Port Reitz Road', container:'MAEU3456789', status:'transit', route:'Consolebase ICD → APM Terminals' },
        { reg:'KDD 556P', driver:'Fatuma Bakari', loc:'Kibarani', container:'EMCU7654321', status:'transit', route:'Kibarani Depot → KPA Port' },
        { reg:'KBZ 112R', driver:'David Njoroge', loc:'Gargo Haven Depot', container:'—', status:'idle', route:'Awaiting dispatch' },
      ];
      const stats = document.getElementById('gpsDashStats');
      if (stats) {
        const active = trucks.filter(t => t.status === 'transit').length;
        stats.innerHTML = [
          { label:'Trucks Active', val:active, color:'#22c55e' },
          { label:'In Yard', val:trucks.filter(t=>t.status==='yard').length, color:'#f59e0b' },
          { label:'Idle / Available', val:trucks.filter(t=>t.status==='idle').length, color:'var(--gray-light)' },
          { label:'Total Fleet', val:'120+', color:'var(--white)' },
        ].map(s => `<div style="background:var(--dark-card);border:1px solid var(--border);border-radius:10px;padding:24px;text-align:center;">
          <div style="font-size:32px;font-family:var(--font-main);color:${s.color};font-weight:700;">${s.val}</div>
          <div style="font-size:11px;color:var(--gray);letter-spacing:1px;margin-top:6px;">${s.label}</div>
        </div>`).join('');
      }
      const list = document.getElementById('gpsTruckList');
      if (list) {
        const statusColor = { transit:'#22c55e', yard:'#f59e0b', idle:'var(--gray)' };
        const statusLabel = { transit:'En Route', yard:'In Yard', idle:'Idle' };
        list.innerHTML = trucks.map(t => `
          <div style="display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--border);">
            <div style="width:8px;height:8px;background:${statusColor[t.status]};border-radius:50%;flex-shrink:0;"></div>
            <div style="min-width:100px;"><span style="font-size:13px;color:var(--white);font-weight:600;">${t.reg}</span></div>
            <div style="flex:1;"><div style="font-size:12px;color:var(--gray-light);">${t.driver}</div><div style="font-size:11px;color:var(--gray);margin-top:2px;">${t.route}</div></div>
            <div style="text-align:right;"><div style="font-size:12px;color:var(--gold);">${t.container}</div><div style="font-size:11px;color:${statusColor[t.status]};margin-top:2px;">${statusLabel[t.status]} · ${t.loc}</div></div>
          </div>`).join('');
      }
    }
  },
};


window.navigateToSubpage = function(key) {
  const sp = SUBPAGES[key];
  if (!sp) return;

 
  const parentPage = document.getElementById(sp.parent + '-page');
  if (!parentPage) return;

 
  let container = document.getElementById('subpage-' + key);

  if (!container) {
    container = document.createElement('div');
    container.id = 'subpage-' + key;
    container.className = 'page subpage-panel';

    container.innerHTML = `
      <section class="page-hero" style="background-image:url('${sp.hero || 'images/gargo1.png'}');min-height:240px;">
        <div class="hero-overlay-dark"></div>
        <div class="page-hero-content">
          <div style="margin-bottom:12px;">
            <button onclick="navigateToPage('${sp.parent}')" style="background:white;border:1px solid rgba(0, 0, 0, 0.3);color: black;padding:6px 16px;border-radius:4px;font-size:11px;letter-spacing:1px; font-weight:700;cursor:pointer;">← BACK TO ${sp.parent.toUpperCase()}</button>
          </div>
          <div class="section-tag">${sp.tag || ''}</div>
          <h1 class="section-title light" style="font-size:clamp(24px,4vw,36px);">${sp.title}</h1>
        </div>
      </section>
      ${sp.render()}`;

    const footer = document.querySelector('footer');
    document.body.insertBefore(container, footer);
  }


  document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));


  container.classList.add('active-page');
  window.scrollTo({ top: 0, behavior: 'smooth' });

 
  if (sp.afterRender) setTimeout(sp.afterRender, 100);
};


function wireNavLinks() {
  const linkMap = {
    // ABOUT
    'Company Overview':     'company-overview',
    'Mission & Vision':     'mission-vision',
    'Team':                 'team',
    'About Gargo':          'about-gargo',
    'Certifications':       'certifications',
    'Partners & Alliances': 'partners',

    // SERVICES
    'Container Storage':    'container-storage',
    'Port Haulage':         'port-haulage',
    'Reefer Monitoring':    'reefer-monitoring',
    'Container Repairs':    'container-repairs',
    'Container Washing':    'container-washing',
    'IICL Inspection':      'iicl-inspection',
    'EIR Processing':       'eir-processing',
    'Customs Documentation':'customs-documentation',
    'Container Leasing':    'container-leasing',
    'Corporate Logistics':  'corporate-logistics',

    // DEPOT
    'Changamwe Main Depot': 'changamwe-depot',
    'Consolebase ICD':      'consolebase-icd',
    'Hakika Depot':         'hakika-depot',
    'Kibarani Depot':       'kibarani-depot',
    'Fortune Depot':        'fortune-depot',
    'Capacity Dashboard':   'capacity-dashboard',
    'Gate-In Requirements': 'gate-in-requirements',
    'Gate-Out Requirements':'gate-out-requirements',

    // BOOKING
    'Bulk Bookings':        'bulk-bookings',
    'Request Quotation':    'request-quotation',
    'Dedicated Contracts':  'dedicated-contracts',
    'Service Agreements':   'dedicated-contracts',

    // TRACK
    'Container Tracking':   'container-tracking',
    'Truck Tracking':       'truck-tracking',
    'Driver Tracking':      'driver-tracking',
    'Booking Status':       'booking-status',
    'EIR Status':           'eir-status',
    'Delivery Reports':     'eir-status',
    'GPS Dashboard':        'gps-dashboard',

    // FLEET
    'Fleet Overview':       'fleet-overview',
    'Flatbed Trucks':       'fleet-overview',
    'Reefer Trucks':        'reefer-monitoring',
    'Reach Stackers':       'fleet-overview',
    'Yard Equipment':       'fleet-overview',
    'GPS Monitoring':       'gps-monitoring',
    'Maintenance Center':   'maintenance-center',
  };

  document.querySelectorAll('.mega-menu a, .mega-menu.small-menu a').forEach(a => {
    const text = a.textContent.trim().replace(/^[^\w]+/, '').trim();
    const match = Object.keys(linkMap).find(k => text.includes(k) || k.includes(text));
    if (match) {
      a.href = 'javascript:void(0)';
      a.onclick = () => navigateToSubpage(linkMap[match]);
    }
  });
}


const _origNavigate = window.navigateToPage;
window.navigateToPage = function(page) {
 
  document.querySelectorAll('.subpage-panel').forEach(sp => sp.classList.remove('active-page'));
  if (_origNavigate) _origNavigate(page);
};


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireNavLinks);
} else {
  wireNavLinks();
}

function makeAllDropdownsWorkLikeBooking() {
  const dropdownLinks = document.querySelectorAll('.mega-menu a, .small-menu a');
  
  dropdownLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const text = this.textContent.trim();
      
     
      const dropdown = this.closest('.nav-dropdown');
      if (dropdown) dropdown.classList.remove('hover');
      
   
      if (this.onclick && this.onclick.toString().includes('navigateToSubpage')) {
        return;
      }
      
     
      if (text.includes('Company Overview') || text.includes('About Gargo')) {
        navigateToSubpage('company-overview');
      } else if (text.includes('Storage') || text.includes('Depot')) {
        navigateToPage('depot');
      } else if (text.includes('Haulage') || text.includes('Transport')) {
        navigateToPage('booking');
      } else if (text.includes('Repair') || text.includes('Washing')) {
        navigateToPage('services');
      } else {
      
        navigateToPage(this.closest('.nav-dropdown').querySelector('a').textContent.toLowerCase().trim());
      }
    });
  });
}


document.addEventListener('DOMContentLoaded', makeAllDropdownsWorkLikeBooking);

function switchTrackTab(type, btn) {
  document.querySelectorAll('.track-tab').forEach(function(t){ t.classList.remove('active'); });
  btn.classList.add('active');
  const input = document.getElementById('trackInput');
  if (input) {
    const placeholders = {
      container: 'Enter container number e.g. MSCU1234567',
      truck: 'Enter truck registration e.g. KCB 421G',
      booking: 'Enter booking reference e.g. GH-2024-0001'
    };
    input.placeholder = placeholders[type] || placeholders.container;
    input.value = '';
  }
  closeTrackResult();
}
window.switchTrackTab = switchTrackTab;

/* ─── DEMO TRACK ─── */
function demoTrack(num) {
  const input = document.getElementById('trackInput');
  if (input) input.value = num;
  doTrack();
}
window.demoTrack = demoTrack;


(function() {
  function initReveal() {
    const imgs = document.querySelectorAll('.reveal-img');
    if (!imgs.length) return;
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    imgs.forEach(function(img){ observer.observe(img); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }
})();


/* ═══════════════════════════════════════════════════
   GARGO HAVEN — CLIENT AUTH MODAL
   Login · Create Account · Forgot Password
═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Real session, backed by Supabase Auth (see ghAuth* helpers above).
     Supabase persists its own session in localStorage; this sessionStorage
     copy is just a fast local cache so the nav/dashboard can render
     without waiting on a round trip. ── */
  function getCurrentUser() {
    try { return JSON.parse(sessionStorage.getItem('gh_session') || 'null'); } catch (e) { return null; }
  }
  function setCurrentUser(user) {
    sessionStorage.setItem('gh_session', JSON.stringify(user));
  }
  function clearCurrentUser() {
    sessionStorage.removeItem('gh_session');
  }
  // Splits the backend's single `name` field into a first name for greetings/nav
  function firstNameOf(user) {
    return user && user.name ? user.name.split(' ')[0] : 'there';
  }


  const style = document.createElement('style');
  style.textContent = `
    /* AUTH OVERLAY */
    #gh-auth-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.88);
      z-index: 9500;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity 0.35s ease;
      backdrop-filter: blur(6px);
    }
    #gh-auth-overlay.open {
      opacity: 1; pointer-events: all;
    }

    /* AUTH PANEL */
    .gh-auth-panel {
      background: #111;
      border: 1px solid rgba(201,162,39,0.35);
      border-radius: 14px;
      width: 100%;
      max-width: 480px;
      padding: 0;
      overflow: hidden;
      transform: translateY(24px) scale(0.97);
      transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
      box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(201,162,39,0.1);
      position: relative;
      max-height: 92vh;
      overflow-y: auto;
    }
    #gh-auth-overlay.open .gh-auth-panel {
      transform: translateY(0) scale(1);
    }

    /* PANEL HEADER */
    .gh-auth-header {
      background: linear-gradient(135deg, #0d0d0d 0%, #1a1400 100%);
      border-bottom: 1px solid rgba(201,162,39,0.2);
      padding: 28px 32px 24px;
      position: relative;
    }
    .gh-auth-logo {
      display: flex; 
      align-items: center; 
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .gh-auth-logo-img {
      justify-content: center; 
      align-items: center;
      text-align: center;
    }
    .gh-auth-logo-text {
      font-family: 'Cormorant Garamond', serif;
      font-size: 16px; font-weight: 700;
      letter-spacing: 2px;
      color: #fff;
    }
    .gh-auth-logo-text span { color: #c9a227; }
    .gh-auth-close {
      position: absolute; top: 20px; right: 20px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: #888; font-size: 14px;
      width: 32px; height: 32px;
      border-radius: 6px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .gh-auth-close:hover { background: rgba(201,162,39,0.12); color: #c9a227; border-color: rgba(201,162,39,0.3); }

    /* TABS */
    .gh-auth-tabs {
      display: flex; gap: 0;
    }
    .gh-auth-tab {
      flex: 1;
      background: transparent;
      border: none; border-bottom: 2px solid transparent;
      color: #666;
      font-family: 'DM Mono', monospace;
      font-size: 10px; font-weight: 500;
      letter-spacing: 1.5px; text-transform: uppercase;
      padding: 12px 16px;
      cursor: pointer;
      transition: all 0.25s;
    }
    .gh-auth-tab.active {
      color: #c9a227;
      border-bottom-color: #c9a227;
      background: rgba(201,162,39,0.04);
    }
    .gh-auth-tab:hover:not(.active) { color: #aaa; }

    /* PANEL BODY */
    .gh-auth-body {
      padding: 28px 32px 32px;
    }

    /* VIEW (login / register / forgot) */
    .gh-auth-view { display: none; }
    .gh-auth-view.active { display: block; }

    /* FORM FIELDS */
    .gh-field {
      margin-bottom: 16px;
    }
    .gh-field label {
      display: block;
      font-family: 'DM Mono', monospace;
      font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase;
      color: #c9a227;
      margin-bottom: 6px;
    }
    .gh-field input, .gh-field select {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid #333;
      color: #fff;
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      padding: 11px 14px;
      border-radius: 6px;
      outline: none;
      transition: border-color 0.2s, background 0.2s;
      box-sizing: border-box;
    }
    .gh-field input:focus, .gh-field select:focus {
      border-color: #c9a227;
      background: rgba(201,162,39,0.04);
    }
    .gh-field input::placeholder { color: #555; }
    .gh-field input.error { border-color: #ef4444; }
    .gh-field .gh-error-msg {
      font-size: 11px; color: #ef4444;
      margin-top: 4px; display: none;
    }
    .gh-field .gh-error-msg.show { display: block; }

    /* PASSWORD WRAPPER */
    .gh-pw-wrap { position: relative; }
    .gh-pw-wrap input { padding-right: 42px; }
    .gh-pw-toggle {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: #555; cursor: pointer;
      font-size: 14px; padding: 0; line-height: 1;
      transition: color 0.2s;
    }
    .gh-pw-toggle:hover { color: #c9a227; }

    /* TWO-COLUMN GRID */
    .gh-field-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    }

    /* SUBMIT BUTTON */
    .gh-auth-submit {
      width: 100%;
      background: #c9a227;
      color: #000;
      font-family: 'Outfit', sans-serif;
      font-size: 12px; font-weight: 700;
      letter-spacing: 1.5px; text-transform: uppercase;
      padding: 14px;
      border: none; border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 8px;
      position: relative;
      overflow: hidden;
    }
    .gh-auth-submit:hover { background: #e8c44a; transform: translateY(-1px); }
    .gh-auth-submit:active { transform: translateY(0); }
    .gh-auth-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .gh-auth-submit .gh-btn-spinner {
      display: none;
      width: 16px; height: 16px;
      border: 2px solid rgba(0,0,0,0.3);
      border-top-color: #000;
      border-radius: 50%;
      animation: ghSpin 0.7s linear infinite;
      margin: 0 auto;
    }
    .gh-auth-submit.loading .gh-btn-text { display: none; }
    .gh-auth-submit.loading .gh-btn-spinner { display: block; }
    @keyframes ghSpin { to { transform: rotate(360deg); } }

    /* DIVIDER */
    .gh-divider {
      display: flex; align-items: center; gap: 12px;
      margin: 20px 0;
    }
    .gh-divider::before, .gh-divider::after {
      content: ''; flex: 1; height: 1px; background: #2a2a2a;
    }
    .gh-divider span {
      font-size: 10px; color: #555;
      font-family: 'DM Mono', monospace; letter-spacing: 0.8px;
      white-space: nowrap;
    }

    /* SWITCH LINK */
    .gh-switch-link {
      text-align: center;
      font-size: 12px; color: #666;
      margin-top: 20px;
    }
    .gh-switch-link button {
      background: none; border: none;
      color: #c9a227;
      font-size: 12px; font-weight: 600;
      cursor: pointer; padding: 0;
      text-decoration: underline; text-underline-offset: 2px;
      transition: color 0.2s;
    }
    .gh-switch-link button:hover { color: #e8c44a; }

    /* FORGOT LINK */
    .gh-forgot-link {
      background: none; border: none;
      color: #888; font-size: 11px;
      cursor: pointer; padding: 0;
      float: right; margin-top: 6px;
      font-family: 'Outfit', sans-serif;
      transition: color 0.2s;
    }
    .gh-forgot-link:hover { color: #c9a227; }

    /* PASSWORD STRENGTH */
    .gh-pw-strength {
      margin-top: 8px;
    }
    .gh-pw-strength-bar {
      height: 3px; background: #222; border-radius: 2px; overflow: hidden;
      margin-bottom: 4px;
    }
    .gh-pw-strength-fill {
      height: 100%; width: 0%; border-radius: 2px;
      transition: width 0.3s ease, background 0.3s ease;
    }
    .gh-pw-strength-label {
      font-size: 10px; color: #555; font-family: 'DM Mono', monospace;
      letter-spacing: 0.8px;
    }

    /* TERMS CHECKBOX */
    .gh-checkbox-row {
      display: flex; align-items: flex-start; gap: 10px;
      margin: 16px 0;
    }
    .gh-checkbox-row input[type="checkbox"] {
      width: 16px; height: 16px;
      min-width: 16px;
      accent-color: #c9a227;
      margin-top: 2px;
      cursor: pointer;
    }
    .gh-checkbox-row label {
      font-size: 11px; color: #888; line-height: 1.5;
      cursor: pointer;
    }
    .gh-checkbox-row label a {
      color: #c9a227; text-decoration: none;
    }
    .gh-checkbox-row label a:hover { text-decoration: underline; }

    /* SUCCESS STATE */
    .gh-success-state {
      text-align: center; padding: 20px 0 8px;
    }
    .gh-success-icon {
      width: 60px; height: 60px;
      background: rgba(34,197,94,0.12);
      border: 1px solid rgba(34,197,94,0.3);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; margin: 0 auto 20px;
    }
    .gh-success-state h3 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22px; font-weight: 700;
      color: #fff; margin-bottom: 10px;
    }
    .gh-success-state p {
      font-size: 12px; color: #888; line-height: 1.7; margin-bottom: 24px;
    }

    /* LOGGED-IN STATE — NAV BUTTON */
    .nav-login.logged-in {
      background: rgba(201,162,39,0.12) !important;
      border: 1px solid rgba(201,162,39,0.3) !important;
      color: #c9a227 !important;
    }

    /* USER BADGE (nav area) */
    #gh-user-badge {
      display: none;
      align-items: center; gap: 10px;
    }
    #gh-user-badge.show { display: flex; }
    .gh-user-avatar {
      width: 32px; height: 32px;
      background: #c9a227;
      color: #000;
      font-family: 'Cormorant Garamond', serif;
      font-size: 13px; font-weight: 700;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .gh-user-name {
      font-size: 11px; color: #fff; font-weight: 600;
      max-width: 100px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .gh-user-logout {
      background: none; border: 1px solid #333;
      color: #888; font-size: 10px;
      font-family: 'DM Mono', monospace; letter-spacing: 0.8px;
      padding: 5px 10px; border-radius: 4px;
      cursor: pointer; transition: all 0.2s;
      white-space: nowrap;
    }
    .gh-user-logout:hover { border-color: #ef4444; color: #ef4444; }

    /* DASHBOARD PANEL */
    #gh-dashboard-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.9);
      z-index: 9400;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity 0.35s ease;
      backdrop-filter: blur(6px);
    }
    #gh-dashboard-overlay.open { opacity: 1; pointer-events: all; }
    .gh-dashboard-panel {
      background: #111;
      border: 1px solid rgba(201,162,39,0.3);
      border-radius: 14px;
      width: 100%; max-width: 680px;
      max-height: 88vh; overflow-y: auto;
      transform: translateY(20px) scale(0.97);
      transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
      box-shadow: 0 32px 80px rgba(0,0,0,0.7);
    }
    #gh-dashboard-overlay.open .gh-dashboard-panel { transform: none; }
    .gh-dash-header {
      background: linear-gradient(135deg, #0d0d0d 0%, #1a1400 100%);
      border-bottom: 1px solid rgba(201,162,39,0.2);
      padding: 24px 28px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .gh-dash-greeting {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22px; font-weight: 700; color: #fff;
    }
    .gh-dash-greeting span { color: #c9a227; font-style: italic; }
    .gh-dash-body { padding: 24px 28px 28px; }
    .gh-dash-quick {
      display: grid; grid-template-columns: repeat(3,1fr); gap: 12px;
      margin-bottom: 24px;
    }
    .gh-dash-tile {
      background: rgba(255,255,255,0.03);
      border: 1px solid #2a2a2a;
      border-radius: 8px; padding: 18px 14px;
      text-align: center; cursor: pointer;
      transition: all 0.2s;
    }
    .gh-dash-tile:hover { border-color: rgba(201,162,39,0.4); background: rgba(201,162,39,0.04); }
    .gh-dash-tile-icon { font-size: 22px; margin-bottom: 8px; }
    .gh-dash-tile-label {
      font-size: 11px; font-weight: 600; color: #fff;
      font-family: 'Outfit', sans-serif; margin-bottom: 2px;
    }
    .gh-dash-tile-sub { font-size: 10px; color: #666; }
    .gh-dash-section-title {
      font-family: 'DM Mono', monospace;
      font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
      color: #c9a227; margin-bottom: 14px;
      border-bottom: 1px solid #1e1e1e; padding-bottom: 8px;
    }
    .gh-dash-empty {
      background: rgba(255,255,255,0.02);
      border: 1px dashed #2a2a2a;
      border-radius: 8px; padding: 32px;
      text-align: center;
    }
    .gh-dash-empty p { font-size: 12px; color: #555; line-height: 1.7; }
    .gh-dash-account-info {
      background: rgba(201,162,39,0.04);
      border: 1px solid rgba(201,162,39,0.15);
      border-radius: 8px; padding: 16px 20px;
      margin-top: 20px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    }
    .gh-ai-item { }
    .gh-ai-label { font-size: 10px; color: #666; font-family: 'DM Mono', monospace; letter-spacing: 0.8px; margin-bottom: 3px; }
    .gh-ai-value { font-size: 12px; color: #fff; font-weight: 500; }

    @media(max-width:560px) {
      .gh-auth-panel { margin: 0 12px; }
      .gh-auth-body { padding: 20px; }
      .gh-auth-header { padding: 20px; }
      .gh-field-row { grid-template-columns: 1fr; }
      .gh-dash-quick { grid-template-columns: repeat(2,1fr); }
    }
  `;
  document.head.appendChild(style);

  /* ── Inject HTML ── */
  const authHTML = `
  <!-- AUTH MODAL -->
  <div id="gh-auth-overlay" role="dialog" aria-modal="true" aria-label="Client Login">
    <div class="gh-auth-panel">
      <div class="gh-auth-header">
        <div class="gh-auth-logo">
          <div class="gh-auth-logo-img">
            <img src="images/gargologo222.png" style="height: 120px; width: 150px;">
          </div>
        </div>
        <div class="gh-auth-tabs">
          <button class="gh-auth-tab active" data-tab="login" onclick="ghAuthTab('login')">CLIENT LOGIN</button>
          <button class="gh-auth-tab" data-tab="register" onclick="ghAuthTab('register')">CREATE ACCOUNT</button>
        </div>
        <button class="gh-auth-close" onclick="ghAuthClose()" aria-label="Close">✕</button>
      </div>

      <div class="gh-auth-body">

        <!-- LOGIN VIEW -->
        <div class="gh-auth-view active" id="gh-view-login">
          <div class="gh-field">
            <label for="gh-login-email">Email Address</label>
            <input type="email" id="gh-login-email" placeholder="you@company.com" autocomplete="email">
            <div class="gh-error-msg" id="gh-login-email-err"></div>
          </div>
          <div class="gh-field">
            <label for="gh-login-pw">Password</label>
            <button class="gh-forgot-link" onclick="ghAuthView('forgot')" type="button">Forgot password?</button>
            <div class="gh-pw-wrap">
              <input type="password" id="gh-login-pw" placeholder="Your password" autocomplete="current-password">
              <button class="gh-pw-toggle" type="button" onclick="ghTogglePw('gh-login-pw', this)" aria-label="Show password">👁</button>
            </div>
            <div class="gh-error-msg" id="gh-login-pw-err"></div>
          </div>
          <div class="gh-error-msg" id="gh-login-general-err" style="margin-bottom:12px;font-size:12px;"></div>
          <button class="gh-auth-submit" id="gh-login-btn" onclick="ghDoLogin()">
            <span class="gh-btn-text">ACCESS CLIENT PORTAL →</span>
            <div class="gh-btn-spinner"></div>
          </button>
          <div class="gh-switch-link">Don't have an account? <button onclick="ghAuthTab('register')">Create one free</button></div>
        </div>

        <!-- REGISTER VIEW -->
        <div class="gh-auth-view" id="gh-view-register">
          <div class="gh-field-row">
            <div class="gh-field">
              <label for="gh-reg-fname">First Name</label>
              <input type="text" id="gh-reg-fname" placeholder="First name" autocomplete="given-name">
              <div class="gh-error-msg" id="gh-reg-fname-err"></div>
            </div>
            <div class="gh-field">
              <label for="gh-reg-lname">Last Name</label>
              <input type="text" id="gh-reg-lname" placeholder="Last name" autocomplete="family-name">
              <div class="gh-error-msg" id="gh-reg-lname-err"></div>
            </div>
          </div>
          <div class="gh-field">
            <label for="gh-reg-company">Company Name</label>
            <input type="text" id="gh-reg-company" placeholder="Your company or shipping line" autocomplete="organization">
            <div class="gh-error-msg" id="gh-reg-company-err"></div>
          </div>
          <div class="gh-field">
            <label for="gh-reg-role">Your Role</label>
            
            <select class="form-select" id="gh-reg-role">
              <option value="">Select role…</option>
              <option>Freight Forwarder</option>
              <option>Shipping Line Agent</option>
              <option>Importer / Exporter</option>
              <option>Customs Agent</option>
              <option>Logistics Manager</option>
              <option>Transport Operator</option>
              <option>Other</option>
            </select>
            <div class="gh-error-msg" id="gh-reg-role-err"></div>
          </div>
          <div class="gh-field-row">
            <div class="gh-field">
              <label for="gh-reg-email">Email Address</label>
              <input type="email" id="gh-reg-email" placeholder="you@company.com" autocomplete="email">
              <div class="gh-error-msg" id="gh-reg-email-err"></div>
            </div>
            <div class="gh-field">
              <label for="gh-reg-phone">Phone / WhatsApp</label>
              <input type="tel" id="gh-reg-phone" placeholder="+254 7XX XXX XXX" autocomplete="tel">
              <div class="gh-error-msg" id="gh-reg-phone-err"></div>
            </div>
          </div>
          <div class="gh-field">
            <label for="gh-reg-pw">Password</label>
            <div class="gh-pw-wrap">
              <input type="password" id="gh-reg-pw" placeholder="Create a password" autocomplete="new-password" oninput="ghCheckStrength(this.value)">
              <button class="gh-pw-toggle" type="button" onclick="ghTogglePw('gh-reg-pw', this)" aria-label="Show password">👁</button>
            </div>
            <div class="gh-pw-strength">
              <div class="gh-pw-strength-bar"><div class="gh-pw-strength-fill" id="gh-strength-fill"></div></div>
              <div class="gh-pw-strength-label" id="gh-strength-label">Enter a password</div>
            </div>
            <div class="gh-error-msg" id="gh-reg-pw-err"></div>
          </div>
          <div class="gh-field">
            <label for="gh-reg-pw2">Confirm Password</label>
            <div class="gh-pw-wrap">
              <input type="password" id="gh-reg-pw2" placeholder="Repeat your password" autocomplete="new-password">
              <button class="gh-pw-toggle" type="button" onclick="ghTogglePw('gh-reg-pw2', this)" aria-label="Show password">👁</button>
            </div>
            <div class="gh-error-msg" id="gh-reg-pw2-err"></div>
          </div>
          <div class="gh-checkbox-row">
            <input type="checkbox" id="gh-reg-terms">
            <label for="gh-reg-terms">I agree to the <a href="#" onclick="return false;">Terms of Service</a> and <a href="#" onclick="return false;">Privacy Policy</a>. Gargo Haven may contact me about my account and bookings.</label>
          </div>
          <div class="gh-error-msg" id="gh-reg-general-err" style="margin-bottom:12px;font-size:12px;"></div>
          <button class="gh-auth-submit" id="gh-reg-btn" onclick="ghDoRegister()">
            <span class="gh-btn-text">CREATE MY ACCOUNT →</span>
            <div class="gh-btn-spinner"></div>
          </button>
          <div class="gh-switch-link">Already have an account? <button onclick="ghAuthTab('login')">Sign in</button></div>
        </div>

        <!-- FORGOT PASSWORD VIEW -->
        <div class="gh-auth-view" id="gh-view-forgot">
          <div style="margin-bottom:20px;">
            <button onclick="ghAuthView('login')" style="background:none;border:none;color:#888;font-size:11px;cursor:pointer;padding:0;font-family:'DM Mono',monospace;letter-spacing:0.8px;">← BACK TO LOGIN</button>
          </div>
          <p style="font-size:13px;color:#888;line-height:1.7;margin-bottom:20px;">Enter your registered email address and we'll send a password reset link to your inbox.</p>
          <div class="gh-field">
            <label for="gh-forgot-email">Registered Email</label>
            <input type="email" id="gh-forgot-email" placeholder="you@company.com">
            <div class="gh-error-msg" id="gh-forgot-err"></div>
          </div>
          <button class="gh-auth-submit" id="gh-forgot-btn" onclick="ghDoForgot()">
            <span class="gh-btn-text">SEND RESET LINK →</span>
            <div class="gh-btn-spinner"></div>
          </button>
        </div>

        <!-- REGISTER SUCCESS VIEW -->
        <div class="gh-auth-view" id="gh-view-success">
          <div class="gh-success-state">
            <div class="gh-success-icon">✅</div>
            <h3>Account Created</h3>
            <p id="gh-success-msg">Welcome to Gargo Haven's client portal. Your account is active and ready to use.</p>
            <button class="gh-auth-submit" onclick="ghOpenDashboard()">
              <span class="gh-btn-text">GO TO MY DASHBOARD →</span>
            </button>
          </div>
        </div>

        <!-- FORGOT SUCCESS VIEW -->
        <div class="gh-auth-view" id="gh-view-forgot-sent">
          <div class="gh-success-state">
            <div class="gh-success-icon">📧</div>
            <h3>Reset Link Sent</h3>
            <p>Check your inbox for a password reset link. If you don't see it within 5 minutes, check your spam folder or contact our support team.</p>
            <button class="gh-auth-submit" onclick="ghAuthView('login')">
              <span class="gh-btn-text">BACK TO LOGIN →</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- DASHBOARD MODAL -->
  <div id="gh-dashboard-overlay" role="dialog" aria-modal="true" aria-label="Client Dashboard">
    <div class="gh-dashboard-panel">
      <div class="gh-dash-header">
        <div>
          <div class="gh-dash-greeting" id="gh-dash-greeting">Welcome, <span>Client</span></div>
          <div style="font-size:11px;color:#666;margin-top:4px;font-family:'DM Mono',monospace;letter-spacing:0.8px;">CLIENT PORTAL · GARGO HAVEN</div>
        </div>
        <button class="gh-auth-close" onclick="ghDashClose()" aria-label="Close">✕</button>
      </div>
      <div class="gh-dash-body">
        <div class="gh-dash-section-title" style="margin-bottom:16px;">QUICK ACTIONS</div>
        <div class="gh-dash-quick">
          <div class="gh-dash-tile" onclick="ghDashClose();navigateToPage('booking')">
            <div class="gh-dash-tile-icon">📦</div>
            <div class="gh-dash-tile-label">New Booking</div>
            <div class="gh-dash-tile-sub">Storage or transport</div>
          </div>
          <div class="gh-dash-tile" onclick="ghDashClose();navigateToPage('track')">
            <div class="gh-dash-tile-icon">📍</div>
            <div class="gh-dash-tile-label">Track Container</div>
            <div class="gh-dash-tile-sub">Live GPS status</div>
          </div>
          <div class="gh-dash-tile" onclick="ghDashClose();navigateToPage('contact')">
            <div class="gh-dash-tile-icon">💬</div>
            <div class="gh-dash-tile-label">Support</div>
            <div class="gh-dash-tile-sub">Talk to our team</div>
          </div>
        </div>

        <div class="gh-dash-section-title">MY BOOKINGS</div>
        <div class="gh-dash-empty">
          <p>No bookings yet. Submit a depot storage or transport request to get started — your booking history will appear here.</p>
          <button class="gh-auth-submit" style="margin-top:16px;max-width:240px;" onclick="ghDashClose();navigateToPage('booking')">
            <span class="gh-btn-text">CREATE FIRST BOOKING →</span>
          </button>
        </div>

        <div class="gh-dash-account-info" id="gh-dash-account-info">
          <div class="gh-ai-item">
            <div class="gh-ai-label">Account Holder</div>
            <div class="gh-ai-value" id="gh-dash-name">—</div>
          </div>
          <div class="gh-ai-item">
            <div class="gh-ai-label">Company</div>
            <div class="gh-ai-value" id="gh-dash-company">—</div>
          </div>
          <div class="gh-ai-item">
            <div class="gh-ai-label">Email</div>
            <div class="gh-ai-value" id="gh-dash-email">—</div>
          </div>
          <div class="gh-ai-item">
            <div class="gh-ai-label">Role</div>
            <div class="gh-ai-value" id="gh-dash-role">—</div>
          </div>
          <div class="gh-ai-item">
            <div class="gh-ai-label">Member Since</div>
            <div class="gh-ai-value" id="gh-dash-since">—</div>
          </div>
          <div class="gh-ai-item">
            <div class="gh-ai-label">Account Status</div>
            <div class="gh-ai-value" style="color:#22c55e;">● Active</div>
          </div>
        </div>

        <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="gh-auth-submit" style="max-width:160px;background:transparent;color:#ef4444;border:1px solid #ef4444;" onclick="ghDoLogout()">
            <span class="gh-btn-text">SIGN OUT</span>
          </button>
        </div>

      </div>
    </div>
  </div>
  `;

  document.body.insertAdjacentHTML('beforeend', authHTML);

 
  document.getElementById('gh-auth-overlay').addEventListener('click', function(e) {
    if (e.target === this) ghAuthClose();
  });
  document.getElementById('gh-dashboard-overlay').addEventListener('click', function(e) {
    if (e.target === this) ghDashClose();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { ghAuthClose(); ghDashClose(); }
  });

 
  window.ghAuthOpen = function(tab) {
    const overlay = document.getElementById('gh-auth-overlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (tab) ghAuthTab(tab);
  };

  window.ghAuthClose = function() {
    document.getElementById('gh-auth-overlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.ghDashOpen = function() {
    const u = getCurrentUser();
    if (!u) { ghAuthOpen('login'); return; }
    populateDashboard(u);
    document.getElementById('gh-dashboard-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.ghDashClose = function() {
    document.getElementById('gh-dashboard-overlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.ghOpenDashboard = function() {
    ghAuthClose();
    setTimeout(ghDashOpen, 200);
  };

  window.ghAuthTab = function(tab) {
    document.querySelectorAll('.gh-auth-tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    ghAuthView(tab);
  };

  window.ghAuthView = function(view) {
    document.querySelectorAll('.gh-auth-view').forEach(function(v) {
      v.classList.remove('active');
    });
    var el = document.getElementById('gh-view-' + view);
    if (el) el.classList.add('active');
    clearErrors();
  };

  window.ghTogglePw = function(inputId, btn) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁';
  };

  window.ghCheckStrength = function(pw) {
    var fill = document.getElementById('gh-strength-fill');
    var label = document.getElementById('gh-strength-label');
    if (!fill || !label) return;
    var score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    var pct = score * 25;
    var colors = ['#ef4444','#f59e0b','#eab308','#22c55e'];
    var labels = ['WEAK','FAIR','GOOD','STRONG'];
    fill.style.width = pct + '%';
    fill.style.background = score > 0 ? colors[score - 1] : '#333';
    label.textContent = score > 0 ? labels[score - 1] : 'Enter a password';
    label.style.color = score > 0 ? colors[score - 1] : '#555';
  };

  function clearErrors() {
    document.querySelectorAll('.gh-error-msg').forEach(function(el) {
      el.textContent = ''; el.classList.remove('show');
    });
    document.querySelectorAll('.gh-field input').forEach(function(el) {
      el.classList.remove('error');
    });
  }

  function showErr(fieldId, errId, msg) {
    var field = document.getElementById(fieldId);
    var err = document.getElementById(errId);
    if (field) field.classList.add('error');
    if (err) { err.textContent = msg; err.classList.add('show'); }
  }

  function setLoading(btnId, loading) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
  }

  
  window.ghDoLogin = function() {
    clearErrors();
    var email = (document.getElementById('gh-login-email').value || '').trim().toLowerCase();
    var pw = (document.getElementById('gh-login-pw').value || '');
    var ok = true;
    if (!email) { showErr('gh-login-email','gh-login-email-err','Email is required.'); ok = false; }
    else if (!/^\S+@\S+\.\S+$/.test(email)) { showErr('gh-login-email','gh-login-email-err','Enter a valid email.'); ok = false; }
    if (!pw) { showErr('gh-login-pw','gh-login-pw-err','Password is required.'); ok = false; }
    if (!ok) return;

    setLoading('gh-login-btn', true);
    window.bridge.authLogin({ email: email, password: pw })
      .then(function (result) {
        setCurrentUser(result.user);
        updateNavForUser(result.user);
        ghAuthClose();
        setTimeout(function() { ghDashOpen(); }, 200);
      })
      .catch(function (err) {
        var errEl = document.getElementById('gh-login-general-err');
        if (errEl) { errEl.textContent = err.message || 'Incorrect email or password. Please try again.'; errEl.classList.add('show'); }
      })
      .finally(function () {
        setLoading('gh-login-btn', false);
      });
  };

  
  window.ghDoRegister = function() {
    clearErrors();
    var fname = (document.getElementById('gh-reg-fname').value || '').trim();
    var lname = (document.getElementById('gh-reg-lname').value || '').trim();
    var company = (document.getElementById('gh-reg-company').value || '').trim();
    var role = (document.getElementById('gh-reg-role').value || '').trim();
    var email = (document.getElementById('gh-reg-email').value || '').trim().toLowerCase();
    var phone = (document.getElementById('gh-reg-phone').value || '').trim();
    var pw = (document.getElementById('gh-reg-pw').value || '');
    var pw2 = (document.getElementById('gh-reg-pw2').value || '');
    var terms = document.getElementById('gh-reg-terms').checked;
    var ok = true;

    if (!fname) { showErr('gh-reg-fname','gh-reg-fname-err','First name is required.'); ok = false; }
    if (!lname) { showErr('gh-reg-lname','gh-reg-lname-err','Last name is required.'); ok = false; }
    if (!company) { showErr('gh-reg-company','gh-reg-company-err','Company name is required.'); ok = false; }
    if (!role) { showErr('gh-reg-role','gh-reg-role-err','Please select your role.'); ok = false; }
    if (!email) { showErr('gh-reg-email','gh-reg-email-err','Email is required.'); ok = false; }
    else if (!/^\S+@\S+\.\S+$/.test(email)) { showErr('gh-reg-email','gh-reg-email-err','Enter a valid email address.'); ok = false; }
    if (!pw) { showErr('gh-reg-pw','gh-reg-pw-err','Create a password.'); ok = false; }
    else if (pw.length < 8) { showErr('gh-reg-pw','gh-reg-pw-err','Password must be at least 8 characters.'); ok = false; }
    if (pw !== pw2) { showErr('gh-reg-pw2','gh-reg-pw2-err','Passwords do not match.'); ok = false; }
    if (!terms) {
      var errEl = document.getElementById('gh-reg-general-err');
      if (errEl) { errEl.textContent = 'Please accept the Terms of Service to continue.'; errEl.classList.add('show'); }
      ok = false;
    }
    if (!ok) return;

    setLoading('gh-reg-btn', true);
    window.bridge.authRegister({
      name: fname + ' ' + lname,
      email: email,
      phone: phone,
      company: company,
      role: role,
      password: pw
    })
      .then(function (result) {
        var msg = document.getElementById('gh-success-msg');

        if (result.needsEmailConfirmation) {
          if (msg) msg.textContent = 'Almost there, ' + fname + '. We\'ve sent a confirmation link to ' + email + ' — click it, then log in to reach your dashboard.';
          ghAuthView('success');
          return;
        }

        setCurrentUser(result.user);
        updateNavForUser(result.user);
        if (msg) msg.textContent = 'Welcome, ' + fname + '. Your Gargo Haven client account is ready. You can now book services, track containers, and manage your operations from your dashboard.';
        ghAuthView('success');
      })
      .catch(function (err) {
        showErr('gh-reg-email','gh-reg-email-err', err.message || 'Could not create your account. Please try again.');
      })
      .finally(function () {
        setLoading('gh-reg-btn', false);
      });
  };

  
  window.ghDoForgot = function() {
    clearErrors();
    var email = (document.getElementById('gh-forgot-email').value || '').trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      showErr('gh-forgot-email','gh-forgot-err','Enter a valid email address.');
      return;
    }
    setLoading('gh-forgot-btn', true);
    setTimeout(function() {
      setLoading('gh-forgot-btn', false);
      // Always show success (don't reveal account existence)
      ghAuthView('forgot-sent');
    }, 1000);
  };

  
  window.ghDoLogout = function() {
    window.bridge.authLogout()
      .catch(function () { /* even if the network call fails, still clear the local session below */ })
      .finally(function () {
        clearCurrentUser();
        ghDashClose();
        resetNavForGuest();
        if (typeof showNotification === 'function') {
          showNotification('Signed Out', 'You have been logged out of your account.', '👋');
        }
      });
  };

  function updateNavForUser(user) {
    var loginBtn = document.querySelector('.nav-login');
    if (!loginBtn) return;
    loginBtn.textContent = firstNameOf(user);
    loginBtn.classList.add('logged-in');
    loginBtn.onclick = function() { ghDashOpen(); };
  }

  function resetNavForGuest() {
    var loginBtn = document.querySelector('.nav-login');
    if (!loginBtn) return;
    loginBtn.textContent = 'CLIENT LOGIN';
    loginBtn.classList.remove('logged-in');
    loginBtn.onclick = function() { ghAuthOpen('login'); };
  }

  function populateDashboard(user) {
    var el = function(id) { return document.getElementById(id); };
    var greeting = el('gh-dash-greeting');
    if (greeting) greeting.innerHTML = 'Welcome back, <span>' + firstNameOf(user) + '</span>';
    if (el('gh-dash-name')) el('gh-dash-name').textContent = user.name;
    if (el('gh-dash-company')) el('gh-dash-company').textContent = user.company || '—';
    if (el('gh-dash-email')) el('gh-dash-email').textContent = user.email;
    if (el('gh-dash-role')) el('gh-dash-role').textContent = user.role || '—';
    if (el('gh-dash-since')) el('gh-dash-since').textContent = user.created || '—';
  }

  
  function wireLoginButton() {
    var loginBtn = document.querySelector('.nav-login');
    if (!loginBtn) return;

   
    loginBtn.onclick = function(e) {
      e.preventDefault();
      ghAuthOpen('login');
    };

    window.bridge.authCurrentUser()
      .then(function (user) {
        if (user) {
          setCurrentUser(user);
          updateNavForUser(user);
        } else {
          clearCurrentUser();
          resetNavForGuest();
        }
      })
      .catch(function () {
        clearCurrentUser();
        resetNavForGuest();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireLoginButton);
  } else {
    wireLoginButton();
  }

})();

(function () {
  function wireGalleryNav() {
    const strip = document.getElementById('galleryStrip');
    const prevBtn = document.getElementById('galleryPrevBtn');
    const nextBtn = document.getElementById('galleryNextBtn');
    if (!strip || !prevBtn || !nextBtn) return; // not on this page, bail quietly

    function scrollByOneItem(direction) {
      const item = strip.querySelector('.gallery-item');
      const itemWidth = item ? item.getBoundingClientRect().width : 260;
      const gapStr = window.getComputedStyle(strip).gap || '4px';
      const gap = parseFloat(gapStr) || 4;
      const amount = itemWidth + gap;
      strip.scrollBy({
        left: direction === 'next' ? amount : -amount,
        behavior: 'smooth'
      });
    }

    prevBtn.addEventListener('click', function () { scrollByOneItem('prev'); });
    nextBtn.addEventListener('click', function () { scrollByOneItem('next'); });

    // Optional: disable arrows at the ends
    function updateArrowState() {
      const maxScroll = strip.scrollWidth - strip.clientWidth - 1;
      prevBtn.disabled = strip.scrollLeft <= 0;
      nextBtn.disabled = strip.scrollLeft >= maxScroll;
      prevBtn.style.opacity = prevBtn.disabled ? '0.35' : '1';
      nextBtn.style.opacity = nextBtn.disabled ? '0.35' : '1';
    }
    strip.addEventListener('scroll', updateArrowState);
    window.addEventListener('resize', updateArrowState);
    updateArrowState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireGalleryNav);
  } else {
    wireGalleryNav();
  }
})();

/* ═══════════════════════════════════════════════════════════
   GARGO HAVEN — MOBILE DESKTOP-LOCK SCRIPT
   Load this LAST, after script.js, right before </body>.
   Does three things:
     1. Renders the real 1300px desktop layout, scaled to fit
        the phone — same images, same text, same layout, just smaller.
     2. Freezes html/body permanently so the page itself never
        scrolls, bounces, or jumps — only #site-scroll-outer does.
     3. Replaces the plain mobile menu with a sophisticated
        slide-in drawer that mirrors the desktop mega-menus.
   Does nothing at all on real desktop / mouse devices.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DESKTOP_WIDTH = 1300;   // matches .section-inner max-width in styles.css
  var ACTIVATE_MAX_WIDTH = 1024; // same breakpoint the site already uses for mobile nav

  function isMobileDevice() {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var narrow = window.innerWidth <= ACTIVATE_MAX_WIDTH;
    return coarse || narrow;
  }

  if (!isMobileDevice()) return; // real desktop visitors: untouched, original site as-is

  /* ── elements that must stay OUTSIDE the scaled layout because
     they're position:fixed and rely on the true viewport (nav bar,
     loader, toast, modal, scroll-to-top, chat bubble, and anything
     injected later like the auth/dashboard overlays) ── */
  var KEEP_OUTSIDE_IDS = ['loader', 'notification', 'modalOverlay', 'gh-auth-overlay', 'gh-dashboard-overlay'];
  var KEEP_OUTSIDE_CLASSES = ['nav', 'mobile-menu', 'scroll-top', 'chatbot-btn'];

  function shouldKeepOutside(el) {
    if (!el || el.nodeType !== 1) return true; // text nodes / comments stay put trivially
    if (el.tagName === 'SCRIPT') return true;
    if (el.id && KEEP_OUTSIDE_IDS.indexOf(el.id) !== -1) return true;
    for (var i = 0; i < KEEP_OUTSIDE_CLASSES.length; i++) {
      if (el.classList && el.classList.contains(KEEP_OUTSIDE_CLASSES[i])) return true;
    }
    return false;
  }

  function buildShell() {
    if (document.getElementById('site-scroll-outer')) return; // already built

    var outer = document.createElement('div');
    outer.id = 'site-scroll-outer';
    var inner = document.createElement('div');
    inner.id = 'site-scroll-inner';
    outer.appendChild(inner);

    // Move everything eligible, in order, into the scaled inner container.
    var kids = Array.prototype.slice.call(document.body.children);
    kids.forEach(function (el) {
      if (shouldKeepOutside(el)) return;
      inner.appendChild(el);
    });

    document.body.appendChild(outer);
    document.documentElement.classList.add('gh-locked');

    applyScale();
    window.addEventListener('resize', applyScale);
    window.addEventListener('orientationchange', function () {
      setTimeout(applyScale, 250);
    });

    patchInsertBefore();
    patchScrollTo(outer);
    wireScrollTopButton(outer);
    watchLegacyOverlayLocks(outer);
  }

  function applyScale() {
    var inner = document.getElementById('site-scroll-inner');
    if (!inner) return;
    var scale = window.innerWidth / DESKTOP_WIDTH;
    inner.style.transform = 'scale(' + scale + ')';
  }

  /* navigateToSubpage() in script.js does:
       document.body.insertBefore(container, footer)
     ...but footer no longer lives directly under <body> once we've
     moved it into #site-scroll-inner. Redirect any such call to
     footer's real parent so subpages keep inserting in the right spot. */
  function patchInsertBefore() {
    var orig = document.body.insertBefore.bind(document.body);
    document.body.insertBefore = function (newNode, referenceNode) {
      if (referenceNode && referenceNode.parentNode && referenceNode.parentNode !== document.body) {
        return referenceNode.parentNode.insertBefore(newNode, referenceNode);
      }
      return orig(newNode, referenceNode);
    };
  }

  /* window.scrollTo(...) is used throughout script.js (page changes,
     etc). Redirect it to the element that actually scrolls now. */
  function patchScrollTo(outer) {
    window.scrollTo = function (a) {
      if (a && typeof a === 'object') {
        outer.scrollTo({ top: a.top || 0, left: a.left || 0, behavior: a.behavior || 'auto' });
      } else {
        outer.scrollTo(arguments[1] || 0, arguments[0] || 0);
      }
    };
  }

  /* Re-implement the "back to top" button's visibility against the
     real scroller (the original listens on `window`, which never
     scrolls anymore). */
  function wireScrollTopButton(outer) {
    var btn = document.getElementById('scrollTop');
    if (!btn) return;
    outer.addEventListener('scroll', function () {
      if (outer.scrollTop > 480) btn.classList.add('visible');
      else btn.classList.remove('visible');
    }, { passive: true });
  }

  /* The existing code locks scrolling for modals/menus/auth panels by
     toggling document.body.style.overflow. Body can't scroll anyway
     now, so mirror that same toggle onto our real scroller. */
  function watchLegacyOverlayLocks(outer) {
    var mo = new MutationObserver(function () {
      var locked = document.body.style.overflow === 'hidden';
      document.documentElement.classList.toggle('gh-scroll-locked', locked || drawerOpen);
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }

  /* ═══════════════════════════════════════════════════════
     SOPHISTICATED DRAWER NAV
  ═══════════════════════════════════════════════════════ */

  var drawerOpen = false;

  var NAV_GROUPS = [
    { label: 'Home', icon: '⌂', direct: 'home' },
    {
      label: 'About', icon: '◈',
      items: [
        ['Company Overview', 'company-overview'],
        ['Mission & Vision', 'mission-vision'],
        ['Team', 'team'],
        ['About Gargo', 'about-gargo'],
        ['Certifications', 'certifications'],
        ['Partners & Alliances', 'partners']
      ]
    },
    {
      label: 'Services', icon: '⚙',
      items: [
        ['Container Storage', 'container-storage'],
        ['Port Haulage', 'port-haulage'],
        ['Reefer Monitoring', 'reefer-monitoring'],
        ['Container Repairs', 'container-repairs'],
        ['Container Washing', 'container-washing'],
        ['IICL Inspection', 'iicl-inspection'],
        ['EIR Processing', 'eir-processing'],
        ['Customs Documentation', 'customs-documentation'],
        ['Container Leasing', 'container-leasing'],
        ['Corporate Logistics', 'corporate-logistics']
      ]
    },
    {
      label: 'Depot', icon: '⌘',
      items: [
        ['Changamwe Main Depot', 'changamwe-depot'],
        ['Consolebase ICD', 'consolebase-icd'],
        ['Hakika Depot', 'hakika-depot'],
        ['Kibarani Depot', 'kibarani-depot'],
        ['Fortune Depot', 'fortune-depot'],
        ['Capacity Dashboard', 'capacity-dashboard'],
        ['Gate-In Requirements', 'gate-in-requirements'],
        ['Gate-Out Requirements', 'gate-out-requirements']
      ]
    },
    {
      label: 'Booking', icon: '▤', pageFallback: 'booking',
      items: [
        ['Bulk Bookings', 'bulk-bookings'],
        ['Request Quotation', 'request-quotation'],
        ['Dedicated Contracts', 'dedicated-contracts']
      ]
    },
    {
      label: 'Track', icon: '◎', pageFallback: 'track',
      items: [
        ['Container Tracking', 'container-tracking'],
        ['Truck Tracking', 'truck-tracking'],
        ['Driver Tracking', 'driver-tracking'],
        ['Booking Status', 'booking-status'],
        ['EIR Status', 'eir-status'],
        ['GPS Dashboard', 'gps-dashboard']
      ]
    },
    {
      label: 'Fleet', icon: '▲', pageFallback: 'fleet',
      items: [
        ['Fleet Overview', 'fleet-overview'],
        ['GPS Monitoring', 'gps-monitoring'],
        ['Maintenance Center', 'maintenance-center']
      ]
    },
    { label: 'Contact', icon: '✉', direct: 'contact' }
  ];

  function buildDrawer() {
    if (document.getElementById('gh-drawer')) return;

    var backdrop = document.createElement('div');
    backdrop.id = 'gh-drawer-backdrop';

    var drawer = document.createElement('div');
    drawer.id = 'gh-drawer';

    var head = document.createElement('div');
    head.className = 'gh-drawer-head';
    head.innerHTML =
      '<div class="gh-drawer-logo">GARGO <span>HAVEN</span></div>' +
      '<button class="gh-drawer-close" aria-label="Close menu">✕</button>';

    var scroll = document.createElement('div');
    scroll.className = 'gh-drawer-scroll';

    var cta = document.createElement('div');
    cta.className = 'gh-drawer-cta';
    cta.innerHTML =
      '<a class="call" href="tel:+254116307751">📞 CALL NOW</a>' +
      '<a class="track" href="javascript:void(0)" data-page="track">📍 TRACK</a>';
    scroll.appendChild(cta);

    NAV_GROUPS.forEach(function (group, idx) {
      var wrap = document.createElement('div');
      wrap.className = 'gh-drawer-group';

      var btn = document.createElement('button');
      btn.className = 'gh-drawer-group-btn' + (group.direct ? ' direct' : '');
      btn.innerHTML =
        '<span class="icon">' + group.icon + '</span><span>' + group.label + '</span><span class="chev">›</span>';

      if (group.direct) {
        btn.addEventListener('click', function () {
          go(group.direct);
        });
      } else {
        var sub = document.createElement('div');
        sub.className = 'gh-drawer-sub';
        group.items.forEach(function (item) {
          var a = document.createElement('a');
          a.href = 'javascript:void(0)';
          a.textContent = item[0];
          a.addEventListener('click', function () {
            goSub(item[1], group.pageFallback);
          });
          sub.appendChild(a);
        });
        btn.addEventListener('click', function () {
          var isOpen = wrap.classList.contains('open');
          document.querySelectorAll('.gh-drawer-group.open').forEach(function (g) {
            if (g !== wrap) g.classList.remove('open');
          });
          wrap.classList.toggle('open', !isOpen);
        });
        wrap.appendChild(sub);
      }

      wrap.insertBefore(btn, wrap.firstChild);
      scroll.appendChild(wrap);
    });

    var foot = document.createElement('div');
    foot.className = 'gh-drawer-foot';
    foot.innerHTML =
      '<div class="gh-drawer-foot-row">📞 <a href="tel:+254116307751">+254 116 307 751</a></div>' +
      '<div class="gh-drawer-foot-row">📧 <a href="mailto:Info@gargohavendepot.co.ke">Info@gargohavendepot.co.ke</a></div>';

    drawer.appendChild(head);
    drawer.appendChild(scroll);
    drawer.appendChild(foot);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    head.querySelector('.gh-drawer-close').addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    cta.querySelector('[data-page]').addEventListener('click', function () {
      go(this.getAttribute('data-page'));
    });
  }

  function go(pageId) {
    closeDrawer();
    if (typeof window.navigateToPage === 'function') window.navigateToPage(pageId);
  }
  function goSub(key, fallbackPage) {
    closeDrawer();
    if (typeof window.navigateToSubpage === 'function') {
      window.navigateToSubpage(key);
    } else if (fallbackPage && typeof window.navigateToPage === 'function') {
      window.navigateToPage(fallbackPage);
    }
  }

  function openDrawer() {
    drawerOpen = true;
    document.getElementById('gh-drawer-backdrop').classList.add('open');
    document.getElementById('gh-drawer').classList.add('open');
    document.documentElement.classList.add('gh-scroll-locked');
  }
  function closeDrawer() {
    drawerOpen = false;
    var b = document.getElementById('gh-drawer-backdrop');
    var d = document.getElementById('gh-drawer');
    if (b) b.classList.remove('open');
    if (d) d.classList.remove('open');
    if (document.body.style.overflow !== 'hidden') {
      document.documentElement.classList.remove('gh-scroll-locked');
    }
    document.querySelectorAll('.gh-drawer-group.open').forEach(function (g) { g.classList.remove('open'); });
  }
  window.closeMobileMenu = closeDrawer; // original code calls this after every nav click

  function wireHamburger() {
    var toggle = document.getElementById('menuToggle');
    if (!toggle) return;
    var fresh = toggle.cloneNode(true); // strip the original open-old-panel listener
    toggle.parentNode.replaceChild(fresh, toggle);
    fresh.addEventListener('click', openDrawer);
  }

  function init() {
    buildShell();
    buildDrawer();
    wireHamburger();
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init); // run after script.js's own DOMContentLoaded work (incl. the auth modal it injects)
  }
})();

