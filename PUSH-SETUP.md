# Notifications — what works, and what needs you

This document exists because the easiest thing to get wrong here is also the
most damaging: telling someone a reminder will arrive, and then not delivering
it. They only find out by missing something.

So the state of play is written down plainly.

---

## What works right now

**Reminders while Dayplan is open.** A due reminder is shown through the
service worker's registration. It is a real device notification, on the lock
screen, with the item's name and time. It requires:

- notification permission, asked the first time you turn a reminder on — never
  at launch, because at launch there is nothing to explain it with;
- the app to be open, or very recently open.

That last condition is the whole limitation. On a phone, a browser tab is
discarded within seconds of switching away.

## What does not work, and cannot yet

**Reminders with the app closed.** This needs the Push API, which needs a push
subscription, which needs a VAPID key pair whose private half must live on a
server. Dayplan is a folder of static files on GitHub Pages. There is no
server, there is no key, and `PUSH_CONFIG.vapidPublicKey` is `null`.

The app says exactly this, in these words, wherever reminders are configured:

> Reminders appear while Dayplan is open. Background reminders need the
> notification service, which is not set up yet.

### What was deliberately not built

A `setTimeout` chain that fires while the tab happens to be alive, presented as
a reminder system. It would demo perfectly and fail in someone's pocket.

---

## The decision

| | |
|---|---|
| **1 · Current hosting** | GitHub Pages. Static files, no runtime. |
| **2 · Backend required?** | Yes, unavoidably. Web Push has no serverless-from-the-client form: something has to hold the VAPID private key and sign the request at the moment the reminder is due. |
| **3 · Simplest secure shape** | A **Cloudflare Worker + KV**, or a Vercel function + KV/Upstash. About 40 lines. Free tier covers a personal planner comfortably. Deliberately a *small isolated service* — the app stays a static site and never becomes a server application. |
| **4 · Subscription storage** | The push endpoint and its two keys, stored server-side against an opaque random client id generated on the device (`ui.notifyId`). No email, no account, no login. |
| **5 · Scheduling** | The client sends its next N due reminders whenever the schedule changes. The worker stores desired state, and a cron trigger every 60s sends what is due. Storing *desired state* rather than a queue is what makes cancellation trivial. |
| **6 · Cancel / update** | Re-sync replaces the set for that client id. Nothing has to be individually cancelled, so a reminder for a deleted item cannot survive as an orphan. |
| **7 · Privacy** | The payload can carry only "You have something scheduled" and let the client fill in the title from local storage — an option worth taking, since the schedule itself never needs to leave the device. |
| **8 · Failure / retry** | `404`/`410` from the push service means the subscription is dead: prune it. Other failures retry with backoff, bounded. A send that fails permanently is dropped rather than delivered late and wrong. |
| **9 · Offline** | Reminders are server-side, so they fire with the app closed and the device online. The *client* being offline only defers the next sync; the schedule itself is local and unaffected. |
| **10 · Cost / complexity** | Free tier, one worker, one KV namespace, one cron trigger. The blast radius is one service that can be deleted without touching the app. |

## The client half is already built and inert

Nothing below needs writing again — it is in the repository now, doing nothing
because there is no key:

- `PUSH_CONFIG` — the single gate. Non-null key turns the path on.
- `notificationCapability()` — one function every notification surface reads,
  so no two screens can disagree about what is true.
- `dueReminders(from, to, dates)` — pure, derives every reminder instant from
  the schedule. Tested.
- `sw.js` — `push` and `notificationclick` handlers, complete. A tap focuses an
  existing window rather than opening a second copy (two instances of a
  local-first app writing the same storage is how an edit gets lost) and posts
  `{type:'open-item', date, itemId}` back to the page, which opens that day.

---

## ⛔ What I need from you

This is the gate. Everything that can be built safely without it has been.

**1. Choose the host.** Cloudflare Workers is my recommendation — cron triggers
and KV are built in, and the free tier is generous.

- [ ] Cloudflare account, or
- [ ] Vercel account (add Upstash Redis or Vercel KV), or
- [ ] something you already run

**2. Generate the VAPID key pair.** Do this yourself so the private key never
passes through a chat:

```bash
npx --yes web-push generate-vapid-keys
```

- The **public** key goes into `PUSH_CONFIG.vapidPublicKey` in `index.html`. It
  is public by design and safe to commit.
- The **private** key goes into the host's secret store **only**
  (`wrangler secret put VAPID_PRIVATE_KEY`). It must never appear in
  `index.html`, in this repository, or in a message to me.

**3. Tell me the deployed worker URL**, and I will wire `PUSH_CONFIG.endpoint`,
add the subscribe/sync client, and we test end to end on a real phone with the
app force-closed.

Until step 3 is done and a notification has actually arrived on a locked phone,
background reminders stay described as "not set up yet". They will not be
marked working on the strength of code that looks right.
