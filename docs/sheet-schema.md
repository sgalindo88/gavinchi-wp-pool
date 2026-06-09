# Google Sheet schema

The Google Sheet is the database. The Apps Script `setupSheet` action creates
these tabs automatically and seeds `Teams` + `Matches` — you normally don't
create them by hand. This is the reference for what each tab holds.

The **first row of every tab is the header** (exact column names below). Data
starts on row 2.

## `Config` (key/value)
| Key | Value |
|---|---|
| `adminPassword` | The shared admin password gating all writes. |
| `draftStatus` | `not_started` · `in_progress` · `complete` |
| `currentPickNumber` | 1–45 during the draft; 0 before; 46 when done. |
| `dataBaseUrl` | Folder serving the seed JSON (set during seeding). |

## `Teams`
`TeamId` · `Name` · `GroupLetter` · `FlagEmoji` — 45 rows, seeded from
`docs/teams-2026.json`.

## `Participants`
`PlayerId` · `Name` · `DraftSlot` (1–5). Written by the Admin panel
(`setParticipants`). `PlayerId` is `P<slot>` (P1…P5).

## `Picks`
`PickNumber` (1–45) · `Round` (1–9) · `PlayerId` · `TeamId` · `Timestamp`.
One row per draft pick, appended by `makePick`.

## `Matches`
`MatchId` · `Stage` (`group`/`R32`/`R16`/`QF`/`SF`/`ThirdPlace`/`Final`) ·
`GroupLetter` (group stage only) · `HomeTeamId` · `AwayTeamId` ·
`KickoffDate` · `HomeScore` · `AwayScore` · `WinnerTeamId` (for tied
knockouts) · `Status` (`scheduled`/`final`).

63 group-stage rows are seeded from `docs/fixtures-2026.json`. Knockout rows
are added later via the **Add a knockout match** form on the Fixtures tab.

## Scoring model (computed in the browser, not stored)
A match counts only when its two teams have **different owners**:
- winner's owner → **+3** (a win)
- group-stage draw → **0** to both
- knockout tie → the `WinnerTeamId` owner wins
- **same owner** owns both teams (only possible in knockouts) → no points; the
  team simply advances

Player total = 3 × wins. Tiebreaker: head-to-head points between the tied
players, then goal difference.
