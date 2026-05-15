# n8n Workflow Migration Guide: UAT to PROD (DevOps Optimized)

This document provides a technical mapping for migrating n8n workflows from UAT to PROD. It is structured to focus exclusively on required actions for manual migration or automated conversion scripts.

**Strategy (high level).** The FastAPI migration step applies `docs/migration_mapping.json` (domains, credentials, workflow IDs, buckets, WATI channels, emails, webhook paths) and strips server metadata. Anything that is environment-specific but embedded in expressions, prompts, or undocumented URLs must be caught in **manual review** (the checklist in the app is driven by `backend/scanners/review_scanner.py`).

---

## 0. Reference corpus: `UAT/` (24 workflow exports)

The repo’s `UAT/` directory holds **24 real n8n JSON exports** used as the ground truth for this guide, the mapping defaults, and the review scanner. Filenames and root `name` fields include CRM pipelines, Zoho/WATI/Portal integrations, schedulers, LLM nodes, and shared utilities.

| Group | Files (filename on disk) |
| :--- | :--- |
| **Core messaging & portal** | `[UAT]Central Message Pipeline.json`, `[UAT]Portal to CS Msg Pipeline.json`, `[UAT]Portal to WATI campaign call.json`, `send to closed chatroom customer.json`, `15mins follow up message.json` |
| **WATI / WhatsApp / templates** | `[UAT] Template Message Webhook.json`, `[UAT] Wati-PSQL-pipeline-v7-20250731.json`, `Zoho _ WATI Add New Profile.json`, `Zoho _ WATI Data Sync.json` |
| **Zoho CRM & data** | `[UAT] Assign CRM Tasks.json`, `[UAT] Daily CRM Task Online Scheduler.json`, `[UAT] Daily Sales Phone Online Email Scheduler.json`, `[UAT] Leads Map Contact View Automation.json`, `[UAT] Recall Zoho API Token.json`, `Lead Modules.json`, `Load Zoho Modules ID.json`, `Zoho Campaign Workflow.json`, `CRM add entitlements v3.json` |
| **Schedulers & alerts** | `[UAT]Daily no PIC Alert Email (For Internal CS).json` |
| **Email & customer comms** | `Customer Email Workflow Master.json` |
| **AI / LLM** | `Turn AI mode ON_OFF operator v2.json` |
| **Storage / misc** | `OSS Bucket POC.json`, `Pass2U Virutal Membership Card.json`, `[UAT] Error Handling.json` |

**Observed patterns across all 24 files (for prioritizing manual review):**

* **Node mix:** Very heavy use of `n8n-nodes-base.set`, `httpRequest`, `postgres`, `code`, `if`, `zohoCrm`, plus `webhook`, `executeWorkflow`, `emailSend`, `redis`, `s3`, and LangChain `lmChatOpenAi` in smaller numbers. Expect most risk in **Code**, **HTTP Request** (URLs + bodies), and **Set** nodes that build JSON strings.
* **Credentials in use:** Primarily **Postgres-UAT-n8n-admin**, **Zoho Sandbox Account**, **smtp1**, **Portal Incoming Auth**, **rds-redis-uat**, **AliYun OSS credential**, several **OpenAI / Qwen / Ollama** credentials, **wechat proxy basic auth**, and **Postgres account 2**. Every occurrence must exist in `migration_mapping.json` → `credentialMappings` or be added before PROD import.
* **Error workflow:** A single error-workflow id (`Bd7wEK5rKd6CqgGk` in the sample exports) appears on **most** workflows’ `settings.errorWorkflow`. PROD must supply the live error-handler id in the mapping.
* **Sub-workflows:** `executeWorkflow` nodes store **`parameters.workflowId.value` as a compact alphanumeric n8n id (typically 16 characters), not a UUID.** The six ids referenced across this corpus are exactly those listed under `workflowMappings.subWorkflows` in `migration_mapping.json`; any **new** id must be mapped before migration.
* **Webhooks:** `webhookPathMappings` only rewrites paths that embed **`-uat`** (e.g. `zoho-uat` → `zoho`, `whatsapp-in-uat-v2` → `whatsapp-in-v2` by stripping that segment). Other webhook paths are left unchanged on migrate; change PROD URLs only if you rename those webhooks manually.
* **Domains & storage:** `cp-uat.emperorint.com` appears inside expressions (e.g. customer-portal links in HTML). OSS-related strings may reference `eihl-crm-storage` or bucket names containing `uat`; confirm signed URLs and bucket names for PROD.

---

## 1. Keep (Do Not Modify)

