(function(root){
  const globalTarget = root || (typeof globalThis !== 'undefined' ? globalThis : {});
  const STRIP = s => (s || '').toString().trim();
  const lc = s => STRIP(s).toLowerCase();
  const normKey = s => lc(s).replace(/[^a-z0-9]+/g, '');

  const HEADER_MAP = {
    owner: [
      'owner','ownername','name','fullname','owner1','owner 1 name',
      'owner 1 full name','grantee','mailing name','firstandlastname'
    ],
    ownerFirst: ['owner1first','owner first name','first name','ownerfirst'],
    ownerLast: ['owner1last','owner last name','last name','ownerlast'],
    addrLine1: [
      'site address','situs address','property address','address','situs','street address',
      'property full address','siteaddress','propertyaddr','addressline1'
    ],
    city: ['city','situs city','property city'],
    state: ['state','situs state','property state','st'],
    zip: ['zip','zipcode','zip code','situs zip','property zip'],
    county: ['county','countyname'],
    apn: ['apn','parcel','parcel id','parcelid','parcel number','parcelnumber','parid','parno','pin'],
    acreage: ['acreage','acres','lot size','lotsize','lot acreage'],
    estValue: ['estimated market value','est value','marketvalue','assessedvalue','avm'],
    lat: ['latitude','lat'],
    lng: ['longitude','lon','long'],
    phone1: ['phone','phone 1','cell','mobile','primary phone','best phone','phone1'],
    phone2: ['phone 2','alternate phone','other phone','phone2','alt phone'],
    phone3: ['phone 3','phone3','landline'],
    email1: ['email','email 1','primary email','email1'],
    email2: ['email 2','alternate email','other email','email2'],
    dnc: ['dnc','donotcall','do not call','do-not-call','optout','dnc flag'],
  };

  const CANON_KEYS = Object.keys(HEADER_MAP);
  const HEADER_INDEX = new Map();
  for (const canon of CANON_KEYS) {
    for (const alias of HEADER_MAP[canon]) {
      HEADER_INDEX.set(normKey(alias), canon);
    }
  }

  function assembleOwner(row) {
    const first = STRIP(row.ownerFirst || '');
    const last = STRIP(row.ownerLast || '');
    const full = STRIP(row.owner || '');
    if (full) return full;
    if (first || last) return `${first} ${last}`.trim();
    return '';
  }

  const cleanPhone = p => STRIP(p).replace(/[^\d]+/g, '').replace(/^1(?=\d{10}$)/, '');
  const isPhone = p => /^\d{10}$/.test(p);
  const cleanEmail = e => lc(e);
  const uniq = arr => [...new Set(arr.filter(Boolean))];

  function toBool(v) {
    const s = lc(v);
    return ['1','true','yes','y','t'].includes(s);
  }

  function normalizeAddress(line1, city, state, zip) {
    return {
      line1: STRIP(line1),
      city: STRIP(city),
      state: STRIP(state).toUpperCase(),
      zip: STRIP(zip).replace(/[^\d]/g, '').slice(0, 10)
    };
  }

  function recordKey(rec) {
    const apn = STRIP(rec.apn);
    if (apn) return `apn:${lc(apn).replace(/[^a-z0-9]/g,'')}`;
    const o = lc(rec.owner);
    const a = lc(rec.address?.line1 || '');
    const z = STRIP(rec.address?.zip || '');
    return `oa:${o}|${a}|${z}`;
  }

  function mapRowToCanonical(row, sourceLabel) {
    const interim = {};
    for (const [k, v] of Object.entries(row)) {
      const mapped = HEADER_INDEX.get(normKey(k)) || null;
      if (mapped) interim[mapped] = v;
    }

    const owner = assembleOwner(interim);

    const address = normalizeAddress(
      interim.addrLine1 || row['Address'] || row['Property Address'] || '',
      interim.city || row['City'] || '',
      interim.state || row['State'] || '',
      interim.zip || row['Zip'] || row['Zip Code'] || '',
    );

    const phones = uniq(
      ['phone1','phone2','phone3']
        .map(k => interim[k])
        .flatMap(v => (Array.isArray(v) ? v : [v]))
        .map(cleanPhone)
        .filter(isPhone)
    );

    const emails = uniq(
      ['email1','email2']
        .map(k => interim[k])
        .flatMap(v => (Array.isArray(v) ? v : [v]))
        .map(cleanEmail)
        .filter(Boolean)
    );

    const num = s => {
      const n = Number(String(s || '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    };

    return {
      id: null,
      source: sourceLabel || 'import',
      owner,
      address,
      county: STRIP(interim.county),
      apn: STRIP(interim.apn),
      acreage: num(interim.acreage),
      estValue: num(interim.estValue),
      lat: interim.lat != null ? Number(interim.lat) : undefined,
      lng: interim.lng != null ? Number(interim.lng) : undefined,
      phones,
      emails,
      dnc: interim.dnc != null ? toBool(interim.dnc) : false,
      notes: [],
      history: [],
    };
  }

  function mergeRecords(a, b) {
    const prefer = (x, y) => (x == null || x === '' ? y : x);
    const maxNum = (x, y) => (x != null ? x : y);
    const or = (x, y) => Boolean(x || y);

    return {
      ...a,
      owner: prefer(a.owner, b.owner),
      address: {
        line1: prefer(a.address?.line1, b.address?.line1),
        city: prefer(a.address?.city, b.address?.city),
        state: prefer(a.address?.state, b.address?.state),
        zip: prefer(a.address?.zip, b.address?.zip),
      },
      county: prefer(a.county, b.county),
      apn: prefer(a.apn, b.apn),
      acreage: maxNum(a.acreage, b.acreage),
      estValue: maxNum(a.estValue, b.estValue),
      lat: a.lat ?? b.lat,
      lng: a.lng ?? b.lng,
      phones: uniq([...(a.phones || []), ...(b.phones || [])]),
      emails: uniq([...(a.emails || []), ...(b.emails || [])]),
      dnc: or(a.dnc, b.dnc),
      notes: a.notes || [],
      history: a.history || []
    };
  }

  function parseCsvToCanonical(csvText, sourceLabel) {
    const rows = csvText
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(',').map(s => s.replace(/^"|"$/g, '')));

    if (!rows.length) return [];
    const headers = rows[0];
    const dataRows = rows.slice(1);

    return dataRows.map(cells => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cells[i]));
      return mapRowToCanonical(obj, sourceLabel);
    });
  }

  function parseXlsxToCanonical(arrayBuffer, sourceLabel) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) library is required to parse XLSX files');
    }
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName =
      wb.SheetNames.find(n => /lead|property|sheet1/i.test(n)) ||
      wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return json.map(row => mapRowToCanonical(row, sourceLabel));
  }

  function mergeCanonical(existing, incoming) {
    const byKey = new Map(existing.map(r => [recordKey(r), r]));
    for (const inc of incoming) {
      const key = recordKey(inc);
      if (!key) continue;
      if (byKey.has(key)) {
        const merged = mergeRecords(byKey.get(key), inc);
        byKey.set(key, merged);
      } else {
        byKey.set(key, inc);
      }
    }
    return Array.from(byKey.values());
  }

  const LandIngest = {
    parseCsvToCanonical,
    parseXlsxToCanonical,
    mergeCanonical,
    mapRowToCanonical,
    recordKey,
    __internal: {
      cleanPhone,
      cleanEmail,
      mergeRecords,
      normalizeAddress,
      HEADER_INDEX,
      HEADER_MAP,
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LandIngest;
  }
  if (globalTarget) {
    globalTarget.LandIngest = LandIngest;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
