# Personal Domains Expansion Plan

## Goal

Add five connected personal domains to Focus:

1. Nutrition and diet
2. Body and recovery
3. Exercise
4. Personal finance
5. Learning

The result must remain one local-first personal operating system. Each domain
owns canonical records, contributes concise summaries to Today and Timeline,
is globally searchable, and can accept reviewed AI proposals. The application
must not become a wall of independent dashboards.

## Product Review

### Blocking foundation corrections

The review found two existing behaviors that must be corrected before expansion:

- Optional health observations currently normalize missing values into recorded
  zeros or midpoint scores. New normalization must preserve `null` as unknown,
  and legacy defaults must not be counted as observations.
- Whole-document browser mirroring and optional sync can include sensitive
  health and finance records. Add explicit domain privacy settings and a
  projection that excludes disabled sensitive domains before data reaches
  browser fallback storage, folder sync, MySQL sync, search recents, or AI
  context.

These corrections precede domain analytics and are release requirements.

### Navigation

- Keep Today, Calendar, Tasks, Focus, Health, and Progress as the six visible
  primary destinations.
- Expand Health into four internal views: Check-in, Recovery, Nutrition, and
  Exercise.
- Expand Progress into three internal views: Habits, Goals, and Learning.
- Add only Finance as a new route under the existing More group.
- Keep Performance, Timeline, Work, and Insights under More.
- Every new domain remains one click away, searchable, and keyboard reachable.

### Scope controls

- Nutrition tracks intake and goals; it does not diagnose deficiencies.
- Recovery records observations; it does not score medical risk.
- Exercise tracks completed training and personal records; it does not prescribe
  rehabilitation or override professional advice.
- Finance is a personal cash-flow and goals view, not double-entry accounting,
  tax preparation, investment execution, or regulated financial advice.
- Learning tracks resources, sessions, notes, and review prompts; it is not a
  full learning-management system.

### Shared interaction contract

- One dominant action per page.
- Common capture takes the minimum useful fields and progressively discloses
  optional detail.
- Destructive actions remain secondary and explicit.
- AI never writes domain data directly. It returns validated proposals and the
  user approves them through the existing proposal flow.
- Imported or estimated values retain source and confidence metadata.
- Today shows only actionable or goal-relevant summaries, never every metric.

## Canonical Data Model

All records are normalized defensively, preserve unknown forward-compatible
fields, receive stable local IDs, and are included in backup/sync documents.

### Nutrition

`nutritionEntries`

```json
{
  "id": "nutrition-...",
  "date": "2026-06-08",
  "mealType": "lunch",
  "name": "Chicken curry with rice",
  "servingAmount": 1,
  "servingUnit": "meal",
  "calories": 720,
  "proteinGrams": 42,
  "carbsGrams": 78,
  "fatGrams": 24,
  "fiberGrams": 7,
  "sourceType": "usda",
  "sourceId": "123",
  "sourceLabel": "USDA FoodData Central",
  "sourceUrl": "https://fdc.nal.usda.gov/...",
  "confidence": "verified",
  "assumptions": "",
  "notes": "",
  "createdAt": 0
}
```

`savedMeals`

- Same nutrient and serving fields as a nutrition entry.
- Stores reusable meals without a date.
- Logging a saved meal creates a new independent nutrition entry.

`settings.nutritionGoals`

- `calories`
- `proteinGrams`
- `carbsGrams`
- `fatGrams`
- `fiberGrams`
- `waterMl`

Goals are optional and user-entered. Focus does not calculate calorie deficits,
target body weight, or "optimal" macro plans.

### Body and recovery

Extend daily `healthEntries` so sleep, mood, energy, hydration, movement, body,
and recovery remain one daily observation:

- `weightKg`
- `bodyFatPercent`
- `waistCm`
- `restingHeartRate`
- `sleepQuality` from 1 to 5
- `stress` from 1 to 5
- `soreness` from 1 to 5
- `recoveryNote`
- `symptoms`

`wellnessRoutines`

- `id`, `name`, `kind` (`medication` or `supplement`)
- `dose`, `scheduleTime`, `instructions`, `active`, `createdAt`
- The app stores reminders and completion only; it does not recommend dosage.

`wellnessLogs`

- `id`, `routineId`, `date`, `taken`, `takenAt`, `note`

Recovery is a plain-language summary based on user-recorded sleep, energy,
stress, and soreness. It must show evidence and must not claim diagnosis.
Every optional observation is nullable. Unknown values never contribute a zero
or midpoint score to summaries.

### Exercise

`workoutSessions`

