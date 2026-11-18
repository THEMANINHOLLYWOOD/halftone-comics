// How a bound page bends as it turns. A leaf runs from the spine (u = 0) to its
// edge (u = 1, one sheet wide) and is bent as a circular arc: its angle runs
// evenly from the spine angle `a` to the tip angle `t`. Angles are measured from
// +x towards +z (up off the book): 0 lies flat on the right, π flat on the left.
// The same formula runs in the leaf vertex shader (shaders.ts).

export interface LeafPoint {
  x: number;
  z: number;
  /** Unit normal of the front face. */
  nx: number;
  nz: number;
}

export function leafPoint(u: number, a: number, t: number): LeafPoint {
  const k = t - a; // total bend across the page
  const phi = a + k * u;
  let x: number;
  let z: number;
  if (Math.abs(k) < 1e-4) {
    x = u * Math.cos(a);
    z = u * Math.sin(a);
  } else {
    // ∫₀ᵘ (cos φ, sin φ) du for φ = a + k·u
    x = (Math.sin(phi) - Math.sin(a)) / k;
    z = (Math.cos(a) - Math.cos(phi)) / k;
  }
  return { x, z, nx: -Math.sin(phi), nz: Math.cos(phi) };
}

/** The tip angle that puts a flat leaf's edge under a pointer at world x. */
export function tipAngleFor(pointerX: number): number {
  return Math.acos(Math.min(Math.max(pointerX, -1), 1));
}

export function clampPose(a: number, t: number): { a: number; t: number } {
  const clamp = (v: number) => Math.min(Math.max(v, 0), Math.PI);
  return { a: clamp(a), t: clamp(t) };
}
