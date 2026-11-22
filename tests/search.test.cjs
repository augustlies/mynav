"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const search = require("../js/search.js");
const data = require("../data.js");

test("精确站名优先于批注中的次要提及", () => {
  const matches = search.filter(data.sites, "LinuxDo");
  assert.deepEqual(matches.map((site) => site.id), ["social-mwrkkhqa"]);
});
