// Solar position for the Shire at ~52°N around midsummer, in local solar time.
// Returns a unit vector in world space (+x east, -z north, +y up).

const LAT = (52 * Math.PI) / 180;
const DECL = (21 * Math.PI) / 180;

export function sunDirection(hours, azimuthOffsetDeg = 0, out = [0, 0, 0]) {
  const H = ((hours - 12) / 24) * Math.PI * 2; // hour angle
  const sinEl = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
  const el = Math.asin(sinEl);
  // Azimuth measured from north, clockwise toward east.
  const cosAz = (Math.sin(DECL) - Math.sin(el) * Math.sin(LAT)) / (Math.cos(el) * Math.cos(LAT));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (H > 0) az = Math.PI * 2 - az;
  az += (azimuthOffsetDeg * Math.PI) / 180;
  const c = Math.cos(el);
  out[0] = Math.sin(az) * c;
  out[1] = sinEl;
  out[2] = -Math.cos(az) * c;
  return out;
}

/** The moon, placed roughly opposite the sun and kept above the horizon through the night. */
export function moonDirection(sun, out = [0, 0, 0]) {
  const el = Math.max(0.35, -Math.asin(sun[1]) * 0.9 + 0.25);
  const az = Math.atan2(-sun[0], sun[2]) + 0.4;
  const c = Math.cos(el);
  out[0] = Math.sin(az) * c;
  out[1] = Math.sin(el);
  out[2] = -Math.cos(az) * c;
  return out;
}
