// Site-wide animated backdrop: soft cyan / blue / violet liquid orbs fixed
// behind every page (same look the onboarding quiz introduced). Being
// position:fixed + full-viewport, it can never leave a white gap above the
// footer or bottom nav.
export default function SiteBackground() {
  return (
    <div className="site-bg" aria-hidden="true">
      <span className="site-orb site-orb-1" />
      <span className="site-orb site-orb-2" />
      <span className="site-orb site-orb-3" />
    </div>
  );
}
