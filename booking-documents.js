(function () {
  'use strict';

  const BUCKET = 'booking-documents';
  const DOC_TYPES = ['guarantee_form', 'release_order', 'delivery_order'];


  const PORT_LOCATIONS = ['Mombasa Port (KPA)', 'APM Terminals', 'APM Terminals Mombasa'];


  function getRequiredDocTypes({ serviceType, origin, destination }) {
    const required = [];
    const originIsPort = PORT_LOCATIONS.indexOf(origin) !== -1;
    const destIsPort = PORT_LOCATIONS.indexOf(destination) !== -1;

    if (serviceType === 'Depot Storage') {
      required.push('guarantee_form');
    }

    if (serviceType === 'Port Haulage' || serviceType === 'Full Transport Package') {
      if (destIsPort && !originIsPort) required.push('release_order');   // going TO port = export
      else if (originIsPort && !destIsPort) required.push('delivery_order'); // coming FROM port = import
      else if (!originIsPort && !destIsPort) required.push('guarantee_form'); // depot-to-depot: container still moves in/out of depot custody at one end
      // both-port case (rare/unlikely) intentionally left unrequired — flag for review if it occurs.

      if (serviceType === 'Full Transport Package' && required.indexOf('guarantee_form') === -1) required.push('guarantee_form');
    }

    return required;
  }

  function client() {
    if (window.ghSupabase) return window.ghSupabase;
    throw new Error('Supabase client not initialised — load script.js first, or provide window.ghSupabase.');
  }

  function assertDocType(docType) {
    if (DOC_TYPES.indexOf(docType) === -1) {
      throw new Error('doc_type must be one of: ' + DOC_TYPES.join(', '));
    }
  }


  async function uploadBookingDocument({ bookingId, docType, containerNo, file }) {
    if (!bookingId) throw new Error('bookingId (booking reference) is required');
    if (!file) throw new Error('No file selected');
    assertDocType(docType);

    const { data: sessionData } = await client().auth.getSession();
    const userId = sessionData && sessionData.session ? sessionData.session.user.id : null;
    if (!userId) throw new Error('Please sign in before uploading booking documents.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${bookingId}/${docType}-${Date.now()}-${safeName}`;

    const { error: uploadErr } = await client()
      .storage.from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadErr) throw new Error(uploadErr.message || 'Upload failed — please try again');

    const { data: row, error: insertErr } = await client()
      .from('booking_documents')
      .insert({
        booking_id: bookingId,
        doc_type: docType,
        container_no: containerNo || null,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size || null,
        uploaded_by: userId,
      })
      .select('*')
      .single();

    if (insertErr) {

      await client().storage.from(BUCKET).remove([path]).catch(() => {});
      throw new Error(insertErr.message || 'Could not record uploaded document');
    }
    return row;
  }


  async function myBookingDocuments(bookingId) {
    const { data, error } = await client()
      .from('booking_documents')
      .select('*')
      .eq('booking_id', bookingId)
      .order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message || 'Could not load documents');
    return data || [];
  }


  async function storageAvailability() {
    const { data, error } = await client()
      .from('depot_storage_availability')
      .select('*')
      .order('zone_name');
    if (error) throw new Error(error.message || 'Could not load storage availability');
    return data || [];
  }

  async function pendingReviewQueue() {
    const { data, error } = await client()
      .from('booking_documents')
      .select('*, public_bookings(id, full_name, company, service_type, container, storage_status)')
      .eq('status', 'pending_review')
      .order('uploaded_at', { ascending: true }); // oldest first = FIFO for staff
    if (error) throw new Error(error.message || 'Could not load review queue');
    return data || [];
  }


  // Same shape as pendingReviewQueue but for any status (or all of them),
  // used by the admin Document Verification screen which needs to browse
  // Pending / Verified / Rejected / All — not just the FIFO review queue.
  async function documentsByStatus(status) {
    let q = client()
      .from('booking_documents')
      .select('*, public_bookings(id, full_name, company, service_type, container, storage_status)')
      .order('uploaded_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new Error(error.message || 'Could not load documents');
    return data || [];
  }


  async function documentsForBooking(bookingId) {
    const { data, error } = await client()
      .from('booking_documents')
      .select('*')
      .eq('booking_id', bookingId)
      .order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message || 'Could not load documents');
    return data || [];
  }


  // Batch version of documentsForBooking — one round trip for a whole list
  // of bookings (e.g. the client dashboard's "My Bookings" panel), grouped
  // by booking_id so the caller doesn't have to.
  async function documentsForBookings(bookingIds) {
    const ids = (bookingIds || []).filter(Boolean);
    if (!ids.length) return {};

    const { data, error } = await client()
      .from('booking_documents')
      .select('*')
      .in('booking_id', ids)
      .order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message || 'Could not load documents');

    const byBooking = {};
    (data || []).forEach(function (doc) {
      if (!byBooking[doc.booking_id]) byBooking[doc.booking_id] = [];
      byBooking[doc.booking_id].push(doc);
    });
    return byBooking;
  }


  // Lets front-end code decide whether to show staff-only UI (e.g. a link
  // to the staff portal) without guessing from booking data. Resolves
  // false (never throws) so it's safe to call speculatively.
  async function isStaffMember() {
    try {
      const { data: sessionData } = await client().auth.getSession();
      const userId = sessionData && sessionData.session ? sessionData.session.user.id : null;
      if (!userId) return false;

      const { data, error } = await client()
        .from('staff_members')
        .select('user_id')
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();
      if (error) return false;
      return !!data;
    } catch (e) {
      return false;
    }
  }


  async function getDownloadUrl(filePath, expiresInSeconds = 300) {
    const { data, error } = await client()
      .storage.from(BUCKET)
      .createSignedUrl(filePath, expiresInSeconds);
    if (error) throw new Error(error.message || 'Could not generate download link');
    return data.signedUrl;
  }

  async function verifyDocument(documentId, notes) {
    const { data: sessionData } = await client().auth.getSession();
    const reviewerId = sessionData && sessionData.session ? sessionData.session.user.id : null;
    const { error } = await client()
      .from('booking_documents')
      .update({
        status: 'verified',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      })
      .eq('id', documentId);
    if (error) throw new Error(error.message || 'Could not verify document');

  }

  async function rejectDocument(documentId, notes) {
    if (!notes) throw new Error('A reason is required when rejecting a document');
    const { data: sessionData } = await client().auth.getSession();
    const reviewerId = sessionData && sessionData.session ? sessionData.session.user.id : null;
    const { error } = await client()
      .from('booking_documents')
      .update({
        status: 'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('id', documentId);
    if (error) throw new Error(error.message || 'Could not reject document');
  }


  async function allocateStorage(bookingId, zoneId, teu) {
    const { data: zone, error: zoneErr } = await client()
      .from('depot_storage_zones')
      .select('*')
      .eq('id', zoneId)
      .single();
    if (zoneErr) throw new Error(zoneErr.message || 'Zone not found');
    if (zone.capacity_teu - zone.occupied_teu < teu) {
      throw new Error(`Not enough space in ${zone.zone_name} — only ${zone.capacity_teu - zone.occupied_teu} TEU free`);
    }

    const { error: zoneUpdateErr } = await client()
      .from('depot_storage_zones')
      .update({ occupied_teu: zone.occupied_teu + teu, updated_at: new Date().toISOString() })
      .eq('id', zoneId);
    if (zoneUpdateErr) throw new Error(zoneUpdateErr.message || 'Could not reserve storage space');

    const { error: bookingUpdateErr } = await client()
      .from('public_bookings')
      .update({ storage_status: 'allocated', storage_zone_id: zoneId })
      .eq('id', bookingId);
    if (bookingUpdateErr) throw new Error(bookingUpdateErr.message || 'Could not update booking status');
  }

  window.bookingDocs = {
   
    uploadBookingDocument,
    myBookingDocuments,
    storageAvailability,
   
    pendingReviewQueue,
    documentsByStatus,
    documentsForBooking,
    documentsForBookings,
    isStaffMember,
    getDownloadUrl,
    verifyDocument,
    rejectDocument,
    allocateStorage,
    getRequiredDocTypes,
    DOC_TYPES,
    PORT_LOCATIONS,
  };
})();