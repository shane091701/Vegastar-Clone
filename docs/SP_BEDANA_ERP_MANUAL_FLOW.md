# SP Bedana ERP — Manual Testing Guide: MRF → Delivery Flow

This describes how the system actually works end-to-end so you can test it
manually (e.g. with Postman/Insomnia/curl) before or alongside automated
Cucumber tests.

**Important architecture note:** This is not a page-based Rails app. There are
no server-rendered forms/views for this flow — every step is a `POST` to a
JSON RPC-style endpoint under `/api/...`, with the request body shaped as:

```json
{ "args": ["positional", "arguments", "here"] }
```

and the response is bare JSON. If you're testing manually, use Postman/curl
against these endpoints directly (or through whatever separate front-end SPA
consumes this API, if you have it running).

There are also no `Mrf`, `PurchaseOrder`, or `Approval` model classes — the
data is flat and denormalized:
- `MrfItem` — one row per requested line item, tied to other rows only by a
  shared `mrf_code` string.
- `PurchaseOrderItem` — one row per ordered line item, tied together by a
  shared `po_code`/`po_number` string.
- `Delivery` — one row per received line item, linked by `po_number`.

Status fields are plain strings (not Rails enums) — case matters in places,
so match values exactly as shown below.

---

## Step 0 — Log in

`POST /api/verifyLogin` — `Api::AuthController`

You need a `User` with `role` in `approver`/`admin` to approve MRFs, and any
active user to submit requests. Check `app/controllers/api/auth_controller.rb`
for the exact login args and how the returned token/session is used on
subsequent calls.

---

## Step 1 — Submit an MRF (Material Request Form)

`POST /api/submitRequest` → `Api::MrfController#submit_request`

What happens:
- A new `mrf_code` is generated (e.g. `MRF-PRJ1-1`) via `SequencedCode`.
- One `MrfItem` row is created per line item you submit, with:
  - `status = "Pending"`
  - `request_amount` = quantity requested
  - `requester_email`, `project_code`, `phase`, `item`, `unit`, `remarks`, etc.
- A matching `OutLedgerEntry` (movement type `"Material Request"`) is created —
  this reserves budget against the project's BOQ (Bill of Quantities).
- Approvers/admins get an email (`MrfMailer.new_request`).

**Manual test:** submit a request, then confirm in the DB / via
`getApprovalQueueData` that a `MrfItem` exists with `status: "Pending"`.

> Note: `submitReturnableRequest` is a parallel, separate flow for
> tools/equipment (creates `ReturnableItem`, `status: "Pending"`) — it skips
> the ledger/BOQ budget logic entirely and does **not** continue into
> POs/Delivery. Don't confuse it with the main MRF flow.

---

## Step 2 — Approve or Reject the MRF

`POST /api/getApprovalQueueData` — lists all `Pending` `MrfItem`s grouped by
`mrf_code`, with budget-remaining info (`BoqItem` vs `OutLedgerEntry`).

`POST /api/processApproval` → `Api::MrfController#process_approval`

Two outcomes:
- **Approve**: `MrfItem.status → "Approved"`, `approved_qty` set,
  `preferred_brands` set, ledger entry updated to match approved qty. The
  system also auto-generates an **RFQ PDF** (Request for Quotation) and
  stamps `pdf_url` onto the `MrfItem` rows — this unlocks canvassing.
- **Reject**: `MrfItem.status → "Rejected"`, ledger entry removed (budget
  returned).

Either way, the requester gets an email (`MrfMailer.approval_result`).

**Manual test:** approve an item, confirm `status == "Approved"` and that
`pdf_url` is now populated; try rejecting a different item and confirm
`status == "Rejected"`.

### Optional: RFQ management
- `POST /api/getRFQsList` — lists approved items with a generated RFQ PDF
  (used for canvassing suppliers).
- `POST /api/voidAlphaRFQ` → sets `status → "Voided"` on all approved rows for
  an `mrf_code`. **Blocked if a PO already exists** (`po_code` present) — you
  must void the PO first.

---

## Step 3 — Canvassing (collect supplier quotes)

Controller: `Api::CanvasController`

- `POST /api/getPendingQuoteMRFs` — items that are `Approved` and don't have a
  `po_code` yet (i.e. up for canvassing).
- `POST /api/saveSupplierQuotes` — records `SupplierQuote` rows (one per
  item/supplier combo) + `PaymentTerm` rows. No status field here — this is
  just quote data collection.
- `POST /api/getCanvasPivotData` — builds a side-by-side comparison of
  supplier quotes vs. BOQ budget vs. amounts already delivered/spent, to help
  the approver pick a winner.

**Manual test:** submit 2+ competing quotes for the same approved MRF item
from different suppliers, then confirm the pivot data returns all of them
side-by-side.

---

## Step 4 — Award the canvas (create the Purchase Order)

`POST /api/awardCanvasWinners` → delegates to `CanvasAwarder.call`

