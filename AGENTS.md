# Working in this repository

Guidelines for every agent (and person) changing code here.

## Tests

- **Never run the full test suite while making changes.** Do not run `npm test` or `npm run test:all`.
  The full run takes more than seven minutes, can run out of memory, and slows the machine for anyone else
  working on it (several agents often share it, and film renders run in the background).
- **Run only the tests relevant to your change:**
  - the test files for the modules you changed and for their direct callers, for example
    `node --test --test-isolation=none tests/gameBlockStates.test.js tests/buildingStudioSchem.test.js`;
  - or the group that covers the area, for example `node scripts/test.mjs studio`. Run
    `npm run test:list` to see the groups and their files.
- When you add a test file, add it to the matching group in `scripts/test.mjs`.
- If a relevant test fails and you think your change did not cause it, check by running that test on a clean
  checkout of `HEAD` before going further. Say which failures were already there.
