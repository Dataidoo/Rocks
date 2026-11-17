# Rock Vault — Rock & Mineral Collection App

A fully offline Progressive Web App (PWA) for cataloguing your rock and mineral
collection: photo cards, identification tests, an automatic density calculator,
search/sort/filter, favorites, and full data export/import — all stored on
your own device.

## What's inside

- `index.html`, `css/style.css`, `js/app.js`, `js/db.js` — the app itself
- `manifest.json`, `service-worker.js`, `icons/` — makes it installable and
  usable fully offline, like a native app
- All your data (entries **and** photos) is stored locally in the browser's
  IndexedDB. Nothing is uploaded anywhere.

## How to run it

A PWA's "Add to Home Screen" / offline features require being served over
**HTTPS** or **localhost** — opening `index.html` directly from disk
(`file://`) will show the app but the install prompt and offline caching
won't work. Pick whichever is easiest:

**Quickest — test locally:**
```
cd rock-vault-pwa
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your phone/desktop browser (same Wi-Fi,
use your computer's local IP instead of localhost to reach it from your phone).

**Free permanent hosting (recommended for real use):**
- **Netlify Drop** — go to https://app.netlify.com/drop and drag the whole
  `rock-vault-pwa` folder in. You'll get a free HTTPS URL instantly.
- **GitHub Pages** — push this folder to a GitHub repo and enable Pages in
  the repo settings.
- **Vercel / Cloudflare Pages** — similar drag-and-drop or git-based deploy.

Once it's live on an HTTPS URL, open it on your phone and use your browser's
**"Add to Home Screen"** (Safari: Share → Add to Home Screen; Chrome/Android:
menu → Install app). It'll then behave like a native app icon and work with
no signal in the field.

## Using the app

- Tap **+** to log a new specimen. The modal has four tabs: **Photos**,
  **Identity**, **Tests & Measurements**, and **Provenance & Notes**.
- Take/choose your **Top, Front, and Side** photos — on a phone this opens
  your camera directly.
- Fill in Mohs hardness, UV reaction, acid test, magnetic response, streak,
  luster, and cleavage/fracture as you learn them — you can always come back
  and **edit** an entry later.
- Enter **dimensions** (mm or in) and **weight** (g or oz) and the app
  automatically computes estimated volume and density live. This uses the
  bounding-box method (L × W × H), so it's an *upper-bound* estimate —
  real density is a bit higher for anything that isn't a perfect rectangle.
- Set **status** to Known or Unknown — this colors the card's top edge and
  badge (blue = known, grey = unknown) so your whole shelf is scannable at a
  glance.
- Tap the **star** on a card to flag a favorite.
- Use the **search bar** (matches identity, minerals, location, tags,
  notes, inventory #), the **filter chips** (All / Known / Unknown /
  Favorites), and the **sort dropdown** (inventory #, date found, date
  added, name, hardness, value, density) to find things fast.
- The **gear icon** opens Settings, where you can export a full JSON
  backup (data + photos), import one back in, or export a CSV (data only,
  for spreadsheets). **Export a backup regularly** — since everything lives
  only in this browser's storage, clearing browser data or switching devices
  without a backup will lose your collection.
- The **sun/moon icon** toggles light/dark theme.

## Fields included

Inventory #, status (known/unknown), favorite, assumed identity, known
identity, rock/minerals present, estimated value, condition, tags, Mohs
hardness, streak color, luster, UV light reaction + notes, acid test,
magnetic response, cleavage/fracture, dimensions + unit, weight + unit,
auto-calculated estimated volume & density, location found, GPS coordinates,
date found, date added to collection, how it was acquired (found/purchased/
traded/gifted), storage location, and free-form notes.