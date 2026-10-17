# Health timings review: what the app says against NZ vet guidance

Reviewed 17 October 2026 on `feat/health-tracker`. Scope: the `health`
block in `public/content.js` (vaccine course, worming rule, weigh-in note,
the five log kinds), the due-next logic in `renderHealth` in `public/app.js`,
and the `/api/healthlog` validation in `server/server.js`. The timeline
entries in `content.js` that mention vaccinations are on main and noted at
the end.

Nothing here is veterinary advice. The app's own note says the vet's card
wins, and every source below says the same.

## Sources read

NZ veterinary bodies and clinics:

- NZVA, policy "Vaccine use in New Zealand cats and dogs", ratified
  November 2018, current: https://nzva.org.nz/positions-advocacy/position-statements/vaccines/.
  Principles only, no schedule: every dog should be immunised, as often as
  its own vet considers necessary, after an examination.
- NZVA media release, 6 March 2024, "Don't put off puppy vaccinations as
  parvovirus cases surge": https://nzva.org.nz/home/news/puppy-vaccinations-parvovirus-cases-surge/.
  At-risk group is puppies six weeks to six months; first parvo booster at
  12 months then three-yearly; keep puppies away from public areas where
  dogs commonly walk.
- Totally Vets (Manawatu), vaccination guidelines:
  https://totallyvets.co.nz/vaccination-guidelines-for-dogs/. Course starts
  at six weeks or older, at least two doses 3 to 4 weeks apart, last dose at
  16 weeks or older; typical 8, 12, 16; leptospirosis optional at 12 and 16,
  urban dogs "equally at risk"; booster 6 to 12 months after the course.
- Totally Vets, bringing a new puppy home:
  https://totallyvets.co.nz/all-you-need-to-know-about-bringing-a-new-puppy-home/.
  Worm from two weeks, every two weeks to three months, monthly to six
  months, three-monthly for life. Vaccines 8, 12, 16; booster 12 months after.
- New Plymouth Vet Group, puppy healthcare handout (2023) and walking page:
  https://www.npvet.co.nz/wp-content/uploads/2023/01/Puppy-Healthcare-Handout_FINAL-2023-1.pdf,
  https://www.npvet.co.nz/?p=6691. Worm at 2, 4, 6, 8, 10, 12 weeks, then
  monthly to 6 months; fleas monthly from 8 weeks; no beach, park or public
  places until 10 days after the final puppy vaccine; their final puppy
  vaccine is at 12 weeks, 16 for black and tan breeds.
- Franklin Vets, fleas and worms: https://www.franklinvets.co.nz/pets/fleas-worms.
  2 to 12 weeks every 2 weeks, 3 to 6 months monthly, over 6 months every 3
  months; fleas monthly for 3 to 4 months then as the product directs.
- Aorangi Vets, worming guidelines:
  https://www.aorangivet.co.nz/companion-animals/updated-worming-guidelines-for-pets/.
  Same worming schedule; sheep-farm dogs monthly.
- Barkes Corner and Brookfield Vets (Tauranga), puppy care:
  https://www.barkesvet.co.nz/puppy-care/. Vaccines "usually 6, 9 and 12
  weeks"; yearly booster; same worming schedule; public areas two weeks
  after the course.
- Petstock NZ, worming puppies:
  https://petstock.co.nz/blog/articles/worming-puppies-when-your-puppy-has-worms.
  2 to 12 weeks every 2 weeks (liquid), 12 weeks to 6 months every 4 weeks,
  then every 3 months.
- Animates, puppy in shape: https://animates.co.nz/articles/puppy-in-shape.
  Walks 7 to 14 days after the final core vaccination, typically from 16 weeks.
- Vetpost NZ, heartworm: https://vetpost.co.nz/do-i-need-to-treat-my-pets-for-heartworm/.
  New Zealand is heartworm-free; routine prevention is not needed for dogs
  living here.

International:

- WSAVA Vaccination Guidelines Group, 2024 guidelines:
  https://wsava.org/wp-content/uploads/2024/05/2024-Guidelines-for-the-Vaccination-of-Dogs-and-Cats.pdf.
  Core doses every 2 to 4 weeks with the final dose at 16 weeks of age or
  older; revaccination at or after 26 weeks rather than waiting until 12 to
  16 months; serology possible from 20 weeks.
- Royal Canin NZ, puppy vaccinations:
  https://www.royalcanin.com/nz/dogs/puppy/puppy-vaccinations. 7 to 9,
  11 to 13, 15 to 17 weeks, boosters at 15 months. Generic international
  copy (it lists rabies, which NZ does not use), included only to show the
  spread.
- Royal Canin Academy, puppy growth charts:
  https://academy.royalcanin.com/en/veterinary/puppy-growth-charts. Weigh
  at least every two weeks, weekly is better, clinic check every four weeks.

## Findings, line by line

