const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../crm-logic.js');

const {
  GEOCODE_PROVIDERS,
  cleanBuyerRecord,
  cleanLeadRecord,
  makeHistoryEntry,
  normalizeCoordinate,
  leadHasCoordinates,
  buildGeocodeQuery,
  sanitizeHistory,
  sampleBuyers,
  sampleLeads,
  toNumber
} = logic;

test('sanitizeHistory normalizes primitive entries', () => {
  const entries = sanitizeHistory([
    'Called and left voicemail',
    { type: 'Call', note: 'Reached seller', timestamp: '2024-01-01T00:00:00.000Z', id: 'persisted' }
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].type, 'Note');
  assert.equal(entries[0].note, 'Called and left voicemail');
  assert.ok(entries[0].id);
  assert.ok(entries[0].timestamp);
  assert.equal(entries[1].type, 'Call');
  assert.equal(entries[1].note, 'Reached seller');
  assert.equal(entries[1].id, 'persisted');
  assert.equal(entries[1].timestamp, '2024-01-01T00:00:00.000Z');
});

test('cleanLeadRecord fills defaults and preserves identifiers', () => {
  const normalized = cleanLeadRecord({
    __history: [makeHistoryEntry('Note', 'Imported lead')],
    __id: 'lead-1',
    Latitude: '28.50',
    Longitude: '-82.4'
  });
  assert.equal(normalized.__id, 'lead-1');
  assert.equal(normalized['Owner Name'], '');
  assert.equal(normalized.Status, 'New');
  assert.equal(normalized.Type, 'Seller Lead');
  assert.equal(normalized.Latitude, 28.5);
  assert.equal(normalized.Longitude, -82.4);
  assert.ok(Array.isArray(normalized.__history));
  assert.equal(normalized.__history.length, 1);
  assert.ok(normalized.__history[0].id);
  assert.equal(normalized.__history[0].type, 'Note');
});

test('normalizeCoordinate and leadHasCoordinates handle string inputs safely', () => {
  assert.equal(normalizeCoordinate(' 28.1234 '), 28.1234);
  assert.equal(normalizeCoordinate('-82.501 '), -82.501);
  assert.equal(normalizeCoordinate(''), undefined);
  assert.equal(normalizeCoordinate(' - '), undefined);
  const lead = { Latitude: '28.9723', Longitude: '-82.4891' };
  assert.equal(leadHasCoordinates(lead), true);
  const missing = { Latitude: '', Longitude: null };
  assert.equal(leadHasCoordinates(missing), false);
});

test('buildGeocodeQuery assembles address fallbacks', () => {
  const lead = {
    'Site Address': '123 Main St',
    City: 'Ocala',
    State: 'FL',
    Zip: '34470',
    County: 'Marion'
  };
  assert.equal(buildGeocodeQuery(lead), '123 Main St, Ocala, FL, 34470, Marion County');
  const fallback = {
    'Site Address': '',
    'Street Address': '456 Pine Ave',
    City: 'Ocala',
    State: 'FL',
    Zip: '34470',
    APN: '123-456'
  };
  assert.equal(buildGeocodeQuery(fallback), '456 Pine Ave, Ocala, FL, 34470');
  const ownerOnly = { 'Owner Name': 'Sample Owner' };
  assert.equal(buildGeocodeQuery(ownerOnly), 'Sample Owner');
});

test('cleanBuyerRecord keeps ids and normalizes history', () => {
  const normalized = cleanBuyerRecord({
    __history: ['Follow-up after inspection'],
    __id: 'buyer-1'
  });
  assert.equal(normalized.__id, 'buyer-1');
  assert.equal(normalized.__notes, '');
  assert.ok(Array.isArray(normalized.__history));
  assert.equal(normalized.__history[0].type, 'Note');
  assert.ok(normalized.__history[0].id);
});

test('toNumber strips currency characters safely', () => {
  assert.equal(toNumber('$12,345.67'), 12345.67);
  assert.equal(toNumber('  5000  '), 5000);
  assert.equal(toNumber(null), undefined);
});

test('geocode providers parse valid payloads', () => {
  const osm = GEOCODE_PROVIDERS.find(p => p.name === 'OpenStreetMap');
  const mapsCo = GEOCODE_PROVIDERS.find(p => p.name === 'Maps.co');
  const openMeteo = GEOCODE_PROVIDERS.find(p => p.name === 'Open-Meteo');
  assert.deepEqual(osm.parse([{ lat: '28.9', lon: '-82.4' }]), { lat: 28.9, lon: -82.4 });
  assert.deepEqual(mapsCo.parse([{ lat: '29.0', lon: '-81.5' }]), { lat: 29.0, lon: -81.5 });
  assert.deepEqual(openMeteo.parse({ results: [{ latitude: '30.1', longitude: '-83.2' }] }), { lat: 30.1, lon: -83.2 });
  assert.equal(osm.parse([]), null);
  assert.equal(mapsCo.parse(null), null);
  assert.equal(openMeteo.parse({}), null);
});

test('sample data hydrates into clean records', () => {
  const hydratedLeads = sampleLeads.map(cleanLeadRecord);
  const hydratedBuyers = sampleBuyers.map(cleanBuyerRecord);
  assert.ok(hydratedLeads.length > 0);
  assert.ok(hydratedLeads.every(lead => Array.isArray(lead.__history) && lead.__history.every(entry => entry.id && entry.timestamp)));
  assert.ok(hydratedBuyers.length > 0);
  assert.ok(hydratedBuyers.every(buyer => Array.isArray(buyer.__history) && buyer.__history.every(entry => entry.id && entry.timestamp)));
});