```json
{
  "id": "workout-...",
  "date": "2026-06-08",
  "name": "Upper body",
  "type": "strength",
  "durationMinutes": 50,
  "distanceKm": 0,
  "caloriesBurned": 0,
  "effort": 4,
  "exercises": [
    {
      "name": "Bench press",
      "sets": 3,
      "reps": 8,
      "weightKg": 70,
      "distanceKm": 0,
      "durationMinutes": 0
    }
  ],
  "notes": "",
  "createdAt": 0
}
```

`trainingPlans`

- `id`, `name`, `goal`, `weeklyTarget`, `active`, `createdAt`
- V1 stores intent and weekly frequency, not a generated multi-week medical or
  rehabilitation prescription.

Personal records are derived from canonical workout sessions. Weekly load is
duration and effort, not a medical readiness score.

### Finance

`financeEntries`

- `id`, `date`, `label`, `amountMinor`, `kind` (`expense`, `income`, `refund`)
- `currency`, `category`, `account`, `notes`
- `excluded`, `createdAt`, `updatedAt`, `deletedAt`
- Amounts are positive integer minor units; kind supplies their meaning.

`financeBudgets`

- `id`, `category`, `monthlyLimitMinor`, `active`, `createdAt`, `updatedAt`

`financeRecurring`

- `id`, `name`, `amountMinor`, `kind`, `currency`, `category`, `frequency`
- `nextDueDate`, `active`, `createdAt`

`financeGoals`

- `id`, `name`, `kind` (`saving` or `debt`)
- `targetAmountMinor`, `currentAmountMinor`, `targetDate`, `active`, `createdAt`

Finance calculations are monthly income, spending minus refunds, balance,
category budget usage, recurring items due soon, and progress toward
savings/debt goals.
Currency is a user setting; V1 stores exact integer minor units and does not
perform exchange-rate conversion. Focus does not provide investment, credit,
tax, or debt-repayment advice.

### Learning

`learningItems`

- `id`, `title`, `kind` (`book`, `course`, `skill`, `article`, `other`)
- `status` (`planned`, `active`, `completed`, `paused`)
- `progress`, `target`, `unit`, `source`, `notes`, `createdAt`, `updatedAt`

`learningLogs`

- `id`, `date`, `learningItemId`, `title`, `durationMinutes`
- `note`, `createdAt`, `updatedAt`, `deletedAt`

`learningNotes`

- `id`, `learningItemId`, `title`, `body`
- `createdAt`, `reviewedAt`, `nextReviewDate`, `reviewIntervalDays`

Completing a review advances a bounded interval. AI quiz generation is exposed
as a prompt from selected notes; generated questions remain transient until the
user explicitly saves them.

## Nutrition Lookup

Add a narrow main-process service:

- Search USDA FoodData Central when an API key is available. The environment
  variable is read only in the main process and never exposed to the renderer.
- Use the documented USDA demo key only as a low-rate development fallback.
- Search Open Food Facts for packaged products and barcode-oriented matches.
- Normalize providers into a common result with serving, macros, source URL,
  source ID, and confidence.
- Apply timeouts, input limits, result limits, and user-safe errors.
- Cache recent successful lookups in memory to reduce rate pressure.
- Never silently convert a database value to a different portion.

The renderer receives only normalized nutrition results. Selecting one opens a
reviewable meal entry. A manual entry is always available when offline.

## AI Contract

Add these validated assistant actions:

- `log_meal`
- `log_body_recovery`
- `log_workout`
- `create_finance_transaction`
- `log_study_session`

### Meal behavior

Before a nutrition-related assistant request is sent, Focus may query the
nutrition service and append up to five normalized matches to the model context.
The model must:

- use a supplied verified match when it clearly fits;
- preserve its source metadata;
- label unmatched values as `ai_estimate`;
- include portion assumptions;
- never use `verified` without a supplied database match.

The proposal preview shows calories, macros, portion, source, confidence, and
assumptions. Approval converts the proposal into canonical reducer actions.

### Other domain behavior

- Recovery proposals record observations only.
- Workout proposals record what the user says they completed, not invented
  exercise details.
- Finance proposals require explicit amount, transaction type, date, and
  currency context; ambiguous signs or currencies produce no action.
- Study proposals require a subject/title and duration.

## Page Design

### Nutrition

- Header: today's calorie and protein status.
- Primary capture: food/meal search plus manual add.
- Daily macro strip: calories, protein, carbohydrates, fat, fibre.
- Meal list grouped by breakfast, lunch, dinner, snack.
- Goals and saved meals are progressively disclosed.
- Every estimated item has a visible estimate label.

### Body & Recovery

