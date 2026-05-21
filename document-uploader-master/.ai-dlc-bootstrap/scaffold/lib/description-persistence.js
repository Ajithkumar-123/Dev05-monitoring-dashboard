// assets/scripts/lib/description-persistence.js — D-73 description persistence shim.
// Now delegates to the universal `persisted-arg.js` helper. The existing
// description-persistence.test.js still passes against this shim. New code should
// import directly from `./persisted-arg.js` and use the field-parameterized API.
import { existsSync, writeFileSync } from 'node:fs';
import { writePersistedArg, readPersistedArg } from './persisted-arg.js';

export function writeDescriptionToQuestionFile(filePath, body, description) {
  // Legacy signature — takes a body argument. If the file doesn't yet exist, write the body
  // first so writePersistedArg's body-preservation path runs against a real file. If it exists,
  // ignore body and just upsert the persisted field.
  if (!existsSync(filePath)) {
    writeFileSync(filePath, body);
  }
  writePersistedArg(filePath, 'description', description);
}

export function readDescriptionFromQuestionFile(filePath) {
  const r = readPersistedArg(filePath, 'description');
  return { description: r.value };
}
