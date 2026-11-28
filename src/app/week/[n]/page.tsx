import Link from 'next/link';
import GrammarPractice from '@/components/b1b2/GrammarPractice';
import FocusWeekSection from '@/components/b1b2/FocusWeekSection';
import { ListeningAfterQuestions, ListeningBeforePlayer } from '@/components/b1b2/ListeningSupport';
import { ReadingAfterQuestions, ReadingBeforeQuestions, ReadingPracticeLayout, ReadingText } from '@/components/b1b2/ReadingSupport';
import ListeningTrialPlayer from '@/components/b1b2/ListeningTrialPlayer';
import RememberWeek from '@/components/b1b2/RememberWeek';
import VocabularyPractice from '@/components/b1b2/VocabularyPractice';
import WeekInputTask from '@/components/b1b2/WeekInputTask';
import WeekSpeakingSupport from '@/components/b1b2/WeekSpeakingSupport';
import WritingLab from '@/components/labs/WritingLab';
import WeekTaskLayout, { type WeekTaskEntry } from '@/components/b1b2/WeekTaskLayout';
import { getViewer } from '@/lib/b1b2/data';
import { notFound } from 'next/navigation';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';
import { loadPlayableTrialAudio } from '@/lib/curriculum/load-listening-audio';
import { learnerGrammar } from '@/lib/curriculum/learner-grammar';
import { learnerVocabulary } from '@/lib/curriculum/learner-vocabulary';
import { learnerVocabularyExercises } from '@/lib/curriculum/learner-vocabulary-exercises';
import { loadSyllabusContent } from '@/lib/curriculum/syllabus';
import { loadUnlockedModels } from '@/lib/curriculum/week-models';
import { loadWeekPracticeProgress } from '@/lib/curriculum/week-practice-progress';
import { ensureWeeklyPracticeSummary } from '@/lib/curriculum/week-practice-auto-finish';
import { loadWeekProgress } from '@/lib/curriculum/week-progress';
import { loadWeekSpeakingSupport } from '@/lib/curriculum/week-speaking-support';
import { grammarWritingIdeas, loadWeekSentencePractice } from '@/lib/curriculum/week-sentence-practice';
import {
  plainGrammarTargetsForWeek,
  targetWordsForWeek,
} from '@/lib/curriculum/week-writing-support.mjs';
import { WEEK_TASKS, ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import RefreshCurrentWeekOnVisit from '@/components/b1b2/RefreshCurrentWeekOnVisit';

export const dynamic = 'force-dynamic';

export default async function LearnerWeekPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  if (!/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(n)) notFound();
  const number = Number(n);
  const [details, syllabus, viewer, trialAudio, speakingSupport, sentencePractice] = await Promise.all([
    loadLearnerWeek(number),
    loadSyllabusContent(),
    getViewer(),
    loadPlayableTrialAudio(number),
    loadWeekSpeakingSupport(number),
    loadWeekSentencePractice(number),
  ]);
  const week = syllabus.weeks.find((item) => item.number === number);
  if (!week) notFound();
  const header = <header><p className="text-sm font-semibold text-indigo-700">Week {number}</p><h1 className="font-serif text-3xl font-semibold">{details?.title ?? week.theme}</h1>
    <p className="mt-4 rounded-xl bg-emerald-50 p-4"><strong>By the end of this week I can… </strong>{details?.canDo ?? week.cefr.canDo}</p></header>;
  if (!details) return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <RefreshCurrentWeekOnVisit enabled={viewer.signedIn} />
    <FocusWeekSection week={number} />
    {!viewer.signedIn && <RememberWeek week={number} />}
    {header}
    <section id="week-activities-unavailable" className="scroll-mt-20 rounded-xl border border-stone-200 p-5"><h2 tabIndex={-1} className="font-semibold">Week {number} activities are coming soon</h2><p className="mt-2 text-sm">This week&apos;s tasks aren&apos;t ready yet. You can practise in Practice.</p><Link className="mt-3 inline-block text-indigo-700 underline" href="/labs">Free practice</Link></section>
  </main>;
  if (viewer.user?.id) await ensureWeeklyPracticeSummary(number);
  const [practice, weekProgress, unlockedModels] = await Promise.all([
    loadWeekPracticeProgress(number),
    loadWeekProgress(viewer.user?.id ?? null, number),
    viewer.signedIn ? loadUnlockedModels(number) : Promise.resolve(null),
  ]);
  const weekGrammarIdeas = viewer.signedIn ? grammarWritingIdeas(sentencePractice, number) : [];
  const grammar = learnerGrammar(number);
  const cards = learnerVocabulary(number);
  const vocabulary = learnerVocabularyExercises(number);
  const readingText = details.readingSupport.support
    ? <ReadingText support={details.readingSupport.support} />
    : <p className="whitespace-pre-line leading-7">{details.reading.text}</p>;
  const listeningQuestions = <div id="listening-questions"><WeekInputTask week={number} skill="listening" questions={details.listening.questions} available={Boolean(trialAudio || details.listening.audioUrl)} signedIn={viewer.signedIn} /></div>;
  const listeningAfterQuestions = <ListeningAfterQuestions week={number} listening={details.listeningSupport} />;

  // One task is open at a time, walked in the order the finish buttons already
  // use: grammar → vocabulary → reading → listening → speaking → writing. The
  // ✓ marks come from the completion records and the saved attempts the loaders
  // already read; the task order and anchors live in `week-tasks.mjs`.
  const tasks: WeekTaskEntry[] = WEEK_TASKS.flatMap((task) => {
    if (task.key === 'grammar' && grammar) {
      return [{
        ...task,
        heading: 'Grammar practice',
        regionLabel: 'Grammar practice',
        done: weekProgress.grammar.done,

        itemsAnswered: weekProgress.grammar.itemsAnswered,

        progressMinutes: weekProgress.grammar.minutes,
        body: <GrammarPractice key={`${number}:${viewer.user?.id ?? 'guest'}`} grammar={grammar} week={number} signedIn={viewer.signedIn} userId={viewer.user?.id ?? null} progress={practice.grammar} sentencePractice={sentencePractice} hasVocabulary={Boolean(cards && vocabulary)} />,
      }];
    }
    if (task.key === 'vocabulary' && cards && vocabulary) {
      return [{
        ...task,
        heading: `Vocabulary: ${vocabulary.title}`,
        regionLabel: 'Vocabulary practice',
        done: weekProgress.vocabulary.done,

        itemsAnswered: weekProgress.vocabulary.itemsAnswered,

        progressMinutes: weekProgress.vocabulary.minutes,
        body: <VocabularyPractice cards={cards} exercises={vocabulary} signedIn={viewer.signedIn} progress={practice.vocabulary} sentencePractice={sentencePractice} />,
      }];
    }
    if (task.key === 'reading') {
      return [{
        ...task,
        heading: `Reading: ${details.reading.title}`,
        regionLabel: 'Reading practice',
        done: weekProgress.reading.done,

        itemsAnswered: weekProgress.reading.itemsAnswered,

        progressMinutes: weekProgress.reading.minutes,
        body: <ReadingPracticeLayout
          before={<ReadingBeforeQuestions support={details.readingSupport.support} />}
          text={readingText}
          questions={<div id="reading-questions"><WeekInputTask week={number} skill="reading" questions={details.reading.questions} available signedIn={viewer.signedIn} /></div>}
          after={<ReadingAfterQuestions week={number} reading={details.readingSupport} />}
        />,
      }];
    }
    if (task.key === 'listening') {
      return [{
        ...task,
        heading: `Listening: ${details.listening.title}`,
        regionLabel: 'Listening practice',
        done: weekProgress.listening.done,

        itemsAnswered: weekProgress.listening.itemsAnswered,

        progressMinutes: weekProgress.listening.minutes,
        body: <>
          <ListeningBeforePlayer support={details.listeningSupport.support} />
          {trialAudio ? <><p className="text-sm text-stone-600">Listen once for the main idea, then once more for the detail.</p><ListeningTrialPlayer trial={trialAudio}>{listeningQuestions}{listeningAfterQuestions}</ListeningTrialPlayer></> : <>{details.listening.audioUrl ? <audio controls src={details.listening.audioUrl} /> : <p>Audio coming soon.</p>}{listeningQuestions}{listeningAfterQuestions}</>}
        </>,
      }];
    }
    if (task.key === 'speaking') {
      return [{
        ...task,
        heading: 'Speaking',
        regionLabel: 'Speaking practice',
        done: weekProgress.speaking.done,

        itemsAnswered: weekProgress.speaking.itemsAnswered,

        progressMinutes: weekProgress.speaking.minutes,
        body: speakingSupport ? <WeekSpeakingSupport
          week={number} prompt={details.speakingPrompt} cueCard={details.cueCard} signedIn={viewer.signedIn}
          planNotes={speakingSupport.planNotes} usefulPhrases={speakingSupport.usefulPhrases}
          retryGoal={speakingSupport.retryGoal} initialNotes={speakingSupport.notes} available={speakingSupport.available} weekRecorded={speakingSupport.weekRecorded}
          first={speakingSupport.first} tries={speakingSupport.tries} firstVersions={speakingSupport.firstVersions}
          retryCount={speakingSupport.retryCount} checksUsed={speakingSupport.checksUsed} pending={speakingSupport.pending}
          recordings={speakingSupport.recordings} model={speakingSupport.model} speakingParts={details.speakingParts}
        /> : <div className="space-y-3"><p>{details.speakingPrompt}</p><p><strong>Cue card: </strong>{details.cueCard}</p><Link href={`/labs?week=${number}#speaking`} className={ACTION_BUTTON_CLASS}>Start speaking task</Link></div>,
      }];
    }
    return [{
      ...task,
      heading: 'Writing',
      regionLabel: 'Writing practice',
      done: weekProgress.writing.done,

      itemsAnswered: weekProgress.writing.itemsAnswered,

      progressMinutes: weekProgress.writing.minutes,
      body: <div className="space-y-4">
        <WritingLab
          unlockedModel={unlockedModels?.writing ?? null}
          grammarIdeas={weekGrammarIdeas}
          planFrame={details.writingPlanFrame}
          usefulLanguage={details.writingUsefulLanguage}
          linkers={details.writingLinkers}
          wordRange={details.writingWords}
          inputEmail={details.writingInputEmail}
          callForArticles={details.writingCallForArticles}
          lessonContext={{
            prompt: details.writingPrompt,
            mode: 'free',
            weekNumber: number,
            targetGrammar: plainGrammarTargetsForWeek(number, details.writingGrammar),
            targetVocabulary: targetWordsForWeek(details.writingFeaturedWords, details.writingLinkers),
          }}
        />
        {!viewer.signedIn && <Link href={`/labs?week=${number}#writing`} className={ACTION_BUTTON_CLASS}>Start writing task</Link>}
      </div>,
    }];
  });

  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <RefreshCurrentWeekOnVisit enabled={viewer.signedIn} />
    <FocusWeekSection week={number} />
    {!viewer.signedIn && <RememberWeek week={number} />}
    {header}
    <WeekTaskLayout tasks={tasks} />
  </main>;
}
