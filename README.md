# World Cup 2026 Draft Pool

A private fantasy-style pool for the 2026 FIFA World Cup: 5 participants
snake-draft 45 teams (the 48-team field minus Haiti, Curaçao and Cape Verde),
and then play a head-to-head league driven by the real tournament results.

- **Draft:** snake order, 9 teams each. A participant can't draft two teams from
  the same World Cup group — so every group-stage match is automatically a
  head-to-head between two different participants.
- **Scoring:** for any match where two *different* players own the two teams, the
  winner's owner gets **3 points**; a draw gives **0**. Knockout ties resolve to
  the team that advanced; a knockout where one player owns both teams scores no
  points (the team just advances). Total = 3 × wins; tiebreaker is head-to-head,
  then goal difference.

## Stack

Static site (GitHub Pages) → Google Apps Script web app → Google Sheet (the DB).
No build step; plain HTML/CSS/vanilla-JS modules.

```
index.html, css/, js/        the static app
apps-script/Code.gs          paste into the sheet-bound Apps Script project
docs/teams-2026.json         the 45 teams + groups (seed data)
docs/fixtures-2026.json      63 group-stage fixtures (seed data)
docs/setup.md                ← start here to deploy
docs/sheet-schema.md         database reference
```

## Setup

See **[docs/setup.md](docs/setup.md)**. In short: publish this folder to GitHub
Pages, paste `apps-script/Code.gs` into a sheet-bound Apps Script and deploy it
as a web app, put that URL + your Pages `/docs` URL into `js/config.js`, then use
the in-app **Admin** tab to seed the sheet and add the 5 players.
