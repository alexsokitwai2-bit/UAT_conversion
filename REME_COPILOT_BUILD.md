# n8n Workflow Migration Assistant

## Project Goal

Build a modern web-based migration assistant for migrating n8n workflow JSON files from UAT to PROD.

The tool should:

- Import folders containing UAT workflow JSON files
- Automatically apply migration replacements based on rules
- Export transformed PROD-ready workflow JSON files
- Provide structured JSON Diff visualization
- Provide inline editing with validation
- Detect manual review risks automatically
- Track migration progress visually

The project should heavily reference:

- `n8n_migration_guide.md`
- `migration_mapping.json`

---

# Tech Stack

## Frontend

Recommended:

- React
- TypeScript
- Vite
- TailwindCSS
- shadcn/ui
- Monaco Editor
- Zustand or Redux
- React Query

## Backend

Recommended:

- Python FastAPI

Python responsibilities:

- Parse JSON files
- Apply automatic replacements
- Detect manual review items
- Generate diff metadata
- Validate JSON

---

# Core Features

---

# PART 1 — Input Explorer (UAT Files)

## Features

Allow user to import a folder containing UAT workflow JSON files.

Display imported files in a VSCode-style file explorer.

## UI Requirements

### File Explorer

Display:

- folder hierarchy
- workflow names
- status icons

Example:

- ✅ Auto Converted
- ⚠️ Manual Review Required
- ❌ Error

### Metadata Display

Show:

- workflow name
- total nodes
- webhook count
- credentials count
- last modified time

### Search & Filter

Support:

- filename search
- status filtering
- workflow tag filtering

---

# PART 2 — Output Explorer (PROD Files)

## Features

Display transformed/exported PROD workflow JSON files.

## IMPORTANT

Must support:

# Side-by-Side Diff View

Left:

- Original UAT JSON

Right:

- Transformed PROD JSON

## Diff Requirements

Use STRUCTURED JSON DIFF.

DO NOT use plain text diff only.

The diff engine should:

- ignore whitespace
- ignore formatting
- ignore JSON property order
- compare actual JSON structure

## Highlight Rules

### Green

Added values

### Red

Deleted values

### Yellow

Modified values

## Required Auto-Replacement Examples

### Remove

- id
- versionId
- meta

### Replace

- credential IDs
- domains
- workflow IDs
- redis IDs

---

# PART 3 — Code Viewer

## Features

When user clicks a file:

Open Monaco Editor.

Support:

- JSON syntax highlighting
- JavaScript syntax highlighting
- search
- folding
- minimap
- line numbers

## Modes

### Default

Read-only mode

### Edit Mode

Enable inline editing after clicking "Edit".

## Real-Time JSON Validation

While editing:

- validate JSON syntax
- show inline errors
- disable Save button if invalid

## Navigation

Must support jump-to-path.

Examples:

- nodes[].parameters.url
- nodes[].parameters.jsCode

When clicking review items in PART 4:

Automatically scroll to matching JSON line.

---

# PART 4 — Manual Review Checklist (Core Intelligence)

## Purpose

Automatically scan workflow JSON files and detect risky hardcoded values requiring human review.

This is the MOST IMPORTANT feature.

---

# Auto Detection Rules

## 1. API Keys / Bearer Tokens

Detect:

- Authorization
- Bearer
- x-api-key

Locations:

```json
nodes[].parameters.headerParameters.parameters[]
```

Severity:

HIGH

---

## 2. Environment Labels

Detect:

- [UAT]
- TBC

Locations:

- subject
- html
- workflow name

Severity:

MEDIUM

---

## 3. UAT Domain Warning

Detect:

```txt
cp-uat.emperorint.com
```

Severity:

HIGH

Display warning in RED.

---

## 4. Hardcoded SaaS IDs

Detect:

- Zoho Template IDs
- Pass2U Model IDs
- workflow IDs

Provide inline input fields for user to enter PROD IDs.

Severity:

HIGH

---

## 5. Phone Numbers

Detect:

- channel_number
- whitelist arrays
- hardcoded phone numbers

Severity:

MEDIUM

---

## 6. Mock Data

Detect:

- jsonOutput
- large test payloads
- fake webhook events

Severity:

LOW

---

# Global Progress Tracking

Add top progress bar.

Example:

```txt
5 / 20 files reviewed
```

Track:

- reviewed
- auto converted
- pending manual review
- errors

---

# Export Features

## Export Individual File

Download single transformed JSON.

## Export All

Download ZIP package containing:

- transformed workflows
- migration report
- manual review report

---

# Python Backend Responsibilities

## Import Parser

Parse all workflow JSON files.

## Migration Engine

Apply automatic replacements from:

```txt
migration_mapping.json
```

## Review Scanner

Generate structured review items.

## Diff Generator

Generate JSON structure diff.

## Validation

Validate:

- JSON syntax
- required fields
- n8n workflow structure

---

# Suggested Project Structure

```txt
project-root/
│
├── frontend/
│   ├── src/
│   ├── components/
│   ├── pages/
│   ├── store/
│   ├── hooks/
│   └── services/
│
├── backend/
│   ├── app/
│   ├── scanners/
│   ├── migration/
│   ├── diff/
│   ├── validators/
│   └── api/
│
├── docs/
│   ├── n8n_migration_guide.md
│   └── migration_mapping.json
│
├── REME_COPILOT_BUILD.md
└── README.md
```

---

# Recommended Libraries

## Frontend

### Monaco Editor

Use for:

- JSON editing
- syntax highlighting
- inline validation

### react-diff-viewer OR jsondiffpatch

Use structured JSON diff.

### react-arborist

Use for VSCode-like file explorer.

### zod

Use schema validation.

---

# Backend Libraries

## Python

### deepdiff

JSON structure diff

### pydantic

Validation

### fastapi

API server

### orjson

Fast JSON parsing

---

# API Design

## POST /import-folder

Import workflow files.

## POST /migrate

Apply replacements.

## GET /diff/{file}

Get structured diff.

## GET /review-items/{file}

Get manual review items.

## POST /save

Save edited workflow.

## GET /export

Export ZIP package.

---

# UX Requirements

## Theme

Modern dark-mode DevOps dashboard.

Inspired by:

- VSCode
- GitHub
- Linear
- Supabase

## Layout

Three-column layout:

| Left | Center | Right |
|---|---|---|
| Input Explorer | Diff / Editor | Review Checklist |

---

# Important Business Logic

Must follow rules defined in:

```txt
n8n_migration_guide.md
```

Especially:

## Keep

Do not modify:

- connections
- webhookId
- active
- settings

## Delete

- id
- versionId
- meta

## Replace

Based on:

```txt
migration_mapping.json
```

## Manual Review

Must NEVER auto-approve risky values.

Always require user confirmation.

---

# Future Enhancements

## AI Suggestions

Use LLM to recommend PROD replacements.

## Smart Detection

Detect risky JS code automatically.

## Git Integration

Commit migrated workflows directly.

## n8n API Integration

Deploy directly to PROD n8n instance.

---

# Expected User Flow

1. Import UAT folder
2. Scan workflows
3. Auto replace safe fields
4. Show diff
5. Review warnings
6. Inline edit
7. Validate JSON
8. Export PROD package