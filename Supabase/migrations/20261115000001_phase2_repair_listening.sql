CREATE POLICY "Authenticated users can read ListeningTrack"
  ON "ListeningTrack"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read ListeningQuestion"
  ON "ListeningQuestion"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS "ListeningAttempt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "trackId" TEXT NOT NULL REFERENCES "ListeningTrack"("id") ON DELETE CASCADE,
  "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
  "score" INTEGER NOT NULL,
  "totalQuestions" INTEGER NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "ListeningAttempt" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own listening attempts"
  ON "ListeningAttempt"
  FOR ALL
  TO authenticated
  USING (auth.uid() = "userId")
  WITH CHECK (auth.uid() = "userId");

CREATE OR REPLACE VIEW "ListeningTrackExamSafe"
WITH (security_invoker = true) AS
SELECT
  lt."id",
  lt."lessonId",
  lt."code",
  lt."order",
  lt."title",
  lt."audioUrl",
  lt."durationSec",
  lt."primaryAccent",
  lt."secondaryAccents",
  lt."mediaFormat",
  lt."speakerCount",
  lt."speechRate",
  CASE
    WHEN lt."isExamTrack" = TRUE AND NOT EXISTS (
      SELECT 1 FROM "ListeningAttempt" la
      WHERE la."trackId" = lt."id" AND la."userId" = auth.uid()
    ) THEN ''
    ELSE lt."transcript"
  END AS "transcript",
  lt."hideTranscriptByDefault",
  lt."isExamTrack",
  lt."sourceName",
  lt."sourceUrl",
  lt."licenseType"
FROM "ListeningTrack" lt;
