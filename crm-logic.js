(function(global){
  const HISTORY_TYPES = ["Note","Call","Offer","Follow-up","Task","Status","Assignment","Lead Assignment"];
  const sleep = (ms)=> new Promise(resolve=>setTimeout(resolve, ms));
  const GEOCODE_PROVIDERS = [
    {
      name: "OpenStreetMap",
      buildUrl: (query)=>`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&email=landcrm-demo@example.com&q=${encodeURIComponent(query)}`,
      parse: (payload)=>{
        if(Array.isArray(payload) && payload[0]){
          const lat=Number(payload[0].lat), lon=Number(payload[0].lon);
          if(Number.isFinite(lat) && Number.isFinite(lon)) return {lat, lon};
        }
        return null;
      }
    },
    {
      name: "Maps.co",
      buildUrl: (query)=>`https://geocode.maps.co/search?q=${encodeURIComponent(query)}&limit=1`,
      parse: (payload)=>{
        if(Array.isArray(payload) && payload[0]){
          const lat=Number(payload[0].lat), lon=Number(payload[0].lon);
          if(Number.isFinite(lat) && Number.isFinite(lon)) return {lat, lon};
        }
        return null;
      }
    },
    {
      name: "Open-Meteo",
      buildUrl: (query)=>`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en`,
      parse: (payload)=>{
        const result = payload?.results?.[0];
        if(result){
          const lat=Number(result.latitude), lon=Number(result.longitude);
          if(Number.isFinite(lat) && Number.isFinite(lon)) return {lat, lon};
        }
        return null;
      }
    }
  ];
  const makeId = ()=>`id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const formatDateTime = (iso)=>{ try{ return new Date(iso).toLocaleString(); }catch{ return iso || ""; } };
  const makeHistoryEntry = (type, note)=>({id:makeId(), type:type||"Note", note, timestamp:new Date().toISOString()});
  const toNumber = (x)=>{ const raw=String(x??"").replace(/[$,\s]/g,""); if(!raw) return undefined; const n=Number(raw); return Number.isFinite(n)?n:undefined; };
  function sanitizeHistory(list){
    if(!Array.isArray(list)) return [];
    return list.map(entry=>{
      if(!entry || typeof entry!=="object"){
        return makeHistoryEntry("Note", String(entry ?? ""));
      }
      return {
        id: entry.id || makeId(),
        type: entry.type || entry.kind || "Note",
        note: entry.note ?? entry.text ?? "",
        timestamp: entry.timestamp || entry.date || new Date().toISOString()
      };
    });
  }
  function cleanLeadRecord(o){
    const normalized = {
      ...o,
      "Owner Name":o["Owner Name"]||"", County:o["County"]||"", "Site Address":o["Site Address"]||"",
      "Estimated Market Value":o["Estimated Market Value"]||"", APN:o["APN"]||"",
      Latitude: toNumber(o["Latitude"]), Longitude: toNumber(o["Longitude"]),
      Acreage: o["Acreage"] || o["Lot Acres"] || o["Lot Size (acres)"] || "",
      "First Name": o["First Name"]||o["First Name (0)"]||"", "Last Name": o["Last Name"]||o["Last Name (0)"]||"",
      "Company Name": o["Company Name"]||"", "Street Address": o["Street Address"]||"", City:o["City"]||"", State:o["State"]||"", Zip:o["Zip"]||"",
      Cell:o["Cell"]||"", "Cell 2":o["Cell 2"]||"", "Cell 3":o["Cell 3"]||"", Landline:o["Landline"]||"", "Landline 2":o["Landline 2"]||"", "Landline 3":o["Landline 3"]||"", "Landline 4":o["Landline 4"]||"",
      "Email 1":o["Email 1"]||o["Email"]||"", "Email 2":o["Email 2"]||"", "Email 3":o["Email 3"]||"",
      Status: o["Status"]||"New", Type: o["Type"]||"Seller Lead",
      __notes:o.__notes||"", __lastContacted:o.__lastContacted||"", __nextAction:o.__nextAction||"", __tags:Array.isArray(o.__tags)?o.__tags:[],
      __assignedBuyerId: o.__assignedBuyerId || null
    };
    const history = sanitizeHistory(o.__history);
    return {...normalized, __history:history, __id:o.__id || makeId()};
  }
  function cleanBuyerRecord(o){
    const normalized = {
      ...o,
      __notes:o.__notes||"",
      __history:sanitizeHistory(o.__history)
    };
    return {...normalized, __id:o.__id || makeId()};
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
      Status: "Contacted",
      __notes: "Seller is open to a clean cash offer with a quick close.",
      __nextAction: "Send purchase agreement draft",
      __lastContacted: dateDaysAgo(2),
      __assignedBuyerId: null,
      __history: [
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
      Status: "New",
      __notes: "Cold mailer response asking for quick valuation.",
      __nextAction: "Research comps and call back",
      __lastContacted: dateDaysAgo(5),
      __assignedBuyerId: null,
      __history: [
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
      __history: [
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
      __history: [
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
      __history: [
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
    toNumber,
    sanitizeHistory,
    cleanLeadRecord,
    cleanBuyerRecord,
    sampleLeads,
    sampleBuyers,
    isoDaysAgo,
    dateDaysAgo
  };
  if(typeof module !== 'undefined' && module.exports){
    module.exports = logic;
  }
  if(global){
    global.CRM_LOGIC = logic;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
