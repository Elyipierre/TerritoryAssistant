import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const STATUSES = [
  { key: 'confirmed',  label: 'Not Started',   next: 'en_route',  nextLabel: 'Start — Head to Pickup' },
  { key: 'en_route',   label: 'En Route',       next: 'arrived',   nextLabel: 'Mark Arrived' },
  { key: 'arrived',    label: 'Arrived',        next: 'active',    nextLabel: 'Start Tour' },
  { key: 'active',     label: 'Tour Active',    next: 'complete',  nextLabel: 'Complete Tour' },
  { key: 'complete',   label: 'Complete',       next: null,        nextLabel: null },
];

function getStatusMeta(key) {
  return STATUSES.find(s => s.key === key) || STATUSES[0];
}

export default function DriverPage() {
  const { bookingId } = useParams();
  const watchRef = useRef(null);

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [currentLoc, setCurrentLoc] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [geoError, setGeoError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadBooking();
    return () => stopSharing();
  }, [bookingId]);

  async function loadBooking() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (err || !data) {
      setError('Booking not found. Please check the link.');
    } else {
      setBooking(data);
    }
    setLoading(false);
  }

  const pushLocation = useCallback(async (lat, lng, acc) => {
    if (!bookingId) return;
    await supabase.from('driver_locations').upsert(
      { booking_id: bookingId, lat, lng, accuracy: acc, updated_at: new Date().toISOString() },
      { onConflict: 'booking_id' }
    );
    setLastUpdate(new Date());
  }, [bookingId]);

  function startSharing() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }
    setGeoError('');
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
        setCurrentLoc({ lat, lng });
        setAccuracy(Math.round(acc));
        pushLocation(lat, lng, acc);
      },
      (err) => {
        setGeoError(`Location error: ${err.message}`);
        setIsSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setIsSharing(true);
  }

  function stopSharing() {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setIsSharing(false);
  }

  async function advanceStatus() {
    if (!booking) return;
    const meta = getStatusMeta(booking.status);
    if (!meta.next) return;
    setUpdating(true);
    const { data } = await supabase
      .from('bookings')
      .update({ status: meta.next })
      .eq('id', bookingId)
      .select()
      .single();
    if (data) setBooking(data);
    setUpdating(false);
  }

  if (loading) {
    return (
      <div className="driver-loading">
        <div className="tracking-spinner" />
        <p>Loading booking…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tracking-error-screen">
        <div className="tracking-error-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <h2>Booking Not Found</h2>
          <p>{error}</p>
          <Link to="/app" className="primary-action">Go to Dashboard</Link>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusMeta(booking?.status || 'confirmed');
  const statusIndex = STATUSES.findIndex(s => s.key === (booking?.status || 'confirmed'));

  return (
    <div className="driver-root">
      <div className="driver-header">
        <div className="driver-header-logo">
          <img src="/assets/logo.png" alt="JW Bethel Tours" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>Guide App</span>
        </div>
        <Link to="/app" className="driver-admin-link">Dashboard</Link>
      </div>

      <div className="driver-body">
        <div className="driver-booking-card">
          <p className="driver-label">TODAY'S BOOKING</p>
          <h2 className="driver-guest-name">{booking?.guest_name}</h2>
          <div className="driver-booking-meta">
            <span>{booking?.party_size} {booking?.party_size === 1 ? 'guest' : 'guests'}</span>
            {booking?.guest_phone && <a href={`tel:${booking.guest_phone}`} className="driver-call-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.07 9.81 19.79 19.79 0 011 1.18 2 2 0 013 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
              Call Guest
            </a>}
          </div>
          {booking?.special_requests && (
            <div className="driver-special"><strong>Note:</strong> {booking.special_requests}</div>
          )}
        </div>

        <div className="driver-status-card">
          <p className="driver-label">TOUR STATUS</p>
          <div className="driver-progress-track">
            {STATUSES.slice(0, -1).map((s, i) => (
              <div key={s.key} className={`driver-progress-step ${i <= statusIndex ? 'done' : ''} ${i === statusIndex ? 'current' : ''}`}>
                <div className="driver-progress-dot">{i < statusIndex ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg> : i + 1}</div>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          {statusMeta.next && (
            <button className="primary-action driver-advance-btn" onClick={advanceStatus} disabled={updating}>
              {updating ? 'Updating…' : statusMeta.nextLabel}
            </button>
          )}
          {!statusMeta.next && (
            <div className="driver-complete-msg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              Tour Complete
            </div>
          )}
        </div>

        <div className={`driver-location-card ${isSharing ? 'sharing' : ''}`}>
          <div className="driver-location-header">
            <div>
              <p className="driver-label">LOCATION SHARING</p>
              <p className="driver-location-status">
                {isSharing ? (
                  <><span className="tracking-pulse-dot inline" /> Live — Guests can track you</>
                ) : (
                  <><span className="tracking-pulse-dot muted inline" /> Not sharing</>
                )}
              </p>
            </div>
            <button
              className={isSharing ? 'driver-stop-btn' : 'driver-start-btn'}
              onClick={isSharing ? stopSharing : startSharing}
            >
              {isSharing ? 'Stop' : 'Start Sharing'}
            </button>
          </div>

          {geoError && <p className="inline-warning" style={{ marginTop: 8 }}>{geoError}</p>}

          {currentLoc && (
            <div className="driver-loc-detail">
              <div className="driver-loc-row">
                <span>Lat</span><code>{currentLoc.lat.toFixed(5)}</code>
              </div>
              <div className="driver-loc-row">
                <span>Lng</span><code>{currentLoc.lng.toFixed(5)}</code>
              </div>
              {accuracy && (
                <div className="driver-loc-row">
                  <span>Accuracy</span><code>±{accuracy}m</code>
                </div>
              )}
              {lastUpdate && (
                <div className="driver-loc-row">
                  <span>Last sent</span><code>{lastUpdate.toLocaleTimeString()}</code>
                </div>
              )}
            </div>
          )}

          {!isSharing && (
            <p className="driver-location-hint">
              Tap "Start Sharing" to broadcast your location. Guests will see you move in real time on their tracking link.
            </p>
          )}
        </div>

        <div className="driver-tracking-link-row">
          <p className="driver-label">CUSTOMER TRACKING LINK</p>
          <div className="driver-tracking-url">
            <span>{window.location.origin}/track/{booking?.tracking_token}</span>
            <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/track/${booking?.tracking_token}`)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            </button>
          </div>
          <p className="driver-location-hint" style={{ marginTop: 6 }}>Share this link with your guest so they can track you.</p>
        </div>
      </div>
    </div>
  );
}
