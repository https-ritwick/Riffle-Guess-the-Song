// Terms of Service and Privacy Policy.
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BRAND } from '../../shared/brand'
import { Shell } from '../components/Shell'
import { Toggle } from '../components/ui'
import { analyticsEnabled, browserBlocksAnalytics, setAnalyticsEnabled } from '../lib/track'

const UPDATED = '24 October 2026'
const MAIL = <a href={`mailto:${BRAND.email}`} className="text-brand-300 underline-offset-2 hover:underline">{BRAND.email}</a>

function Doc({ title, intro, toc, children }: { title: string; intro: ReactNode; toc: { id: string; label: string }[]; children: ReactNode }) {
  useEffect(() => {
    const before = document.title
    document.title = `${title} · ${BRAND.name}`
    return () => {
      document.title = before
    }
  }, [title])
  return (
    <Shell banner={false}>
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16">
        <p className="text-sm text-gray-400">Last updated {UPDATED}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h1>
        <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-gray-300">{intro}</div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="On this page" className="hidden lg:block">
            <ul className="sticky top-6 space-y-1.5 border-l border-white/10 pl-4 text-sm">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-gray-400 hover:text-white">
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <article className="max-w-3xl space-y-10 text-[15px] leading-relaxed text-gray-300">{children}</article>
        </div>
        <p className="mt-14 border-t border-white/5 pt-6 text-sm text-gray-500">
          See also: {title.startsWith('Terms') ? <Link to="/privacy" className="text-brand-300 hover:underline">Privacy Policy</Link> : <Link to="/terms" className="text-brand-300 hover:underline">Terms of Service</Link>}
        </p>
      </main>
    </Shell>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {children}
    </section>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-brand-400">{children}</ul>
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-white/[0.04] text-gray-300">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/5 align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 text-gray-300">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------

const PRIVACY_TOC = [
  { id: 'summary', label: 'The short version' },
  { id: 'collect', label: 'What we collect' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'use', label: 'How we use it' },
  { id: 'cookies', label: 'Cookies & local storage' },
  { id: 'sharing', label: 'Who we share with' },
  { id: 'public', label: 'What others can see' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'rights', label: 'Your choices & rights' },
  { id: 'children', label: 'Children' },
  { id: 'security', label: 'Security & transfers' },
  { id: 'changes', label: 'Changes & contact' },
]

function AnalyticsSwitch() {
  const blocked = browserBlocksAnalytics()
  const [on, setOn] = useState(() => analyticsEnabled())
  return (
    <div className="rounded-2xl border border-brand-400/20 bg-brand-400/[0.05] p-4" data-testid="analytics-optout">
      <Toggle
        checked={on && !blocked}
        disabled={blocked}
        onChange={(v) => {
          setAnalyticsEnabled(v)
          setOn(v)
        }}
        label="Count my visits in Riffle’s analytics"
        hint={
          blocked
            ? 'Your browser sends a “do not track” / Global Privacy Control signal, so your visits are never counted.'
            : 'Turning this off stops visit and feature counting on this browser and forgets its analytics ID. Games still work exactly the same.'
        }
      />
    </div>
  )
}

export function PrivacyPage() {
  return (
    <Doc
      title="Privacy Policy"
      toc={PRIVACY_TOC}
      intro={
        <p>
          {BRAND.name} is a free guess-the-song party game made by {BRAND.author}. This policy explains what information {BRAND.name} collects when you play, why, and the choices you have.
          We’ve tried to keep it plain and specific.
        </p>
      }
    >
      <Section id="summary" title="The short version">
        <List>
          <li>You can play without an account. If you sign in with Google, we get your name, email and profile photo, and we ask your age and gender once.</li>
          <li>We run our own cookie-free analytics to see how {BRAND.name} is used — which pages, game modes and songs are popular, and roughly where players are (country, region, city).</li>
          <li>We never store your IP address, never sell your data and never show ads.</li>
          <li>You can switch analytics off below, and we honour your browser’s Global Privacy Control / Do Not Track signal automatically.</li>
          <li>Email {MAIL} to see, correct or delete your data.</li>
        </List>
        <AnalyticsSwitch />
      </Section>

      <Section id="collect" title="What we collect">
        <h3 className="font-semibold text-white">When you play (with or without an account)</h3>
        <List>
          <li>
            <strong className="text-gray-100">The name you type</strong>, your answers, scores and streaks, and which songs or questions came up — so the game, the scoreboard and the results screen work.
          </li>
          <li>
            <strong className="text-gray-100">Chat messages and stickers</strong> you send in a room. They’re shown to everyone in the room and kept with the room until it’s deleted.
          </li>
          <li>
            <strong className="text-gray-100">Voice</strong>: the voice channel connects players directly (peer to peer). We don’t record or store audio. If a direct connection isn’t possible, the encrypted
            audio may be relayed through Cloudflare’s servers.
          </li>
          <li>
            <strong className="text-gray-100">Playlists you paste</strong> (Spotify or Apple Music links) to fetch their song list.
          </li>
          <li>
            <strong className="text-gray-100">Daily challenge results</strong>: your name, score and when you played go on that day’s public leaderboard.
          </li>
        </List>
        <h3 className="pt-2 font-semibold text-white">If you sign in with Google</h3>
        <List>
          <li>Your Google account ID, name, email address and profile photo.</li>
          <li>
            <strong className="text-gray-100">Your age and gender</strong>, which we ask once after your first sign-in. We store your age as an approximate birth year so it stays up to date. You can
            choose “Prefer not to say” for gender, and change both any time from the account menu (<em>Age & gender</em>). They’re never shown to other players.
          </li>
          <li>When you created your account, when you last signed in and how many times, and the approximate location of your most recent visit.</li>
          <li>Your groups, the group invites you send (including the email addresses you invite), and your game history and stats.</li>
        </List>
        <h3 className="pt-2 font-semibold text-white">If you connect Spotify</h3>
        <List>
          <li>
            Your Spotify display name, profile photo and a list of your top tracks, read once when you connect, to build Blend games. We never store your Spotify password or access tokens.
            Disconnecting deletes this right away; otherwise it expires on its own.
          </li>
        </List>
      </Section>

      <Section id="analytics" title="Analytics">
        <p>
          {BRAND.name} counts visits and gameplay with its own first-party analytics. No Google Analytics, no advertising networks, no third-party trackers. When analytics is on, we record:
        </p>
        <List>
          <li>
            <strong className="text-gray-100">A random ID</strong> kept in your browser’s local storage, so a return visit isn’t counted as a new person. We only store a one-way hash of it.
          </li>
          <li>
            <strong className="text-gray-100">Approximate location</strong> — country, region/state and city — worked out by our host, Cloudflare, from your connection. We never see or keep your IP address.
          </li>
          <li>
            <strong className="text-gray-100">Device type, operating system and browser</strong> (e.g. “mobile · Android · Chrome”), read from your browser’s user-agent.
          </li>
          <li>Which pages you open, the website that sent you here, and the date and hour of your visit.</li>
          <li>Taps on features such as sharing a result, making a story poster or copying an invite.</li>
          <li>
            For every game: the mode and music source, settings (rounds, difficulty, timer), how many players took part, scores, how many answers were right and how fast, and whether chat,
            reactions or voice were used. Players’ approximate location and device type are stored with the game.
          </li>
          <li>Per song or question: how often it’s played and how often it’s guessed right (not who guessed).</li>
        </List>
        <p>
          If you’re signed in, analytics is linked to your account so we can understand how players use {BRAND.name} over time (for example, favourite game modes) and spot abuse. We also look at play
          patterns by age group and gender — for example, which modes 18–24 year olds prefer — in aggregate only.
        </p>
      </Section>

      <Section id="use" title="How we use it">
        <List>
          <li>To run the game: rooms, scoring, results, groups, leaderboards and sign-in.</li>
          <li>To check players meet the minimum age, and to understand which age groups and genders enjoy which parts of {BRAND.name}.</li>
          <li>To understand what people enjoy and improve {BRAND.name} — which songs are too hard, which modes are popular, where players are and what devices they use.</li>
          <li>To keep {BRAND.name} safe: rate-limiting, preventing cheating and spam, and moderating names, chat and groups.</li>
          <li>To answer you when you contact us.</li>
        </List>
        <p>
          We rely on your consent (signing in, connecting Spotify, leaving analytics on), on what’s needed to provide the service you asked for, and on our legitimate interest in running,
          improving and protecting a free game. You can withdraw consent at any time.
        </p>
      </Section>

      <Section id="cookies" title="Cookies & local storage">
        <p>{BRAND.name} uses only the cookies it needs to work. None are used for advertising.</p>
        <Table
          head={['Name', 'What it’s for', 'How long']}
          rows={[
            [<code key="a">encore_session</code>, 'Keeps you signed in', '30 days'],
            [<code key="b">encore_oauth</code>, 'Protects the Google sign-in step', '10 minutes'],
            [<code key="c">Spotify link cookie</code>, 'Remembers that this browser connected Spotify', 'Until you disconnect or it expires'],
          ]}
        />
        <p>
          Your browser’s local storage holds conveniences such as your name, your seat in a room (so you can reconnect), sound settings, progress and badges, the analytics ID described above and a
          copy of site settings. You can clear it any time from your browser settings.
        </p>
      </Section>

      <Section id="sharing" title="Who we share with">
        <p>We don’t sell or rent your information. We share it only with services that help run {BRAND.name}:</p>
        <List>
          <li>
            <strong className="text-gray-100">Cloudflare</strong> — hosting, database, real-time rooms, voice relay and approximate location.
          </li>
          <li>
            <strong className="text-gray-100">Google</strong> — sign-in. Optionally Google Gemini writes quiz questions and award names; it receives game content such as song titles, never your
            name or email.
          </li>
          <li>
            <strong className="text-gray-100">Spotify</strong> and <strong className="text-gray-100">Apple</strong> — playlists, song previews and album art. Your browser loads previews directly from
            them, so they receive your IP address under their own privacy policies.
          </li>
        </List>
        <p>We may also disclose information if the law requires it, or to protect players and {BRAND.name} from fraud or abuse.</p>
      </Section>

      <Section id="public" title="What others can see">
        <List>
          <li>People in your room see the name you typed (and your Google photo if signed in), your score, reactions and chat.</li>
          <li>Members of a group see each other’s names and photos; group admins also see members’ email addresses.</li>
          <li>Daily challenge leaderboards show names and scores to everyone.</li>
          <li>{BRAND.name}’s administrator can see account details and analytics to run and moderate the service.</li>
        </List>
      </Section>

      <Section id="retention" title="How long we keep it">
        <List>
          <li>Rooms, including their chat, are deleted 6 hours after the last activity.</li>
          <li>Visit-level analytics are deleted automatically after about 13 months.</li>
          <li>Game stats and your account stay until you ask us to delete your account. Game records left after deletion show “Deleted player” instead of your name.</li>
          <li>Sign-in sessions last 30 days. Spotify data is kept until you disconnect or it expires.</li>
          <li>We keep a short record of moderation actions (like a ban) to prevent repeat abuse.</li>
        </List>
      </Section>

      <Section id="rights" title="Your choices & rights">
        <List>
          <li>Switch analytics off with the toggle at the top of this page, or send Global Privacy Control / Do Not Track from your browser.</li>
          <li>Play without signing in, and disconnect Spotify from the account menu at any time.</li>
          <li>
            Email {MAIL} to get a copy of your data, correct it, or delete your account. We’ll reply within 30 days. Depending on where you live (for example under India’s Digital Personal Data
            Protection Act or the EU/UK GDPR) you may also have rights to object, restrict processing, nominate someone to act for you, or complain to a regulator.
          </li>
        </List>
      </Section>

      <Section id="children" title="Children">
        <p>
          {BRAND.name} isn’t meant for children under 13, and we don’t knowingly collect their information. We ask your age when you first sign in, and accounts can’t be set up for anyone
          under 13. If you’re under 18, please use {BRAND.name} — especially Google sign-in — only with a
          parent or guardian’s permission. If you think a child has given us personal information, email {MAIL} and we’ll delete it.
        </p>
      </Section>

      <Section id="security" title="Security & transfers">
        <p>
          Connections are encrypted (HTTPS). Session tokens are stored only as hashes, and admin access is limited to verified Google accounts. No system is perfectly secure, but we work to protect your
          information. {BRAND.name} runs on Cloudflare’s global network, so your data may be processed outside your country.
        </p>
      </Section>

      <Section id="changes" title="Changes & contact">
        <p>
          If we change this policy we’ll update the date at the top, and for significant changes we’ll show a notice in the game. Questions, requests or complaints (including grievances under Indian
          law): {BRAND.author}, {MAIL}.
        </p>
      </Section>
    </Doc>
  )
}

// ---------------------------------------------------------------------------

const TERMS_TOC = [
  { id: 'agreement', label: 'Agreement' },
  { id: 'eligibility', label: 'Who can play' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'conduct', label: 'Fair play & conduct' },
  { id: 'your-content', label: 'What you post' },
  { id: 'music', label: 'Music & third parties' },
  { id: 'ai', label: 'AI-written content' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'service', label: 'The service' },
  { id: 'liability', label: 'Liability' },
  { id: 'ending', label: 'Ending' },
  { id: 'law', label: 'Law & changes' },
]

export function TermsPage() {
  return (
    <Doc
      title="Terms of Service"
      toc={TERMS_TOC}
      intro={
        <p>
          These terms are the rules for using {BRAND.name}, a free guess-the-song party game made by {BRAND.author}. Please read them — by playing you agree to them.
        </p>
      }
    >
      <Section id="agreement" title="Agreement">
        <p>
          By using {BRAND.name} you agree to these Terms and to our <Link to="/privacy" className="text-brand-300 hover:underline">Privacy Policy</Link>. If you don’t agree, please don’t use{' '}
          {BRAND.name}.
        </p>
      </Section>

      <Section id="eligibility" title="Who can play">
        <p>
          You must be at least 13 years old. If you’re under 18, you need a parent or guardian’s permission, and they agree to these Terms on your behalf. When you first sign in we ask your age
          and gender; please answer honestly.
        </p>
      </Section>

      <Section id="accounts" title="Accounts">
        <List>
          <li>You can play as a guest. Groups and some features need you to sign in with Google.</li>
          <li>You’re responsible for what happens under your account. Tell us at {MAIL} if you think someone else is using it.</li>
          <li>You can ask us to delete your account at any time.</li>
        </List>
      </Section>

      <Section id="conduct" title="Fair play & conduct">
        <p>Keep {BRAND.name} fun for everyone. Don’t:</p>
        <List>
          <li>Use names, chat, stickers, group names or voice to harass, threaten, bully or demean anyone, or to share hateful, sexual, violent or illegal content.</li>
          <li>Impersonate other people, or share someone’s personal information without their permission.</li>
          <li>Cheat — for example with bots, scripts or tools that look up answers — or manipulate leaderboards.</li>
          <li>Spam, scrape, overload, probe or attack {BRAND.name}, or try to get around rate limits, bans or security.</li>
          <li>Use {BRAND.name} for commercial purposes or to break any law.</li>
        </List>
      </Section>

      <Section id="your-content" title="What you post">
        <p>
          You keep ownership of the names, messages and group names you create. You give {BRAND.name} permission to store and show them to other players as needed to run the game. You’re
          responsible for what you post, and you confirm you have the right to post it.
        </p>
      </Section>

      <Section id="music" title="Music & third parties">
        <List>
          <li>
            Songs play as short official previews streamed from Apple Music or Spotify, with album art from the same sources. All music, artwork, film titles and dialogues belong to their
            respective owners. {BRAND.name} doesn’t sell or host music.
          </li>
          <li>{BRAND.name} isn’t affiliated with or endorsed by Apple, Spotify, Google, or any artist, label or film studio. Their names are used only to identify their content.</li>
          <li>Using Google sign-in, Spotify or Apple Music through {BRAND.name} is also subject to those companies’ own terms.</li>
        </List>
      </Section>

      <Section id="ai" title="AI-written content">
        <p>
          Some quiz questions and award names are written by AI (Google Gemini) and checked automatically. They can occasionally be wrong or odd — they’re for fun, not facts. Tell us if you spot
          something inappropriate.
        </p>
      </Section>

      <Section id="moderation" title="Moderation">
        <p>
          To keep {BRAND.name} safe we may, without notice, remove names, messages, groups or leaderboard scores, remove players from rooms, close rooms, and suspend or delete accounts that break
          these Terms. If you think we got it wrong, email {MAIL}.
        </p>
      </Section>

      <Section id="service" title="The service">
        <p>
          {BRAND.name} is free and provided “as is” and “as available”. We may change, pause or stop any part of it (for example during maintenance) at any time. We don’t promise it will always
          be available, error-free or that scores and history will be kept forever.
        </p>
      </Section>

      <Section id="liability" title="Liability">
        <p>
          To the fullest extent the law allows, {BRAND.author} isn’t liable for indirect or consequential losses, or for anything other players say or do. Our total liability for any claim
          relating to {BRAND.name} is limited to ₹1,000. Nothing here limits rights you have under consumer protection laws that can’t be excluded.
        </p>
      </Section>

      <Section id="ending" title="Ending">
        <p>
          You can stop using {BRAND.name} whenever you like and ask us to delete your account. We may suspend or end your access if you break these Terms. Sections that by their nature should
          continue (like liability) still apply afterwards.
        </p>
      </Section>

      <Section id="law" title="Law & changes">
        <p>
          These Terms are governed by the laws of India, and the courts of India have jurisdiction. We may update these Terms; we’ll change the date at the top, and for significant changes show a
          notice in the game. Continuing to play after a change means you accept it. Questions: {MAIL}.
        </p>
      </Section>
    </Doc>
  )
}