| What the app said | What the sources say | Verdict | Change made |
| --- | --- | --- | --- |
| 8 wk: "First core vaccine (distemper, hepatitis, parvo)" | Totally Vets and most clinics 8; NPVet and Barkes 6; WSAVA from 6 to 8. Diseases right. | Right, slightly firm | Added "some clinics start at 6 weeks" |
| 12 wk: "Second core vaccine; leptospirosis optional" | 12 everywhere except the 6/9/12 clinics. Lepto: two doses 3 to 4 weeks apart, "optional" at Totally Vets but they add urban dogs are equally at risk; NZVA says ask your vet. | "Optional" undersells it | Now "ask about leptospirosis (two doses, 3 to 4 weeks apart)" |
| 16 wk: "Third core vaccine; walks on public ground about 10 days after" | WSAVA: final dose at 16 weeks or older. Some NZ clinics finish at 12 (NPVet, Barkes), so a family at those clinics has no 16-week dose and the app would nag for one. Walks: 10 days (NPVet), 7 to 14 (Animates), 2 weeks (Barkes). | Firmer than the sources on both counts | Now "Last puppy vaccine: 16 weeks or later (WSAVA 2024), though some NZ clinics finish at 12. Public walks 1 to 2 weeks after, when your vet says" |
| 52 wk: "Booster, 6 to 12 months after the course, then as the vet advises" | NZ clinics: 12 months after the course (Totally Vets 6 to 12, NZVA 12 months). WSAVA 2024: from 26 weeks of age. 52 weeks of age sits inside both. | Due date fine; wording vague about where the range comes from | Now "First booster: NZ clinics usually say 12 months after the course; WSAVA says it can be from 6 months old. Ask your vet" |
| Worming: "Every 2 weeks until 12 weeks, monthly until 6 months, then every 3 months. Weigh before each dose." | Identical at Totally Vets, Franklin, Aorangi, NPVet, Barkes, Petstock. Dosing is by weight on every NZ product label, hence weigh first. | Right, and the sources are unanimous | None |
| `wormNext`: 14 days under 12 weeks, 30 days to 26 weeks, then 91 | Matches the rule above. Petstock says "every 4 weeks" for the middle stage, clinics say "monthly"; 30 days is a fair middle. | Right | None |
| Weight: "Weigh every 2 to 4 weeks until 6 months", nag after 28 days | Royal Canin Academy: at least every two weeks, weekly better, clinic check every four weeks. No NZ clinic gives a frequency; Totally Vets says come in if body condition looks wrong. | Looser than the one source with a number, but the 28-day nag matches the clinic-visit cadence | Note now says "every fortnight or so", with the bathroom-scales tip; the nag stays at 28 days |
| Flea treatment: a log kind, no reminder, no wording | NPVet: monthly from 8 weeks; Franklin: monthly for 3 to 4 months then per product. Products range from monthly to three-monthly. | Nothing to reword. A reminder would have to know the product. | None; see follow-ups |
| Vet visit: a log kind only | | Fine | None |
| Note: "Dates here are what NZ clinics usually do" | True, with the caveat that clinics differ by a week or two and some finish at 12. | Slightly firm | Now says so, and points at this file |

Not in the app, checked anyway: the hivemind research digest said heartworm
exists in Northland. Vetpost NZ says New Zealand is heartworm-free and
prevention is only for travelling dogs; no NZ clinic page mentions it. The
app says nothing about heartworm, which is right. The research note has a
correction appended.

## What the due-next logic does with a 6/9/12 clinic

`renderHealth` looks for the first vaccine week at or after the puppy's age
that has no logged vaccine within two weeks of it. A family whose vet gave
doses at 6, 9 and 12 weeks will see the 16-week line as due until they log
something within 14 to 18 weeks. The rewording tells them why, and logging
the 12-week dose as "last puppy vaccine" with a note is the workaround. A
cleaner fix is a follow-up: let a grown-up tick "course complete" so the
16-week line stops, and start the booster countdown from the last logged
vaccine rather than from week 52 of age. Flagged for Tim below.

## For Tim

1. **Agree the softer vaccine wording**, above. It is what the family will
   read on the Skills tab.
2. **Lepto for the family's puppy** is a real question in a rural and river
   town: Totally Vets now says urban dogs are "equally at risk" and the NZVA
   says to ask the vet. The app only prompts; the answer is the vet's.
3. **Course-complete tick and booster from last dose**: build or leave. It
   matters only for families at clinics that finish at 12 weeks.
4. **Flea reminder**: leave as a log, or add "next flea due" from the last
   logged dose with a default of 30 days and a note field for the product.
   Product intervals vary too much to hard-code; the 30-day default would
   be wrong for three-monthly products.
5. **Timeline entries on main** (`content.timeline` weeks 8, 12, 16 say
   "First/Second/Third vaccination" and "Ten days after this jab she can
   walk footpaths"): same softening is due there, on a branch from main,
   with a `scripts/bump.mjs` run.

## Not run here

The branch's 34 tests do not assert these strings, so nothing changes in
the suite. `node --check` and a `require()` of `content.js` pass. Run
`npm test` on bigmac before merging, as for every branch.
