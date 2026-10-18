import { runTag } from "./env-setup";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "next-auth";
import { db } from "~/server/db";
import {
  claimHeroName,
  getHeroName,
  guestNameIsClaimed,
  heroNameKey,
  validateHeroName,
} from "~/server/hero-name";
import { resolveScoreIdentity } from "~/server/score-identity";

const userIds: string[] = [];
async function makeUser(label: string) {
  const user = await db.user.create({ data: { email: `${runTag}-${label}@example.test` } });
  userIds.push(user.id);
  return user;
}
const sessionFor = (id: string) => ({ user: { id, heroName: null }, expires: "2999-01-01" }) as unknown as Session;
const valid = (name: string) => validateHeroName(name).status === "ok";

after(async () => {
  await db.heroName.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("hero name validation", () => {
  test("accepts normal names and trims or collapses whitespace", () => {
    assert.ok(valid("SignMaster"));
    const v = validateHeroName("  Sign   Master ");
    assert.equal(v.status, "ok");
    if (v.status === "ok") assert.equal(v.name, "Sign Master");
  });

  test("enforces the 3-16 character limits", () => {
    assert.ok(!valid("ab"));
    assert.ok(valid("a".repeat(16)));
    assert.ok(!valid("a".repeat(17)));
  });

  test("rejects symbols, emoji and edge separators", () => {
    assert.ok(!valid("Hero!"));
    assert.ok(!valid("Hero\u{1F600}"));
    assert.ok(!valid("_hero"));
    assert.ok(!valid("hero-"));
  });

  test("rejects reserved names in any spelling", () => {
    assert.ok(!valid("Guest Hero"));
    assert.ok(!valid("admin"));
    assert.ok(!valid("Sign_Hero"));
  });

  test("rejects blocked words, including digit look-alikes, but not innocent names", () => {
    assert.ok(!valid("sh1t"));
    assert.ok(!valid("Big FUCK"));
    assert.ok(valid("Classic Hero"));
  });

  test("the uniqueness key ignores case, spaces, hyphens and underscores", () => {
    assert.equal(heroNameKey("Sign Master"), heroNameKey("sign_master"));
    assert.equal(heroNameKey("SIGN-MASTER"), "SIGNMASTER");
  });
});

describe("claiming a hero name", () => {
  test("a first claim succeeds and sets the display name", async () => {
    const user = await makeUser("claim");
    const name = `Claim${runTag}`.slice(0, 16);
    const result = await claimHeroName(user.id, name);
    assert.equal(result.status, "claimed");
    assert.equal((await db.user.findUnique({ where: { id: user.id } }))?.displayName, name);
    assert.equal((await getHeroName(user.id))?.name, name);
  });

  test("the same name in another case or spacing is taken, and the loser gets no row", async () => {
    const first = await makeUser("dupA");
    const second = await makeUser("dupB");
    const suffix = runTag.slice(0, 8);
    const name = `Dup${suffix}`; // 11 characters
    assert.equal((await claimHeroName(first.id, name)).status, "claimed");
    assert.equal((await claimHeroName(second.id, name.toUpperCase())).status, "taken");
    // extra spaces and underscores do not make a different name (still within the 16 character limit)
    assert.equal((await claimHeroName(second.id, `D u p_${suffix}`)).status, "taken");
    assert.equal(await getHeroName(second.id), null);
  });

  test("an account cannot claim a second name, and the first stays", async () => {
    const user = await makeUser("twice");
    const name = `Once${runTag}`.slice(0, 16);
    assert.equal((await claimHeroName(user.id, name)).status, "claimed");
    assert.equal((await claimHeroName(user.id, `Other${runTag}`.slice(0, 16))).status, "already_has_name");
    assert.equal((await getHeroName(user.id))?.name, name);
  });

  test("invalid names are refused by claim itself", async () => {
    const user = await makeUser("invalid");
    assert.equal((await claimHeroName(user.id, "x")).status, "invalid");
  });

  test("two users racing for one name: exactly one wins, every time", async () => {
    for (let round = 0; round < 3; round++) {
      const a = await makeUser(`raceA${round}`);
      const b = await makeUser(`raceB${round}`);
      const name = `Race${round}${runTag}`.slice(0, 16);
      const results = await Promise.all([claimHeroName(a.id, name), claimHeroName(b.id, name)]);
      assert.equal(results.filter((r) => r.status === "claimed").length, 1, `round ${round}: ${JSON.stringify(results)}`);
      assert.equal(await db.heroName.count({ where: { key: heroNameKey(name) } }), 1);
    }
  });
});

describe("who a score belongs to", () => {
  test("guests cannot use a claimed name (any case) or a reserved one, but can use free names and GUEST HERO", async () => {
    const owner = await makeUser("owner");
    const name = `Owned${runTag}`.slice(0, 16);
    assert.equal((await claimHeroName(owner.id, name)).status, "claimed");
    assert.equal(await guestNameIsClaimed(name.toLowerCase()), true);
    assert.equal(await guestNameIsClaimed("Admin"), true);
    assert.equal(await guestNameIsClaimed(`Free${runTag}`), false);
    assert.equal(await guestNameIsClaimed("GUEST HERO"), false);
  });

  test("a signed-in account without a hero name is refused", async () => {
    const user = await makeUser("noname");
    await assert.rejects(resolveScoreIdentity(sessionFor(user.id), "anything"), { code: "FORBIDDEN" });
  });

  test("a signed-in account is always saved under its claimed name and id, whatever the client sends", async () => {
    const user = await makeUser("named");
    const name = `Named${runTag}`.slice(0, 16);
    assert.equal((await claimHeroName(user.id, name)).status, "claimed");
    const identity = await resolveScoreIdentity(sessionFor(user.id), "FAKE NAME");
    assert.deepEqual(identity, { name, userId: user.id });
  });

  test("a guest sending a claimed name is refused, and a free name passes through", async () => {
    const owner = await makeUser("owner2");
    const name = `Taken${runTag}`.slice(0, 16);
    assert.equal((await claimHeroName(owner.id, name)).status, "claimed");
    await assert.rejects(resolveScoreIdentity(null, name), { code: "CONFLICT" });
    assert.deepEqual(await resolveScoreIdentity(null, `Guest${runTag}`), { name: `Guest${runTag}` });
  });
});
