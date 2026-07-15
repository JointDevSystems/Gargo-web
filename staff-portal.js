(function () {
  'use strict';

  // Same project/anon key used by the public site's script.js. The anon
  // key is safe to expose client-side — every privileged action here is
  // gated by the `is_staff()` RLS policies added in
  // sql/staff-review-access.sql, not by this key.
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

  // Which review filter chip is active — drives both the query and the
  // empty-state copy. Defaults to the pending queue on load.
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
        errEl.textContent = err.message || 'Sign-in failed. Please try again.';
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

  // On load, resume an existing session if there is one.
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

  // ---------------------------------------------------------------------
  // Document review queue
  // ---------------------------------------------------------------------

  function loadReviewQueue() {
    const wrap = el('reviewList');
    wrap.innerHTML = '<div class="empty">Loading…</div>';

    window.bookingDocs.reviewQueue(currentReviewStatus)
      .then(function (docs) {
        if (!docs.length) {
          wrap.innerHTML = '<div class="empty">' + (REVIEW_EMPTY_MESSAGES[currentReviewStatus] || 'Nothing to show.') + '</div>';
          return;
        }
        wrap.innerHTML = docs.map(renderDocCard).join('');
      })
      .catch(function (err) {
        wrap.innerHTML = '<div class="empty">Could not load documents — ' + esc(err.message || 'please retry') + '</div>';
      });
  }
  window.loadReviewQueue = loadReviewQueue;

  // Filter chip click handler — swaps the active chip, updates the
  // current status, and reloads. Wired from the onclick attributes in
  // staff-portal.html.
  window.switchReviewFilter = function (status, btnEl) {
    currentReviewStatus = status;
    document.querySelectorAll('.filter-chip[data-status]').forEach(function (b) {
      b.classList.toggle('active', b === btnEl);
    });
    loadReviewQueue();
  };

  // Safely embed a value as a single-quoted JS string literal inside an
  // onclick="..." attribute (which is itself double-quoted). Using
  // JSON.stringify() here would wrap the value in double quotes and
  // break out of the attribute early — this keeps it single-quoted and
  // escapes anything that could terminate the literal or the attribute.
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

    // Verify/Reject only make sense while a document is still pending —
    // once reviewed, the card is read-only (View/Download plus the
    // reviewer's note) regardless of which filter chip surfaced it.
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
      .catch(function (err) { alert(err.message || 'Could not open document.'); });
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
        if (line) { line.textContent = err.message || 'Could not verify.'; line.style.color = '#ef4444'; }
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
        if (line) { line.textContent = err.message || 'Could not reject.'; line.style.color = '#ef4444'; }
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

  // ---------------------------------------------------------------------
  // Depot storage
  // ---------------------------------------------------------------------

  function loadZones() {
    const wrap = el('zoneTableWrap');
    const select = el('allocZone');
    wrap.innerHTML = '<div class="empty">Loading…</div>';

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
        wrap.innerHTML = '<div class="empty">Could not load storage zones — ' + esc(err.message || 'please retry') + '</div>';
      });
  }

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
      })
      .catch(function (err) {
        msg.textContent = err.message || 'Could not allocate storage.'; msg.style.color = '#ef4444';
      });
  };

})();