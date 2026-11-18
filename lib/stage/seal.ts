// Breaking the seal on a bagged comic, as one 0→1 timeline: the tape peels,
// the flap lifts, the comic slides out, and the empty bag fades away.

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const span = (p: number, from: number, to: number) => ease((p - from) / (to - from));

export function sealPose(p: number): { tape: number; flap: number; slide: number; bagFade: number } {
  return {
    tape: span(p, 0, 0.3),
    flap: span(p, 0.25, 0.5),
    slide: span(p, 0.45, 0.9),
    bagFade: span(p, 0.8, 1),
  };
}
