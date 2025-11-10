# Project: LandCRM (Web) — Advanced Spec

Goal: Build a best-in-class, local-first CRM for land wholesaling with powerful import, dedupe, buyer matching, map tools, quick communication, and rapid follow-up workflows. Coordinates logic is already fixed; this spec focuses on advanced productivity features, better list-level visibility (contacted indicators), and scalable UX.

---

## 0) System Principles

- **Local-first**: Persist to localStorage; provide full data export/import (JSON/CSV).
- **Fast**: 10k rows must remain responsive (virtualized lists or chunked rendering if needed).
- **Keyboard-friendly**: Common actions via hotkeys.
- **Non-destructive**: Undo last destructive action (delete, merge) during session.
- **Accessible**: High-contrast theme; focus states; readable at 12–14pt base.

---

## 1) Import System (CSV + XLSX)

- Accept `.csv` and `.xlsx` via SheetJS (CDN script already included).
- Header normalization (case-insensitive; spaces/underscores tolerated).
- Append (de-dup) rules (existing):  
  - Key1: `APN + County`  
  - Key2: `Owner Name + Site Address + County`  
  - Key3: `Site Address + County`
- Merge fields only when incoming values are non-empty; never overwrite good numbers with blanks.
- **Mapping Memory**: Remember last header mapping by filename pattern in `localStorage` (`landcrm:import:mapping:<pattern>`).
- **Preview Modal** (non-blocking): show counts for New / Merged / Skipped / Errors; let user download `import_log.csv`.

**Acceptance**
- Uploads for both CSV/XLSX succeed; mapping remembered; preview shows buckets with counts; after confirm, dataset updates with no dupes.

---

## 2) Lead & Buyer Data Model (normalized + computed)

Each **Lead** must support:

```ts
Lead {
  __id: string        // UI id
  __key: string       // dedupe key
  Owner Name: string
  County: string
  Site Address: string
  APN?: string
  Estimated Market Value?: number
  Acreage?: number
  Latitude?: number
  Longitude?: number

  // Contacts
  Phone 1?: string; Phone 2?: string; Cell?: string; Cell 2?: string
  Landline?: string; Landline 2?: string
  Email?: string; Email 2?: string
  DNC?: string; DNC 2?: string; DNC 3?: string; DNC 4?: string

  // Workflow
  __status?: "New" | "Skip" | "Researching" | "Contact Attempted" | "Connected" | "Negotiating" | "Under Contract" | "Closed Won" | "Closed Lost"
  __priority?: "Low" | "Med" | "High" | "Hot"
  __tags?: string[]             // user tags (e.g., "tax delinquent", "corner lot")
  __score?: number              // lead score (see §5)
  __lastContacted?: string      // ISO date
  __nextAction?: string         // free text (e.g., "Call Tue 2pm")
  __nextActionAt?: string       // ISO datetime for reminders
  __ownerUser?: string          // (future multi-user; still local)

  // Logs & notes
  __log: Array<{ ts: string, type: "Call"|"Text"|"Email"|"Note"|"VM", outcome?: "No Answer"|"Left VM"|"Bad Number"|"Spoke"|"Not Interested"|"Follow-up", notes?: string }>
  __notes?: string

  // Extra columns (not mapped)
  __extra?: Record<string, any>
}
