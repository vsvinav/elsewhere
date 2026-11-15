# Set up Elsewhere

Elsewhere turns the location history Google already keeps on your phone into a poster of where you've been: cities ranked by nights, every stop pinned, flights on a globe, a calendar of where you slept. It runs in your browser or as an Android app. Nothing you upload leaves your device.

You need about ten minutes and your phone. Everything here is free, apart from one optional step that stays free for normal personal use.

---

## Step 1 — Get your location history out of Google (2 minutes)

Google calls this your **Timeline**. Since 2024 it lives on your phone, not on Google's servers, so you export it from the phone itself.

**On an Android phone**

1. Open **Settings**.
2. Tap **Location**, then **Location Services**, then **Timeline**.
3. Tap **Export Timeline data**.
4. Save the file somewhere you can find it, for example Downloads or Google Drive.

**On an iPhone**

1. Open the **Google Maps** app.
2. Tap your profile picture (top right), then **Your timeline**.
3. Tap the **⋯** menu (top right), then **Export**.
4. Save or AirDrop the file to where you want to use it.

Either way you get one file called **Timeline.json**. If you have years of history it may be a few dozen megabytes — that's normal.

> Can't find Timeline in Settings? It's only there if you had Location History / Timeline turned on. If you never did, there's nothing to export yet — see *Recording from today* at the end.

---

## Step 2 — Open it in Elsewhere

Pick one or both.

### In your browser (any computer or phone)

1. Go to **https://vsvinav.github.io/elsewhere/**
2. Tap **Import** and choose your Timeline.json.
3. Answer five quick questions — your name, where home is (and earlier homes, if you moved), work, and whether you prefer miles or kilometres.
4. Done. Swipe through the tabs along the top.

Your file is read inside the browser and kept in the browser's own storage on that device. It is never uploaded.

### On your Android phone (the app)

1. On the phone, open **https://github.com/vsvinav/elsewhere-android/releases** and tap the newest **elsewhere-vX.Y.Z.apk**.
2. Your phone will say it can't install apps from this source. Tap **Settings** on that message, allow it for your browser, go back, and tap the download again.
3. Open Elsewhere, tap **Import**, and pick the Timeline.json you saved in Step 1.
4. Answer the same five questions.

Updates install over the old version and keep everything. (If you installed a version before v0.9.0, uninstall it once first.)

---

## Step 3 (optional) — Add a Google key for names and photos

Without this step everything works, but your stops are shown by coordinates and category rather than by name, and there are no photos. With it, your hundred busiest stops get their real names — "Blue Bottle Coffee", "Gare du Nord" — and a photo.

This means creating a free "API key" in Google's developer console. It sounds technical, but it's five clicks, and **one key works for both the website and the Android app**.

### Will this cost me money?

Almost certainly not. Google asks you to attach a card, but gives every account a free monthly allowance that is far more than Elsewhere uses:

| What Elsewhere does with your key | How often | Google's free allowance |
| --- | --- | --- |
| Looks up the names of your 100 busiest stops | once, ever (then remembered) | ~5,000 a month |
| Loads a photo when you open a stop | only when you look | ~1,000 a month, then about 0.7¢ each |
| Draws the map (website only) | once each time you open the site | ~10,000 a month |
| Draws the map (Android app) | — | free, no limit |

Both the website and the app show a running count of paid calls and a rough dollar figure in the **▾** menu so you can see for yourself. A personal install stays at $0.

### Get the key

1. Go to **https://console.cloud.google.com/google/maps-apis** and sign in with any Google account.
2. If it's your first time, Google walks you through creating a *project* and adding a billing card. Accept the defaults. (The card is required by Google; it won't be charged for personal use.)
3. In the left menu choose **APIs & Services**, then **Library**. Search for and **Enable** these two:
   - **Places API (New)**
   - **Maps JavaScript API** (only needed for the website; harmless to enable anyway)
4. In the left menu choose **Keys & Credentials**, then **Create credentials → API key**. A long string starting with `AIza` appears. Copy it.
5. Click the key's name to edit it, and set:
   - **Application restrictions:** *None*
   - **API restrictions:** *Restrict key*, then tick just **Places API (New)** and **Maps JavaScript API**.
   Save. This makes the key useless for anything but the two things Elsewhere does, so it's safe even if someone else saw it.

### Paste it in

- **Website:** tap the **▾** menu by the title, then **Maps key**, paste, save.
- **Android app:** at the front door tap **Paste a key**, or later **▾ → Maps key**.

Both check the key right away with two free requests and tell you in plain words if something is off (for example "Enable the Places API (New)"), and what to click to fix it.

> **Android note:** the app's check also mentions *Map Tiles API*. If you're using an official release from the Releases page it says *not needed* — the app already includes Google's map. You only need Map Tiles if you compile the app yourself without a Maps SDK key.

---

## Recording from today (Android only)

If you never had Timeline on, or want to keep the record going without exporting again, the Android app can record your movements itself.

1. At the front door tap **Skip — record on this phone instead**, or later **▾ → Recording**.
2. Allow location access **All the time** when asked (that's what lets it notice where you sleep), plus physical activity and notifications.
3. Leave it running. A quiet notification shows it's on; tap it to pause or resume.

It only notes places you stay for five minutes or more, keeps raw position fixes for 90 days, and stores everything on the phone. Nothing is sent anywhere.

---

## Your data, in one paragraph

Your Timeline file is read on your device and kept on your device — in the browser's storage on the web, in a local database on Android. The only things that go over the network are map images, a few free address look-ups for the homes you pick, and (only if you added a key) Google's names and photos for your busiest stops. Clearing your browser's site data or uninstalling the app erases everything; there is no account and no server copy.

---

## Something not working?

- **"Couldn't read this file"** — make sure it's the *Timeline.json* from Step 1, not a Google Takeout archive.
- **Map is grey or blank (Android)** — check your phone has Google Play services (most do); otherwise the app falls back to a free OpenStreetMap map automatically.
- **Key says "restricted to websites"** — in step 5 above, set *Application restrictions* to *None*.
- **Nothing on the Flights tab** — flights are found from long, fast jumps between airports; a record with no flights shows an empty globe.

Still stuck? Open an issue at https://github.com/vsvinav/elsewhere/issues with what you clicked and what you saw (never your Timeline file).
