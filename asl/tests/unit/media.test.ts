import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mediaKeyFromSegments, mediaUrlForKey, resolveMediaUrl } from "../../src/server/media";

const opts = { bucket: "signhero", fallback: (k: string) => mediaUrlForKey(k) };

describe("mediaKeyFromSegments", () => {
  test("serves only audio/ and thumbnails/ objects", () => {
    assert.equal(mediaKeyFromSegments(["audio", "abc123.mp3"]), "audio/abc123.mp3");
    assert.equal(mediaKeyFromSegments(["thumbnails", "x-1_2.jpg"]), "thumbnails/x-1_2.jpg");
    assert.equal(mediaKeyFromSegments(["private", "secret.txt"]), null);
    assert.equal(mediaKeyFromSegments(["audio"]), null);
    assert.equal(mediaKeyFromSegments([]), null);
  });

  test("refuses traversal, hidden files and odd characters", () => {
    for (const bad of [["audio", ".."], ["audio", "..", "x"], ["audio", ".hidden"], ["audio", "a b.mp3"], ["audio", "a%2Fb"], ["audio", "x/y"], ["audio", ""], ["audio", "a..b.mp3"]]) {
      assert.equal(mediaKeyFromSegments(bad), null, JSON.stringify(bad));
    }
    assert.equal(mediaKeyFromSegments(["audio", "a", "b", "c", "d"]), null);
  });
});

describe("resolveMediaUrl", () => {
  test("empty stays empty and relative or foreign URLs pass through", () => {
    assert.equal(resolveMediaUrl(null, opts), null);
    assert.equal(resolveMediaUrl("", opts), null);
    assert.equal(resolveMediaUrl("/api/media/audio/a.mp3", opts), "/api/media/audio/a.mp3");
    assert.equal(resolveMediaUrl("https://cdn.example/x.mp3", opts), "https://cdn.example/x.mp3");
  });

  test("old direct MinIO URLs are rewritten to the site's media route", () => {
    assert.equal(resolveMediaUrl("http://localhost:4003/signhero/audio/a.mp3", opts), "/api/media/audio/a.mp3");
    assert.equal(resolveMediaUrl("http://192.168.2.8:4003/signhero/thumbnails/t.jpg", opts), "/api/media/thumbnails/t.jpg");
  });

  test("a bare object key becomes a media URL", () => {
    assert.equal(resolveMediaUrl("audio/a.mp3", opts), "/api/media/audio/a.mp3");
  });
});
