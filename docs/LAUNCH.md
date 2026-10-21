# Launching Still to everyone

Everything in the code is ready. What's left are accounts and forms that only you can fill in, because they're tied to your name, your Google account and a one-time payment. Do them in this order. Steps marked **(send to Claude)** need one quick change from me before you continue.

Files you need (in the project's `still/launch/` folder):
- `still-1.0.0.zip`: the package you upload to the Chrome Web Store
- `still-site.zip`: the public website (home page + privacy policy)
- `store-images/`: screenshots and the promo tile
- `store-listing.md`: every text field for the store, ready to paste

---

## 1. Put the website online (about 15 minutes)

Google needs a public home page and privacy policy before it will verify Calendar sign-in.

1. **Get a domain (recommended).** Buy a short domain, such as `getstill.app` or `stillfocus.in`, from Namecheap, GoDaddy or Google's partner Squarespace Domains. It costs about ₹700 to ₹1,500 a year. Google's verification needs a domain you can prove you own. A free `something.netlify.app` address may also pass, but your own domain is the safe route.
2. **Host the site for free on Netlify:**
   1. Unzip `still-site.zip`.
   2. Go to https://app.netlify.com/drop, sign in, and drag the unzipped `site` folder onto the page.
   3. In Netlify, open **Domain management**, choose **Add a domain**, enter your domain, and follow the DNS steps it shows.
3. **Check it works.** Open `https://<your domain>/` and `https://<your domain>/privacy.html`.
4. **Add your contact email.** Open `site/config.js`, put your email in `contactEmail`, and drag the folder onto Netlify again. You can also send the email to Claude and I'll set it.

## 2. Create your Chrome Web Store developer account (about 10 minutes)

1. Go to https://chrome.google.com/webstore/devconsole and sign in with the Google account you want as the publisher.
2. Pay the one-time US$5 registration fee and accept the developer agreement.
3. Under **Account**, set the publisher name (for example "Still") and verify your contact email.

## 3. Upload the first draft and get your store ID (about 5 minutes)

1. In the dashboard, click **New item** and upload `still-1.0.0.zip`.
2. Don't submit yet. The item now has its permanent ID, a 32-letter code shown under the item name and in the address bar.
3. Your store link is `https://chromewebstore.google.com/detail/<ID>`. It opens once the item is published.
4. **(send to Claude)** Send me the ID. I'll put the store link on the website's "Add to Chrome" buttons. You can also set `storeUrl` in `site/config.js` yourself and redrop the folder on Netlify.

## 4. Make Google sign-in work for the store version (about 10 minutes)

The store gives Still a new ID, so Google Calendar sign-in needs a login client for that ID.

1. Open https://console.cloud.google.com/auth/clients?project=still-512106.
2. Click **Create client**, set **Application type** to **Chrome Extension**, paste the store **Item ID**, and click **Create**.
3. Copy the new **Client ID** (it ends in `.apps.googleusercontent.com`).
4. Open your existing **Web application** client (the one Still already uses). Under **Authorized redirect URIs**, add `https://<store ID>.chromiumapp.org/` and save.
5. **(send to Claude)** Send me the new Client ID. I'll run `node scripts/build-store.mjs --client-id <id>` and give you a new `still-1.0.0.zip`.
6. In the store dashboard, open **Package**, upload the new zip, and replace the draft.

## 5. Fill in the store listing (about 20 minutes)

Paste the fields from `store-listing.md`:
- **Store listing:** description, category, screenshots, small promo tile, and your website as the homepage and support URL.
- **Privacy practices:** single purpose, one justification per permission, "No" to remote code, the data usage answers, and `https://<your domain>/privacy.html`.
- **Distribution:** Public, all regions, free.

Then click **Submit for review**. Reviews usually take a few days. Broad site access (`<all_urls>`, which blocking needs) can make it take longer. You'll get an email when it's approved.

## 6. Open Calendar sign-in to everyone (Google verification)

Until this step is done, only people you add as test users can connect Calendar. Everyone else can still use Still fully (focus, blocking, Bucket, Insights). Only the Calendar button is affected.

**Option A: launch now, verify in parallel (recommended).**
1. Open https://console.cloud.google.com/auth/audience?project=still-512106 and click **Publish app** to move it from Testing to In production.
2. Until Google verifies it, people who connect Calendar see a "Google hasn't verified this app" screen. They can continue by choosing **Advanced** and then **Go to Still**. There's a cap of 100 users.

**Option B: verification (needed to remove the warning and the cap).**
1. **Branding page** (https://console.cloud.google.com/auth/branding?project=still-512106): fill in the app name, logo (`assets/icon-128.png`), support email, home page `https://<your domain>/`, privacy policy `https://<your domain>/privacy.html`, and under **Authorized domains** add your domain.
2. **Verify the domain** in Google Search Console (https://search.google.com/search-console) with the same Google account. The easiest method is a DNS TXT record at your domain provider.
3. **Data access page:** confirm the only scope is `.../auth/calendar.events.readonly`. Justification: "Still reads the title, start and end time of upcoming events to remind the user before an event and, if they choose, block distracting sites while it runs. Data stays in the user's browser."
4. **Demo video:** record 1 to 2 minutes and upload it to YouTube as **Unlisted**. Show:
   1. Still's Settings, clicking **Sign in with Google**.
   2. Google's consent screen. Make sure the address bar showing the client ID is visible.
   3. The next calendar event appearing in Still.
   4. A nudge before the event, and sites being blocked while it runs.
5. Click **Prepare for verification** / **Submit**. Calendar read-only is a "sensitive" scope, so there is no paid security audit. Google usually replies within a few days to a few weeks and may email questions.

## 7. After approval

- The "Add to Chrome" buttons on your website go live automatically once `storeUrl` is set.
- For future updates, bump `version` in `manifest.json` (for example 1.0.1), run `node scripts/build-store.mjs --client-id <store client id>`, and upload the new zip under **Package**.
- Keep using your own unpacked copy for development. It has its own ID and its own sign-in client, and both keep working.

---

### Costs at a glance
| Item | Cost |
|---|---|
| Chrome Web Store developer account | US$5 once |
| Domain | about ₹700 to ₹1,500 a year |
| Netlify hosting | Free |
| Google verification (sensitive scope) | Free |
