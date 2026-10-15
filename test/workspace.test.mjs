import test from "node:test";
import assert from "node:assert/strict";
import { suggestWorkspaceName, emailDomain } from "../src/lib/workspace.ts";

test("workspace name comes from the email domain", () => {
  assert.equal(suggestWorkspaceName("joseph.benson@trostechnologies.com"), "Trostechnologies");
  assert.equal(suggestWorkspaceName("ada@koraforge.com.ng"), "Koraforge");
  assert.equal(suggestWorkspaceName("ops@mail.acme-foods.co.uk"), "Acme Foods");
  assert.equal(suggestWorkspaceName("hr@dragnet.ng"), "Dragnet");
  assert.equal(suggestWorkspaceName("a@unilag.edu.ng"), "Unilag");
  assert.equal(suggestWorkspaceName("koraforge.com.ng"), "Koraforge");
});

test("incomplete input gives an empty or safe suggestion", () => {
  assert.equal(suggestWorkspaceName("joseph@"), "");
  assert.equal(suggestWorkspaceName("joseph"), "Joseph");
  assert.equal(emailDomain("X@TrosTechnologies.COM"), "trostechnologies.com");
});
