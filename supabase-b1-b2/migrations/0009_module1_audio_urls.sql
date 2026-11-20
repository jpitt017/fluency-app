-- ============================================================================
-- Migration 0009: Wire pre-generated British English studio audio URLs
-- for Module 1 content_inputs and core vocab_items.
-- ============================================================================

update public.content_inputs
   set audio_url = '/audio/module-1/three-people-three-changes.mp3'
 where id = '3b7026c8-e692-4ec3-b449-d097170cfd6b';

update public.content_inputs
   set audio_url = '/audio/module-1/the-year-everything-changed.mp3'
 where id = '8c3c0680-ca89-4088-8dca-771fa2de7cf2';

update public.vocab_items set audio_url = '/audio/module-1/turning-point.mp3' where id = '0a33f4f9-9f50-4ac5-bd9d-e78eb80c9beb';
update public.vocab_items set audio_url = '/audio/module-1/come-round-to.mp3' where id = '02628d24-0ff9-4340-869a-a977aaea1865';
update public.vocab_items set audio_url = '/audio/module-1/settle-down.mp3' where id = 'b7cbfdbe-a750-4ac4-ba21-3c5787f5a545';
update public.vocab_items set audio_url = '/audio/module-1/bring-up.mp3' where id = '9d2c61c4-f4b5-42ad-b797-6ccd9cbc9d13';
update public.vocab_items set audio_url = '/audio/module-1/get-on-with.mp3' where id = '9484b6f9-013f-4113-8491-30f050880a14';
update public.vocab_items set audio_url = '/audio/module-1/get-used-to.mp3' where id = '74a2f8b9-1b5d-4c6d-9e6e-a7eeb746c5bf';
update public.vocab_items set audio_url = '/audio/module-1/look-back-on.mp3' where id = '44c25615-e3ff-4869-88cd-f1b18ace7696';
update public.vocab_items set audio_url = '/audio/module-1/set-in-your-ways.mp3' where id = '9105f792-6e55-4d4c-afb7-3f3343472448';
