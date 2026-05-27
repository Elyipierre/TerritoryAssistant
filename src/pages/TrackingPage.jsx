import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const DEFAULT_CENTER = [35.5095, -82.5371];
const STATUS_LABELS = {
  confirmed:  { label: 'Confirmed',       color: 'teal',    desc: 'Your booking is confirmed. Your guide will be en route soon.' },
  en_route:   { label: 'Guide En Route',  color: 'cyan',    desc: 'Your guide is on the way to your pickup location.' },
  arrived:    { label: 'Guide Arrived',   color: 'success', desc: 'Your guide has arrived at the meeting point.' },
  active:     { label: 'Tour Active',     color: 'success', desc: 'Your tour is underway. Enjoy the experience!' },
  complete:   { label: 'Tour Complete',   color: 'muted',   desc: 'Your tour has ended. Thanks for joining!' },
  cancelled:  { label: 'Cancelled',       color: 'danger',  desc: 'This booking has been cancelled.' },
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtEta(meters) {
  const minutes = Math.round(meters / 80 / 60);
  if (minutes <= 1) return 'Less than 1 min away';
  if (minutes < 60) return `${minutes} min away`;
  return 'More than 1 hr away';
}

export default function TrackingPage() {
  const { token } = useParams();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const meetingMarkerRef = useRef(null);

  const [booking, setBooking] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBooking();
  }, [token]);

  async function loadBooking() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('bookings')
      .select('*')
      .eq('tracking_token', token)
      .single();

    if (err || !data) {
      setError('Booking not found. Please check your tracking link.');
      setLoading(false);
      return;
    }

    setBooking(data);
    setLoading(false);

    const { data: loc } = await supabase
      .from('driver_locations')
      .select('*')
      .eq('booking_id', data.id)
      .single();

    if (loc) setDriverLoc(loc);
  }

  useEffect(() => {
    if (!booking) return;

    const channel = supabase
      .channel(`track-${booking.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'driver_locations',
        filter: `booking_id=eq.${booking.id}`,
      }, (payload) => {
        if (payload.new) setDriverLoc(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${booking.id}`,
      }, (payload) => {
        if (payload.new) setBooking(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [booking?.id]);

  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    if (mapInstanceRef.current) return;

    const L = window.L;
    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const meetingIcon = L.divIcon({
      html: '<div class="meeting-marker"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>',
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    meetingMarkerRef.current = L.marker(DEFAULT_CENTER, { icon: meetingIcon })
      .addTo(map)
      .bindPopup('Meeting Point');

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      driverMarkerRef.current = null;
      meetingMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    if (!L || !mapInstanceRef.current || !driverLoc) return;

    const { lat, lng } = driverLoc;
    const pos = [parseFloat(lat), parseFloat(lng)];

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng(pos);
    } else {
      const driverIcon = L.divIcon({
        html: '<div class="driver-marker-map"><div class="driver-pulse" /><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg></div>',
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      driverMarkerRef.current = L.marker(pos, { icon: driverIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('Your Guide');
    }

    if (meetingMarkerRef.current) {
      mapInstanceRef.current.fitBounds([pos, meetingMarkerRef.current.getLatLng()], { padding: [60, 60] });
    } else {
      mapInstanceRef.current.setView(pos, 15);
    }
  }, [driverLoc]);

  const status = booking ? (STATUS_LABELS[booking.status] || STATUS_LABELS.confirmed) : null;
  const distMeters = driverLoc ? haversineMeters(parseFloat(driverLoc.lat), parseFloat(driverLoc.lng), DEFAULT_CENTER[0], DEFAULT_CENTER[1]) : null;

  if (loading) {
    return (
      <div className="tracking-loading">
        <div className="tracking-spinner" />
        <p>Loading your tracking info…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tracking-error-screen">
        <div className="tracking-error-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <h2>Link Not Found</h2>
          <p>{error}</p>
          <Link to="/" className="primary-action">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tracking-root">
      <div className="tracking-status-bar">
        <div className="tracking-status-bar-inner">
          <div className="tracking-logo">
            <img src="/assets/logo.png" alt="JW Bethel Tours" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span>JW Bethel Tours</span>
          </div>
          <div className="tracking-status-right">
            <span className={`status-pill ${status?.color}`}>{status?.label}</span>
            <button className="cal-nav-btn" onClick={loadBooking} title="Refresh">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="tracking-map-wrap">
        <div ref={mapRef} className="tracking-map" />
      </div>

      <div className="tracking-panel">
        <div className="tracking-panel-inner">
          <div className="tracking-info-header">
            <div>
              <p className="tracking-tour-label">Your Guide</p>
              <h3 className="tracking-driver-name">{booking?.driver_name || 'JW Bethel Guide'}</h3>
            </div>
            {driverLoc && booking?.status === 'en_route' && (
              <div className="tracking-eta-badge">
                <span className="tracking-pulse-wrap"><span className="tracking-pulse-dot" /></span>
                {distMeters !== null ? fmtEta(distMeters) : 'En Route'}
              </div>
            )}
            {!driverLoc && (
              <div className="tracking-waiting-badge">
                <span className="tracking-pulse-dot muted" />
                Waiting for guide
              </div>
            )}
          </div>

          <div className="tracking-detail-row">
            <div className="tracking-detail-item">
              <span>Status</span>
              <strong className={`tracking-status-text ${status?.color}`}>{status?.label}</strong>
            </div>
            <div className="tracking-detail-item">
              <span>Guest</span>
              <strong>{booking?.guest_name}</strong>
            </div>
            <div className="tracking-detail-item">
              <span>Party</span>
              <strong>{booking?.party_size} {booking?.party_size === 1 ? 'person' : 'people'}</strong>
            </div>
          </div>

          <p className="tracking-status-desc">{status?.desc}</p>

          {!driverLoc && (
            <div className="info-banner" style={{ marginTop: 12 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18, flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              Live tracking activates when your guide starts sharing their location on tour day.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
