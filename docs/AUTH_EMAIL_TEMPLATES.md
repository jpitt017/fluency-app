# Supabase auth email templates

Five templates, pasted into **Supabase → Authentication → Emails**. Each one links
to `/auth/callback` with a `token_hash` in the query string, so the token is
verifiable on the server, in any browser.

## Why the default link fails

Supabase's default email button uses `{{ .ConfirmationURL }}`, which points at
`/auth/v1/verify?token=…`. That endpoint returns the session in the URL
**fragment** (`#access_token=…`) and redirects to your `redirect_to` with no
`code` added. A server route cannot read a fragment, so `/auth/callback` saw no
`code` and no `token_hash`, fell through, and sent everyone to
`/login?error=auth_callback_failed`. Every confirmation, magic link and reset
ended on the "link expired" banner.

Building the link from `{{ .TokenHash }}` puts the token in the query string
instead, which `/auth/callback` verifies with `verifyOtp`. It also works when the
email is opened on a different device, because nothing depends on a cookie in the
browser that requested it.

## Rules that apply to all five

- Use `{{ .TokenHash }}`, **not** `{{ .ConfirmationURL }}`.
- `next` is **fixed per template**. A mail merge cannot read `emailRedirectTo`, so
  `/auth/callback` uses the `next` in the link and falls back to the right default
  for the action. Keep the values below.
- `type` is GoTrue's value, not the template name: sign-up is `signup`, a magic
  link is `magiclink`, a reset is `recovery`.
- `{{ .SiteURL }}` must stay the live origin. It is `https://fluency-app-nine.vercel.app`.
- Subjects are in the same table for convenience; the dashboard keeps them
  separate from the body.

## The five templates

| Template | `type` | `next` | Subject |
| --- | --- | --- | --- |
| Confirm signup | `signup` | `/dashboard` | `Confirm your email` |
| Magic link | `magiclink` | `/dashboard` | `Your sign-in link` |
| Reset password | `recovery` | `/login?mode=update-password` | `Reset your password` |
| Change email | `email_change` | `/dashboard` | `Confirm your new email` |
| Invite | `invite` | `/dashboard` | `You're invited` |

### Confirm signup

`type=signup` · `next=/dashboard`

```html
<h2>Welcome to Fluency Studio</h2>
<p>Please confirm your email so we can keep your account safe.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=%2Fdashboard">Confirm my email</a></p>
<p>This link works for one hour. If it expires, sign in and ask for a new one.</p>
<p>See you inside,<br>Fluency Studio</p>
```

### Magic link

`type=magiclink` · `next=/dashboard`

```html
<h2>Your sign-in link</h2>
<p>Click below to sign in to Fluency Studio. You will not need your password.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&next=%2Fdashboard">Sign me in</a></p>
<p>This link works for one hour and only once. If you did not ask for it, you can ignore this email.</p>
<p>Fluency Studio</p>
```

### Reset password

`type=recovery` · `next=/login?mode=update-password`

```html
<h2>Reset your password</h2>
<p>Hello. Someone asked to reset the password for this account. If it was you, click below to choose a new one.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=%2Flogin%3Fmode%3Dupdate-password">Choose a new password</a></p>
<p>This link works for one hour. If it was not you, you can ignore this email. Your password will not change.</p>
<p>Fluency Studio</p>
```

### Change email

`type=email_change` · `next=/dashboard`

`{{ .Email }}` is the current address; the new one is `{{ .NewEmail }}`.

```html
<h2>Confirm your new email</h2>
<p>You asked to use {{ .NewEmail }} for your Fluency Studio account. Click below to confirm it.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change&next=%2Fdashboard">Confirm {{ .NewEmail }}</a></p>
<p>This link works for one hour. If it was not you, you can ignore this email and your address will stay the same.</p>
<p>Fluency Studio</p>
```

### Invite

`type=invite` · `next=/dashboard`

```html
<h2>You're invited to Fluency Studio</h2>
<p>You have been invited to practise English with us. Click below to set your password and start.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=%2Fdashboard">Set my password</a></p>
<p>This link works for one hour. If you were not expecting it, you can ignore this email.</p>
<p>Fluency Studio</p>
```

## After pasting

1. Save each template.
2. Ask for the three-flow check (admin `generate_link`, no email is sent): the
   confirmation and magic link must land on `/dashboard`, the reset on
   `/login?mode=update-password` showing **Set a new password**.
3. If a link 404s on Vercel, the deploy predates this route — check Deployments
   for a **Ready** build of the merge commit.

## Testing without sending email

`admin/generate_link` returns a working `action_link` without mailing it. The
`action_link` itself still points at `/auth/v1/verify`; the template above is what
builds the `/auth/callback` link, so the check should follow the **template shape**
with the returned `hashed_token`:

```
{{ .SiteURL }}/auth/callback?token_hash=<hashed_token>&type=<type>&next=<next>
```

For `signup`, the user must be unconfirmed — a confirmed user has no sign-up
token. `https://<ref>.supabase.co/auth/v1/admin/generate_link` with
`{"type":"signup","email":…,"password":…}` (no `email_confirm`) creates one.
