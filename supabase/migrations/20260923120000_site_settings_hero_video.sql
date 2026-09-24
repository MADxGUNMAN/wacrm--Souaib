-- ============================================================
-- Hero background video for the public landing page.
--
-- One platform-wide asset, set by a super admin in Platform Settings and
-- rendered behind the hero on desktop only. Nullable with no default: an
-- unset value is the normal state and means "render the hero exactly as it
-- was before", so this column can be added to a live site without changing
-- what anyone sees.
--
-- The value is a public S3 URL. Uploads go browser -> S3 through
-- /api/storage/presign into the existing `landing-assets` prefix, NOT
-- through /api/super-admin/upload: that route buffers the whole file in
-- memory and passes through nginx, which caps request bodies well below the
-- size of a video.
-- ============================================================

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS hero_video_url TEXT;

COMMENT ON COLUMN site_settings.hero_video_url IS
  'Public URL of the landing hero background video (MP4/H.264). NULL means no video: the hero falls back to its static background. Desktop only; never loaded on mobile or under prefers-reduced-motion.';
