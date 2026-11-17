import { db } from "../src/prisma/db";

async function check() {
  const lessons = await db.orm.public.Lesson
    .where((lesson) => lesson.id.in(["M1L01", "M2L01"]))
    .all();

  const vault = await db.orm.public.ShadowingVault
    .where((item) => item.code.in(["W001", "W002", "W003", "W004", "W005"]))
    .all();

  console.log("Lessons found:", lessons.map((lesson) => lesson.id));
  console.log("Vault items found:", vault.map((item) => item.code));
}

check()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());