# Sharing a world

Play in your world with a few friends. They need nothing but a link: no install, no account, no server address to type.

1. Open the pause menu (or the start screen) and choose **Share This World**.
2. Copy the link and send it.
3. Your friends click it. They are in your world.

Your computer is the server. The game connects your friends' browsers directly to yours (peer to peer, over WebRTC), so
keep your tab open while they play. Up to **8 players**, you included.

Java server play (`/multiplayer.html`, the Minecraft Web Client bridge and the server directory) was removed. This
project now does one thing in this area, and does it without a server in the middle.

## Getting the link to a friend

A link is the address of the game with a world code on it: `https://your-game-address/?join=k7m2q9xe`. It can only work if
your friend can open that address. Which address that is depends on where the game is running.

| Where you play | What to do | Who can join |
|---|---|---|
| `npm run dev` on your computer | Share as usual. The dialog notices the link says `localhost` and lists **network links** that use your computer's address on the network (for example `http://192.168.1.20:3000/?join=...`). | Friends on the same Wi-Fi or network. Your firewall may ask to allow Node the first time. |
| Anywhere on the internet | Run `npm run share` (builds the game and serves it, plus the introduction service, on port 8080). Put a tunnel in front of it ([Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), [ngrok](https://ngrok.com/), Tailscale Funnel) or run it on a server. **Open the game at that public address**, then share: the link uses the address your page has. | Anyone with the link. |
| Static hosting (GitHub Pages, Netlify, ...) | A static site has no introduction service. Run `node server/shareServer.js` somewhere reachable, then open the game with `?signal=wss://that-host/ws/share`. The link you share carries the `signal` setting, so friends use the same service. | Anyone with the link. |

To find out whether sharing works through an address *before* you send a link to anyone, run
`npm run share:check -- https://your-address`. It opens two browsers, shares a world, joins it from the link and checks that
edits arrive in both directions, then says plainly whether sharing works there.

A page served over `https://` cannot connect to a `ws://` service (browsers block it as mixed content), so a public address
needs `https` and `wss` together, which tunnels provide.

## How it works

```
 guest                      introduction service                    host
   | -- join(room) ---------------> |                                 |
   | -- offer ---------------------> | ------------------------------> |
   | <------------------- answer --- | <------------------------------ |
   | <================ direct WebRTC data channel =================> |
   | -- hello -----------------------------------------------------> |
   | <------------------------------------ welcome, then the world -- |
```

- **The host is the server.** It holds the world, accepts guests, gives each an identity, checks every message and passes
  the good ones on. Guests connect only to the host, never to each other, so there is one authority and one set of rules.
- **The introduction service** (`server/shareRendezvous.js`, deployed as `cloudflare/share/src/index.js`) lets two browsers
  that cannot yet reach each other swap the few messages WebRTC needs to connect. It then steps out of the way. It keeps no
  record, offers no list of rooms, and a room exists only while its host is connected. It is built into the dev and preview
  servers and into `server/shareServer.js`.
- **The relay.** Some networks and browser settings block every peer-to-peer route (an office or school firewall, a phone
  network, a privacy extension that hides local addresses), so WebRTC can never connect. The guest then asks for the relay
  (`src/multiplayer/resilientPeerLink.js`): after a direct connection fails, or has not opened within 5 seconds, the game's
  frames go through the introduction service's WebSocket, which both browsers already hold. The service passes them on
  without reading them, under their own allowance (`RELAY_LIMITS`: 800 frames and 4 MB a second, after a burst large enough
  for a world). The game is otherwise identical; it is a little slower than a direct link. No TURN server or key is needed.
  Two tabs of the same browser can also connect through a `BroadcastChannel` without any network.
- **STUN servers** tell a browser the address the outside world sees it at. The defaults are Google's public STUN servers
  (they carry no game data). To use your own, or to add a TURN relay for networks that block direct connections, store a
  list in the browser: `localStorage['mc-ice-servers'] = '[{"urls":"turn:turn.example","username":"u","credential":"c"}]'`.
  Only `stun:`, `turn:` and `turns:` addresses are accepted.
- **The world** is sent once, when a friend joins: gzipped (about 36 times smaller on typical terrain), cut into small
  frames, and sent over the channel with back-pressure so a slow connection is not flooded. A friend joining a default world
  receives about half a megabyte, then spends several seconds building it (the same time as loading a saved world).
- **Codes** are 4 digits, easy to read out and type in the start screen's **Join** box. A taken code is drawn again. Guessing
  is slowed instead: one address may try 10 wrong codes a minute, so running through all 10,000 takes most of a day.
  Spaces and dashes are ignored, and I/L/O read as 1/1/0.

## What is shared, and what is not

Shared live: **block placing and breaking**, **where each player is, how they are moving and what they hold**, **each
player's skin** (changed in the Packs window, it changes on everyone's screen at once), **chat**, and who joins and leaves. The world a friend joins with is a copy of the host's, taken at the moment they join.

Not shared, and running separately on each player's computer: **mobs, items on the ground, redstone, fluids, crops and
growth, the clock and the weather, containers (chests, furnaces), and each player's inventory and health.** Two players can
therefore see a cow in different places, and a chest one of them fills will be empty for the other. This is a small-group
sandbox for building and exploring together, not a lock-step simulation. The host's copy is the one a late joiner receives.

A friend's copy lives in their browser. When the host stops sharing, the friend is told and can go back to the main menu;
they can save their copy like any world.

## Security

In a game with no server, **every guest message is untrusted input arriving at the server**: a guest can be a modified
client, or simply have a bug. The host (`src/multiplayer/shareProtocol.js` and `shareSession.js`) therefore:

- gives each guest an identity of its own (`p1`, `p2`, ...); a guest can never claim to be the host or another player;
- strips names of markup and control characters and limits them to 24 characters, makes duplicate names unique, and shows
  names with `textContent`, never `innerHTML`; **chat** is escaped when it is displayed;
- accepts a block edit only when its coordinates are whole numbers inside the world, and its block is one the game has;
- clamps positions, angles and held-item ids, drops any field the game does not use, and refuses a pose that has no real position;
- limits each guest's messages per second (movement, block edits, chat, and all traffic), and **drops a guest that keeps
  sending nonsense**;
- accepts a skin only as a PNG image of at most 64 KB, sent as data (never a link to fetch), at most a few changes in a
  row; each browser redraws its own skin as a standard 64x64 PNG before sending it (`skinShare.js`), so an imported or
  HD skin works too;
- accepts only the message types a guest may send, and only from a guest that has said hello;
- refuses a guest on a different protocol version, with a message that says so;
- bounds every message a peer can make it assemble, and caps how far a received world may expand, so a hostile peer cannot
  exhaust its memory;
- drops a connection that never says hello, and a guest that goes silent for 20 seconds;
- limits the room to 8 players.

A guest also validates what the host sends. The introduction service limits the size and rate of its messages, answers a
malformed code and an unknown one identically, and has no endpoint that lists rooms.

What this does **not** protect against, by design: anyone holding the link can join (until the host stops sharing, or the room
is full), and a guest in the world can build and break blocks anywhere in it, including griefing. There is no kick or ban yet:
stop sharing (which ends the world for everyone) and share again for a new code.

**Privacy.** WebRTC lets the players in a world learn each other's network addresses, which is inherent to connecting
browsers directly. The STUN servers see the address a browser connects from. Gameplay passes through a server only for a
pair of browsers that could not connect directly, through the relay, which does not read or keep it.

**Chests and a world's own game.** Chest contents are shared: a change one player makes is sent to the host, which passes it
on (`container`, 27 validated slots). A designed world's game -- SkyWars -- talks over a small validated data channel
(`game`, at most 8 KB of plain data a message); the host's game may also refuse hits (`attackPolicy`: nobody fights in a lobby)
and hears of each hit that lands (`attack_landed`).

## When joining fails

The join screen says what went wrong and offers **Back to Main**.

| Message | Meaning | What to do |
|---|---|---|
| That world is not being shared right now | The host closed the world, or the code is wrong. | Ask for a fresh link. |
| That link does not contain a valid world code | The link was cut off or retyped wrongly. | Copy it again. |
| That world is full (8 players) | | Try when someone leaves. |
| Your friend is on a different version of the game | The wire protocol changed between versions. | Ask them to share again. |
| Could not reach the sharing service | The page was not opened from the game's server, or the server is down. | Open the link in a normal browser tab; check the host's server. |
| Could not make a direct connection to the host | Neither a direct connection nor the relay could be opened (the relay needs the introduction service, so this usually means it was unreachable too). | Check the connection to the game's site; try again. |

If the introduction service drops while you are hosting, friends already in the world are unaffected (they talk to you
directly). The dialog says that nobody new can join, and the game reconnects the same room by itself, so the link keeps working.

## Files

| File | What it does |
|---|---|
| `src/multiplayer/shareCode.js` | Room codes, share links, reading a code from an address. |
| `src/multiplayer/shareProtocol.js` | The rules above: validators, rate limits, framing and compressed snapshots. |
| `src/multiplayer/signaling.js` | The client of the introduction service. |
| `src/multiplayer/peerLink.js` | One WebRTC connection with a data channel, and ICE server configuration. |
| `src/multiplayer/resilientPeerLink.js` | WebRTC first; a same-browser channel or the relay when it cannot connect. |
| `src/multiplayer/shareSession.js` | The host and guest roles: admitting, relaying, validating, keeping everyone in step. |
| `src/multiplayer/worldSyncManager.js` | The game's side: dialogs, joining from a link, applying edits and movement. |
| `src/multiplayer/remotePlayerManager.js` | The other players' avatars: the game's player model, in each player's own skin. |
| `src/multiplayer/skinShare.js` | This player's skin as the others receive it: a 64x64 PNG and the arm model. |
| `server/shareRendezvous.js` | The introduction service. |
| `server/shareVite.js`, `server/shareServer.js`, `server/shareInfo.js` | The dev-server plugin, the standalone server, and LAN address lookup. |

If you change what the host and guests say to each other, bump `PROTOCOL_VERSION` in `shareProtocol.js`: a guest on the old
version is then told to ask for a fresh link instead of misreading messages.

## Tests

```sh
node scripts/test.mjs sharing        # the unit tests (the relay, the deployed worker, chests and the game channel too)
npm run test:share:browser           # real browsers: join through a link, the relay, PvP bots and a SkyWars match
```

The unit tests run the whole protocol in memory (`tests/helpers/shareFakes.js` stands in for the introduction service and the
direct connection, so every failure can be made to happen). The browser test runs the same code over real WebRTC in two
separate browser contexts and the real service: it checks that a friend joins from the link alone, that edits, chat and
movement arrive, that the connection is direct and the introduction service is not in use afterwards, that nothing typed
becomes markup, and that leaving and closing are announced.
