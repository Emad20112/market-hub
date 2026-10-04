# Unified Printing System
## Architecture
The printing platform is layered over the existing `src/lib/templates` engine. `src/lib/printing` provides the shared contracts and orchestration:

- `document-types.ts`: searchable document type registry and labels.
- `company-profile.ts`: canonical Company Profile resolver backed by `company_settings` and a small cache.
- `paper.ts`: A4/A5 and 58/80mm profiles, margins and orientation.
- `themes.ts`: `standard`, `luxury`, and `formal` visual themes.
- `footer.ts`: Universal footer markup and print-safe CSS.
- `settings.ts`: global defaults, preview, method, behavior, copies, and per-document overrides.
- `formal.ts`: the new official/corporate layout.
- `engine.ts`: request normalization, profile resolution, rendering and adapter dispatch.

The existing template registry remains the compatibility layer for callers using `renderInvoiceHTML` and `printDocument`.

## Data flow
```text
Document mapper -> UnifiedDocumentData + DocumentType
                 -> Company Profile
                 -> Global settings + document override
                 -> Template/theme + paper/orientation
                 -> HTML document
                 -> Universal Preview or Browser/Thermal adapter
```

The engine never fetches document data again during rendering. The caller supplies the already-built document snapshot. Company Profile is cached and can be loaded once from `company_settings`.

## Templates and themes
`standard` is the unified modern business layout and `elegant` remains a backward-compatible luxury theme. `formal` is registered as a reusable official layout and shares the same `UnifiedDocumentData`, labels, visibility options, and footer contract. Legacy names are normalized instead of being treated as separate business logic.

A new template should implement `TemplateRenderer`, register `PrintTemplateMeta` in `src/lib/templates/index.ts`, and declare supported paper profiles/document types. It must not read Supabase or calculate business totals.

## Print profiles
A profile combines document type, template/theme, paper, orientation, method, behavior and copies. `settings.ts` stores global defaults plus `overrides[documentType]`. Legacy `vortex_print_settings`, `pos_default_template` and `pos_print_mode` remain supported by the existing store and are normalized by the new settings layer.

## Thermal support
`paper.ts` centralizes 58mm and 80mm thermal formats. The current milling renderer still remains a compatibility path, but its paper choices map conceptually to the same platform profiles. `PrintMethod = thermal` is an adapter boundary for a future local/QZ/native printer; browser printing remains the supported web implementation.

## Preview
`renderUnifiedDocument` is the single HTML source for preview and browser printing. It removes `body onload` side effects from legacy renderers before returning HTML, so a preview cannot print accidentally. The existing `PrintPreviewModal` can consume this function without a second data fetch.

## Company Profile and Footer
The `company_settings` row is the source of truth. `loadCompanyProfile()` reads it and caches the result. Footer contact defaults to the requested current value `784795104`, while `footer_contact` and `footer_text` are editable Company Profile fields when those columns exist. No printed template should contain a tenant/company name fallback.

## Document types
The registry includes sales, purchases, returns, payment receipts, statements, inventory transfers/movements, reports, mill documents, daily tickets and audit records. Existing specialized statement/report/mill mappers can progressively emit `UnifiedDocumentData` without changing their business calculations.

## Adding a document type
1. Add the type and labels to `document-types.ts`.
2. Add a mapper from the existing page result to `UnifiedDocumentData`.
3. Declare a default override if needed.
4. Call `renderUnifiedDocument`/the shared preview and adapter instead of adding page-local HTML.
5. Add Arabic/English labels and tests.

## Adding a renderer/adapter
A renderer produces a complete print-safe HTML document and must use the company/footer contracts. An adapter consumes rendered output and owns the side effect. Browser printing uses the shared iframe plumbing; PDF can continue using the existing jsPDF implementation where it is materially better; thermal/native integrations should implement the same method boundary without changing pages.

## RTL/LTR and pagination
All shared layouts set `dir`, isolate numeric values with `dir=ltr`, repeat table headers through print CSS, avoid breaking rows, and keep the footer in normal flow with `margin-top:auto`/`break-inside:avoid` so it cannot cover content.