What happens:
- Winning items are grouped by supplier.
- One `po_code` is generated **per supplier** (e.g. `PO-PRJ1-1-A2B9`).
- A `PurchaseOrderItem` row is created per item, `status = "Draft"`.
- The corresponding `MrfItem` rows are updated: `win_loss = "Win"`,
  `po_code = <the new po_code>`, `request_amount` updated to the awarded
  subtotal.
- A PO PDF is generated and `pdf_url` stamped onto the `MrfItem`s.

**Manual test:** award a canvassed item to a supplier, confirm a new
`PurchaseOrderItem` exists with `status: "Draft"` and the `MrfItem.win_loss`
flips to `"Win"`.

---

## Step 5 — Dispatch (send) the Purchase Order

Controller: `Api::PurchaseOrdersController`

- `POST /api/getPurchaseOrders` — lists POs grouped by `po_code`, with a
  **computed** (not stored) `status` from `PoStatusCalculator`, plus
  `paymentStatus` (`Not Yet Paid` / `Partially Paid` / `Fully Paid`) derived
  from `IssuePayment` records.
- `POST /api/dispatchAlphaPO` → only allowed when current status is
  `"Draft"`. Requires the supplier to have an email on file
  (`Api::SuppliersController#saveSupplierData` / `getSuppliersList`).
  Generates a signed PO PDF using the dispatching user's stored signature,
  emails the supplier (`PoMailer.dispatch`), and sets
  `PurchaseOrderItem.status → "Sent"`.
- `POST /api/voidAlphaPO` — blocked once status is `"Partial delivery"`,
  `"Received all"`, or already `"Voided"`. On void: sets
  `status → "Voided"` + `void_reason`; clears `win_loss`/`po_code`/`pdf_url`
  on the related `MrfItem`s, returning them to the canvassing pool.

**Manual test:** dispatch a Draft PO, confirm `status == "Sent"` via
`getPurchaseOrders` and that the supplier received an email.

---

## Step 6 — Receiving / Delivery

Controller: `Api::ReceivingController`

- `POST /api/getReceivingData` — for each `PurchaseOrderItem`, computes
  `remaining = ordered_quantity - sum(Delivery.quantity for that po+item)`.
  Only POs with `remaining > 0` are shown (grouped by project) — this is your
  "what's still owed to us" list.
- `POST /api/submitReceivingToBackend` → creates one `Delivery` row per
  delivered item: `received_date`, `delivery_doc_number`, `receiver_email`,
  `item_name`, `quantity`, `po_number`, `remarks`. Optional file attachments
  (`receipt`, `photos`) can be attached to the batch.
- `POST /api/getReceivingHistoryData` — flat, newest-first list of every
  `Delivery` ever recorded.

**Deriving PO status after receiving** (via `PoStatusCalculator`, not stored
on any record):
| Condition | Computed `status` |
|---|---|
| No deliveries yet | `"Sent"` |
| `0 < total_received < total_ordered` | `"Partial delivery"` |
| `total_received >= total_ordered` | `"Received all"` |

**Manual test:**
1. Call `getReceivingData` — confirm the dispatched PO/item appears with the
   full ordered quantity as `remaining`.
2. Submit a partial delivery (less than ordered qty) via
   `submitReceivingToBackend`.
3. Call `getPurchaseOrders` again — confirm computed `status ==
   "Partial delivery"` and `getReceivingData` shows reduced `remaining`.
4. Submit the rest of the quantity.
5. Confirm `status == "Received all"` and the PO drops off
   `getReceivingData` (remaining == 0).
6. Confirm `getReceivingHistoryData` lists both delivery records.

---

## Full happy-path status summary

```
MrfItem.status:            Pending → Approved
                                        │
                                (RFQ PDF generated)
                                        │
                              SupplierQuote(s) collected
                                        │
                              CanvasAwarder awards winner
                                        │
MrfItem.win_loss:                    Win, po_code = X
PurchaseOrderItem.status:           Draft
                                        │
                              dispatchAlphaPO
                                        │
PurchaseOrderItem.status:           Sent
                                        │
                              Delivery rows created (receiving)
                                        │
Computed PO status:      Sent → Partial delivery → Received all
```

**Off-path branches to also test manually:**
- Reject at approval: `MrfItem.status → Rejected` (flow stops here).
- Void RFQ before a PO exists: `MrfItem.status → Voided`.
- Void PO before any delivery: `PurchaseOrderItem.status → Voided`, `MrfItem`
  returns to canvassing pool (`win_loss`/`po_code`/`pdf_url` cleared).
- Void PO attempt after partial/full delivery: should be **rejected** by the
  API (business rule — can't void once real-world goods have arrived).
- Returnable items (tools/equipment): separate `ReturnableItem` flow,
  `Pending → Approved/Rejected`, never touches POs or Delivery.

---

See `CUCUMBER_SETUP.md` for how to turn these manual steps into automated
Gherkin scenarios.
