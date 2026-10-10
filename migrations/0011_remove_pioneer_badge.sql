-- Remove the Pioneer badge from the catalog and any existing ownership.
-- points_inventory references points_catalog with ON DELETE CASCADE.
DELETE FROM points_catalog WHERE id = 'badge-pioneer';
