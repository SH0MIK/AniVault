-- Persist the full MAL-normalised metadata used by curated homepage hero slides.
-- The public homepage reads this snapshot from D1 and never hydrates curated
-- heroes from MAL at request time.
ALTER TABLE home_hero_banners ADD COLUMN metadata_json TEXT;
