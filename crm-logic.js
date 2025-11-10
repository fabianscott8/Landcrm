(function(global){
  const HISTORY_TYPES = ["Note","Call","Offer","Follow-up","Task","Status","Assignment","Lead Assignment"];
  const sleep = (ms)=> new Promise(resolve=>setTimeout(resolve, ms));
  const GEOCODE_THROTTLE_MS = 1200;
  const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
  const COORDINATE_PLACEHOLDER_THRESHOLD = 1e-9;
  const TEXT_PLACEHOLDER_VALUES = new Set(["—", "-"]);

  const asNumber = (v)=>{
    if(v === null || v === undefined) return undefined;
    const s = String(v).trim();
    if(!s) return undefined;
    const lower = s.toLowerCase();
    if(TEXT_PLACEHOLDER_VALUES.has(s) || lower === "na" || lower === "null") return undefined;
    const n = Number(s);
    if(Number.isFinite(n)) return n;
    const fallback = Number(s.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(fallback) ? fallback : undefined;
  };

  const stripPlaceholderText = (value)=>{
    if(value === null || value === undefined) return "";
    const s = String(value).trim();
    if(!s) return "";
    if(TEXT_PLACEHOLDER_VALUES.has(s)) return "";
    return s;
  };

  const rawCoordinateToNumber = (value)=>{
    const numeric = asNumber(value);
    if(!Number.isFinite(numeric)) return undefined;
    return numeric;
  };
  const normalizeLatitude = (value)=>{
    const numeric = rawCoordinateToNumber(value);
    if(!Number.isFinite(numeric)) return undefined;
    if(numeric < -90 || numeric > 90) return undefined;
    return numeric;
  };
  const normalizeLongitude = (value)=>{
    const numeric = rawCoordinateToNumber(value);
    if(!Number.isFinite(numeric)) return undefined;
    if(numeric < -180 || numeric > 180) return undefined;
    return numeric;
  };
  const normalizeCoordinate = rawCoordinateToNumber;
  const coordinatesLookValid = (lat, lon)=>{
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if(Math.abs(lat) <= COORDINATE_PLACEHOLDER_THRESHOLD && Math.abs(lon) <= COORDINATE_PLACEHOLDER_THRESHOLD) return false;
    return true;
  };
  const GEOCODE_PROVIDERS = [
    {
      name: "OpenStreetMap",
      throttleMs: GEOCODE_THROTTLE_MS,
      buildUrl: (query)=>`${NOMINATIM_ENDPOINT}?format=json&limit=1&addressdetails=0&email=landcrm-demo@example.com&q=${encodeURIComponent(query)}`,
      parse: (payload)=>{
        if(Array.isArray(payload) && payload[0]){
          const lat = normalizeLatitude(payload[0].lat ?? payload[0].latitude);
          const lon = normalizeLongitude(payload[0].lon ?? payload[0].lng ?? payload[0].longitude);
          if(coordinatesLookValid(lat, lon)) return {lat, lon};
        }
        return null;
      }
    }
  ];
  let lastGeocodeAt = 0;
  async function awaitGeocodeWindow(now = Date.now()){
    const elapsed = now - lastGeocodeAt;
    if(lastGeocodeAt && elapsed < GEOCODE_THROTTLE_MS){
      await sleep(GEOCODE_THROTTLE_MS - elapsed);
    }
    lastGeocodeAt = Date.now();
  }
  async function geocodeWithNominatim(query, fetchImpl){
    if(!query || typeof fetchImpl !== "function") return null;
    await awaitGeocodeWindow();
    const url = GEOCODE_PROVIDERS[0].buildUrl(query);
    try{
      const res = await fetchImpl(url,{headers:{"Accept":"application/json"}});
      if(!res || !res.ok) return null;
      const payload = await res.json();
      const coords = GEOCODE_PROVIDERS[0].parse(payload);
      if(!coords) return null;
      const lat = normalizeLatitude(coords.lat ?? coords.latitude);
      const lon = normalizeLongitude(coords.lon ?? coords.lng ?? coords.longitude);
      if(!coordinatesLookValid(lat, lon)) return null;
      return {lat, lon, provider: GEOCODE_PROVIDERS[0].name};
    }catch(err){
      console.warn("OpenStreetMap geocode failed", err);
      return null;
    }
  }
  const makeId = ()=>`id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const formatDateTime = (iso)=>{ try{ return new Date(iso).toLocaleString(); }catch{ return iso || ""; } };
  const makeHistoryEntry = (type, note, extras)=>({
    id: makeId(),
    type: type || "Note",
    note,
    timestamp: new Date().toISOString(),
    ...(extras && typeof extras === 'object' ? extras : null)
  });
  const toNumber = (x)=>{ const raw=String(x??"").replace(/[$,\s]/g,""); if(!raw) return undefined; const n=Number(raw); return Number.isFinite(n)?n:undefined; };
  const hasCoords = (obj)=>{
    if(!obj || typeof obj !== 'object') return false;
    const lat = normalizeLatitude(obj.Latitude ?? obj.lat ?? obj.latitude);
    const lon = normalizeLongitude(obj.Longitude ?? obj.lon ?? obj.longitude);
    return coordinatesLookValid(lat, lon);
  };
  const needsCoords = (obj)=> !hasCoords(obj);
  const leadHasCoordinates = hasCoords;
  const computeGeocodeTargets = (leads, selectedIds)=>{
    const list = Array.isArray(leads) ? leads : [];
    const selectedSet = selectedIds instanceof Set ? selectedIds : (selectedIds ? new Set(selectedIds) : null);
    const base = (selectedSet && selectedSet.size) ? list.filter(l=>selectedSet.has(l.__id)) : list;
    return base.map((l, idx)=>({l, idx})).filter(({l})=>needsCoords(l));
  };
  const normalizeCountyName = (value)=>{
    const clean = stripPlaceholderText(value);
    if(!clean) return '';
    return clean.toLowerCase().includes('county') ? clean : `${clean} County`;
  };
  const addPart = (parts, value)=>{
    const clean = stripPlaceholderText(value);
    if(!clean) return;
    const lower = clean.toLowerCase();
    if(parts.some(part=>part.toLowerCase() === lower)) return;
    parts.push(clean);
  };
  const valueIncludes = (source, needle)=>{
    if(!source || !needle) return false;
    return source.toLowerCase().includes(needle.toLowerCase());
  };
  const buildGeocodeQuery = (l)=>{
    if(!l) return '';
    const siteAddress = stripPlaceholderText(l["Site Address"]);
    const mailingAddress = stripPlaceholderText(l["Street Address"]);
    const county = normalizeCountyName(l["County"]);
    const city = stripPlaceholderText(l["City"] || l["Site City"]);
    const state = stripPlaceholderText(l["State"] || l["Site State"]);
    const zip = stripPlaceholderText(l["Zip"] || l["Site Zip"]);
    const address = siteAddress || mailingAddress;
    if(address){
      const parts = [];
      addPart(parts, address);
      if(county && !valueIncludes(address, county)){ addPart(parts, county); }
      const addressHasCity = valueIncludes(address, city);
      const addressHasState = valueIncludes(address, state);
      if(city && state){
        if(!(addressHasCity && addressHasState)){
          addPart(parts, `${city}, ${state}`);
        }
      }else{
        if(city && !addressHasCity) addPart(parts, city);
        if(state && !addressHasState) addPart(parts, state);
      }
      if(zip && !valueIncludes(address, zip)) addPart(parts, zip);
      return parts.join(', ');
    }
    const parts = [];
    if(city && state){
      addPart(parts, `${city}, ${state}`);
    }else{
      addPart(parts, city);
      addPart(parts, state);
    }
    addPart(parts, zip);
    addPart(parts, county);
    if(parts.length){
      return parts.join(', ');
    }
    const apn = stripPlaceholderText(l["APN"]);
    if(apn) return apn;
    return stripPlaceholderText(l["Owner Name"]);
  };
  function applyGeocodeResult(lead, coords){
    if(!lead || typeof lead !== 'object') return lead;
    const latCandidate = coords && (coords.lat ?? coords.Latitude ?? coords.latitude);
    const lonCandidate = coords && (coords.lon ?? coords.lng ?? coords.Longitude ?? coords.longitude);
    const lat = normalizeLatitude(latCandidate);
    const lon = normalizeLongitude(lonCandidate);
    if(!coordinatesLookValid(lat, lon)) return lead;
    const existingLat = normalizeLatitude(lead.Latitude);
    const existingLon = normalizeLongitude(lead.Longitude);
    const provider = coords && (coords.provider || coords.source || null);
    const next = {...lead};
    let changed = false;
    if(existingLat !== lat || typeof next.Latitude !== 'number'){
      next.Latitude = lat;
      changed = true;
    }
    if(existingLon !== lon || typeof next.Longitude !== 'number'){
      next.Longitude = lon;
      changed = true;
    }
    if(provider){
      const note = `Coordinates verified via ${provider}`;
      const historyBase = Array.isArray(lead.__log) ? lead.__log : (Array.isArray(lead.__history) ? lead.__history : []);
      const history = historyBase.slice();
      const alreadyLogged = history.length && history[0] && history[0].type === "Status" && history[0].note === note;
      if(!alreadyLogged){
        history.unshift(makeHistoryEntry("Status", note));
        next.__history = history;
        next.__log = history;
        changed = true;
      }
    }
    return changed ? next : lead;
  }
  function sanitizeHistory(list){
    if(!Array.isArray(list)) return [];
    return list.map(entry=>{
      if(!entry || typeof entry!=="object"){
        return makeHistoryEntry("Note", String(entry ?? ""));
      }
      const nextActionCandidate = entry.nextActionDate || entry.nextAction || entry.followUpDate || entry.follow_up_date;
      const normalizedNextAction = nextActionCandidate ? String(nextActionCandidate).trim() : "";
      const extras = normalizedNextAction ? { nextActionDate: normalizedNextAction } : {};
      return {
        id: entry.id || makeId(),
        type: entry.type || entry.kind || "Note",
        note: entry.note ?? entry.text ?? "",
        timestamp: entry.timestamp || entry.date || new Date().toISOString(),
        ...extras
      };
    });
  }
  function cleanLeadRecord(o){
    const normalized = {
      ...o,
      "Owner Name":stripPlaceholderText(o["Owner Name"]||o.owner||""), County:stripPlaceholderText(o["County"]||""), "Site Address":stripPlaceholderText(o["Site Address"]||""),
      "Estimated Market Value":stripPlaceholderText(o["Estimated Market Value"]||""), APN:stripPlaceholderText(o["APN"]||""),
      Latitude: normalizeLatitude(asNumber(o["Latitude"] ?? o.lat ?? o.latitude)), Longitude: normalizeLongitude(asNumber(o["Longitude"] ?? o.lon ?? o.longitude)),
      Acreage: o["Acreage"] || o["Lot Acres"] || o["Lot Size (acres)"] || "",
      "First Name": o["First Name"]||o["First Name (0)"]||"", "Last Name": o["Last Name"]||o["Last Name (0)"]||"",
      "Company Name": o["Company Name"]||"", "Street Address": o["Street Address"]||"", City:o["City"]||"", State:o["State"]||"", Zip:o["Zip"]||"",
      Cell:o["Cell"]||"", "Cell 2":o["Cell 2"]||"", "Cell 3":o["Cell 3"]||"", Landline:o["Landline"]||"", "Landline 2":o["Landline 2"]||"", "Landline 3":o["Landline 3"]||"", "Landline 4":o["Landline 4"]||"",
      "Email 1":o["Email 1"]||o["Email"]||"", "Email 2":o["Email 2"]||"", "Email 3":o["Email 3"]||"",
      Status: o["Status"]||"New", Type: o["Type"]||"Seller Lead",
      __notes:o.__notes||"", __lastContacted:o.__lastContacted||"", __nextAction:o.__nextAction||"", __tags:Array.isArray(o.__tags)?o.__tags:[],
      __assignedBuyerId: o.__assignedBuyerId || null
    };
    const history = sanitizeHistory(o.__log || o.__history);
    return {...normalized, __history:history, __log:history, __id:o.__id || makeId()};
  }
  function cleanBuyerRecord(o){
    const normalized = {
      ...o,
      __notes:o.__notes||"",
      __history:sanitizeHistory(o.__log || o.__history)
    };
    const history = normalized.__history;
    return {...normalized, __history:history, __log:history, __id:o.__id || makeId()};
  }
  const now = Date.now();
  const isoDaysAgo = (days)=> new Date(now - days*86400000).toISOString();
  const dateDaysAgo = (days)=> isoDaysAgo(days).slice(0,10);
  const sampleLeads = [
    {
      "Owner Name": "John & Jane Sample",
      County: "Citrus",
      City: "Citrus Springs",
      State: "FL",
      Zip: "34433",
      "Site Address": "1234 W Elm Dr, Citrus Springs, FL 34433",
      "Estimated Market Value": "$12,500",
      Latitude: 28.9723,
      Longitude: -82.4891,
      APN: "18E17S100010 01230 0120",
      Acreage: "0.24",
      Cell: "(352) 555-0199",
      "Email 1": "john.sample@citrusland.com",
      Status: "Contacted",
      __notes: "Seller is open to a clean cash offer with a quick close.",
      __nextAction: "Send purchase agreement draft",
      __lastContacted: dateDaysAgo(2),
      __assignedBuyerId: null,
      __log: [
        {...makeHistoryEntry("Call", "Spoke with John – property is vacant and taxes are current."), timestamp: isoDaysAgo(6)},
        {...makeHistoryEntry("Note", "Mailed follow-up packet with offer range."), timestamp: isoDaysAgo(4)},
        {...makeHistoryEntry("Offer", "Working on written offer around $9,500."), timestamp: isoDaysAgo(1)}
      ]
    },
    {
      "Owner Name": "Acme Holdings LLC",
      County: "Citrus",
      City: "Citrus Springs",
      State: "FL",
      Zip: "34433",
      "Site Address": "9876 N Maple Way, Citrus Springs, FL 34433",
      "Estimated Market Value": "$14,900",
      Latitude: 28.9677,
      Longitude: -82.4612,
      APN: "18E17S100020 04560 0070",
      Acreage: "0.25",
      "Phone 1": "(352) 555-0142",
      "Email 1": "offers@acmeholdings.example",
      Status: "New",
      __notes: "Cold mailer response asking for quick valuation.",
      __nextAction: "Research comps and call back",
      __lastContacted: dateDaysAgo(5),
      __assignedBuyerId: null,
      __log: [
        {...makeHistoryEntry("Note", "Lead imported from PropStream CSV."), timestamp: isoDaysAgo(10)},
        {...makeHistoryEntry("Task", "Pull three nearby sold comps."), timestamp: isoDaysAgo(3)}
      ]
    }
  ];
  const sampleBuyers = [
    {
      "Buyer Name / Company":"LandPath Ventures",
      "Buy Box - Counties":"Citrus; Marion",
      "Buy Box - States":"FL",
      "Min Acres":"0.2",
      "Max Acres":"10",
      "Min Price":"$5,000",
      "Max Price":"$80,000",
      "Funding Type (Cash/Hard Money)":"Cash",
      "Phone":"(352) 555-0118",
      "Email":"offers@landpath.com",
      __notes: "Prefers infill lots close to paved roads.",
      __log: [
        {...makeHistoryEntry("Assignment", "Closed Inverness lot assignment in May."), timestamp: isoDaysAgo(25)},
        {...makeHistoryEntry("Call", "Interested in 0.25-0.5 acre inventory in Citrus."), timestamp: isoDaysAgo(7)}
      ]
    },
    {
      "Buyer Name / Company":"Sunstate Holdings",
      "Buy Box - Counties":"Hernando; Citrus",
      "Buy Box - States":"FL",
      "Min Acres":"0.18",
      "Max Acres":"5",
      "Min Price":"$3,000",
      "Max Price":"$65,000",
      "Funding Type (Cash/Hard Money)":"Cash",
      "Phone":"(813) 555-0194",
      "Email":"acq@sunstate.com",
      __notes: "Will take down multiple lots at once.",
      __log: [
        {...makeHistoryEntry("Note", "Met at Tampa meetup – send over Citrus list weekly."), timestamp: isoDaysAgo(14)}
      ]
    },
    {
      "Buyer Name / Company":"Trailblazer Capital",
      "Buy Box - Counties":"Polk; Lake",
      "Buy Box - States":"FL",
      "Min Acres":"0.25",
      "Max Acres":"12",
      "Min Price":"$8,000",
      "Max Price":"$120,000",
      "Funding Type (Cash/Hard Money)":"Hard Money",
      "Phone":"(407) 555-0137",
      "Email":"closings@trailblazer.cap",
      __notes: "Has rehab crew for light clearing; needs 30-day close.",
      __log: [
        {...makeHistoryEntry("Call", "Checking on Polk pipeline; asked for 3 new deals."), timestamp: isoDaysAgo(5)}
      ]
    }
  ];
  const logic = {
    HISTORY_TYPES,
    GEOCODE_PROVIDERS,
    sleep,
    makeId,
    formatDateTime,
    makeHistoryEntry,
    asNumber,
    toNumber,
    sanitizeHistory,
    cleanLeadRecord,
    cleanBuyerRecord,
    sampleLeads,
    sampleBuyers,
    isoDaysAgo,
    dateDaysAgo,
    normalizeCoordinate,
    normalizeLatitude,
    normalizeLongitude,
    applyGeocodeResult,
    leadHasCoordinates,
    hasCoords,
    needsCoords,
    computeGeocodeTargets,
    buildGeocodeQuery,
    GEOCODE_THROTTLE_MS,
    awaitGeocodeWindow,
    geocodeWithNominatim
  };
  if(typeof module !== 'undefined' && module.exports){
    module.exports = logic;
  }
  if(global){
    global.CRM_LOGIC = logic;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
