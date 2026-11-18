// Smoothing another person's hero: draw it a little behind their latest
// position and glide between the samples that arrive.

const DELAY_MS = 120;
const STALE_MS = 5000;

export class Track {
  private samples: { x: number; y: number; t: number }[] = [];

  push(x: number, y: number, t: number) {
    this.samples.push({ x, y, t });
    if (this.samples.length > 8) this.samples.shift();
  }

  at(now: number): { x: number; y: number } | null {
    const s = this.samples;
    if (!s.length) return null;
    const t = now - DELAY_MS;
    if (t <= s[0].t) return { x: s[0].x, y: s[0].y };
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i].t) {
        const a = s[i - 1];
        const b = s[i];
        const k = (t - a.t) / Math.max(b.t - a.t, 1);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    const last = s[s.length - 1];
    return { x: last.x, y: last.y };
  }

  stale(now: number): boolean {
    const last = this.samples[this.samples.length - 1];
    return !last || now - last.t > STALE_MS;
  }
}
