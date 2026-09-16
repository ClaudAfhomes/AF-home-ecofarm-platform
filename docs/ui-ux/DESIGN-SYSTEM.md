# JAD - Design System SSOT (DESIGN-SYSTEM.md)

> **Authority:** This document is the **authoritative visual and component design-system specification** for the JA&D (JAD) system. It defines colors, typography, spacing, grid, components, responsive breakpoints, accessibility rules, and component usage rules.
>
> **Precedence:** UI-UX.md (product experience and screen behavior) → **this document** (visual/component layer). BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → ARCHITECTURE.md → TECH-STACK.md remain authoritative for behavior, data, and constraints.
>
> **Status vocabulary:** **CONFIRMED** = derived from approved SSOT decisions. **PROPOSED** = recommended design-system decision not yet approved. **REQUIRES APPROVAL** = material design decision. **TBD** = unresolved; must not be invented. **REQUIRES VERIFICATION** = value/version not yet confirmed.
>
> **Critical rule:** The repository contains **no code, no design assets, and no brand references**. Therefore **no color, font, spacing, or breakpoint value in this document is approved** - every concrete value is either `TBD` or `PROPOSED / REQUIRES APPROVAL`. Do not treat any value below as an approved brand value.
>
> **Version:** Project 04 - Product / UI / UX (Baseline v1.0)

---

## 1. Colors

### 1.1 Principles

- **Color is a semantic aid, never the only signal.** State is always communicated with icon + text + color (UI-UX §12.6, §10).
- **Money and status colors are conservative.** Financial values use neutral/positive semantics that do not imply spendability of Pending funds (BI-002). Pending vs Available must remain distinguishable by label first, color second.
- **No brand color values are approved.** All values are `TBD` or `PROPOSED / REQUIRES APPROVAL`.

### 1.2 Color token model (roles - CONFIRMED need)

| Token group | Roles | Used for |
|---|---|---|
| **Brand** | `brand-primary`, `brand-secondary` | Primary actions, headers, links (across all apps) |
| **Semantic** | `success`, `warning`, `danger`, `info` | Status, alerts, feedback (UI-UX §10) |
| **Backgrounds** | `bg-canvas`, `bg-surface`, `bg-surface-raised` | App background, cards, dialogs |
| **Text** | `text-primary`, `text-secondary`, `text-muted`, `text-on-brand` | Body, secondary, captions, text on brand fills |
| **Borders** | `border-default`, `border-strong` | Dividers, input borders, table rules |
| **States** | `state-disabled`, `state-focus`, `state-hover`, `state-active`, `state-selected` | Disabled, focus ring, hover, active, selected |
| **Money/status** | `money-available`, `money-pending`, `status-*` (per BUSINESS-RULES §5 states) | Financial figures and record statuses |

### 1.3 Status color mapping (PROPOSED - REQUIRES APPROVAL)

| Record state (BUSINESS-RULES §5) | Semantic suggestion | Notes |
|---|---|---|
| Member: `Approved-Active` | success | - |
| Member: `Pending` / `Admin Review` / `Submitted` | info | In-progress, not a failure |
| Member: `Rejected` / `LOCKED` / `Cancelled` | danger | Always with reason text where applicable (BR-REG-004, BR-SAL-005) |
| Sale: `Qualifying Sale` / `Payment Verified` | success | - |
| Commission: `Available` | success | Distinct label from Pending |
| Commission: `Pending` | info / neutral | Must not read as spendable (BI-002) |
| Commission: `Reversed` | warning/danger | Refers to immutable original (BR-LED-002) |
| Withdrawal: `Reserved` | info | Reserved funds not reusable (BR-WDR-002) |
| Withdrawal: `Completed` | success | - |
| Withdrawal: `Rejected` | danger | Reason shown (BR-WDR-004) |
| Voucher redemption failure | danger | Maps to voucher error codes (API-SPECIFICATION §3) |

### 1.4 Concrete values - TBD

| Item | Status |
|---|---|
| Exact brand palette (all hex/OKLCH values) | **TBD - REQUIRES APPROVAL** (UX-DEC-001) |
| Exact semantic palette (success/warning/danger/info) | **TBD / PROPOSED - REQUIRES APPROVAL** (UX-DEC-005) |
| Contrast-verified pairs (text/bg, border/bg) | **TBD - REQUIRES APPROVAL** |

