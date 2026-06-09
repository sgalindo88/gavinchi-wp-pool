# Setup guide — World Cup 2026 Draft Pool

This app is a static site (GitHub Pages) backed by a Google Sheet through a
Google Apps Script web app. ~20 minutes, no server to run.

```
GitHub Pages (static site)  ──fetch──▶  Apps Script web app  ──▶  Google Sheet
```

---

## 1. Put the code on GitHub Pages

1. Create a GitHub repo and upload everything in this folder (`index.html`,
   `css/`, `js/`, `docs/`).
2. Repo **Settings ▸ Pages ▸ Build and deployment** → Source: *Deploy from a
   branch* → branch `main`, folder `/ (root)` → **Save**.
3. After a minute your site is live at
   `https://<you>.github.io/<repo>/`. The seed files are served from
   `https://<you>.github.io/<repo>/docs/`.

> You'll come back to edit `js/config.js` in step 4.

## 2. Create the Google Sheet + Apps Script

1. Create a new blank Google Sheet (any name). Leave the tabs empty — the
   script builds them.
2. **Extensions ▸ Apps Script**. Delete the default `Code.gs` contents and
   paste the entire contents of `apps-script/Code.gs` from this repo. Save.

## 3. Deploy the web app

1. In the Apps Script editor: **Deploy ▸ New deployment**.
2. Gear icon ▸ **Web app**.
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. **Deploy**, authorize when prompted (it's your own script accessing your own
   sheet), and **copy the Web app URL** (ends in `/exec`).

> Whenever you paste new code, create a **new version** under
> *Deploy ▸ Manage deployments ▸ Edit ▸ New version* so the `/exec` URL serves
> the latest code.

## 4. Point the site at the backend

Edit `js/config.js` (and push the change to GitHub):

```js
export const API_URL = 'https://script.google.com/macros/s/AKfy…/exec';
export const DATA_BASE_URL = 'https://<you>.github.io/<repo>/docs';
```

## 5. Initialize from the app (Admin tab)

Open your GitHub Pages site and go to the **Admin** tab:

1. **Admin password** – type the password you want and click *Save*. The first
   *Seed* call sets this as the sheet's `adminPassword` (so pick it now and
   reuse it everywhere). Anyone entering scores or drafting will need it.
2. **Seed the sheet** – click *Seed teams & fixtures*. This creates all tabs and
   loads the 45 teams + 63 group-stage fixtures.
3. **Participants** – enter the 5 player names (slot order = snake draft order)
   and *Save participants*.

## 6. Run the draft

Go to the **Draft** tab → *Start draft*. The app shows who's on the clock in
snake order. On a player's turn, click their team; teams from a group that
player already owns are disabled. Picks sync to everyone within a few seconds
(async-friendly). Use *Undo last pick* if the draft gets cornered, *Reset
draft* to start over.

## 7. During the tournament

- **Fixtures** tab: enter each score and *Save*. The head-to-head result (who
  +3) shows on the row. For a **tied knockout**, also pick the team that
  advanced in the *winner…* dropdown.
- Add knockout matchups with **Add a knockout match** as the bracket resolves.
- **Leaderboard** and **Rosters** update automatically.

---

## Notes / troubleshooting

- **Removed teams:** Haiti, Curaçao and Cape Verde are excluded → 45 teams,
  with Groups C, E and H having 3 teams (3 matches) instead of 4.
- **"Wrong admin password":** the password lives in the `Config` tab. To change
  it, edit that cell directly in the sheet.
- **Changed `Code.gs` but nothing updates:** you must publish a *new version* of
  the deployment (step 3 note).
- **CORS errors in the console:** make sure the deployment's *Who has access* is
  **Anyone**, and that `API_URL` is the `/exec` URL (not `/dev`).
- **Re-seeding** wipes and reloads `Teams` and `Matches` (clearing entered
  scores) but does **not** touch `Participants`, `Picks`, or the password.
