// ============================================================
// The landing hero's background video.
//
// ─── Native media selection, not a client-side gate ───────────────
//
// The first two versions decided whether to render with matchMedia in a
// client effect. On the actual landing page that gate stayed false, so
// hydration removed the <video> entirely even though all of these were
// independently correct:
//
//   - site_settings.hero_video_url was populated,
//   - the server-rendered page carried the URL,
//   - the S3 object returned HTTP 200, video/mp4, and was only 1.25 MB,
//   - the viewport was desktop sized.
//
// A decorative background does not need JavaScript to choose its source.
// Native <source media> lets the browser select the MP4 at resource-selection
// time, before downloading it. On a viewport below 768px the source does not
// match, so the video bytes are not requested — unlike `hidden md:block`,
// which only hides an element after the browser has already fetched it.
//
// This is deliberately a server component now: no hydration race, no effect,
// no state, and no period where React can remove the media after the server
// rendered it.
// ============================================================

interface HeroBackgroundVideoProps {
  /** Public URL from site_settings.hero_video_url. */
  src: string;
}

export function HeroBackgroundVideo({ src }: HeroBackgroundVideoProps) {
  return (
    <div
      // Decorative: it carries no information the copy does not, so it is
      // hidden from assistive technology entirely.
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block"
    >
      {/* Deliberately no <track>: muted, decorative, and carries no audio
          or speech there would be anything to caption. */}
      <video
        autoPlay
        muted
        loop
        // Without playsInline, Safari can take a video fullscreen instead
        // of playing it in place.
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      >
        {/*
          IMPORTANT: keep the URL on <source>, not on <video src>.

          A `src` on the video is unconditional and downloads on phones even
          when CSS hides the element. The media query participates in native
          source selection, so a mobile browser never selects or requests it.
          `type` lets an incapable browser reject it without downloading.

          Motion is not part of this query on purpose. The user's machine was
          desktop-sized and had animations enabled, but the matchMedia gate
          still removed the element. CSS below remains the visual reduced-
          motion fallback, while source selection remains deterministic.
        */}
        <source src={src} type="video/mp4" media="(min-width: 768px)" />
      </video>

      {/* Contrast scrim. Dark headline text on operator-supplied footage is
          not a contrast guarantee. 22% keeps this light source video visible
          while still calming a higher-contrast replacement. */}
      <div className="absolute inset-0 bg-white/22" />
    </div>
  );
}
