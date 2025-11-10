# Project: LandCRM (Web)

Goal: Fix geocoding false-positive (“Selected leads already have coordinates”) and implement UX upgrades that make daily wholesaling faster and clearer.

## Current Problem
- Geocode button often shows “Selected leads already have coordinates” when many selected rows **do not** have valid Latitude/Longitude.
- Root cause: loose truthiness checks on `Latitude/Longitude` treating "—", `""`, `"0"`, or strings as "has value". Also coords are often stored as strings.

## Required Fix (Must)
1) **Numeric normalization on import**
   - When parsing CSV, coerce `Latitude`/`Longitude` into numbers.
   - Create helpers:
     ```js
     const asNumber = (v) => {
       if (v === null || v === undefined) return undefined;
       const s = String(v).trim();
       if (!s || s === "—" || s.toLowerCase() === "na" || s.toLowerCase() === "null") return undefined;
       const n = Number(s);
       return Number.isFinite(n) ? n : undefined;
     };

     const hasCoords = (obj) => {
       const lat = asNumber(obj.Latitude ?? obj.lat ?? obj.latitude);
       const lon = asNumber(obj.Longitude ?? obj.lon ?? obj.longitude);
       return Number.isFinite(lat) && Number.isFinite(lon);
     };

     const needsCoords = (obj) => !hasCoords(obj);
     ```
   - Apply during CSV mapping:
     ```js
     lead.Latitude  = asNumber(row.Latitude ?? row.lat ?? row.latitude);
     lead.Longitude = asNumber(row.Longitude ?? row.lon ?? row.longitude);
     ```
   - Also strip “—” for text fields used for queries: `"Owner Name"`, `County`, `"Site Address"`.

2) **Target selection for geocoding**
   - Replace current target algorithm with:
     ```js
     const computeGeocodeTargets = (leads, selectedIds) => {
       const base = selectedIds?.size ? leads.filter(l => selectedIds.has(l.__id)) : leads;
       return base.map((l, idx) => ({ l, idx })).filter(({ l }) => needsCoords(l));
     };
     ```
   - Button logic:
     - When selection exists: label `Geocode Selected (N)` where `N = selectedMissingCount`.
     - When no selection: label `Geocode Missing (M)` where `M = total missing`.
     - Disable button only when count === 0 or a geocode job is in-progress.

3) **Geocode loop**
   - Keep Nominatim throttle to **1200ms**/request.
   - Query = `"Site Address, County"` if address exists; else fall back to APN.
   - On success, store **numbers** in `Latitude/Longitude`, update state immediately for progressive progress display.

## UX Upgrades (Should)
1) **Collapsible panels** using native `<details>`/`<summary>`:
   - Panels: “Map & Details” (open), “Contact Details”, “Communication History”, “Nearby Comps”.
2) **Multi‐phone & multi‐email rendering with DNC badges**
   - Known phone columns: `["Cell","Cell 2","Landline","Landline 2","Phone 1","Phone 2"]`
   - Known DNC columns: `["DNC","DNC 2","DNC 3","DNC 4"]`
   - For each non-empty phone, show: number + badges `[Primary]` `[DNC]` + actions (Call, Text, Copy).
3) **Communication history**
   - Per-lead `__log` array; prepend entries. Guard: `Array.isArray(lead.__log) ? lead.__log : []`.
   - Quick type dropdown: Call/Text/Email/Note + notes + “Next action date” (optional).
4) **Buyer matching (MVP)**
   - On Buyers tab, add a button “Match To Selected Lead”: show buyers whose county list contains the lead’s county AND acreage overlaps their min/max.

## Files & Places to Edit
- `app.jsx` (or `crm-logic.js` depending on current repo):
  - Add helpers `asNumber`, `hasCoords`, `needsCoords`, `computeGeocodeTargets`.
  - Apply normalization during CSV import mapping.
  - Replace geocode button state/label code with count-aware variant.
  - Replace geocode handler to use `computeGeocodeTargets`.
  - Wrap detail sections with `<details>` blocks.
  - Add `extractPhones` util:
    ```js
    const phoneFields = ["Cell","Cell 2","Landline","Landline 2","Phone 1","Phone 2"];
    const dncFields   = ["DNC","DNC 2","DNC 3","DNC 4"];
    const extractPhones = (lead) => {
      const dncs = new Set(dncFields.filter(f => String(lead[f] ?? "").trim().toLowerCase() === "yes"));
      return phoneFields
        .map(f => ({ label: f, value: String(lead[f] ?? "").trim() }))
        .filter(p => p.value)
        .map(p => ({
          ...p,
          isDNC: dncs.size > 0 && [...dncs].some(() => true), // simple flag if any DNC true (label-based matching may be dataset-specific)
        }));
    };
    ```
  - Render phones with badges + actions (tel:, sms:, copy).
- Ensure LocalStorage persistence remains unchanged.

## Acceptance Tests
- Import CSV with missing coords; geocode button shows `Geocode Missing (>0)`.
- Select a mixed set; button shows `Geocode Selected (count of missing among selection)`.
- Click geocode; progress increments, map updates, state persists on refresh.
- Phone list shows every non-empty phone; DNC shows a red badge; call/text/copy work.
- Collapsible panels reduce vertical clutter; “Map & Details” open by default.
- Buyers “Match To Selected Lead” filters correctly.

## Non-Goals (for this PR)
- No server-side persistence.
- No third-party paid geocode service.
- No re-styling beyond light tweaks (retain current Tailwind-ish utilities if present).

## Definition of Done
- All acceptance tests pass manually.
- No console errors.
- Geocode false positives eliminated (verified by CSV with blanks and “—”).
