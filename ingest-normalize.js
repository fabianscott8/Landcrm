(function(root){
  const globalTarget = root || (typeof globalThis !== 'undefined' ? globalThis : {});

  const STRIP = value => (value ?? '').toString().trim();
  const lc = value => STRIP(value).toLowerCase();
  const normKey = value => lc(value).replace(/[^a-z0-9]+/g, '');
  const titleCase = value => {
    const str = STRIP(value);
    if(!str) return '';
    return str.toLowerCase().replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
  };

  const norm = {
    apn: s => STRIP(s).replace(/[^0-9A-Za-z]/g, '').toUpperCase(),
    county: s => lc(s).replace(/\s+county$/, '').trim(),
    owner: s => lc(s).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim(),
    zip: s => STRIP(s).replace(/[^0-9]/g, '').slice(0, 5),
    phone: s => {
      const digits = STRIP(s).replace(/\D+/g, '');
      if(digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
      return digits;
    },
    email: s => lc(s).replace(/\s+/g, ''),
    state: s => STRIP(s).toUpperCase(),
    city: s => lc(s).replace(/\s+/g, ' ').trim(),
  };

  const SUFFIX_MAP = {
    st: 'street',
    rd: 'road',
    ave: 'avenue',
    dr: 'drive',
    blvd: 'boulevard',
    ct: 'court',
    ln: 'lane',
    hwy: 'highway'
  };

  const DIR_MAP = {
    north: 'n',
    south: 's',
    east: 'e',
    west: 'w',
    northeast: 'ne',
    northwest: 'nw',
    southeast: 'se',
    southwest: 'sw'
  };

  function normalizeStreetCore(addrRaw){
    const output = { core: '', house: '', street: '', streetName: '', suffix: '', direction: '' };
    if(!addrRaw) return output;
    let s = addrRaw.toLowerCase();
    s = s.replace(/\s+apt.*$|#.*$/g, '');
    s = s.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
    if(!s) return output;

    const parts = s.split(' ');
    const house = /^\d+[a-z]?$/.test(parts[0]) ? parts.shift() : '';

    let direction = '';
    if(parts.length){
      const rawDir = parts[0];
      const normalizedDir = DIR_MAP[rawDir] || rawDir;
      if(/^(n|s|e|w|ne|nw|se|sw)$/.test(normalizedDir)){
        direction = normalizedDir;
        parts.shift();
      }
    }

    let suffix = parts.length ? parts[parts.length - 1] : '';
    const mappedSuffix = SUFFIX_MAP[suffix] || suffix;
    if(mappedSuffix !== suffix){
      parts[parts.length - 1] = mappedSuffix;
    }
    suffix = mappedSuffix;

    const streetNameParts = suffix ? parts.slice(0, -1) : parts.slice();
    const streetName = streetNameParts.join(' ').trim();
    const street = parts.join(' ').trim();
    const core = [house, direction, street].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    output.core = core;
    output.house = house;
    output.street = street;
    output.streetName = streetName || street;
    output.suffix = suffix;
    output.direction = direction;
    return output;
  }

  function initialsMatch(a, b){
    const initials = value => value.split(/\s+/).filter(Boolean).map(word => word.charAt(0)).join('');
    const ia = initials(a);
    const ib = initials(b);
    return ia && ib && ia === ib;
  }

  function jaroWinkler(a, b){
    const s1 = (a || '').trim();
    const s2 = (b || '').trim();
    if(!s1 || !s2) return 0;
    const maxDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);
    let matches = 0;

    for(let i=0;i<s1.length;i++){
      const start = Math.max(0, i - maxDist);
      const end = Math.min(i + maxDist + 1, s2.length);
      for(let j=start;j<end;j++){
        if(s2Matches[j]) continue;
        if(s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if(!matches) return 0;

    let t = 0;
    let k = 0;
    for(let i=0;i<s1.length;i++){
      if(!s1Matches[i]) continue;
      while(!s2Matches[k]) k++;
      if(s1[i] !== s2[k]) t++;
      k++;
    }
    t /= 2;

    const jaro = ((matches / s1.length) + (matches / s2.length) + ((matches - t) / matches)) / 3;
    let prefix = 0;
    const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
    for(let i=0;i<maxPrefix;i++){
      if(s1[i] === s2[i]) prefix++;
      else break;
    }
    const jw = jaro + prefix * 0.1 * (1 - jaro);
    return Math.min(1, jw);
  }

  function haversineMeters(a, b){
    if(!Array.isArray(a) || !Array.isArray(b)) return Infinity;
    const [lat1, lon1] = a;
    const [lat2, lon2] = b;
    if(!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return Infinity;
    const toRad = d => d * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const sLat1 = toRad(lat1);
    const sLat2 = toRad(lat2);
    const aVal = Math.sin(dLat/2) ** 2 + Math.cos(sLat1) * Math.cos(sLat2) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    return R * c;
  }

  const HEADER_MAP = {
    owner: [
      'owner','ownername','name','fullname','owner1','owner 1 name','owner 1 full name','grantee','mailing name','firstandlastname'
    ],
    ownerFirst: ['owner1first','owner first name','first name','ownerfirst'],
    ownerLast: ['owner1last','owner last name','last name','ownerlast'],
    addressLine1: [
      'site address','situs address','property address','address','address line1','situsaddr','siteaddress','propertyaddr','street address','property full address','addressline1'
    ],
    city: ['city','situs city','property city','site city'],
    state: ['state','situs state','property state','site state','st'],
    zip: ['zip','zipcode','zip code','postal code','situs zip','property zip','site zip'],
    county: ['county','countyname','property county','site county'],
    apn: ['apn','parcel','parcel id','parcelid','parcel number','parcelnumber','parid','parno','pin','assessor parcel number (apn)'],
    acreage: ['acreage','acres','lot size','lotsize','lot acreage'],
    estValue: ['estimated market value','est value','marketvalue','assessedvalue','avm','estimated value','est. value'],
    lat: ['latitude','lat'],
    lng: ['longitude','lon','long','lng'],
    phone1: ['phone','phone 1','cell','mobile','primary phone','best phone','phone1'],
    phone2: ['phone 2','alternate phone','other phone','phone2','alt phone','cell 2'],
    phone3: ['phone 3','phone3','landline'],
    email1: ['email','email 1','primary email','email1'],
    email2: ['email 2','alternate email','other email','email2'],
    dnc: ['dnc','donotcall','do not call','do-not-call','optout','dnc flag'],
    streetNumber: ['street no','house no','streetnumber','street number'],
    streetName: ['street','street name','road','streetname'],
    streetSuffix: ['suffix','street suffix'],
    streetDir: ['dir','direction','prefix dir','street dir','street direction']
  };

  const CANON_KEYS = Object.keys(HEADER_MAP);
  const HEADER_INDEX = new Map();
  for(const canon of CANON_KEYS){
    for(const alias of HEADER_MAP[canon]){
      HEADER_INDEX.set(normKey(alias), canon);
    }
  }

  function mapRowToCanonical(row, sourceLabel){
    const interim = {};
    for(const [key, value] of Object.entries(row || {})){
      const mapped = HEADER_INDEX.get(normKey(key));
      if(mapped){
        interim[mapped] = value;
      }
    }

    const ownerFirst = STRIP(interim.ownerFirst);
    const ownerLast = STRIP(interim.ownerLast);
    const ownerFull = STRIP(interim.owner || interim.ownerFirst || interim.ownerLast);
    const owner = ownerFull || [ownerFirst, ownerLast].filter(Boolean).join(' ');

    const cityRaw = STRIP(interim.city || row.City || row['Site City']);
    const stateRaw = STRIP(interim.state || row.State || row['Site State']);
    const zipRaw = STRIP(interim.zip || row.Zip || row['Site Zip']);
    const countyRaw = STRIP(interim.county || row.County || '');

    const lineCandidates = [
      STRIP(interim.addressLine1),
      STRIP(row['Site Address']),
      STRIP(row['Situs Address']),
      STRIP(row['Property Address']),
      STRIP(row['Address']),
    ].filter(Boolean);

    const numberRaw = STRIP(interim.streetNumber || row['Street Number'] || '');
    const dirRaw = STRIP(interim.streetDir || row['Street Dir'] || '');
    const nameRaw = STRIP(interim.streetName || row['Street Name'] || '');
    const suffixRaw = STRIP(interim.streetSuffix || row['Street Suffix'] || '');

    if(!lineCandidates.length){
      const fallbackLine = [numberRaw, dirRaw, nameRaw, suffixRaw].filter(Boolean).join(' ');
      if(fallbackLine) lineCandidates.push(fallbackLine);
    }

    const primaryLine = lineCandidates[0] || '';
    const normalizedStreet = normalizeStreetCore(primaryLine || [numberRaw, dirRaw, nameRaw, suffixRaw].filter(Boolean).join(' '));

    const streetNumber = numberRaw || (normalizedStreet.house || '');
    const streetDir = normalizedStreet.direction || dirRaw;
    const streetSuffix = normalizedStreet.suffix || suffixRaw;
    const streetName = nameRaw || normalizedStreet.streetName || normalizedStreet.street;

    const address = {
      line1: primaryLine || [streetNumber, streetDir, streetName, streetSuffix].filter(Boolean).join(' '),
      city: cityRaw,
      state: stateRaw.toUpperCase(),
      zip: zipRaw.replace(/[^0-9]/g, '').slice(0, 10),
      streetNumber: streetNumber,
      streetName: streetName,
      streetSuffix: streetSuffix ? titleCase(streetSuffix) : '',
      streetDir: streetDir ? streetDir.toUpperCase() : ''
    };

    const phones = ['phone1','phone2','phone3']
      .map(key => interim[key])
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => norm.phone(value))
      .filter(Boolean);

    const emails = ['email1','email2']
      .map(key => interim[key])
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => norm.email(value))
      .filter(Boolean);

    const num = value => {
      const cleaned = STRIP(value).replace(/[^0-9.-]/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const canonical = {
      id: null,
      source: sourceLabel || 'import',
      owner,
      address,
      county: countyRaw,
      apn: STRIP(interim.apn || row.APN || row['Parcel Number'] || row['Parcel ID']),
      acreage: num(interim.acreage || row.Acreage),
      estValue: num(interim.estValue || row['Estimated Market Value']),
      lat: row.Latitude != null ? Number(row.Latitude) : (interim.lat != null ? Number(interim.lat) : undefined),
      lng: row.Longitude != null ? Number(row.Longitude) : (interim.lng != null ? Number(interim.lng) : undefined),
      phones,
      emails,
      dnc: interim.dnc != null ? ['1','true','yes','y','t'].includes(lc(interim.dnc)) : ['1','true','yes','y','t'].includes(lc(row.DNC)),
      notes: [],
      history: [],
      extra: { conflicts: {} },
      _provenance: [{ source: sourceLabel || 'import', importedAt: Date.now(), raw: { ...row } }]
    };

    return prepareCanonicalRecord(canonical);
  }

  function cloneCanonical(record){
    if(!record) return null;
    return {
      ...record,
      address: record.address ? { ...record.address } : undefined,
      phones: Array.isArray(record.phones) ? record.phones.slice() : [],
      emails: Array.isArray(record.emails) ? record.emails.slice() : [],
      notes: Array.isArray(record.notes) ? record.notes.map(note => ({ ...note })) : [],
      history: Array.isArray(record.history) ? record.history.map(item => ({ ...item })) : [],
      extra: record.extra ? { ...record.extra, conflicts: { ...(record.extra.conflicts || {}) } } : { conflicts: {} },
      _provenance: Array.isArray(record._provenance) ? record._provenance.map(item => ({ ...item })) : [],
      _normalized: record._normalized ? { ...record._normalized } : undefined,
      __keys: record.__keys ? { ...record.__keys } : undefined
    };
  }

  function dedupeNormalized(list){
    const seen = new Set();
    const out = [];
    for(const value of list){
      if(!value) continue;
      if(seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  function computeNormalized(record){
    const normalized = {};
    normalized.owner = norm.owner(record.owner);
    normalized.county = norm.county(record.county);
    normalized.apn = norm.apn(record.apn);

    const address = record.address || {};
    const line = STRIP(address.line1 || '');
    const dir = STRIP(address.streetDir || '');
    const number = STRIP(address.streetNumber || '');
    const name = STRIP(address.streetName || '');
    const suffix = STRIP(address.streetSuffix || '');
    const coreSource = line || [number, dir, name, suffix].filter(Boolean).join(' ');
    const normalizedStreet = normalizeStreetCore(coreSource);

    normalized.streetCore = normalizedStreet.core || [number, dir, [name, suffix].filter(Boolean).join(' ')].filter(Boolean).join(' ').toLowerCase();
    normalized.streetNumber = normalizedStreet.house || number.toLowerCase();
    normalized.streetName = normalizedStreet.streetName || name.toLowerCase();
    normalized.streetSuffix = normalizedStreet.suffix || suffix.toLowerCase();
    normalized.direction = normalizedStreet.direction || dir.toLowerCase();
    normalized.city = norm.city(address.city || '');
    normalized.state = norm.state(address.state || '');
    normalized.zip = norm.zip(address.zip || '');

    normalized.lat = Number.isFinite(record.lat) ? Number(record.lat) : undefined;
    normalized.lng = Number.isFinite(record.lng) ? Number(record.lng) : undefined;

    return normalized;
  }

  function buildKeys(record){
    const normalized = record._normalized || computeNormalized(record);
    const apn = normalized.apn;
    const county = normalized.county;
    const core = (normalized.streetCore || '').replace(/\s+/g, ' ').trim();
    const city = normalized.city;
    const state = normalized.state;
    const zip = normalized.zip;
    const owner = normalized.owner;

    const kAPN = apn && county ? `apn:${apn}|c:${county}` : '';
    const kAddrFull = core && city && state && zip ? `a:${core}|ct:${city}|s:${state}|z:${zip}` : '';
    const kOwnerAddrLite = owner && core && city && state ? `o:${owner}|a:${core}|ct:${city}|s:${state}` : '';
    return { kAPN, kAddrFull, kOwnerAddrLite };
  }

  function prepareCanonicalRecord(record){
    const clone = cloneCanonical(record) || {};
    clone.phones = dedupeNormalized((clone.phones || []).map(value => norm.phone(value)));
    clone.emails = dedupeNormalized((clone.emails || []).map(value => norm.email(value)));
    clone.dnc = Boolean(clone.dnc);
    if(!clone.extra || typeof clone.extra !== 'object') clone.extra = {};
    if(!clone.extra.conflicts || typeof clone.extra.conflicts !== 'object') clone.extra.conflicts = {};
    if(!Array.isArray(clone._provenance) || !clone._provenance.length){
      clone._provenance = [{ source: clone.source || 'import', importedAt: Date.now() }];
    }
    clone._normalized = computeNormalized(clone);
    clone.__keys = buildKeys(clone);
    return clone;
  }

  function recordKey(record){
    if(!record) return '';
    const keys = record.__keys || buildKeys(prepareCanonicalRecord(record));
    return keys.kAPN || keys.kAddrFull || keys.kOwnerAddrLite || '';
  }

  function mergeRecords(existing, incoming, detail){
    const left = prepareCanonicalRecord(existing);
    const right = prepareCanonicalRecord(incoming);

    const result = cloneCanonical(left) || {};

    const prefer = (a, b, field) => {
      const aVal = a ?? '';
      const bVal = b ?? '';
      if(aVal === '' || aVal === null || aVal === undefined){
        return bVal;
      }
      if(bVal === '' || bVal === null || bVal === undefined) return aVal;
      if(String(aVal) === String(bVal)) return aVal;
      if(!result.extra.conflicts[field]) result.extra.conflicts[field] = [];
      if(!result.extra.conflicts[field].includes(bVal)) result.extra.conflicts[field].push(bVal);
      return aVal;
    };

    result.owner = prefer(left.owner, right.owner, 'owner');
    result.county = prefer(left.county, right.county, 'county');
    result.apn = prefer(left.apn, right.apn, 'apn');
    result.acreage = left.acreage ?? right.acreage;
    result.estValue = left.estValue ?? right.estValue;
    result.lat = Number.isFinite(left.lat) ? left.lat : right.lat;
    result.lng = Number.isFinite(left.lng) ? left.lng : right.lng;

    const addr = { ...(left.address || {}), ...(right.address || {}) };
    const mergeAddressField = (field) => {
      const leftVal = left.address ? left.address[field] : undefined;
      const rightVal = right.address ? right.address[field] : undefined;
      return prefer(leftVal, rightVal, `address.${field}`);
    };

    addr.line1 = mergeAddressField('line1');
    addr.city = mergeAddressField('city');
    addr.state = mergeAddressField('state');
    addr.zip = mergeAddressField('zip');
    addr.streetNumber = mergeAddressField('streetNumber');
    addr.streetName = mergeAddressField('streetName');
    addr.streetSuffix = mergeAddressField('streetSuffix');
    addr.streetDir = mergeAddressField('streetDir');
    result.address = addr;

    const phoneSet = new Set();
    const pushPhone = value => {
      const normalized = norm.phone(value);
      if(!normalized) return;
      if(!phoneSet.has(normalized)) phoneSet.add(normalized);
    };
    (left.phones || []).forEach(pushPhone);
    (right.phones || []).forEach(pushPhone);
    result.phones = Array.from(phoneSet);

    const emailSet = new Set();
    const pushEmail = value => {
      const normalized = norm.email(value);
      if(!normalized) return;
      if(!emailSet.has(normalized)) emailSet.add(normalized);
    };
    (left.emails || []).forEach(pushEmail);
    (right.emails || []).forEach(pushEmail);
    result.emails = Array.from(emailSet);

    result.dnc = Boolean(left.dnc || right.dnc);

    const noteMap = new Map();
    const mergeArray = (target, source) => {
      if(!Array.isArray(source)) return;
      for(const entry of source){
        if(entry && typeof entry === 'object'){ target.push({ ...entry }); }
      }
    };

    const history = Array.isArray(left.history) ? left.history.map(item => ({ ...item })) : [];
    mergeArray(history, right.history);
    result.history = history;

    const notes = Array.isArray(left.notes) ? left.notes.map(item => ({ ...item })) : [];
    mergeArray(notes, right.notes);
    result.notes = notes;

    const provenance = Array.isArray(left._provenance) ? left._provenance.map(item => ({ ...item })) : [];
    if(Array.isArray(right._provenance)){
      for(const entry of right._provenance){
        const clone = { ...entry };
        if(!clone.importedAt) clone.importedAt = Date.now();
        provenance.push(clone);
      }
    }
    result._provenance = provenance;

    if(detail){
      result.extra.lastMergeDetail = detail;
    }

    return prepareCanonicalRecord(result);
  }

  function matchDetails(a, b){
    const left = prepareCanonicalRecord(a);
    const right = prepareCanonicalRecord(b);
    const A = left.__keys;
    const B = right.__keys;
    const detail = {
      score: 0,
      apnMatch: false,
      addressMatch: false,
      ownerMatch: false,
      geoMatch: false,
      zipMismatch: false,
      ownerSimilarity: 0
    };

    if(A.kAPN && A.kAPN === B.kAPN){
      detail.score += 0.90;
      detail.apnMatch = true;
    }

    if(A.kAddrFull && A.kAddrFull === B.kAddrFull){
      detail.score += 0.50;
      detail.addressMatch = true;
    }

    const ownerA = left._normalized?.owner || norm.owner(left.owner);
    const ownerB = right._normalized?.owner || norm.owner(right.owner);
    if(ownerA && ownerB){
      const similarity = jaroWinkler(ownerA, ownerB);
      if(similarity >= 0.90 || initialsMatch(ownerA, ownerB)){
        detail.score += 0.20;
        detail.ownerMatch = true;
        detail.ownerSimilarity = similarity;
      }
    }

    if(Number.isFinite(left._normalized?.lat) && Number.isFinite(left._normalized?.lng) && Number.isFinite(right._normalized?.lat) && Number.isFinite(right._normalized?.lng)){
      const distance = haversineMeters([left._normalized.lat, left._normalized.lng], [right._normalized.lat, right._normalized.lng]);
      if(distance <= 15){
        detail.score += 0.20;
        detail.geoMatch = true;
        detail.distanceMeters = distance;
      }else{
        detail.distanceMeters = distance;
      }
    }

    if(left._normalized?.zip && right._normalized?.zip && left._normalized.zip !== right._normalized.zip){
      detail.zipMismatch = true;
    }

    detail.score = Math.min(detail.score, 1);
    return detail;
  }

  function matchScore(a, b){
    return matchDetails(a, b).score;
  }

  function mergeCanonical(existing = [], incoming = [], options = {}){
    const opts = {
      autoMergeWithoutApn: options.autoMergeWithoutApn !== false,
      preventCrossZip: options.preventCrossZip !== false,
      now: typeof options.now === 'function' ? options.now : () => Date.now()
    };

    const summary = { processed: 0, created: 0, merged: 0, flagged: 0, invalid: 0 };
    const reviewQueue = [];
    const invalid = [];
    const createdEntries = [];
    const mergedEntries = [];
    const statusByKey = new Map();

    const finalRecords = Array.isArray(existing) ? existing.map(record => prepareCanonicalRecord(record)) : [];

    const rebuildIndexes = () => {
      const apnIndex = new Map();
      const addrIndex = new Map();
      const ownerAddrIndex = new Map();
      finalRecords.forEach((record, idx) => {
        const keys = record.__keys || buildKeys(record);
        if(keys.kAPN){
          if(!apnIndex.has(keys.kAPN)) apnIndex.set(keys.kAPN, []);
          apnIndex.get(keys.kAPN).push(idx);
        }
        if(keys.kAddrFull){
          if(!addrIndex.has(keys.kAddrFull)) addrIndex.set(keys.kAddrFull, []);
          addrIndex.get(keys.kAddrFull).push(idx);
        }
        if(keys.kOwnerAddrLite){
          if(!ownerAddrIndex.has(keys.kOwnerAddrLite)) ownerAddrIndex.set(keys.kOwnerAddrLite, []);
          ownerAddrIndex.get(keys.kOwnerAddrLite).push(idx);
        }
      });
      return { apnIndex, addrIndex, ownerAddrIndex };
    };

    let indexes = rebuildIndexes();

    const gatherCandidates = keys => {
      const set = new Set();
      if(keys.kAPN && indexes.apnIndex.has(keys.kAPN)){
        indexes.apnIndex.get(keys.kAPN).forEach(idx => set.add(idx));
      }
      if(keys.kAddrFull && indexes.addrIndex.has(keys.kAddrFull)){
        indexes.addrIndex.get(keys.kAddrFull).forEach(idx => set.add(idx));
      }
      if(keys.kOwnerAddrLite && indexes.ownerAddrIndex.has(keys.kOwnerAddrLite)){
        indexes.ownerAddrIndex.get(keys.kOwnerAddrLite).forEach(idx => set.add(idx));
      }
      return Array.from(set.values());
    };

    for(const rawIncoming of incoming){
      summary.processed += 1;
      const incomingPrepared = prepareCanonicalRecord({ ...rawIncoming, _provenance: Array.isArray(rawIncoming?._provenance) ? rawIncoming._provenance : [{ source: rawIncoming.source || 'import', importedAt: opts.now() }] });
      const keys = incomingPrepared.__keys;
      const hasAnyKey = Boolean(keys.kAPN || keys.kAddrFull || keys.kOwnerAddrLite);
      if(!hasAnyKey){
        summary.invalid += 1;
        invalid.push({ record: incomingPrepared, reason: 'Missing APN or address/owner details' });
        continue;
      }

      const candidateIdxs = gatherCandidates(keys);
      let best = null;
      for(const idx of candidateIdxs){
        const existingRecord = finalRecords[idx];
        const detail = matchDetails(existingRecord, incomingPrepared);
        if(opts.preventCrossZip && detail.zipMismatch){
          detail.score = Math.min(detail.score, 0.69);
          detail.reason = 'zip-mismatch';
        }
        if(!best || detail.score > best.detail.score){
          best = { idx, detail, existing: existingRecord };
        }
      }

      if(best && opts.preventCrossZip && best.detail.zipMismatch){
        summary.flagged += 1;
        reviewQueue.push({ existing: best.existing, incoming: incomingPrepared, score: best.detail.score, detail: best.detail, reason: 'zip-mismatch' });
        continue;
      }

      if(best && best.detail.score >= 0.90){
        if(best.detail.apnMatch || opts.autoMergeWithoutApn){
          const before = cloneCanonical(finalRecords[best.idx]);
          const merged = mergeRecords(finalRecords[best.idx], incomingPrepared, best.detail);
          finalRecords[best.idx] = merged;
          summary.merged += 1;
          mergedEntries.push({ before, after: merged, incoming: incomingPrepared, detail: best.detail });
          const key = recordKey(merged);
          if(key) statusByKey.set(key, 'merged');
          indexes = rebuildIndexes();
        }else{
          summary.flagged += 1;
          reviewQueue.push({ existing: best.existing, incoming: incomingPrepared, score: best.detail.score, detail: best.detail, reason: 'auto-merge-disabled' });
        }
        continue;
      }

      if(best && best.detail.score >= 0.70){
        summary.flagged += 1;
        reviewQueue.push({ existing: best.existing, incoming: incomingPrepared, score: best.detail.score, detail: best.detail, reason: best.detail.reason || 'low-confidence' });
        continue;
      }

      const key = recordKey(incomingPrepared);
      if(key && finalRecords.some(record => recordKey(record) === key)){
        summary.flagged += 1;
        reviewQueue.push({ existing: finalRecords.find(record => recordKey(record) === key), incoming: incomingPrepared, score: best ? best.detail.score : 0, detail: best ? best.detail : null, reason: 'duplicate-key' });
        continue;
      }

      finalRecords.push(incomingPrepared);
      summary.created += 1;
      createdEntries.push({ record: incomingPrepared });
      if(key) statusByKey.set(key, 'created');
      indexes = rebuildIndexes();
    }

    return {
      records: finalRecords.map(record => prepareCanonicalRecord(record)),
      summary,
      reviewQueue,
      invalid,
      created: createdEntries,
      merged: mergedEntries,
      statusByKey
    };
  }

  function parseCsvToCanonical(csvText, sourceLabel){
    if(typeof csvText !== 'string') return [];
    const rows = csvText.replace(/\r\n?/g, '\n').split('\n');
    if(!rows.length) return [];
    const headers = rows[0].split(',').map(cell => cell.replace(/^"|"$/g, ''));
    const dataRows = rows.slice(1).filter(Boolean);
    return dataRows.map(line => {
      const cells = line.split(',').map(cell => cell.replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((header, idx) => { row[header] = cells[idx]; });
      return mapRowToCanonical(row, sourceLabel || 'csv');
    });
  }

  function parseXlsxToCanonical(arrayBuffer, sourceLabel){
    if(typeof XLSX === 'undefined'){
      throw new Error('SheetJS (XLSX) library is required to parse XLSX files');
    }
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames.find(name => /lead|property|sheet1/i.test(name)) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return json.map(row => mapRowToCanonical(row, sourceLabel || 'xlsx'));
  }

  const LandIngest = {
    parseCsvToCanonical,
    parseXlsxToCanonical,
    mergeCanonical,
    mapRowToCanonical,
    recordKey,
    matchScore,
    __internal: {
      HEADER_MAP,
      HEADER_INDEX,
      normalizeStreetCore,
      norm,
      prepareCanonicalRecord,
      matchDetails,
      jaroWinkler,
      haversineMeters,
      buildKeys
    }
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = LandIngest;
  }
  if(globalTarget){
    globalTarget.LandIngest = LandIngest;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
