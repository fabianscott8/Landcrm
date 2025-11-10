const test = require('node:test');
const assert = require('node:assert');

const LandIngest = require('../ingest-normalize.js');

const { matchDetails, buildKeys } = LandIngest.__internal;

const map = (row, label='test') => LandIngest.mapRowToCanonical(row, label);

test('mapRowToCanonical normalizes identifiers, address parts, and contact channels', () => {
  const row = {
    'Owner 1 Full Name': '  Jane Example  ',
    'Parcel Number': ' 18E17S10-080074-000020 ',
    County: 'Pinal County ',
    'Property Address': '451 n oak st apt 4',
    City: 'Florence',
    State: 'az',
    Zip: '85132-1234',
    'Street No': '451',
    Direction: 'N',
    Street: 'Oak',
    Suffix: 'st',
    'Phone 1': '(555) 111-2222',
    'Phone 2': '1-555-333-4444',
    'Email 1': 'HELLO@Example.com',
    'Alternate Email': ' second@example.com ',
    Latitude: '33.0372',
    Longitude: '-111.3886',
    Acreage: ' 10.50 ',
    'Estimated Market Value': '$250,000'
  };

  const canonical = map(row, 'csv');

  assert.strictEqual(canonical.owner, 'Jane Example');
  assert.strictEqual(canonical.apn.trim(), '18E17S10-080074-000020');
  assert.strictEqual(canonical.county.trim(), 'Pinal County');
  assert.deepStrictEqual(canonical.address.line1, '451 n oak st apt 4');
  assert.strictEqual(canonical.address.city, 'Florence');
  assert.strictEqual(canonical.address.state, 'AZ');
  assert.strictEqual(canonical.address.zip, '851321234');
  assert.strictEqual(canonical.address.streetNumber, '451');
  assert.strictEqual(canonical.address.streetDir, 'N');
  assert.strictEqual(canonical.address.streetSuffix, 'Street');
  assert.deepStrictEqual(canonical.phones.sort(), ['5551112222','5553334444']);
  assert.deepStrictEqual(canonical.emails.sort(), ['hello@example.com','second@example.com']);
  assert.strictEqual(canonical.dnc, false);
  assert.ok(Array.isArray(canonical._provenance));
  assert.strictEqual(canonical._provenance.length, 1);
  assert.strictEqual(canonical._normalized.apn, '18E17S10080074000020');
  assert.strictEqual(canonical._normalized.county, 'pinal');
  assert.strictEqual(canonical._normalized.streetCore.includes('oak street'), true);
});

test('buildKeys prefers APN+county with fallbacks for address/owner', () => {
  const withApn = map({
    Owner: 'River Bend LLC',
    County: 'Dane County',
    'Site Address': '200 Lake Shore Dr',
    City: 'Madison',
    State: 'WI',
    Zip: '53703',
    APN: '0812-345-6789'
  });
  const keysApn = buildKeys(withApn);
  assert.strictEqual(keysApn.kAPN, 'apn:08123456789|c:dane');
  assert.ok(keysApn.kAddrFull.includes('lake shore drive'));

  const fallback = map({
    Owner: 'No APN Holdings',
    Address: '789 Pine Rd',
    City: 'Everett',
    State: 'WA',
    Zip: '98201'
  });
  const keysFallback = buildKeys(fallback);
  assert.strictEqual(keysFallback.kAPN, '');
  assert.ok(keysFallback.kAddrFull.startsWith('a:789 pine road'));
  assert.ok(keysFallback.kOwnerAddrLite.includes('no apn holdings'));
});

