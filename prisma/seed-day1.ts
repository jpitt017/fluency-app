import { db } from "../src/prisma/db";

async function main() {
  console.log("Day 1 seed: M1L01, M2L01, W001-W005");

  const lessonsInserted = await db.orm.public.Lesson.createAndCount(
    [
      {
        id: "M1L01",
        code: "M1L01",
        module: "M1",
        title: "Phrasal Verbs for Daily Routines",
        order: 1,
        durationMin: 12,
        exerciseType: "quiz_native",
        videoUrl: "https://cdn.programme.com/videos/M1L01_final.mp4",
        pdfUrl: "https://cdn.programme.com/assets/pdfs/M1/M1L01_Phrasebook.pdf",
        transcript: "Wake up. Get ready. Set off. Wind down.",
      },
      {
        id: "M2L01",
        code: "M2L01",
        module: "M2",
        title: "Vowel Sounds: /iː/ vs /ɪ/",
        order: 1,
        durationMin: 12,
        exerciseType: "quiz_native",
        videoUrl: "https://cdn.programme.com/videos/M2L01_final.mp4",
        pdfUrl: "https://cdn.programme.com/assets/pdfs/M2/M2L01_CheatSheet.pdf",
        transcript: "Sheep. Ship. Beat. Bit.",
      },
    ],
    { onConflict: "skip" },
  );

  const vaultInserted = await db.orm.public.ShadowingVault.createAndCount(
    [
      {
        lessonId: "M2L01",
        code: "W001",
        type: "word",
        transcript: "thought /θɔːt/",
        order: 1,
        modelAudioUrl75: "https://cdn.programme.com/shadowing/M2_SH_W001_75.webm",
        modelAudioUrl100: "https://cdn.programme.com/shadowing/M2_SH_W001_100.webm",
      },
      {
        lessonId: "M2L01",
        code: "W002",
        type: "word",
        transcript: "business /ˈbɪznəs/",
        order: 2,
        modelAudioUrl75: "https://cdn.programme.com/shadowing/M2_SH_W002_75.webm",
        modelAudioUrl100: "https://cdn.programme.com/shadowing/M2_SH_W002_100.webm",
      },
      {
        lessonId: "M2L01",
        code: "W003",
        type: "word",
        transcript: "comfortable /ˈkʌmfətəbl/",
        order: 3,
        modelAudioUrl75: "https://cdn.programme.com/shadowing/M2_SH_W003_75.webm",
        modelAudioUrl100: "https://cdn.programme.com/shadowing/M2_SH_W003_100.webm",
      },
      {
        lessonId: "M2L01",
        code: "W004",
        type: "word",
        transcript: "interesting /ˈɪntrəstɪŋ/",
        order: 4,
        modelAudioUrl75: "https://cdn.programme.com/shadowing/M2_SH_W004_75.webm",
        modelAudioUrl100: "https://cdn.programme.com/shadowing/M2_SH_W004_100.webm",
      },
      {
        lessonId: "M2L01",
        code: "W005",
        type: "word",
        transcript: "probably /ˈprɒbəbli/",
        order: 5,
        modelAudioUrl75: "https://cdn.programme.com/shadowing/M2_SH_W005_75.webm",
        modelAudioUrl100: "https://cdn.programme.com/shadowing/M2_SH_W005_100.webm",
      },
    ],
    { onConflict: "skip" },
  );

  console.log(`Lessons inserted: ${lessonsInserted}`);
  console.log(`Vault items inserted: ${vaultInserted}`);
  console.log("Day 1 seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());