> Until approved, implementation must use the **semantic token roles** (§1.2) with placeholder values and **must not** hard-code brand colors anywhere (TECH-STACK §16 prohibition spirit: configurable parameters never in code).

### 1.5 Contrast requirements (PROPOSED - REQUIRES APPROVAL)

- Text: ≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI component boundaries (WCAG-2.1 AA).
- Money figures must meet text contrast even in muted/secondary form when they are actionable.
- Color alone never conveys state (§1.1).

---

## 2. Typography

### 2.1 Font family - TBD

- **No font family is approved.** The chosen family must support Latin + extended Latin (Philippine locale) and be licensed for web use. **TBD - REQUIRES APPROVAL** (UX-DEC-001).
- System-font fallback stack is acceptable pre-approval; no webfont may be declared as brand until approved.

### 2.2 Type scale (PROPOSED - REQUIRES APPROVAL)

| Token | Size (px) | Line height | Usage |
|---|---|---|---|
| `text-caption` | 12 | 1.4 | Captions, metadata, timestamps |
| `text-body-s` | 14 | 1.5 | Dense operational text (ledger, tables) |
| `text-body` | 16 | 1.5 | Default body (WCAG readability baseline) |
| `text-h3` | 20 | 1.3 | Card titles, section headers |
| `text-h2` | 24 | 1.25 | Screen titles |
| `text-h1` | 32 | 1.2 | App-level titles |
| `text-display` | 40+ | 1.15 | Landing/marketing only (FEAT-060 media) |

- Fluid scaling on mobile: h1/h2 scale down with viewport, body never below 14px.

### 2.3 Weights

- Regular (400) for body; Medium (500)/Semibold (600) for emphasis and labels; Bold (700) reserved for headings and key figures. **No weight below 400 or above 700 in UI** (PROPOSED).

### 2.4 Headings / body / labels / captions

- Headings: `text-h1..h3`, never used for body.
- Labels: `text-body-s` semibold with visible label pattern (UI-UX §9.2).
- Captions: `text-caption`, used for timestamps, hints, source notes (never the sole carrier of critical info - UI-UX §8.9).
- Money figures use `text-h2`/`text-h3` semibold with currency symbol and exact decimals (see §9 Money display).

---

## 3. Spacing

### 3.1 Spacing scale (PROPOSED - REQUIRES APPROVAL)

