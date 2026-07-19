(function () {
  'use strict';

  
  const GH_SUPABASE_URL = 'https://okisjizcyidvvwdwehaa.supabase.co';
  const GH_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9raXNqaXpjeWlkdnZ3ZHdlaGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTYzNjMsImV4cCI6MjA5ODM5MjM2M30.O_0EeK297a07B7FLunpWr6HDlqrfP5Z8Owyp3qE4hQE';

  if (!window.supabase) {
    document.getElementById('gateErr').textContent = 'Could not load Supabase — check your connection and refresh.';
  } else {
    window.ghSupabase = window.supabase.createClient(GH_SUPABASE_URL, GH_SUPABASE_ANON_KEY);
  }

  const DOC_TYPE_LABELS = {
    guarantee_form: 'Container Guarantee Form',
    release_order: 'Release Order (CRO)',
    delivery_order: 'Delivery Order',
  };


  let currentReviewStatus = 'pending_review';
  const REVIEW_EMPTY_MESSAGES = {
    pending_review: 'No documents waiting for review right now.',
    verified: 'No verified documents yet.',
    rejected: 'No rejected documents yet.',
    all: 'No documents uploaded yet.',
  };

  function el(id) { return document.getElementById(id); }
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }
  function fmtDate(raw) {
    if (!raw) return '—';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? String(raw) : d.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Only these prefixes are messages we deliberately wrote as safe,
  // human-facing copy (form validation, business rules, auth outcomes).
  // Anything else — raw Postgrest/Supabase errors, RLS policy text,
  // column/table names, network errors — never reaches the screen.
  // The real error is always still logged to the console for debugging.
  const SAFE_ERROR_PREFIXES = [
    'Not enough space in',
    'A reason is required',
    'Enter the booking reference',
    'Select a zone',
    'Enter a valid TEU amount',
    'Enter your email and password',
    'Incorrect email or password',
    'Please sign in',
  ];

  function friendlyError(err, fallback) {
    console.error('[staff-portal]', fallback, err);
    const msg = (err && err.message) || '';
    return SAFE_ERROR_PREFIXES.some(function (p) { return msg.indexOf(p) === 0; }) ? msg : fallback;
  }


  function showGate() {
    el('gate').style.display = 'block';
    el('notStaff').style.display = 'none';
    el('app').style.display = 'none';
    el('whoami').style.display = 'none';
  }
  function showNotStaff() {
    el('gate').style.display = 'none';
    el('notStaff').style.display = 'block';
    el('app').style.display = 'none';
    el('whoami').style.display = 'none';
  }
  function showApp(user) {
    el('gate').style.display = 'none';
    el('notStaff').style.display = 'none';
    el('app').style.display = 'block';
    el('whoami').style.display = 'flex';
    el('whoamiName').textContent = user.email;
    loadReviewQueue();
    loadZones();
    loadStorageOccupancy();
  }

  window.staffLogin = function () {
    const email = (el('gateEmail').value || '').trim().toLowerCase();
    const pw = el('gatePw').value || '';
    const errEl = el('gateErr');
    const btn = el('gateBtn');
    errEl.textContent = '';

    if (!email || !pw) { errEl.textContent = 'Enter your email and password.'; return; }

    btn.disabled = true; btn.textContent = 'SIGNING IN…';
    window.ghSupabase.auth.signInWithPassword({ email, password: pw })
      .then(function (res) {
        if (res.error) throw new Error(res.error.message || 'Incorrect email or password.');
        return checkStaffAndEnter(res.data.user);
      })
      .catch(function (err) {
        errEl.textContent = friendlyError(err, 'Sign-in failed. Please try again.');
      })
      .finally(function () {
        btn.disabled = false; btn.textContent = 'SIGN IN';
      });
  };

  window.staffLogout = function () {
    window.ghSupabase.auth.signOut().finally(function () {
      showGate();
      el('gateEmail').value = '';
      el('gatePw').value = '';
    });
  };

  function checkStaffAndEnter(user) {
    return window.bookingDocs.isStaffMember().then(function (isStaff) {
      if (isStaff) {
        showApp(user);
      } else {
        showNotStaff();
      }
    });
  }

 
  window.ghSupabase && window.ghSupabase.auth.getSession().then(function (res) {
    const session = res.data && res.data.session;
    if (session && session.user) {
      checkStaffAndEnter(session.user);
    } else {
      showGate();
    }
  });

  window.switchTab = function (tab) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + tab); });
  };



  function loadReviewQueue() {
    const wrap = el('reviewList');
    wrap.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading…</div>';

    window.bookingDocs.reviewQueue(currentReviewStatus)
      .then(function (docs) {
        if (!docs.length) {
          wrap.innerHTML = '<div class="empty">' + (REVIEW_EMPTY_MESSAGES[currentReviewStatus] || 'Nothing to show.') + '</div>';
          return;
        }
        wrap.innerHTML = docs.map(renderDocCard).join('');
      })
      .catch(function (err) {
        wrap.innerHTML = '<div class="empty">' + esc(friendlyError(err, 'Could not load documents right now. Please try again.')) + '</div>';
      });
  }
  window.loadReviewQueue = loadReviewQueue;


  window.switchReviewFilter = function (status, btnEl) {
    currentReviewStatus = status;
    document.querySelectorAll('.filter-chip[data-status]').forEach(function (b) {
      b.classList.toggle('active', b === btnEl);
    });
    loadReviewQueue();
  };


  function jsStr(value) {
    return "'" + esc(String(value)).replace(/'/g, "\\'") + "'";
  }

  function statusPillStyle(status) {
    if (status === 'verified') return 'background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.35);color:var(--green);';
    if (status === 'rejected') return 'background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.35);color:var(--red);';
    return 'background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.35);color:var(--amber);';
  }

  function renderDocCard(doc) {
    const booking = doc.public_bookings || {};
    const label = DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type;
    const ref = booking.id || doc.booking_id;
    const who = [booking.full_name, booking.company].filter(Boolean).join(' · ') || 'Unknown client';
    const cid = doc.id;
    const status = doc.status || 'pending_review';
    const isPending = status === 'pending_review';
    const statusLabel = status.replace(/_/g, ' ');


    const actions = isPending
      ? (
          '<div class="doc-actions">' +
            '<button class="btn btn-view" onclick="viewDoc(\'' + esc(doc.file_path).replace(/'/g, "\\'") + '\')">View / Download</button>' +
            '<button class="btn btn-verify" onclick="handleVerify(' + jsStr(cid) + ')">Verify</button>' +
            '<button class="btn btn-reject" onclick="toggleRejectNote(' + jsStr(cid) + ')">Reject…</button>' +
          '</div>' +
          '<div class="doc-note-row" id="rejectRow-' + cid + '">' +
            '<input type="text" id="rejectNote-' + cid + '" placeholder="Reason for rejection (required, shown to the client)">' +
            '<button class="btn btn-reject" onclick="handleReject(' + jsStr(cid) + ')">Confirm Reject</button>' +
          '</div>'
        )
      : (
          '<div class="doc-actions">' +
            '<button class="btn btn-view" onclick="viewDoc(\'' + esc(doc.file_path).replace(/'/g, "\\'") + '\')">View / Download</button>' +
          '</div>'
        );

    const reviewNote = !isPending
      ? '<div class="doc-reviewer-note">' +
          esc(statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)) + ' ' + fmtDate(doc.reviewed_at) +
          (doc.review_notes ? ' — ' + esc(doc.review_notes) : '') +
        '</div>'
      : '';

    return (
      '<div class="doc-card" id="doc-' + cid + '">' +
        '<div class="doc-card-top">' +
          '<div>' +
            '<div class="doc-ref">' + esc(ref) + '</div>' +
            '<div class="doc-meta">' + esc(who) + (booking.service_type ? ' · ' + esc(booking.service_type) : '') + '</div>' +
            '<div class="doc-meta">' + (doc.container_no ? 'Container: ' + esc(doc.container_no) + ' · ' : '') + 'Uploaded ' + fmtDate(doc.uploaded_at) + '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">' +
            '<div class="doc-type-badge">' + esc(label) + '</div>' +
            (!isPending ? '<div class="doc-type-badge" style="' + statusPillStyle(status) + '">' + esc(statusLabel) + '</div>' : '') +
          '</div>' +
        '</div>' +
        actions +
        reviewNote +
        '<div class="doc-status-line" id="docStatusLine-' + cid + '"></div>' +
      '</div>'
    );
  }

  window.viewDoc = function (filePath) {
    window.bookingDocs.getDownloadUrl(filePath, 300)
      .then(function (url) { window.open(url, '_blank', 'noopener'); })
      .catch(function (err) { alert(friendlyError(err, 'Could not open document. Please try again.')); });
  };

  window.toggleRejectNote = function (docId) {
    const row = el('rejectRow-' + docId);
    if (row) row.classList.toggle('show');
  };

  window.handleVerify = function (docId) {
    const line = el('docStatusLine-' + docId);
    if (line) { line.textContent = 'Verifying…'; line.style.color = '#888'; }
    disableCard(docId, true);

    window.bookingDocs.verifyDocument(docId, null)
      .then(function () {
        if (line) { line.textContent = '✓ Verified'; line.style.color = '#22c55e'; }
        setTimeout(function () {
          const card = el('doc-' + docId);
          if (card) card.remove();
          checkQueueEmpty();
        }, 700);
      })
      .catch(function (err) {
        if (line) { line.textContent = friendlyError(err, 'Could not verify. Please try again.'); line.style.color = '#ef4444'; }
        disableCard(docId, false);
      });
  };

  window.handleReject = function (docId) {
    const noteEl = el('rejectNote-' + docId);
    const notes = (noteEl && noteEl.value || '').trim();
    const line = el('docStatusLine-' + docId);
    if (!notes) {
      if (line) { line.textContent = 'A reason is required before rejecting.'; line.style.color = '#ef4444'; }
      return;
    }
    if (line) { line.textContent = 'Rejecting…'; line.style.color = '#888'; }
    disableCard(docId, true);

    window.bookingDocs.rejectDocument(docId, notes)
      .then(function () {
        if (line) { line.textContent = '✓ Rejected — client notified'; line.style.color = '#f59e0b'; }
        setTimeout(function () {
          const card = el('doc-' + docId);
          if (card) card.remove();
          checkQueueEmpty();
        }, 700);
      })
      .catch(function (err) {
        if (line) { line.textContent = friendlyError(err, 'Could not reject. Please try again.'); line.style.color = '#ef4444'; }
        disableCard(docId, false);
      });
  };

  function disableCard(docId, disabled) {
    const card = el('doc-' + docId);
    if (!card) return;
    card.querySelectorAll('button').forEach(function (b) { b.disabled = disabled; });
  }

  function checkQueueEmpty() {
    const wrap = el('reviewList');
    if (wrap && !wrap.querySelector('.doc-card')) {
      wrap.innerHTML = '<div class="empty">' + (REVIEW_EMPTY_MESSAGES[currentReviewStatus] || 'Nothing to show.') + '</div>';
    }
  }



  function loadZones() {
    const wrap = el('zoneTableWrap');
    const select = el('allocZone');
    wrap.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading…</div>';

    window.bookingDocs.storageAvailability()
      .then(function (zones) {
        if (!zones.length) {
          wrap.innerHTML = '<div class="empty">No storage zones configured yet.</div>';
          return;
        }

        const rows = zones.map(function (z) {
          const cap = z.capacity_teu || 0;
          const occ = z.occupied_teu || 0;
          const free = Math.max(cap - occ, 0);
          const pct = cap > 0 ? Math.min(100, Math.round((occ / cap) * 100)) : 0;
          return (
            '<tr>' +
              '<td>' + esc(z.zone_name) + '</td>' +
              '<td>' + occ + ' / ' + cap + ' TEU' +
                '<div class="bar-wrap"><div class="bar-fill" style="width:' + pct + '%;"></div></div>' +
              '</td>' +
              '<td>' + free + ' TEU free</td>' +
            '</tr>'
          );
        }).join('');

        wrap.innerHTML = (
          '<table class="zones"><thead><tr><th>Zone</th><th>Occupied</th><th>Available</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>'
        );

        select.innerHTML = '<option value="">Select zone…</option>' +
          zones.map(function (z) {
            const free = Math.max((z.capacity_teu || 0) - (z.occupied_teu || 0), 0);
            return '<option value="' + esc(z.id) + '">' + esc(z.zone_name) + ' (' + free + ' TEU free)</option>';
          }).join('');
      })
      .catch(function (err) {
        wrap.innerHTML = '<div class="empty">' + esc(friendlyError(err, 'Could not load storage zones right now. Please try again.')) + '</div>';
      });
  }

  function loadStorageOccupancy() {
    var wrap = el('storageOccupancyWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading…</div>';

    window.bookingDocs.currentlyInStorage()
      .then(function (rows) {
        if (!rows.length) {
          wrap.innerHTML = '<div class="empty">Nothing currently occupying yard space.</div>';
          return;
        }
        wrap.innerHTML = rows.map(renderStorageOccupancyCard).join('');
      })
      .catch(function (err) {
        wrap.innerHTML = '<div class="empty">' + esc(friendlyError(err, 'Could not load storage occupancy right now.')) + '</div>';
      });
  }
  window.loadStorageOccupancy = loadStorageOccupancy;

  function renderStorageOccupancyCard(b) {
    var who = [b.full_name, b.company].filter(Boolean).join(' · ') || 'Unknown client';
    var zone = (b.depot_storage_zones && b.depot_storage_zones.zone_name) || '—';
    var teu = b.storage_teu != null ? b.storage_teu + ' TEU' : '—';
    return (
      '<div class="doc-card" id="stor-' + esc(b.id) + '">' +
        '<div class="doc-card-top">' +
          '<div>' +
            '<div class="doc-ref">' + esc(b.container || b.id) + '</div>' +
            '<div class="doc-meta">' + esc(who) + (b.service_type ? ' · ' + esc(b.service_type) : '') + '</div>' +
            '<div class="doc-meta">Zone: ' + esc(zone) + ' · ' + esc(teu) + '</div>' +
          '</div>' +
          '<div class="doc-type-badge">IN STORAGE</div>' +
        '</div>' +
        '<div class="doc-actions">' +
          '<button class="btn btn-reject" onclick="handleReleaseStorage(' + jsStr(b.id) + ')">Dispatch — Release Storage</button>' +
        '</div>' +
        '<div class="doc-status-line" id="storStatusLine-' + esc(b.id) + '"></div>' +
      '</div>'
    );
  }

  window.handleReleaseStorage = function (bookingId) {
    var line = el('storStatusLine-' + bookingId);
    var card = el('stor-' + bookingId);
    if (line) { line.textContent = 'Releasing…'; line.style.color = '#888'; }
    if (card) card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });

    window.bookingDocs.releaseStorage(bookingId)
      .then(function (res) {
        if (res && res.released === false) {
          if (line) { line.textContent = res.reason === 'already_released' ? 'Already released.' : 'No active storage allocation found.'; line.style.color = '#f59e0b'; }
          if (card) card.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
          return;
        }
        if (line) { line.textContent = '✓ Dispatched — storage released'; line.style.color = '#22c55e'; }
        setTimeout(function () {
          if (card) card.remove();
          loadZones();
          var wrap = el('storageOccupancyWrap');
          if (wrap && !wrap.querySelector('.doc-card')) {
            wrap.innerHTML = '<div class="empty">Nothing currently occupying yard space.</div>';
          }
        }, 700);
      })
      .catch(function (err) {
        if (line) { line.textContent = friendlyError(err, 'Could not release storage. Please try again.'); line.style.color = '#ef4444'; }
        if (card) card.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      });
  };

  window.submitAllocation = function () {
    const ref = (el('allocBookingRef').value || '').trim();
    const zoneId = el('allocZone').value;
    const teu = parseInt(el('allocTeu').value, 10);
    const msg = el('allocMsg');

    msg.textContent = '';
    if (!ref) { msg.textContent = 'Enter the booking reference.'; msg.style.color = '#ef4444'; return; }
    if (!zoneId) { msg.textContent = 'Select a zone.'; msg.style.color = '#ef4444'; return; }
    if (!teu || teu < 1) { msg.textContent = 'Enter a valid TEU amount.'; msg.style.color = '#ef4444'; return; }

    msg.textContent = 'Allocating…'; msg.style.color = '#888';
    window.bookingDocs.allocateStorage(ref, zoneId, teu)
      .then(function () {
        msg.textContent = '✓ Storage allocated and booking updated.'; msg.style.color = '#22c55e';
        el('allocBookingRef').value = '';
        el('allocTeu').value = 1;
        loadZones();
        loadStorageOccupancy();
      })
      .catch(function (err) {
        msg.textContent = friendlyError(err, 'Could not allocate storage. Please try again.'); msg.style.color = '#ef4444';
      });
  };

})();