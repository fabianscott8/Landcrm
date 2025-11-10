const test = require('node:test');
const assert = require('node:assert');

const LandIngest = require('../ingest-normalize.js');

const makeAddress = (line1='123 Main St', city='Springfield', state='IL', zip='62704')=>({line1, city, state, zip});

test('mapRowToCanonical normalizes header variants and values', () => {
  const row = {
    'Owner 1 Full Name': 'Jane Example',
    'Parcel Number': ' 123-456-789 ',
    'Property Address': '101 Elm St',
    City: 'Ridgefield',
    ST: 'wa',
    'Situs Zip': '98642-1234',
    'Phone 1': '(555) 123-4567',
    'Alternate Phone': '1-555-222-3333',
    'Email 1': 'Jane@Example.com ',
    'Alternate Email': 'Seller@Example.com',
    County: 'Clark',
    Acreage: ' 10.5 ',
    'Estimated Market Value': '$250,000',
    Latitude: '45.1234',
    Longitude: '-122.9876',
    DNC: 'yes'
  };

  const canonical = LandIngest.mapRowToCanonical(row, 'csv');
  assert.strictEqual(canonical.owner, 'Jane Example');
  assert.strictEqual(canonical.apn, '123-456-789');
  assert.deepStrictEqual(canonical.address, { line1: '101 Elm St', city: 'Ridgefield', state: 'WA', zip: '986421234' });
  assert.deepStrictEqual(canonical.phones, ['5551234567', '5552223333']);
  assert.deepStrictEqual(canonical.emails, ['jane@example.com', 'seller@example.com']);
  assert.strictEqual(canonical.county, 'Clark');
  assert.strictEqual(canonical.acreage, 10.5);
  assert.strictEqual(canonical.estValue, 250000);
  assert.strictEqual(canonical.lat, 45.1234);
  assert.strictEqual(canonical.lng, -122.9876);
  assert.strictEqual(canonical.dnc, true);
});

test('recordKey matches across export types and fallbacks', () => {
  const csvCanonical = LandIngest.mapRowToCanonical({
    'Owner Name': 'River Bend LLC',
    'Site Address': '200 Lake Shore Dr',
    City: 'Madison',
    State: 'WI',
    Zip: '53703',
    County: 'Dane',
    'Parcel Number': '0812-345-6789'
  }, 'csv');

  const xlsxCanonical = LandIngest.mapRowToCanonical({
    Owner: 'River Bend LLC',
    'Property Address': '200 Lake Shore Dr',
    'Situs City': 'Madison',
    'Situs State': 'WI',
    'Situs Zip': '53703',
    'Parcel ID': '08123456789'
  }, 'xlsx');

  assert.strictEqual(LandIngest.recordKey(csvCanonical), LandIngest.recordKey(xlsxCanonical));

  const fallbackA = LandIngest.mapRowToCanonical({
    Owner: 'No APN Holdings',
    Address: '789 Pine Rd',
    City: 'Everett',
    State: 'WA',
    Zip: '98201'
  }, 'csv');

  const fallbackB = LandIngest.mapRowToCanonical({
    'Owner Name': 'No APN Holdings',
    'Site Address': '789 Pine Rd',
    City: 'Everett',
    State: 'WA',
    Zip: '98201'
  }, 'xlsx');

  assert.match(LandIngest.recordKey(fallbackA), /^oa:/);
  assert.strictEqual(LandIngest.recordKey(fallbackA), LandIngest.recordKey(fallbackB));
});

test('mergeCanonical unions phones/emails and preserves flags', () => {
  const address = makeAddress();
  const existing = [{
    id: 'existing-1',
    owner: 'Harbor Estates',
    address,
    county: 'Bay',
    apn: '555-111',
    phones: ['5551234567'],
    emails: ['seller@harbor.com'],
    dnc: false,
    notes: ['Existing note'],
    history: [{ id: 'h1', type: 'Note', note: 'Old history' }]
  }];

  const incoming = [{
    owner: 'Harbor Estates',
    address,
    county: 'Bay',
    apn: '555-111',
    phones: ['5551234567', '5559998888'],
    emails: ['seller@harbor.com', 'info@harbor.com'],
    dnc: true
  }];

  const merged = LandIngest.mergeCanonical(existing, incoming);
  assert.strictEqual(merged.length, 1);
  const record = merged[0];
  assert.deepStrictEqual(record.phones.sort(), ['5551234567', '5559998888'].sort());
  assert.deepStrictEqual(record.emails.sort(), ['seller@harbor.com', 'info@harbor.com'].sort());
  assert.strictEqual(record.dnc, true);
  assert.deepStrictEqual(record.history, existing[0].history);
  assert.deepStrictEqual(record.notes, existing[0].notes);
});
