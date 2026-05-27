-- JW Bethel Tours: booking + live tracking schema

CREATE TABLE IF NOT EXISTS tours (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  description       TEXT,
  highlights        TEXT[],
  duration_hours    DECIMAL(4,2) NOT NULL DEFAULT 2,
  max_group_size    INTEGER NOT NULL DEFAULT 12,
  price_per_person  DECIMAL(10,2) NOT NULL DEFAULT 50,
  meeting_point     TEXT,
  meeting_lat       DECIMAL(10,7),
  meeting_lng       DECIMAL(10,7),
  image_url         TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id       UUID REFERENCES tours(id) ON DELETE CASCADE,
  slot_date     DATE NOT NULL,
  start_time    TIME NOT NULL,
  max_capacity  INTEGER NOT NULL DEFAULT 12,
  booked_count  INTEGER DEFAULT 0,
  is_blocked    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tour_id, slot_date, start_time)
);

CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id          UUID REFERENCES tours(id),
  slot_id          UUID REFERENCES availability_slots(id),
  guest_name       TEXT NOT NULL,
  guest_email      TEXT NOT NULL,
  guest_phone      TEXT,
  party_size       INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'confirmed',
  tracking_token   TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  special_requests TEXT,
  driver_name      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_locations (
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE PRIMARY KEY,
  lat         DECIMAL(10,7) NOT NULL,
  lng         DECIMAL(10,7) NOT NULL,
  accuracy    DECIMAL(8,2),
  heading     DECIMAL(5,2),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE tours             ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tours_public_read"   ON tours             FOR SELECT USING (is_active = true);
CREATE POLICY "slots_public_read"   ON availability_slots FOR SELECT USING (is_blocked = false);
CREATE POLICY "bookings_insert"     ON bookings           FOR INSERT WITH CHECK (true);
CREATE POLICY "bookings_read"       ON bookings           FOR SELECT USING (true);
CREATE POLICY "bookings_update"     ON bookings           FOR UPDATE USING (true);
CREATE POLICY "driver_loc_all"      ON driver_locations   FOR ALL    USING (true) WITH CHECK (true);

-- Enable Realtime (run in Supabase dashboard if CLI unavailable)
-- ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- Seed sample tours
INSERT INTO tours (name, slug, description, highlights, duration_hours, max_group_size, price_per_person, meeting_point, meeting_lat, meeting_lng)
VALUES
  (
    'Blue Ridge Mountain Tour',
    'blue-ridge',
    'Experience the breathtaking views of the Blue Ridge Mountains on this unforgettable guided tour.',
    ARRAY['Scenic mountain overlooks','Hidden waterfall stops','Local history & stories','Complimentary refreshments'],
    4.0, 12, 85.00,
    '123 Main Street, Bethel, NC', 35.5095, -82.5371
  ),
  (
    'Historic Downtown Walking Tour',
    'historic-downtown',
    'Step back in time on our 2-hour walking tour through the historic downtown district.',
    ARRAY['Historic architecture','Local legends & stories','Hidden courtyards','Photo opportunities'],
    2.0, 20, 45.00,
    'Town Square Fountain, Main & Oak', 35.5102, -82.5389
  ),
  (
    'Sunset Valley Scenic Drive',
    'sunset-valley',
    'Chase the golden hour through Valley Road as the sun dips below the ridgeline.',
    ARRAY['Golden hour photography','Wildlife spotting','Valley overlooks','Small group experience'],
    3.0, 8, 65.00,
    '456 Valley Rd, Bethel, NC', 35.5078, -82.5412
  )
ON CONFLICT (slug) DO NOTHING;

-- Seed availability slots for the next 60 days
DO $$
DECLARE
  t_id  UUID;
  d     DATE := CURRENT_DATE + 1;
  t_rec RECORD;
BEGIN
  FOR t_rec IN SELECT id FROM tours LOOP
    d := CURRENT_DATE + 1;
    WHILE d <= CURRENT_DATE + 60 LOOP
      IF EXTRACT(DOW FROM d) <> 0 THEN
        INSERT INTO availability_slots (tour_id, slot_date, start_time, max_capacity)
          VALUES (t_rec.id, d, '09:00', 12)
          ON CONFLICT DO NOTHING;
        IF EXTRACT(DOW FROM d) NOT IN (0, 6) THEN
          INSERT INTO availability_slots (tour_id, slot_date, start_time, max_capacity)
            VALUES (t_rec.id, d, '14:00', 12)
            ON CONFLICT DO NOTHING;
        END IF;
      END IF;
      d := d + 1;
    END LOOP;
  END LOOP;
END;
$$;
