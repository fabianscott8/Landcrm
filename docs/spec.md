# Project: LandCRM (Web) — Advanced Spec

Goal: Build a best-in-class, local-first CRM for land wholesaling with powerful import, dedupe, buyer matching, map tools, quick communication, and rapid follow-up workflows. Coordinates logic is already fixed; this spec focuses on advanced productivity features, better list-level visibility, and scalable UX.

---

## 1) Import System (CSV + XLSX)

### Overview
The system must import data from **multiple sources**, including `.csv` and `.xlsx` files, even if their **headers differ significantly** (e.g., “Owner Name” vs. “owner_fullname”, or “APN” vs. “Parcel Number”).  
Codex must implement a **header normalization + mapping layer** that:
- Detects and unifies equivalent fields from different file structures.  
- Remembers previous mappings for reuse.  
- Automatically organizes imported data into easy-to-read, consistent categories inside the CRM UI.

---

### 1.1 Header Mapping & Schema Intelligence  ✅ (NEW)
**Problem:** Uploaded spreadsheets from different providers have inconsistent column names and layouts.  
**Goal:** Automatically map all possible variations into a common internal schema.

#### Expected Behavior
- When importing a file, Codex should:
  1. Read the first row (headers) and infer the mapping to internal field names.
  2. If new or unknown headers appear, show a *mapping suggestion* screen where the user can confirm or reassign them.
  3. Save that mapping in `localStorage` keyed by filename pattern (e.g., `landcrm:mapping:<filename>`).
  4. On subsequent imports, apply the stored mapping automatically.

#### Example:
| Raw Header             | Mapped To (Internal Field)    |
|------------------------|-------------------------------|
| Owner Name             | Owner Name                    |
| owner_fullname         | Owner Name                    |
| site_address           | Site Address                  |
| property_address       | Site Address                  |
| apn / parcel_number    | APN                           |
| est_value / price      | Estimated Market Value         |
| acres / acreage        | Acreage                        |
| latitude / lat         | Latitude                       |
| longitude / lon        | Longitude                      |
| phone / cell / mobile  | Cell                           |
| dnc / do_not_call      | DNC                            |
| email / e_mail         | Email                          |

#### Implementation Notes
- Codex must include a normalization function:
  ```js
  const normalizeHeader = (h) => String(h||"").trim().toLowerCase().replace(/[_-]+/g, " ").trim();
