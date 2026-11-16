-- Answers to the public "Would you use this app?" survey at /survey.
--
-- Anyone with the link can submit, without an account, so nothing here is tied
-- to a user. client_id is made by the respondent's browser and is unique, so a
-- double tap on Submit (or a retry after a dropped connection) stores one row.
CREATE TABLE IF NOT EXISTS survey_responses (
  id          SERIAL PRIMARY KEY,
  survey      TEXT NOT NULL DEFAULT 'rep-app-v1',
  client_id   TEXT NOT NULL UNIQUE,
  answers     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_responses_survey_created
  ON survey_responses (survey, created_at DESC);
