-- Remove only the two synthetic attempts created by the public end-to-end check.
DELETE FROM quiz_attempts
WHERE player_name = 'System check'
  AND token_hash IN ('44e9dccef470e2a79a6df4ffa4ec5c951bbbd94e78280cea0b742904dbaac3b6', '62e504e9f81e791bbf00266eeb2a2c4a13b9bef04200ff35e455d65174d458b4');