test('matchDetails scoring reflects APN, address, owner, and geo signals', () => {
  const base = map({
    Owner: 'Jane Example',
    County: 'Pinal',
    'Site Address': '451 N Oak St',
    City: 'Florence',
    State: 'AZ',
    Zip: '85132',
    APN: '18e17s10-080074-000020',
    Latitude: 33.0372,
    Longitude: -111.3886
  });

  const sameApn = map({
    Owner: 'J. Example',
    County: 'Pinal County',
    'Property Address': '451 North Oak Street',
    City: 'Florence',
    State: 'AZ',
    Zip: '85132',
    APN: '18E17S10-080074-000020'
  });

  const detailApn = matchDetails(base, sameApn);
  assert.ok(detailApn.apnMatch);
  assert.ok(detailApn.addressMatch);
  assert.ok(detailApn.ownerMatch);
  assert.ok(detailApn.score >= 0.9);

  const addressOnly = map({
    Owner: 'Jane Example',
    County: 'Pinal',
    Address: '451 N Oak St',
    City: 'Florence',
    State: 'AZ',
    Zip: '85132',
    Latitude: 33.037205,
    Longitude: -111.38859
  });
  const detailAddr = matchDetails(base, addressOnly);
  assert.strictEqual(detailAddr.apnMatch, false);
  assert.ok(detailAddr.addressMatch);
  assert.ok(detailAddr.geoMatch);
  assert.ok(detailAddr.score >= 0.7);
});

test('mergeCanonical auto-merges high confidence matches and tracks conflicts', () => {
  const existing = [map({
    Owner: 'Harbor Estates',
    County: 'Bay County',
    APN: '555-111',
    'Site Address': '123 Harbor Rd',
    City: 'Baytown',
    State: 'FL',
    Zip: '32401',
    'Phone 1': '555-000-1111',
    Email: 'info@harbor.com'
  })];

  const incoming = [map({
    Owner: 'Harbor Estates',
    County: 'Bay',
    APN: '555111',
    'Property Address': '123 Harbor Rd',
    City: 'Baytown',
    State: 'FL',
    Zip: '32401',
    'Phone 1': '555-000-1111',
    'Phone 2': '555-222-3333',
    'Alternate Email': 'sales@harbor.com',
    DNC: 'yes'
  })];

  const result = LandIngest.mergeCanonical(existing, incoming);
  assert.strictEqual(result.summary.merged, 1);
  assert.strictEqual(result.summary.created, 0);
  assert.strictEqual(result.reviewQueue.length, 0);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.records.length, 1);
  const merged = result.records[0];
  assert.ok(merged.phones.includes('5552223333'));
  assert.ok(merged.emails.includes('sales@harbor.com'));
  assert.strictEqual(merged.dnc, true);
  assert.ok(Array.isArray(merged.extra.conflicts.owner) ? merged.extra.conflicts.owner.length === 0 : true);
});

test('mergeCanonical flags cross-zip matches and respects options', () => {
  const base = [map({
    Owner: 'Example Holdings',
    County: 'King County',
    'Site Address': '400 Pine St',
    City: 'Seattle',
    State: 'WA',
    Zip: '98101'
  })];

  const incoming = [map({
    Owner: 'Example Holdings',
    County: 'King',
    Address: '400 Pine St',
    City: 'Seattle',
    State: 'WA',
    Zip: '98104'
  })];

  const result = LandIngest.mergeCanonical(base, incoming, { preventCrossZip: true });
  assert.strictEqual(result.summary.flagged, 1);
  assert.strictEqual(result.summary.created, 0);
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.reviewQueue.length, 1);
  assert.ok(result.reviewQueue[0].reason.includes('zip'));

  const allowResult = LandIngest.mergeCanonical(base, incoming, { preventCrossZip: false, autoMergeWithoutApn: true });
  assert.strictEqual(allowResult.summary.merged, 0);
  assert.strictEqual(allowResult.summary.created, 1);
  assert.strictEqual(allowResult.records.length, 2);
  assert.strictEqual(allowResult.reviewQueue.length, 0);
});

test('mergeCanonical creates new records when no confident match found', () => {
  const existing = [];
  const incoming = [map({
    Owner: 'Fresh Parcel LLC',
    County: 'Maricopa',
    'Site Address': '99 Desert Ln',
    City: 'Phoenix',
    State: 'AZ',
    Zip: '85001',
    'Phone 1': '602-111-2222'
  })];

  const result = LandIngest.mergeCanonical(existing, incoming);
  assert.strictEqual(result.summary.created, 1);
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.records[0].phones[0], '6021112222');
});
