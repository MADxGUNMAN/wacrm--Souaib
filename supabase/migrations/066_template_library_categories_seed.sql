-- 066 — Industry categories for the starter template library.
--
-- Idempotent on `slug` so re-running the seed updates the copy rather than
-- duplicating rows, and so an operator's edits to `name`/`emoji` are the
-- only thing a re-run overwrites — never their own added categories.

INSERT INTO template_library_categories (slug, name, emoji, description, position) VALUES
  ('ecommerce',   'E-commerce & D2C Brands', '🛍️', 'Order updates, shipping, cart recovery and promotions for online stores.', 10),
  ('education',   'Education',               '🎓', 'Admissions, fee reminders, class schedules and results for schools and institutes.', 20),
  ('healthcare',  'Healthcare & Clinics',    '🏥', 'Appointment booking, reminders, reports and follow-ups for clinics and hospitals.', 30),
  ('real-estate', 'Real Estate',             '🏠', 'Site visits, new listings, price updates and documentation follow-ups.', 40),
  ('travel',      'Travel & Tourism',        '✈️', 'Bookings, itineraries, check-in reminders and holiday packages.', 50),
  ('automotive',  'Automotive',              '🚗', 'Test drives, service reminders, delivery updates and insurance renewals.', 60),
  ('bfsi',        'Finance & Insurance',     '💳', 'Payment reminders, statements, policy renewals and KYC follow-ups.', 70),
  ('logistics',   'Logistics & Courier',     '🚚', 'Pickup confirmations, delivery windows, failed attempts and PODs.', 80),
  ('events',      'Events & Wedding Planners','💒', 'Invitations, RSVPs, schedules and vendor coordination.', 90),
  ('retail',      'Retail & Supermarkets',   '🛒', 'Store offers, loyalty points, restock alerts and billing.', 100),
  ('restaurants', 'Restaurants & Cloud Kitchens','🍽️', 'Order confirmations, table bookings, delivery updates and daily menus.', 110),
  ('fitness',     'Fitness & Gyms',          '💪', 'Membership renewals, class bookings, trial invites and progress nudges.', 120),
  ('saas',        'SaaS & Tech Services',    '💻', 'Onboarding, trials, renewals, incident notices and feature launches.', 130),
  ('legal',       'Legal & Consultancy',     '⚖️', 'Consultation scheduling, document requests and case updates.', 140),
  ('ngo',         'NGOs & Political Campaigns','🗳️', 'Donation appeals, volunteer drives, event mobilisation and updates.', 150)
ON CONFLICT (slug) DO UPDATE
SET name        = EXCLUDED.name,
    emoji       = EXCLUDED.emoji,
    description = EXCLUDED.description,
    position    = EXCLUDED.position;