- Primary daily check-in: sleep, energy, mood.
- Recovery fields: sleep quality, stress, soreness.
- Optional body measurements and symptoms.
- Medication/supplement routines in a disclosure panel.
- Seven-day summary remains compact and evidence-based.

### Exercise

- Header: sessions and minutes this week.
- Primary action: log workout.
- Current-week sessions in a readable list.
- Personal records and active plan in secondary summaries.
- Recovery context links to Health without issuing medical warnings.

### Finance

- Header: current-month balance.
- Primary action: add transaction.
- Income, spending, and balance strip.
- Recent transactions first.
- Budgets, subscriptions/bills, savings, and debt goals use tabs or disclosures.
- Amounts are formatted using the configured currency.

### Learning

- Header: study minutes this week.
- Primary action: log study.
- Active learning items first.
- Recent sessions and due reviews.
- Notes and completed material remain secondary.

## Cross-Domain Integration

### Today

Keep the current primary hierarchy unchanged. Add a compact **Personal snapshot**
inside the existing More Today disclosure:

- Nutrition: calories/protein progress
- Recovery: most recent evidence-based status
- Exercise: latest session or weekly count
- Finance: month spending against budget
- Learning: study minutes and next review

### Timeline

Derived entries:

- meal logged
- recovery/body check-in saved
- workout completed
- finance transaction recorded
- study session completed

Sensitive details remain concise. Timeline should not display medication names,
symptom text, account identifiers, or note bodies by default.

### Search

Add navigation commands and records for:

- meals/saved meals
- workouts/plans
- transactions/budgets/goals
- learning items/notes

Body measurements, symptoms, wellness routines, and account names are excluded
from blank/recent search results to reduce shoulder-surfing exposure.

### Settings

Add category sections for:

- Nutrition goals
- Body units and privacy
- Finance currency and privacy
- Learning review defaults

Add domain privacy controls:

- Include Nutrition/Recovery/Exercise in optional sync
- Include Finance in optional sync
- Allow local AI to read each sensitive domain
- Allow cloud AI to read each sensitive domain
- Include sensitive domains in manual exports

Cloud AI access defaults off. Controls must filter the actual outgoing payload,
not merely hide records in the interface.

No provider secret or sensitive record appears in exported diagnostics.

## Implementation Workstreams

1. Shared schema, reducer, migrations, and tests.
2. Sensitive-domain persistence projections, privacy settings, and tests.
3. Assistant action schema, provider JSON schema/instructions, previews, and
   approval conversion.
4. Nutrition lookup service and IPC boundary.
5. Nutrition page.
6. Body & Recovery expansion.
7. Exercise page.
8. Finance page.
9. Learning page.
10. Shell, search, editor, Timeline, Today, Settings, CSS, and screenshots.
11. Integration, accessibility, migration, and visual verification.

Workers must have disjoint write ownership. Shared integration files are merged
only after domain pages and core contracts stabilize.

## Verification Matrix

### Automated

- Schema defaults and malformed-input normalization for every record.
- Missing observations remain `null`; explicit zero remains zero.
- Migration from current schema-v2 documents preserves all existing records.
- Reducer add/update/delete/log actions and derived Timeline entries.
- Nutrition provider normalization, timeout, rate failure, and redacted errors.
- Assistant validation rejects unknown fields, impossible ranges, unverified
  source claims, ambiguous finance inputs, and oversized text.
- Every new page renders empty and populated state and preserves bind contracts.
- Search navigation and privacy exclusions.
- Settings bounds for goals, units, currency, and review intervals.
- Sensitive-domain projections exclude data when privacy controls are disabled.
- Full existing suite remains green.

### Visual

Capture and inspect:

- Nutrition populated and offline states
- Body & Recovery check-in
- Exercise populated state
- Finance populated state
- Learning populated state
- Today More snapshot
- Narrow-width navigation and each page's primary capture

### Manual desktop

- Native app launch and navigation.
- Nutrition lookup success and offline fallback.
- AI meal request with verified match and unmatched estimate.
- Proposal rejection leaves state unchanged.
- Backup/export/import round-trip.
- Keyboard-only capture and edit flows.
- No sensitive data appears in notifications or generic error messages.

## Plan Review Checklist

- The five domains share the existing local state, Timeline, Search, Settings,
  and AI approval model.
- Navigation remains calm because only More expands.
- Existing Health data is extended instead of duplicated.
- Nutrition provenance is explicit.
- Recovery wording stays observational.
- Finance avoids regulated advice and accounting complexity.
- Learning remains session/note focused.
- All network access stays in the main process.
- No external dependency is required.
- Existing user data remains valid and migration is additive.
