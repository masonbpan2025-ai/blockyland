# Deploy to Cloudflare

This setup deploys the Vite game to Cloudflare Pages and its world-sharing signaling endpoint to a Cloudflare Worker with a Durable Object. Game traffic remains peer to peer; the Worker only introduces the host and guests, matching the existing `/ws/share` protocol.

## One-time setup

1. Create or choose a Cloudflare account. This guide uses Pages Direct Upload from your local working tree, so the deploy includes ignored local files such as the film posters in `public/movies/`.
2. Install a supported Node.js version (22 or newer) and run `npm ci` in the repository root.
3. Authenticate Wrangler and create the Pages project:

   ```sh
   npx wrangler login
   npx wrangler pages project create blockyland
   ```

   Select `main` as the production branch if Wrangler asks. Direct Upload projects cannot later be converted to Git integration; use a Git-connected Pages project instead if you want automatic deploys on push.

4. Deploy the signaling Worker. This first deploy creates the SQLite-backed Durable Object class:

   ```sh
   npm run deploy:cloudflare:share
   ```

5. Build and upload the Pages site. Its `/ws/share` Function forwards WebSocket upgrades to the Worker’s Durable Object:

   ```sh
   npm run build
   npx wrangler pages deploy dist --project-name blockyland
   ```

   Later, `npm run deploy:cloudflare` repeats the Worker deploy, build, and Pages upload.

## Attach `blockyland.online`

In Cloudflare, open **Workers & Pages → blockyland → Custom domains → Set up a domain** and enter `blockyland.online`.

The root domain must be an active zone in the same Cloudflare account. If the domain was purchased elsewhere, add it to Cloudflare and update the registrar's nameserver settings to the Cloudflare nameservers shown for the zone. If it was registered with Cloudflare, it should already use Cloudflare DNS. Add any existing mail or verification DNS records to the Cloudflare zone before changing nameservers.

Let Cloudflare create the Pages DNS record through the Custom domains flow, then wait for the domain and TLS certificate to become active. Verify both `https://blockyland.online` and `https://blockyland.online/api/share/health`.

## Project boundaries

- Single-player worlds and local saves run in each player's browser.
- “Share a World” uses the Pages Function at `/ws/share` and the `ShareRendezvous` Durable Object to exchange connection setup messages. World state and gameplay travel directly between browsers.
- Server-side map-save APIs and LAN address discovery from the local Vite server are not part of the Pages deployment. Local saves continue to use browser storage; the public site does not advertise private LAN addresses.
- The Movies page embeds the films from YouTube. The rendered MP4s are left out of the build because Pages rejects files over 25 MiB.
- Debug and inspection pages included in the Vite build are also publicly reachable. Remove them from the Vite build inputs if they should stay private.

## Files added for this deployment

- `wrangler.toml` configures the Pages output directory and its Durable Object binding.
- `functions/_middleware.js` routes `/ws/share` to the Durable Object and answers share health/info requests.
- `cloudflare/share/` contains the Worker and Durable Object deployment configuration.
