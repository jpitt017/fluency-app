# PR #117 live Review-card cleanup record

- **Date (UTC):** `2026-11-28` (`14:55:59Z`)
- **Production Supabase project:** `ebzmkhrssgnzmixfsuso` (`English Fluency B1-B2`)
- **Application release deployed first:** PR #117 merged to `main` as `32ad8912db6cfad62beff2d3f78e9e91e4186dcb` (`2026-11-28T14:51:35Z`); Vercel production deployment completed (`https://vercel.com/jpitt017/fluency-app/GpMX1v62PXEsTCrmFfhmWffQzoF3`) before any live DB change ran.
- **Owner approval:** Explicitly approved by project owner on 2026-11-28 (test accounts).
- **Reviewed manifest:** `docs/rollouts/review-cards-cleanup-pr117-manifest.json`
- **Generator script:** `scripts/prepare-review-cards-cleanup-pr117.mjs` (unit-tested in `tests/unit/review-cards-cleanup-pr117.test.mjs`, 3/3 pass)
- **Executed atomic SQL SHA-256:** `72a690880a86ccfa53f5a81df75c5dc1a6b3416e97d9a5947c370aa582297587`
- **Supabase connector execution request ID:** `97666c5b-d878-4a39-9175-cf622af8a8db`
- **Post-verification query request IDs:** `ba946c3f-37af-4187-aabd-c983fdf687a1`, `cd2c374d-9d53-42a4-983d-b300c5e54afa`

## Counts before and after

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| `error_review_cards` total | 55 | 47 | −8 |
| `error_review_cards` active (`suspended = false`) | 55 | 23 | −32 (−8 deleted, −24 suspended) |
| `error_review_cards` suspended (`suspended = true`) | 0 | 24 | +24 |
| Synthetic `"Test card."` rows | 8 | 0 | −8 |
| Legacy weekly gap cards (active, untouched) | 13 | 13 | 0 |
| `vocab_cards` active (`suspended = false`) | 94 | 94 | 0 |

## Operations executed atomically

1. **Repaired (1 row):**
   - `84f84204-4894-4906-8ee5-1aa35d1d8c0a` (`W2-R3`):
     - `corrected_sentence`: `"I will meet Ana on Thursday at 3pm."` → `"I'm meeting Ana on Thursday at 3 p.m."`
     - `explanation`: `"Use the target form here: future forms.."` → `"A fixed arrangement."`
     - `updated_at`: `2026-11-28 14:55:59.824086+00`
2. **Suspended (`suspended = true`, 24 rows — `learner_errors` history preserved):**
   - Meaning single-word card (1): `3624ad1a-b0f2-4300-b75c-2fc38c0bdd90`
   - Duplicates (4): `5d1a83fc-3b4c-4eff-87c9-e05ecc95ff19`, `7786d763-10e5-471a-b592-96fa8aae08a3`, `f727ddb5-8e2b-4b0f-b970-8d536f3e9bc4`, `2d8846f8-22a8-46e0-9a49-72224d6d6eb2`
   - Multi-point / full-rewrite / long-sentence cards (18): `b697053d-5423-4c98-97a3-3aca8119847d`, `06cca863-2101-4c1f-8b99-886658f340a9`, `701cd247-96ef-4192-a87f-1a1ec4bc6d1c`, `7f79cdcd-24e6-4668-afec-1697fbd19a62`, `8df208b7-7ce6-426b-9f0e-f646d5a4b5e2`, `97d707a9-9dcd-40c7-88df-c308efda0004`, `60af9878-cf86-4b5d-a745-0cb82f86cb42`, `c66bd0f8-92d1-4c59-960c-890f9d1596c9`, `a0df7c7b-bdc1-409f-8692-1119a0880ad1`, `dff92224-6982-4eab-8845-e4ae2567f476`, `93237190-18f3-40aa-836f-0531af258893`, `765e1a9d-fd0f-4049-9633-420613a5f247`, `61e85d33-91c5-40a2-a4c8-d908ea6c5832`, `c96d2960-3289-4236-9cae-6d55f5eb6a72`, `d580c533-4983-46e7-8bfb-82746024fb62`, `5f66855e-e4d8-4af6-b78f-fc02ee011070`, `6bcf2679-64a5-484d-8319-377f30d81ac8`, `628f7030-707e-4a63-a637-8b882ff1a844`
   - Fragment rewrite (1): `e1e63e28-8457-4695-af7a-387133c2ff4c`
3. **Deleted synthetic `"Test card."` rows (8 rows):**
   - `096e6c52-f40a-4fcf-acfd-784a89d6faa4`, `c62f8fad-6e65-45d1-abdc-b5a9ff671b16`, `db80a24c-fe6e-4523-b4ae-c50f5269fb03`, `8ba57855-8386-47f4-9c27-5667f2dd74f9`, `7e96fca2-0e9e-478a-b919-4cbc2b0ae8dd`, `8770b162-29b7-45d7-9947-0e614a5f3d6f`, `c866ac09-f95a-4f3e-a39f-ab381278aa21`, `880331c2-6fe8-41d1-aab7-884eb6ef535a`
4. **Untouched active cards (23 rows total):**
   - 13 legacy weekly gap cards (all retained original `updated_at` and `reps = 1`; rendered with full sentences and rules via read-time enrichment)
   - 1 repaired weekly Rewrite card (`84f84204`)
   - 2 full-sentence weekly Fix cards (`cb7e04e3`, `ee2bb96b`)
   - 1 valid Use-it card (`4f3f114f`, `reps = 3`)
   - 6 single-point AI / free-text cards (`02fe50ea`, `d1c7aebd`, `28a09651`, `f68be0a4`, `7bb5585e`, `5977f100`)

No migration history rows, `vocab_cards`, `learner_errors`, or audio release flags were modified.
