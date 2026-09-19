UPDATE `public_dashboard`
SET `enabled` = 0,
    `public_identifier` = NULL
WHERE `public_identifier` IS NOT NULL
  AND `public_identifier` = 'legacy-' || `public_identifier_hash`;
