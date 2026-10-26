-- Add an optional admin-managed portrait cover image to homepage hero slides.
ALTER TABLE home_hero_banners ADD COLUMN cover_image_url TEXT;
