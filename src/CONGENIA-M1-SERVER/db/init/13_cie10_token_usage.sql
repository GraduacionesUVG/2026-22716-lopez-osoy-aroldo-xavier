-- Token consumption for CIE-10 AI executions.

ALTER TABLE cie10_run
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reasoning_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS api_call_count integer NOT NULL DEFAULT 0;

ALTER TABLE cie10_sugerencia
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reasoning_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS api_call_count integer NOT NULL DEFAULT 0;

INSERT INTO schema_migrations (version)
VALUES ('13_cie10_token_usage.sql')
ON CONFLICT (version) DO NOTHING;
