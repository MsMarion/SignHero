import { runTag } from "./env-setup";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "~/server/db";
import { upsertGoogleUser } from "~/server/auth-google";

const email = (label: string) => `${runTag}-g-${label}@example.test`;

after(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: `${runTag}-g-` } } });
  await db.$disconnect();
});

describe("Google sign-in accounts", () => {
  test("an unverified or missing email is rejected", async () => {
    assert.equal(await upsertGoogleUser({ email: email("unverified"), email_verified: false }), null);
    assert.equal(await upsertGoogleUser({ email_verified: true }), null);
    assert.equal(await db.user.count({ where: { email: email("unverified") } }), 0);
  });

  test("a verified new email creates a user with no password and no auto-assigned name", async () => {
    const created = await upsertGoogleUser({
      email: email("new"),
      email_verified: true,
      name: "Dawn B",
      picture: "https://example.test/p.png",
    });
    assert.ok(created);
    assert.equal(created.password, null);
    assert.equal(created.displayName, null);
    assert.equal(created.image, "https://example.test/p.png");
  });

  test("signing in again reuses the same user", async () => {
    const first = await upsertGoogleUser({ email: email("again"), email_verified: true });
    const second = await upsertGoogleUser({ email: email("again"), email_verified: true });
    assert.equal(second?.id, first?.id);
    assert.equal(await db.user.count({ where: { email: email("again") } }), 1);
  });

  test("an existing password account is reused, not duplicated, and keeps its data", async () => {
    const existing = await db.user.create({ data: { email: email("pw"), displayName: "PwHero", password: "HASHED" } });
    const linked = await upsertGoogleUser({ email: email("pw"), email_verified: true, picture: "https://example.test/g.png" });
    assert.equal(linked?.id, existing.id);
    assert.equal(linked?.password, "HASHED");
    assert.equal(linked?.displayName, "PwHero");
    assert.equal(linked?.image, "https://example.test/g.png");
    assert.equal(await db.user.count({ where: { email: email("pw") } }), 1);
  });

  test("two simultaneous first sign-ins create exactly one user", async () => {
    const [a, b] = await Promise.all([
      upsertGoogleUser({ email: email("race"), email_verified: true }),
      upsertGoogleUser({ email: email("race"), email_verified: true }),
    ]);
    assert.ok(a && b);
    assert.equal(a.id, b.id);
    assert.equal(await db.user.count({ where: { email: email("race") } }), 1);
  });
});
