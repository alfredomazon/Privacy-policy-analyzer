import test from "node:test";
import assert from "node:assert/strict";

import { splitIntoSentences } from "../lib/policyGrabber.js";

test("splits stitched policy headings into readable evidence units", () => {
  const sentences = splitIntoSentences(
    "We collect your personal information from the following sources: Directly from you. Where We Collect Personal Information FromWe collect information from partners whose services you use."
  );

  assert.ok(
    sentences.some((sentence) =>
      sentence.includes("Where We Collect Personal Information From")
    )
  );
  assert.ok(
    sentences.every((sentence) => !sentence.includes("FromWe collect"))
  );
});

test("keeps table-like policy rows as separate readable units", () => {
  const sentences = splitIntoSentences(`
    Data type: Email; Purpose: account creation and support.
    Data type: Payment details; Purpose: processing purchases.
    Data type: Advertising identifiers; Purpose: targeted advertising.
  `);

  assert.equal(sentences.length, 3);
  assert.ok(sentences[0].includes("Email"));
  assert.ok(sentences[2].includes("Advertising identifiers"));
});
