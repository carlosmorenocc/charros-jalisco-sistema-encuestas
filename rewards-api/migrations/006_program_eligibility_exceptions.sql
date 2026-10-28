ALTER TABLE rewards_programs
  ADD COLUMN eligibility_exception text;

ALTER TABLE rewards_programs
  ADD CONSTRAINT rewards_programs_eligibility_exception_check
  CHECK (
    eligibility_exception IS NULL
    OR (
      eligibility_exception IN ('authorized_giveaway_courtesy')
      AND eligibility_status = 'eligible'
      AND manual_lock
    )
  );
