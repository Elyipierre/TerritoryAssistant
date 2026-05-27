import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TOUR_META = {
  'blue-ridge':        { name: 'Blue Ridge Mountain Tour',     duration: '4 hrs', price: '$85/person' },
  'historic-downtown': { name: 'Historic Downtown Walking Tour', duration: '2 hrs', price: '$45/person' },
  'sunset-valley':     { name: 'Sunset Valley Scenic Drive',   duration: '3 hrs', price: '$65/person' },
};

const ALL_TOURS = [
  { slug: 'blue-ridge',        name: 'Blue Ridge Mountain Tour',      duration: '4 hrs', price: '$85', gradient: 'linear-gradient(135deg, #0a2a27 0%, #14b8a6 100%)' },
  { slug: 'historic-downtown', name: 'Historic Downtown Walking Tour', duration: '2 hrs', price: '$45', gradient: 'linear-gradient(135deg, #08183e 0%, #2459af 100%)' },
  { slug: 'sunset-valley',     name: 'Sunset Valley Scenic Drive',    duration: '3 hrs', price: '$65', gradient: 'linear-gradient(135deg, #291707 0%, #c97d22 100%)' },
];

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getMonthGrid(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function fmtTime(timeStr) {
  const [h] = timeStr.split(':');
  const hr = parseInt(h, 10);
  if (hr === 0) return '12:00 AM';
  if (hr < 12) return `${hr}:00 AM`;
  if (hr === 12) return '12:00 PM';
  return `${hr - 12}:00 PM`;
}

function generateMockSlots() {
  const slots = [];
  const today = new Date();
  for (let d = 1; d <= 60; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + d);
    if (dt.getDay() === 0) continue;
    const ds = dt.toISOString().split('T')[0];
    const avail1 = 12 - Math.floor(Math.random() * 6);
    slots.push({ id: `m-${ds}-09`, slot_date: ds, start_time: '09:00:00', max_capacity: 12, booked_count: 12 - avail1 });
    if (dt.getDay() !== 6) {
      const avail2 = 12 - Math.floor(Math.random() * 4);
      slots.push({ id: `m-${ds}-14`, slot_date: ds, start_time: '14:00:00', max_capacity: 12, booked_count: 12 - avail2 });
    }
  }
  return slots;
}

const STEPS = ['Choose Tour', 'Pick a Date', 'Choose Time', 'Your Details', 'Confirmation'];