* **Keep (Do Not Modify):**
    * `connections` mapping (the blueprint of how nodes connect).
    * `position` (X, Y canvas coordinates).
    * `pinData` (mock data for testing, usually empty).
    * `webhookId` (found in the `"webhookId"` field within a node; since environments are on independent servers, keeping this maintains identical URL paths for external systems).
    * `"active"` (found in the `"active"` field at the root level; maintains the workflow's current activation state).
    * `"tags"` (found in the `"tags"` field at the root level; maintains existing tags for UI filtering).
    * `"Workflow Settings"` The root level `"settings"` block 
    * **Node Disabled Status:** Nodes marked as `"disabled": true` (e.g., POC or debugging nodes) will remain disabled upon migration. Review these to decide if they should be enabled on PROD.

---

## 2. Metadata & System Footprints

### **Delete / Clear (Let PROD Generate Fresh)**
*These fields MUST be removed to allow the PROD server to assign its own unique identifiers and prevent server fingerprint pollution.*

| Item to Delete | JSON Key / Location | Reason |
| :--- | :--- | :--- |
| **Workflow ID** | Root level `id` | Prevents ID conflicts; PROD will generate a new UUID. |
| **Version ID** | Root level `versionId` | Prevents versioning conflicts between independent servers. |
| **System Metadata** | Root level `meta` block | Removes hardware fingerprints like `instanceId`. |

---

## 3. Environment Dependencies & Credentials

### **Change (Modify / Automate Replace)**
*These fields require a direct 1-to-1 replacement. Automated scripts should perform a Search & Replace on these specific paths.*

| Item to Change | JSON Key / Location | Strategy |
| :--- | :--- | :--- |
| **Workflow Name** | Root level `name` | Remove `[UAT]` prefix. |
| **Credential IDs** | `nodes[].credentials.{type}.id` AND `.name` | Replace UAT UUIDs with corresponding PROD UUIDs (e.g., Postgres, Zoho, SMTP, Redis)**AND** their corresponding names with PROD equivalents.. |
| **Error Workflow** | `settings.errorWorkflow` | Replace UAT Workflow ID with PROD Error Handler ID. |
| **Sub-workflow IDs**| `nodes[].parameters.workflowId.value` | Replace the **n8n workflow id** (compact alphanumeric id in exports, often ~16 chars — not always a UUID) with the migrated PROD id from `workflowMappings.subWorkflows`. |
| **API Domains** | `nodes[].parameters.url` | Replace `cp-uat.emperorint.com` with `cp.emperorint.com`. |
| **Redis Source** | `nodes[].credentials.redis.id` | Replace UAT Redis ID with PROD Redis ID. |

---

## 4. Business Logic & Hardcoded Values

### **Human Modification (Manual Check Before Conversion)**
*These require logic review as they contain environment-specific data embedded within strings or logic.*

#### **Static API Keys & Tokens**
* **Location**: `nodes[].parameters.headerParameters.parameters[]` where `name` is `Authorization`, `x-api-key`, etc.
* **JSON Example** (from `[UAT] Template Message Webhook.json`):
```json
"headerParameters": {
  "parameters": [
    {
      "name": "Authorization",
      "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  ]
}
```
* **Action**: Replace the hardcoded long string (JWT/API Key) with a valid token or key for the production environment.

#### **External SaaS Resource IDs**
* **Location**: `nodes[].parameters.url` OR `nodes[].parameters.jsonBody` OR `nodes[].parameters.jsonOutput`.
* **JSON Example** (from `Customer Email Workflow Master.json`):
```json
"url": "={{ $('Get API endpoints').item.json.zoho_api_domain }}/crm/v2/settings/email_templates/6638789000004030005"
```
* **Action**: Identify and replace internal SaaS IDs (e.g., Zoho Template IDs, Zoho Benefit IDs, Pass2U Model IDs) with production equivalents.

#### **Phone Whitelists & Logic Arrays**
* **Location**: `nodes[].parameters.conditions.conditions[].leftValue` or `rightValue`.
* **JSON Example** (from `[UAT] Wati-PSQL-pipeline-v7-20250731.json`):
```json
"leftValue": "={{["85298743343","85298704629"]}}"
```
* **Action**: Review and update hardcoded phone number arrays used for whitelisting or filtering to match production requirements.

#### **Phone & Channel numbers**
* **Location**: `nodes[].parameters.jsonBody` (e.g., `"channel_number"`) or `nodes[].parameters.jsonOutput` arrays.
* **JSON Example** (from `[UAT] Template Message Webhook.json`):
```json
"jsonBody": "{ ... "channel_number": "85290556233" }"
```
* **Action**: Update `channel_number` and static phone number assignments to the official production WhatsApp/WATI lines.

#### **Email Attributes & Content**
* **Location**: `nodes[].parameters.subject`, `nodes[].parameters.fromEmail`, `nodes[].parameters.toEmail`, `nodes[].parameters.html`.
* **JSON Example** (from `Customer Email Workflow Master.json`):
```json
"subject": "=[EIHL-CRM-UAT] Happy Birthday!",
"html": "Format TBC..."
```
* **Action**: Remove [UAT] from subjects, update recipient lists (toEmail), change the sender address (fromEmail) to the official PROD email, and ensure the html body does not contain "TBC" or test content.

#### **Search Criteria / Query Params**
* **Location**: `nodes[].parameters.url` (query strings) OR `nodes[].parameters.queryParameters`.
* **JSON Example** (from `Zoho Campaign Workflow.json`):
```json
"url": "={{ ... }}/search?criteria=(Campaign_Name:equals:20251101 HK Fashion Show)"
```
* **Action**: Replace hardcoded test campaign names or phone numbers in search criteria with dynamic variables or PROD values.

#### **Mock / Simulated Test Data**
* **Location**: `nodes[].parameters.jsonOutput`.
* **JSON Example** (from `[UAT] Template Message Webhook.json`):
```json
"jsonOutput": "{"body": {"eventType": "templateMessageSent_v2", "waId": "85292157403"...}}"
```
* **Action**: Remove or deactivate nodes containing large simulated/mock JSON data used for manual testing.

#### **Cloud Storage Buckets**
* **Location**: `nodes[].parameters.bucketName` OR string URLs in `nodes[].parameters.jsonOutput`.
* **JSON Example** (from `[UAT] Wati-PSQL-pipeline-v7-20250731.json`):
```json
"jsonOutput": "{ "image_URL": "https://eihl-crm-storage-uat.oss..." }"
```
* **Action**: Rename UAT bucket identifiers (e.g., `eihl-crm-storage-uat`) to official production names.

#### **Webhook Paths**
* **Location**: `nodes[].parameters.path`.
* **JSON Example** (from `[UAT] Template Message Webhook.json`):
```json
"parameters": { "path": "zoho-uat" }
```
* **Action**: Remove environment-specific suffixes (e.g., change `zoho-uat` to `zoho`).

#### **Code Node Logic**
* **Location**: `nodes[].parameters.jsCode`.
* **JSON Example** (from `CRM add entitlements v3.json`):
```javascript
const isPROD = contact.customParams.some(param => param.name === "env" && param.value === "prod");
```
* **Action**: Update environment logic flags and internal URLs within JavaScript code to match the production environment.

---

## 5. Migration Checklist: Data to Collect from PROD
Before starting the conversion, ensure you have the following information from the PROD environment (aligned with the **24-file UAT corpus** above):

* [ ] **Credential ids & names** for every integration seen in UAT: Postgres (admin + secondary), Zoho OAuth, SMTP, Portal basic auth, Redis, Aliyun OSS, WeChat proxy basic auth, and each LLM/OpenAI/Ollama credential used by LangChain or HTTP nodes.
* [ ] **Central error workflow id** (replaces `settings.errorWorkflow` where it still points at the UAT error handler).
* [ ] **Sub-workflow ids** for: Central Message Pipeline, Turn AI mode operator, Zoho Campaign workflow, Lead Modules, OSS Bucket POC, Zoho/WATI data sync — plus any new callee workflows you add later.
* [ ] **Official portal / API base URL** (`cp.emperorint.com` and related hosts) so strings and HTML templates that still mention `cp-uat` can be corrected in manual review if not covered by mapping.
* [ ] **PROD SaaS resource ids** embedded in URLs or bodies (Zoho template / module ids, Pass2U model ids, campaign criteria strings, etc.).
* [ ] **PROD bucket names and OSS signing** (replace UAT bucket names and re-test any node that emits pre-signed URLs).
* [ ] **PROD WATI / WhatsApp channel numbers** and any HK phone whitelists in IF conditions or JSON bodies.
* [ ] **PROD recipient and sender email** addresses (replace UAT-tagged subjects and internal-only distribution lists).

## 6. Manual review priorities (scanner + human)

After **Migrate** runs, use the in-app checklist and side-by-side diff in this order:

1. **High — secrets & env leakage:** HTTP header parameters that look like Bearer tokens or API keys; any remaining `cp-uat.emperorint.com` in URLs, bodies, **or HTTP query parameter values**; unknown `workflowId.value` not present in `workflowMappings`; SaaS-looking numeric ids in URLs **or query strings** when still pointed at UAT resources.
2. **Medium — labelling & routing:** `[UAT]` in workflow name or email fields; bucket names containing `uat`; HK phone numbers in conditions, `jsonBody`, **or query parameters**; **search / criteria style** `parameters.queryParameters` (Zoho COQL, filters, test campaign names); webhook paths if PROD must differ from UAT (only `-uat` path segments are rewritten automatically).
3. **Low — test payloads:** Oversized `jsonOutput` used as mock webhook payloads; sticky notes; disabled nodes you may want enabled on PROD.

Re-scan after editing PROD JSON and before activating workflows on the PROD n8n instance.
