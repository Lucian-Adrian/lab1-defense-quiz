-- Remove only the synthetic attempt created to check the new public domain.
DELETE FROM quiz_attempts
WHERE player_name = 'Vercel verification'
  AND token_hash = 'fb6c36bc0c3a96e4586eb566d20923b53f2311b1816c35b751ce3f5cf0f2eab0';
