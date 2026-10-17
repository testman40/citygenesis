import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {City} from '../src/simulation/City';
import {validateSave, type SaveData} from '../src/save/schema';
import {encodeTransfer, decodeTransfer, MAX_TRANSFER_BYTES} from '../src/save/transfer';

function saveAtBytes(bytes: number, multibyte: boolean): SaveData {
  const data: SaveData = {
    version: 4,
    savedAt: '2026-10-17',
    city: new City(64).snapshot(),
    clock: {speed: 0, accumulated: 0},
  };
  const baseBytes = Buffer.byteLength(JSON.stringify(validateSave(data)), 'utf8');
  const paddingBytes = bytes - baseBytes;
  assert.ok(paddingBytes >= 0);
  // Date.parse accepts trailing whitespace on this date-only representation.
  // The validated savedAt field retains the padding, without mocking validation.
  const wideSpaces = multibyte ? Math.floor(paddingBytes / 3) : 0;
  data.savedAt += '\u3000'.repeat(wideSpaces) + ' '.repeat(paddingBytes - wideSpaces * 3);
  const validated = validateSave(data);
  const serialized = JSON.stringify(validated);
  assert.equal(Buffer.byteLength(serialized, 'utf8'), bytes);
  if (multibyte) assert.ok(serialized.length < MAX_TRANSFER_BYTES);
  return data;
}

for (const multibyte of [false, true]) {
  const kind = multibyte ? 'UTF-8 multibyte' : 'ASCII';
  for (const delta of [-1, 0, 1]) {
    test(`export ${kind}: limit ${delta >= 0 ? '+' : ''}${delta} byte`, () => {
      const bytes = MAX_TRANSFER_BYTES + delta;
      const data = saveAtBytes(bytes, multibyte);
      const originalDate = data.savedAt;
      if (delta > 0) {
        assert.throws(() => encodeTransfer(data), /20MB/);
      } else {
        const text = encodeTransfer(data);
        assert.equal(Buffer.byteLength(text, 'utf8'), bytes);
        assert.deepEqual(validateSave(decodeTransfer(text)), validateSave(data));
      }
      assert.equal(data.savedAt, originalDate);
    });
  }
}

test('export still rejects invalid save data before serialization', () => {
  const invalid = {version: 999} as unknown as SaveData;
  assert.throws(() => encodeTransfer(invalid), /セーブバージョン/);
});
