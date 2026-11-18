import { expect, test } from "vitest";
import { sendRate } from "./budget";
import { fightOutcome, fightSender, HEROES, heroBy, type HeroType } from "./heroes";
import { Track } from "./interp";

const hero = (type: HeroType) => HEROES.find((h) => h.type === type)!.id;

test("send rate: nothing alone, then a shared budget", () => {
  expect(sendRate(1)).toBe(0);
  expect(sendRate(2)).toBe(12);
  expect(sendRate(4)).toBe(6);
  expect(sendRate(21)).toBe(2);
});

test("fights: the wheel decides, ties go to the roll", () => {
  expect(fightOutcome(hero("speed"), hero("power"), 0.9)).toBe("a");
  expect(fightOutcome(hero("power"), hero("speed"), 0.9)).toBe("b");
  expect(fightOutcome(hero("speed"), hero("magic"), 0.2)).toBe("a");
  expect(fightOutcome(hero("speed"), hero("magic"), 0.8)).toBe("b");
  expect(fightOutcome(hero("tech"), hero("tech"), 0.1)).toBe("a");
});

test("only one of the two heroes announces a fight", () => {
  expect(fightSender("s1", "s2")).toBe(true);
  expect(fightSender("s2", "s1")).toBe(false);
});

test("tracks glide between samples and go stale", () => {
  const t = new Track();
  t.push(0, 0, 1000);
  t.push(10, 0, 1100);
  expect(t.at(1170)!.x).toBeCloseTo(5, 0);
  expect(t.stale(6000)).toBe(false);
  expect(t.stale(6200)).toBe(true);
});

test("eight heroes, eight types, all original names, found by id", () => {
  expect(HEROES).toHaveLength(8);
  expect(new Set(HEROES.map((h) => h.type)).size).toBe(8);
  expect(heroBy("volt").name).toBe("Volt");
  expect(heroBy("nobody").id).toBe(HEROES[0].id);
});

test("every hero has a signature power", () => {
  expect(new Set(HEROES.map((h) => h.power)).size).toBe(8);
  expect(heroBy("brick").power).toBe("rip");
  expect(heroBy("splash").power).toBe("strike");
});
