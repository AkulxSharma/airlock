// Deep-space backdrop: fixed twinkling stars and two slow nebula glows. Pure CSS, no canvas.
// Positions are fixed numbers (not Math.random) so server and client render the same markup.
const STARS = Array.from({ length: 70 }, (_, i) => ({
  left: (i * 37.7) % 100,
  top: (i * 53.3 + (i % 7) * 11) % 100,
  size: 1 + (i % 3) * 0.6,
  delay: (i % 11) * 0.45,
  duration: 3 + (i % 5),
}));

export function SpaceBackground() {
  return (
    <div className="space-bg text-white/80" aria-hidden>
      <div className="glow" style={{ width: 520, height: 520, left: "-8%", top: "-12%", background: "rgba(99,102,241,0.16)" }} />
      <div className="glow" style={{ width: 460, height: 460, right: "-6%", bottom: "-10%", background: "rgba(34,211,238,0.10)", animationDelay: "-9s" }} />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }}
        />
      ))}
    </div>
  );
}