4px base scale (linear):

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-12` | 48px |
| `space-16` | 64px |

### 3.2 Component spacing

- Buttons/inputs internal padding: `space-2`-`space-3` vertical, `space-4` horizontal.
- Card padding: `space-4` (mobile) to `space-6` (desktop).
- Touch targets ≥ 44px regardless of spacing scale (UI-UX §12.8).

### 3.3 Section spacing

- Between major sections: `space-8` (mobile) to `space-12` (desktop).
- Between cards in a list: `space-3`-`space-4`.

### 3.4 Form spacing

- Between form fields: `space-4`; between field groups: `space-6`; label-to-control gap: `space-2` (UI-UX §9.1).

---

## 4. Grid

### 4.1 Container behavior (PROPOSED - REQUIRES APPROVAL)

- Content container: max-width **1200px** centered; padding `space-4` mobile / `space-6` desktop.
- Admin dense screens may use a wider container (max-width 1440px) - PROPOSED.

### 4.2 Columns

- **12-column grid** for page layouts; column counts collapse per breakpoint (DESIGN-SYSTEM §5): 12 (desktop), 8 (tablet), 4 (mobile).

### 4.3 Gutters

- Column gutters: `space-4` (mobile) to `space-6` (desktop).

### 4.4 Alignment

- Left-aligned text for LTR; amounts and currency right-aligned in tables; statuses as chips with icon+label.

### 4.5 Responsive grid behavior

- Grids reflow by breakpoint (§5). Never shrink a 4-column desktop table into a 4-column mobile grid without converting to cards (UI-UX §11).

---

## 5. Responsive Breakpoints (PROPOSED - REQUIRES APPROVAL)

| Breakpoint | Width | Layout mode |
|---|---|---|
| `sm` | < 640px | Single column; stacked cards; bottom nav (Member app); full-screen dialogs |
| `md` | 640-1023px | Tablets; drawer nav; 2-column; tables scroll or collapse to cards |
| `lg` | 1024-1279px | Desktop; persistent nav; multi-column queues/tables |
| `xl` | ≥ 1280px | Wide desktop; dense admin tables (up to 1440px container) |

- Behavior per breakpoint is defined in UI-UX §11. Values are **PROPOSED / REQUIRES APPROVAL** (UX-DEC-002); they are not confirmed by any SSOT.

---

## 6. Components

### 6.0 Component inventory & governance

- Component inventory below covers the **shared primitives** used across the three apps. Feature-specific components are composed from these primitives in each app's `features/` (FOLDER-STRUCTURE §3).
- No new UI library is introduced by this document (TECH-STACK §2 lists the PROPOSED styling approach: CSS Modules/Tailwind - PROPOSED). Components are the **design-language contract**, implemented with the approved stack.

### 6.1 Buttons

| Aspect | Spec |
|---|---|
| **Purpose** | Trigger the primary/confirming action of a screen or form (UI-UX §8.1, §9.6). |
| **Variants** | `primary` (brand fill) - main action; `secondary` (outline) - supporting action; `danger` - destructive/irreversible (UI-UX §8.5); `ghost` - tertiary/in-context; `link` - inline text action. |
| **States** | default, hover, focus-visible, active, disabled, loading (submit). Disabled buttons always explain eligibility (UI-UX §9.8). |
| **Usage rules** | One primary action per screen; primary used only for the screen's main intent; danger only for destructive actions (never for navigation); loading disables and prevents double-submit (Idempotency-Key - API-SPECIFICATION §5.3). |
| **Accessibility** | Visible focus ring; text label (never icon-only without aria-label); minimum target 44px; keyboard Enter/Space activate. |
| **Responsive** | Full-width on mobile within forms; constrained on desktop. |
| **When NOT to use** | Navigation links (use link/ghost); non-destructive actions (don't use danger); multiple competing primaries on one screen. |

### 6.2 Inputs

| Aspect | Spec |
|---|---|
| **Purpose** | Capture structured data (identity, money, dates, search). |
| **Variants** | `text`, `email`, `tel`, `number` (money as exact decimal - never float), `password`, `select`, `date`, `textarea`, `file` (ID upload FR-REG-002; media FR-ADM-002), `search`. |
| **States** | default, focus, filled, empty, error (inline - UI-UX §9.5), disabled, read-only (e.g., Country - BR-REG-010; Property Value snapshot - BI-006). |
| **Usage rules** | Visible label always (UI-UX §9.2); required vs optional marked; money inputs use exact-decimal parsing (TECH-STACK §8, BR-WAL-002); config-driven selects render from config service values (BR-REG-011, FEAT-005), never hard-coded. |
| **Accessibility** | Label → control association (`for`/`id`); error linked via `aria-describedby`; focus visible; autocomplete attributes for identity fields respecting privacy (NFR-CONF-001). |
| **Responsive** | Full-width on mobile; numeric keyboard on mobile for money/phone. |
| **When NOT to use** | Read-only data (use text); choosing one-of-many large sets (use searchable select); long free text (use textarea). |

### 6.3 Cards

| Aspect | Spec |
|---|---|
| **Purpose** | Group related information (record summaries, list items, dashboard widgets). |
| **Variants** | `record-card` (entity summary with status + primary action), `stat-card` (dashboard metric - e.g., Available/Pending), `list-card` (queue item). |
| **States** | default, hover/selectable (when clickable), disabled (ineligible action), selected. |
| **Usage rules** | One primary action per card; money cards always label status (Pending/Available - BI-002); cards link to detail screens (SCR-* in UI-UX §6.2). |
| **Accessibility** | Clickable cards are real links/buttons (not divs with onClick); focus visible. |
| **Responsive** | Become the primary list pattern on mobile (tables → cards, UI-UX §11.3). |
| **When NOT to use** | Dense tabular data needing sort (use table); a single prominent metric (use stat display). |

### 6.4 Tables

| Aspect | Spec |
|---|---|
| **Purpose** | Dense, comparable data (queues, ledger, commissions, audit). |
| **Variants** | `queue-table` (staff, sortable/filterable - UI-UX §8.2), `financial-table` (ledger - cursor pagination, API-SPECIFICATION §4), `reference-table` (catalog, members). |
| **States** | loading (skeleton rows), empty (empty state - UI-UX §10), pagination, error. |
| **Usage rules** | Column priority collapse on mobile (status, amount, date first; remainder behind expand - UI-UX §11.7); money columns right-aligned; statuses as chip+label; financial tables are **read-only** (BI-005) - no row edit affordance. |
| **Accessibility** | Proper `<th>` scope/headers; sort controls announced; row actions keyboard-accessible. |
| **Responsive** | Mobile: convert to stacked cards (never bare horizontal scroll for financial data - UI-UX §11.4). |
| **When NOT to use** | Few records or narrative content (use cards); deep hierarchical data (use genealogy/tree). |

### 6.5 Modals / Dialogs

| Aspect | Spec |
|---|---|
| **Purpose** | Focused, blocking tasks: confirmations (§8.4/§8.5), mandatory-reason forms, detail without leaving context. |
| **Variants** | `confirm-dialog` (destructive/high-impact), `form-dialog` (adjustments, reasons), `detail-dialog` (record detail). |
| **States** | open (focus trapped), loading (submit), error (inline), closed. |
| **Usage rules** | Escape closes (non-destructive); destructive dialogs require reason + typed/acknowledged confirmation (UI-UX §8.5); never stack multiple destructive dialogs; financial submissions keep Idempotency-Key semantics (API-SPECIFICATION §5.3). |
| **Accessibility** | `role="dialog"` + `aria-modal`; focus moves in/out correctly; focus returns to trigger; Escape handler; backdrop click only for non-destructive. |
| **Responsive** | Full-screen sheet on mobile; centered dialog on desktop (UI-UX §11.10). |
| **When NOT to use** | Simple inline feedback (use toast/alert); long flows (use full page). |

### 6.6 Notifications / Feedback

| Aspect | Spec |
|---|---|
| **Purpose** | Communicate operation results (success/error/warning/info) per UI-UX §10. |
| **Variants** | `toast` (transient, non-blocking success/error), `inline-alert` (form/page error summary - UI-UX §9.5), `banner` (offline, maintenance, eligibility gates). |
| **States** | visible, dismissed, error mapping to API error codes (API-SPECIFICATION §3). |
| **Usage rules** | Icon + text + color (never color-only - §1.1); success states state the resulting record/status/amount (UI-UX §8.12); errors give an actionable path; offline banner preserves form state and Idempotency-Key (UI-UX §10). |
| **Accessibility** | `aria-live` regions announce changes; toasts don't auto-dismiss critical errors; reduced-motion compliant (UI-UX §12.9). |
| **Responsive** | Toasts full-width safe-area on mobile. |
| **When NOT to use** | Forced blocking confirmations (use dialog); persistent status (use inline status chip). |

### 6.7 Icons

| Aspect | Spec |
|---|---|
| **Purpose** | Supplement labels and reinforce state/actions (never sole carriers of meaning - §1.1). |
| **Variants** | `action` (submit/save), `state` (status indicators), `navigation`, `money` (wallet), `document` (ID/media). |
| **Usage rules** | One consistent icon set across all apps; icons always have text alternatives (`aria-label`/`sr-only`); status icons paired with labels (UI-UX §12.4). |
| **Accessibility** | Decorative icons `aria-hidden`; meaningful icons labeled. |
| **Responsive** | Icon+label chips reflow; icons never scaled below 16px target (24px recommended). |
| **When NOT to use** | Decorative-only meaning; replacing readable status text. |

---

## 7. Accessibility Rules (PROPOSED - REQUIRES APPROVAL)

> No accessibility NFR exists in REQUIREMENTS.md. These rules are the **design-system accessibility contract**; they REQUIRE APPROVAL (UX-DEC-003) but are to be applied from P1 forward (UI-UX §12).

### 7.1 Color contrast
- Text ≥ 4.5:1 (normal) / ≥ 3:1 (large + UI boundaries) - WCAG-2.1 AA.
- Focus ring contrast ≥ 3:1 against adjacent background; visible on all states.
- State color changes always accompanied by icon/text (§1.1).

### 7.2 Focus states
- Visible focus indicator on all interactive elements; never removed (`outline`/custom ring token `state-focus`).
- Logical tab order matching visual order; skip-to-content.

### 7.3 Keyboard interaction
- Full keyboard operability; Enter/Space activate; Escape closes dialogs/menus; arrow keys for tabs/tree (genealogy) and menus.

### 7.4 Touch targets
- ≥ 44×44px interactive targets; adequate spacing; no hover-only actions.

### 7.5 Typography / readability
- Body ≥ 14px; line-height ≥ 1.4 (body 1.5); paragraph max-width ~65ch for reading content; no full-justification.

### 7.6 Form accessibility
- Visible + programmatic labels; errors linked to fields; required/optional marked; autofill attributes respecting privacy (NFR-DATA-001).

### 7.7 Component accessibility
- Dialog (§6.5), tables (§6.4), buttons (§6.1), inputs (§6.2), notifications (§6.6) each carry the accessibility requirements in their spec above.

### 7.8 Motion / accessibility
- Respect `prefers-reduced-motion`: disable/curtail animations; no essential information conveyed by motion; toasts remain readable at rest.

---

## 8. Component Usage Rules

These rules prevent duplication, variant drift, one-off styling, and inconsistent behavior (UI-UX §2.3).

1. **Single source for primitives.** Buttons, inputs, cards, tables, dialogs, notifications, and icons are built once in shared UI primitives (`apps/*/src/components` - FOLDER-STRUCTURE §3) and reused. No per-app copies of a shared primitive.
2. **Semantic tokens only.** Colors, spacing, type, and breakpoints use tokens (§1-§5). Hard-coding a raw value (e.g., a hex in a component) is forbidden; values are TBD until approved (UX-DEC-001/005).
3. **One variant per intent.** Use the defined variant (e.g., `primary` button) for that intent across all apps. New variants require design-system review and approval - never an ad-hoc style.
4. **No one-off styling.** If an existing pattern applies (status chip, money figure, confirm dialog), it must be reused. One-off styling is prohibited.
5. **Consistent interaction behavior.** Same interaction (confirm, reason-required, idempotent submit, pagination, error recovery) behaves identically across apps (UI-UX §8).
6. **Financial components are read-only.** No edit/delete affordances on financial records (FR-COM-012, BI-005). Money displays use the exact-decimal rules in §9.
7. **Status vocabulary is fixed.** Status chips render only confirmed states (BUSINESS-RULES §5); no invented states (FOLDER-STRUCTURE §9.8).
8. **Config-driven options.** Any configurable list (Gender - BR-REG-011; rates; redemption mode) renders from the config service (FEAT-005), never from hard-coded UI values (BR-CFG-001).
9. **Accessibility is a component requirement.** Every component ships with its §6 accessibility spec; failing accessibility is a bug, not a styling choice.
10. **Design-system governance.** Changes to this document or the component inventory REQUIRE APPROVAL; they are recorded as updates, never silently altered during implementation.

---

## 9. Money Display (CONFIRMED derivation; formatting PROPOSED)

- **Source correctness (CONFIRMED):** money values are exact decimals (`NUMERIC`), never floats (BR-WAL-002; TECH-STACK §5, §8). The UI must parse/format from decimal **strings**, never perform float arithmetic for display or totals (BR-COM-001/002).
- **Symbol:** `₱` (PHP) per BUSINESS-RULES §6 examples. Other currencies/locales **TBD** (UX-DEC-010).
- **Formatting (PROPOSED):** `₱1,234,567.89` - currency symbol, thousand separators, 2 decimal places; formatting via `Intl.NumberFormat` with a locale matching the approved deployment locale; never truncated mid-token (UI-UX §11.11).
- **Status labeling (CONFIRMED):** Pending and Available are always labeled, and Pending is never presented as spendable (BI-002). A wallet summary shows `Available Balance` and `Pending` as separate figures (FR-WAL-003/004).
- **Snapshot display (CONFIRMED):** Property Value on a sale is displayed as the frozen snapshot value (BR-PRP-004, BI-006) - the UI must not reflect later catalog price changes on historical records.

---

## 10. Traceability & Governance

- Token roles, components, and rules above reference existing SSOT IDs where applicable: `FR-*`, `BR-*`, `BI-*`, `FEAT-*`, `NFR-*`, `AC-*`, `ARCH-DEC-*`, `OD-*` (see REQUIREMENTS.md, BUSINESS-RULES.md, FEATURES.md, ARCHITECTURE.md, TECH-STACK.md, FOLDER-STRUCTURE.md, API-SPECIFICATION.md, UI-UX.md).
- **New IDs introduced by this document:** design tokens (`space-*`, `text-*`, `bg-*`, `border-*`, `state-*`, `money-*`, `status-*`) and the component names in §6. These are this document's own namespaces and are not claimed to exist elsewhere.
- Every concrete value (colors, fonts, scale, breakpoints) is `TBD` or `PROPOSED / REQUIRES APPROVAL` until an Owner approval updates this document. **Nothing here is a silent design decision.**

---