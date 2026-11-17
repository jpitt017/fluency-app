CREATE TABLE IF NOT EXISTS "ShadowingTake" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "shadowingItemId" TEXT NOT NULL REFERENCES "ShadowingVault"("id") ON DELETE CASCADE,
  "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
  "audioStoragePath" TEXT NOT NULL,
  "durationSec" NUMERIC(6, 2),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "ShadowingTake" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own shadowing takes"
  ON "ShadowingTake"
  FOR ALL
  TO authenticated
  USING (auth.uid() = "userId")
  WITH CHECK (auth.uid() = "userId");

INSERT INTO storage.buckets (id, name, public)
VALUES ('shadowing-takes', 'shadowing-takes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own shadowing audio"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'shadowing-takes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own shadowing audio"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'shadowing-takes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own shadowing audio"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'shadowing-takes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
