const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../crm-logic.js');

const {
  GEOCODE_PROVIDERS,
  GEOCODE_THROTTLE_MS,
  cleanBuyerRecord,
  cleanLeadRecord,
  makeHistoryEntry,
  asNumber,
  normalizeCoordinate,
  normalizeLatitude,
  normalizeLongitude,
  leadHasCoordinates,
  hasCoords,
  needsCoords,
  computeGeocodeTargets,
  buildGeocodeQuery,
  sanitizeHistory,
  sampleBuyers,
  sampleLeads,
  toNumber,
  awaitGeocodeWindow,
  geocodeWithNominatim,
  applyGeocodeResult
} = logic;

test('sanitizeHistory normalizes primitive entries', () => {
  const entries = sanitizeHistory([
    'Called and left voicemail',
    { type: 'Call', note: 'Reached seller', timestamp: '2024-01-01T00:00:00.000Z', id: 'persisted', nextActionDate: '2024-01-05' }
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
  assert.equal(entries[1].nextActionDate, '2024-01-05');
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
  assert.ok(Array.isArray(normalized.__log));
  assert.equal(normalized.__history.length, 1);
  assert.equal(normalized.__log.length, 1);
  assert.strictEqual(normalized.__history, normalized.__log);
  assert.ok(normalized.__history[0].id);
  assert.equal(normalized.__history[0].type, 'Note');
});

test('normalizeCoordinate variants and leadHasCoordinates handle inputs safely', () => {
  assert.equal(normalizeCoordinate(' 28.1234 '), 28.1234);
  assert.equal(normalizeCoordinate('-82.501 '), -82.501);
  assert.equal(normalizeCoordinate(''), undefined);
  assert.equal(normalizeCoordinate(' - '), undefined);
  assert.equal(normalizeLatitude('91'), undefined);
  assert.equal(normalizeLatitude('-91.1'), undefined);
  assert.equal(normalizeLongitude('181'), undefined);
  assert.equal(normalizeLongitude('-181'), undefined);
  const lead = { Latitude: '28.9723', Longitude: '-82.4891' };
  assert.equal(leadHasCoordinates(lead), true);
  const missing = { Latitude: '', Longitude: null };
  assert.equal(leadHasCoordinates(missing), false);
  const zeroed = { Latitude: '0', Longitude: '0' };
  assert.equal(leadHasCoordinates(zeroed), false);
});

test('buildGeocodeQuery assembles address fallbacks', () => {
  const lead = {
    'Site Address': '123 Main St',
    City: 'Ocala',
    State: 'FL',
    Zip: '34470',
    County: 'Marion'
  };
  assert.equal(buildGeocodeQuery(lead), '123 Main St, Marion County, Ocala, FL, 34470');
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
  const embedded = {
    'Site Address': '789 Oak Rd, Citrus Springs, FL 34433',
    County: 'Citrus',
    City: 'Citrus Springs',
    State: 'FL',
    Zip: '34433'
  };
  assert.equal(buildGeocodeQuery(embedded), '789 Oak Rd, Citrus Springs, FL 34433, Citrus County');
});

test('cleanBuyerRecord keeps ids and normalizes history', () => {
  const normalized = cleanBuyerRecord({
    __history: ['Follow-up after inspection'],
    __id: 'buyer-1'
  });
  assert.equal(normalized.__id, 'buyer-1');
  assert.equal(normalized.__notes, '');
  assert.ok(Array.isArray(normalized.__history));
  assert.ok(Array.isArray(normalized.__log));
  assert.strictEqual(normalized.__history, normalized.__log);
  assert.equal(normalized.__history[0].type, 'Note');
  assert.ok(normalized.__history[0].id);
});

test('toNumber strips currency characters safely', () => {
  assert.equal(toNumber('$12,345.67'), 12345.67);
  assert.equal(toNumber('  5000  '), 5000);
  assert.equal(toNumber(null), undefined);
});

test('asNumber trims placeholders and converts values', () => {
  assert.equal(asNumber(' 28.75 '), 28.75);
  assert.equal(asNumber('—'), undefined);
  assert.equal(asNumber('NA'), undefined);
  assert.equal(asNumber('null'), undefined);
  assert.equal(asNumber('0'), 0);
  assert.equal(asNumber('$1,200.55'), 1200.55);
});

test('hasCoords and needsCoords respect normalization guards', () => {
  const withCoords = { Latitude: '28.5', Longitude: '-82.4' };
  assert.equal(hasCoords(withCoords), true);
  assert.equal(needsCoords(withCoords), false);
  const withoutCoords = { Latitude: '—', Longitude: '' };
  assert.equal(hasCoords(withoutCoords), false);
  assert.equal(needsCoords(withoutCoords), true);
  const outOfRange = { Latitude: '120', Longitude: '50' };
  assert.equal(hasCoords(outOfRange), false);
});

test('computeGeocodeTargets respects selection and missing coordinates', () => {
  const leads = [
    cleanLeadRecord({ __id: 'a', Latitude: '28.5', Longitude: '-82.4' }),
    cleanLeadRecord({ __id: 'b', Latitude: '', Longitude: '' }),
    cleanLeadRecord({ __id: 'c', Latitude: '—', Longitude: '—' })
  ];
  const allTargets = computeGeocodeTargets(leads);
  assert.equal(allTargets.length, 2);
  assert.deepEqual(allTargets.map(t => t.l.__id), ['b', 'c']);
  const selectedTargets = computeGeocodeTargets(leads, new Set(['a', 'b']));
  assert.equal(selectedTargets.length, 1);
  assert.equal(selectedTargets[0].l.__id, 'b');
});

test('OpenStreetMap provider is configured with throttle and parsing', () => {
  assert.equal(GEOCODE_PROVIDERS.length, 1);
  const osm = GEOCODE_PROVIDERS[0];
  assert.equal(osm.name, 'OpenStreetMap');
  assert.equal(osm.throttleMs, GEOCODE_THROTTLE_MS);
  assert.deepEqual(osm.parse([{ lat: '28.9', lon: '-82.4' }]), { lat: 28.9, lon: -82.4 });
  assert.equal(osm.parse([]), null);
});

test('awaitGeocodeWindow enforces the throttle interval', async () => {
  await awaitGeocodeWindow(Date.now() - (GEOCODE_THROTTLE_MS + 5));
  const before = Date.now();
  await awaitGeocodeWindow(before);
  const elapsed = Date.now() - before;
  assert.ok(elapsed >= GEOCODE_THROTTLE_MS - 50, `expected >= ${GEOCODE_THROTTLE_MS - 50}ms, got ${elapsed}`);
});

test('geocodeWithNominatim fetches and parses coordinates', async () => {
  let called = 0;
  const fakeFetch = async (url) => {
    called += 1;
    assert.ok(url.startsWith('https://nominatim.openstreetmap.org/search'));
    return {
      ok: true,
      async json(){
        return [{ lat: '28.101', lon: '-82.302' }];
      }
    };
  };
  const coords = await geocodeWithNominatim('123 Sample Rd, Town, ST', fakeFetch);
  assert.deepEqual(coords, { lat: 28.101, lon: -82.302, provider: 'OpenStreetMap' });
  assert.equal(called, 1);
});

test('geocodeWithNominatim filters placeholder coordinates', async () => {
  const fakeFetch = async () => ({
    ok: true,
    async json(){
      return [{ lat: '0', lon: '0' }];
    }
  });
  const coords = await geocodeWithNominatim('Any query', fakeFetch);
  assert.equal(coords, null);
});

test('applyGeocodeResult updates coordinates and logs provider', () => {
  const lead = cleanLeadRecord({
    __id: 'lead-geo',
    Latitude: '',
    Longitude: '',
    __history: [makeHistoryEntry('Note', 'Original')]
  });
  const updated = applyGeocodeResult(lead, { lat: '28.501', lon: '-82.401', provider: 'OpenStreetMap' });
  assert.notEqual(updated, lead);
  assert.equal(updated.Latitude, 28.501);
  assert.equal(updated.Longitude, -82.401);
  assert.ok(Array.isArray(updated.__history));
  assert.ok(Array.isArray(updated.__log));
  assert.strictEqual(updated.__history, updated.__log);
  assert.equal(updated.__history[0].type, 'Status');
  assert.equal(updated.__history[0].note, 'Coordinates verified via OpenStreetMap');
  const repeated = applyGeocodeResult(updated, { lat: 28.501, lon: -82.401, provider: 'OpenStreetMap' });
  assert.equal(repeated, updated);
});

test('sample data hydrates into clean records', () => {
  const hydratedLeads = sampleLeads.map(cleanLeadRecord);
  const hydratedBuyers = sampleBuyers.map(cleanBuyerRecord);
  assert.ok(hydratedLeads.length > 0);
  assert.ok(hydratedLeads.every(lead => Array.isArray(lead.__history)
    && Array.isArray(lead.__log)
    && lead.__history === lead.__log
    && lead.__history.every(entry => entry.id && entry.timestamp)));
  assert.ok(hydratedBuyers.length > 0);
  assert.ok(hydratedBuyers.every(buyer => Array.isArray(buyer.__history)
    && Array.isArray(buyer.__log)
    && buyer.__history === buyer.__log
    && buyer.__history.every(entry => entry.id && entry.timestamp)));
});
