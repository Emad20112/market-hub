# Validation Policies

All policies execute server-side before ledger insertion. Client validation may improve usability but is never authoritative.

| Policy | Required behaviour |
|---|---|
| Document State | Source document is approved, open, and eligible for the requested posting. |
| Permission | Actor has module, entity, branch, warehouse/location, action, and approval scope. |
| Posting Period | Business date is in an open permitted period. |
| Idempotency | Same key returns same result; conflicting payload is rejected. |
| Ownership | Owner account matches document and permitted owner policy. |
| Availability | Physical issue does not exceed available less reservations. |
| Lot | Lot belongs to product/entity and is eligible for the action. |
| Quality | HOLD/REJECT lots cannot be consumed, dispatched, or transformed without an approved exception. |
| Location | Location is active, in scope, and compatible with product and owner. |
| Capacity | Receipt/transfer does not exceed capacity where enforced. |
| Mixing | Owner and lot mixing obey the destination policy. |
| Quantity | Kg is nonzero; signs, UOM conversions, and precision are valid. |
| Bags/KG | Bags are optional for bulk; if supplied, bag size is positive and discrepancy policy is explicit. |
| Balance | Transfer/external/variance/transform legs satisfy the selected transaction type policy. |
| Reversal Eligibility | Original posting exists, is not fully reversed, and downstream dependencies permit the requested reversal. |

Policies are versioned. The applied version is recorded on the transaction header for future audit and reproducibility.