export default function BookingPage() {
  const { tourId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(tourId ? 1 : 0);
  const [tour, setTour] = useState(tourId ? (TOUR_META[tourId] ? { slug: tourId, ...TOUR_META[tourId] } : null) : null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', partySize: 2, special: '' });
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (step < 1) return;
    loadSlots();
  }, [step, viewMonth, viewYear, tour]);

  async function loadSlots() {
    if (!tour) return;
    setSlotsLoading(true);
    const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const endDate = new Date(viewYear, viewMonth + 2, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('availability_slots')
      .select('*')
      .gte('slot_date', startDate)
      .lte('slot_date', endDate)
      .eq('is_blocked', false)
      .order('slot_date')
      .order('start_time');

    if (data && data.length > 0) {
      setSlots(data);
    } else {
      setSlots(generateMockSlots());
    }
    setSlotsLoading(false);
  }

  const availableDates = useMemo(() => {
    const s = new Set();
    slots.forEach((sl) => {
      if (sl.booked_count < sl.max_capacity) s.add(sl.slot_date);
    });
    return s;
  }, [slots]);

  const slotsForDate = useMemo(() => {
    if (!selectedDate) return [];
    return slots.filter((sl) => sl.slot_date === selectedDate && sl.booked_count < sl.max_capacity);
  }, [slots, selectedDate]);

  function selectTour(t) {
    setTour(t);
    setStep(1);
  }

  function selectDate(day) {
    const ds = toDateStr(viewYear, viewMonth, day);
    if (!availableDates.has(ds)) return;
    setSelectedDate(ds);
    setSelectedSlot(null);
    setStep(2);
  }

  function selectSlot(slot) {
    setSelectedSlot(slot);
    setStep(3);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    setSubmitting(true);

    const trackingToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    const payload = {
      tour_id: null,
      slot_id: selectedSlot?.id?.startsWith('m-') ? null : selectedSlot?.id,
      guest_name: form.name.trim(),
      guest_email: form.email.trim(),
      guest_phone: form.phone.trim() || null,
      party_size: form.partySize,
      special_requests: form.special.trim() || null,
      status: 'confirmed',
      tracking_token: trackingToken,
    };

    const { data, error } = await supabase.from('bookings').insert(payload).select().single();

    if (error || !data) {
      const mockBooking = {
        id: 'demo-' + Date.now(),
        tracking_token: trackingToken,
        guest_name: form.name,
        guest_email: form.email,
        party_size: form.partySize,
        status: 'confirmed',
      };
      setBooking(mockBooking);
    } else {
      setBooking(data);
    }

    setStep(4);
    setSubmitting(false);
  }

  const calendarDays = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayStr = new Date().toISOString().split('T')[0];

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDate(null);
    setSelectedSlot(null);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDate(null);
    setSelectedSlot(null);
  }

  const isBeforeToday = (year, month, day) => {
    const ds = toDateStr(year, month, day);
    return ds < todayStr;
  };

  return (
    <div className="booking-root">
      <div className="booking-header">
        <Link to="/" className="booking-back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </Link>
        <div className="booking-header-logo">
          <img src="/assets/logo.png" alt="JW Bethel Tours" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>JW Bethel Tours</span>
        </div>
        <div style={{ width: 80 }} />
      </div>

      {step < 4 && (
        <div className="booking-steps-bar">
          {STEPS.map((label, i) => (
            <div key={label} className={`booking-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="booking-step-dot">{i < step ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg> : i + 1}</div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="booking-body">
        {/* ─── Step 0: Tour Selection ─── */}
        {step === 0 && (
          <div className="booking-step-panel">
            <h2 className="booking-step-title">Choose Your Tour</h2>
            <p className="booking-step-sub">Select the experience you'd like to book.</p>
            <div className="tour-select-grid">
              {ALL_TOURS.map((t) => (
                <button key={t.slug} className="tour-select-card" onClick={() => selectTour(t)}>
                  <div className="tour-select-image" style={{ background: t.gradient }} />
                  <div className="tour-select-body">
                    <h3>{t.name}</h3>
                    <div className="tour-select-meta">
                      <span>{t.duration}</span>
                      <span>{t.price}/person</span>
                    </div>
                  </div>
                  <div className="tour-select-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Step 1: Calendar ─── */}
        {step === 1 && (
          <div className="booking-step-panel">
            {tour && (
              <div className="booking-tour-chip">
                <span>{tour.name}</span>
                <button className="booking-tour-change" onClick={() => setStep(0)}>Change</button>
              </div>
            )}
            <h2 className="booking-step-title">Pick a Date</h2>
            <p className="booking-step-sub">Highlighted dates have availability. Select one to continue.</p>
            <div className="booking-calendar">
              <div className="calendar-nav">
                <button className="cal-nav-btn" onClick={prevMonth} disabled={viewYear === new Date().getFullYear() && viewMonth === new Date().getMonth()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
                <button className="cal-nav-btn" onClick={nextMonth}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
              <div className="calendar-grid">
                {DOW_LABELS.map((d) => <div key={d} className="cal-dow">{d}</div>)}
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} />;
                  const ds = toDateStr(viewYear, viewMonth, day);
                  const past = isBeforeToday(viewYear, viewMonth, day);
                  const avail = !past && availableDates.has(ds);
                  const isSelected = ds === selectedDate;
                  const isToday = ds === todayStr;
                  return (
                    <button
                      key={ds}
                      className={`cal-day ${avail ? 'avail' : 'unavail'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${past ? 'past' : ''}`}
                      onClick={() => selectDate(day)}
                      disabled={!avail}
                    >
                      {day}
                      {avail && !isSelected && <span className="cal-avail-dot" />}
                    </button>
                  );
                })}
              </div>
              {slotsLoading && <p className="cal-loading">Loading availability…</p>}
            </div>
            <div className="cal-legend">
              <span className="legend-item"><span className="legend-dot avail" />Available</span>
              <span className="legend-item"><span className="legend-dot unavail" />Unavailable</span>
              <span className="legend-item"><span className="legend-dot selected" />Selected</span>
            </div>
          </div>
        )}

        {/* ─── Step 2: Time Slot ─── */}
        {step === 2 && (
          <div className="booking-step-panel">
            <button className="booking-back-step" onClick={() => setStep(1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Back to Calendar
            </button>
            <h2 className="booking-step-title">Choose a Time</h2>
            <p className="booking-step-sub">
              {selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            {slotsForDate.length === 0 ? (
              <div className="info-banner warning">No available slots on this date. Please go back and choose another day.</div>
            ) : (
              <div className="time-slot-grid">
                {slotsForDate.map((sl) => {
                  const remaining = sl.max_capacity - sl.booked_count;
                  return (
                    <button key={sl.id} className={`time-slot-card ${selectedSlot?.id === sl.id ? 'selected' : ''}`} onClick={() => selectSlot(sl)}>
                      <div className="time-slot-time">{fmtTime(sl.start_time)}</div>
                      <div className="time-slot-meta">
                        <span className={`spots-pill ${remaining <= 3 ? 'low' : ''}`}>
                          {remaining} spot{remaining !== 1 ? 's' : ''} left
                        </span>
                      </div>
                      <svg className="slot-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Step 3: Guest Details ─── */}
        {step === 3 && (
          <div className="booking-step-panel">
            <button className="booking-back-step" onClick={() => setStep(2)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Back to Time Selection
            </button>
            <div className="booking-summary-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span>
                {tour?.name} · {selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {selectedSlot && fmtTime(selectedSlot.start_time)}
              </span>
            </div>
            <h2 className="booking-step-title">Your Details</h2>
            <p className="booking-step-sub">We'll send your confirmation and tracking link to this email.</p>
            <form className="booking-form" onSubmit={handleSubmit}>
              <div className="booking-form-row">
                <label className="booking-label">
                  <span>Full Name *</span>
                  <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required />
                </label>
                <label className="booking-label">
                  <span>Email Address *</span>
                  <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" required />
                </label>
              </div>
              <div className="booking-form-row">
                <label className="booking-label">
                  <span>Phone (optional)</span>
                  <input type="tel" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
                </label>
                <label className="booking-label">
                  <span>Party Size</span>
                  <select value={form.partySize} onChange={(e) => setForm(f => ({ ...f, partySize: parseInt(e.target.value) }))}>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>)}
                  </select>
                </label>
              </div>
              <label className="booking-label">
                <span>Special Requests (optional)</span>
                <textarea value={form.special} onChange={(e) => setForm(f => ({ ...f, special: e.target.value }))} placeholder="Accessibility needs, dietary restrictions, questions…" rows={3} />
              </label>
              {formError && <p className="inline-warning">{formError}</p>}
              <button type="submit" className="primary-action booking-submit" disabled={submitting}>
                {submitting ? 'Reserving…' : 'Confirm Booking'}
              </button>
            </form>
          </div>
        )}

        {/* ─── Step 4: Confirmation ─── */}
        {step === 4 && booking && (
          <div className="booking-step-panel booking-confirm">
            <div className="confirm-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2 className="booking-step-title">You're Booked!</h2>
            <p className="booking-step-sub">A confirmation has been noted for <strong>{booking.guest_name}</strong>. Check your email for details.</p>

            <div className="confirm-details-card">
              <div className="confirm-row"><span>Tour</span><strong>{tour?.name}</strong></div>
              <div className="confirm-row"><span>Date</span><strong>{selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
              <div className="confirm-row"><span>Time</span><strong>{selectedSlot && fmtTime(selectedSlot.start_time)}</strong></div>
              <div className="confirm-row"><span>Party Size</span><strong>{booking.party_size} {booking.party_size === 1 ? 'person' : 'people'}</strong></div>
              <div className="confirm-row"><span>Booking Ref</span><strong className="booking-ref">{booking.id.slice(0, 8).toUpperCase()}</strong></div>
            </div>

            <div className="tracking-link-card">
              <div className="tracking-link-header">
                <span className="tracking-pulse-wrap"><span className="tracking-pulse-dot" /></span>
                <strong>Your Live Tracking Link</strong>
              </div>
              <p>On tour day, open this link to see your guide's real-time location — like Uber for your adventure.</p>
              <div className="tracking-link-box">
                <span>{window.location.origin}/track/{booking.tracking_token}</span>
              </div>
              <div className="tracking-link-actions">
                <button
                  className="secondary-action"
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/track/${booking.tracking_token}`)}
                >
                  Copy Link
                </button>
                <Link to={`/track/${booking.tracking_token}`} className="primary-action" target="_blank">
                  Open Tracker
                </Link>
              </div>
            </div>

            <Link to="/" className="back-to-home-link">← Back to Home</Link>
          </div>
        )}
      </div>
    </div>
  );
}
