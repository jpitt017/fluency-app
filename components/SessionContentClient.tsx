'use client';

import { useState, useEffect } from 'react';
import BlockPracticeDrawer from './BlockPracticeDrawer';

interface Block {
  block_number: number;
  title: string;
  content: string;
  start_minute: number;
  end_minute: number;
}

interface SessionContentClientProps {
  session: {
    id: string;
    session_number: number;
    title: string;
  };
  blocks: Block[];
}

const jargonDictionary: Record<string, string> = {
  litotes: "Understatement (saying 'not bad' when you mean 'fantastic')",
  catenation: 'Linking words together smoothly so speech flows without pauses',
  'nuclear stress': 'Putting extra emphasis on the single most important word in a sentence',
  chunking: 'Breaking a long sentence into smaller, natural thought groups with brief pauses',
  'intrusive /r/': "Adding a smooth 'r' sound between adjacent vowels (e.g., 'law and order')",
};

function getSkillBadge(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('listening')) {
    return { label: 'Listening', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300' };
  }
  if (lower.includes('reading')) {
    return { label: 'Reading', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300' };
  }
  if (lower.includes('speaking')) {
    return { label: 'Speaking', bg: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300' };
  }
  if (lower.includes('writing')) {
    return { label: 'Writing', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300' };
  }
  return { label: 'Practice', bg: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-300' };
}

function parseBlockContent(rawContent: string, simpleMode: boolean) {
  let cleanContent = rawContent;
  let scriptText = '';

  const scriptMatch = cleanContent.match(/\[Script: "(.*?)"\]/);
  if (scriptMatch) {
    scriptText = scriptMatch[1];
    cleanContent = cleanContent.replace(scriptMatch[0], '').trim();
  }

  let quizData = null;
  const quizMatch = cleanContent.match(/\[Quiz: (.*?)\]/);
  if (quizMatch) {
    cleanContent = cleanContent.replace(quizMatch[0], '').trim();
    const parts = quizMatch[1].split(/\b[A-C]\)\s+/);
    if (parts.length >= 4) {
      quizData = {
        question: parts[0].trim(),
        options: [parts[1].trim(), parts[2].trim(), parts[3].trim()],
        correctIndex: 1,
      };
    }
  }

  if (simpleMode) {
    const matchedKey = Object.keys(jargonDictionary).find((k) =>
      cleanContent.toLowerCase().includes(k)
    );
    if (matchedKey) {
      cleanContent = `${cleanContent} [Plain English: "${matchedKey}" means ${jargonDictionary[matchedKey]}]`;
    }
  }

  return { cleanContent, scriptText, quizData };
}

export default function SessionContentClient({ session, blocks }: SessionContentClientProps) {
  const [simpleMode, setSimpleMode] = useState(false);
  const [slowAudio, setSlowAudio] = useState(true);
  const [activePracticeBlock, setActivePracticeBlock] = useState<number | null>(null);
  const [completedBlocks, setCompletedBlocks] = useState<Record<number, boolean>>({});
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`session_${session.id}_completed`);
    if (saved) setCompletedBlocks(JSON.parse(saved));
    const savedConfidence = localStorage.getItem(`session_${session.id}_confidence`);
    if (savedConfidence) setConfidenceScore(Number(savedConfidence));
  }, [session.id]);

  const toggleBlockCompletion = (blockNum: number) => {
    const updated = { ...completedBlocks, [blockNum]: !completedBlocks[blockNum] };
    setCompletedBlocks(updated);
    localStorage.setItem(`session_${session.id}_completed`, JSON.stringify(updated));
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = slowAudio ? 0.82 : 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const completedCount = Object.values(completedBlocks).filter(Boolean).length;
  const progressPercent = blocks.length ? Math.round((completedCount / blocks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
              Interactive Learning Dashboard
            </h3>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Session Progress: {completedCount} of {blocks.length} blocks ({progressPercent}%)
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSlowAudio(!slowAudio)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              {slowAudio ? 'RP Audio: 0.82x' : 'RP Audio: 1.0x'}
            </button>
            <button
              onClick={() => setSimpleMode(!simpleMode)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl ${
                simpleMode ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 border'
              }`}
            >
              {simpleMode ? 'Jargon: Simple ON' : 'Enable Simple Jargon'}
            </button>
          </div>
        </div>
        <div className="w-full bg-indigo-200 dark:bg-indigo-950 rounded-full h-2 overflow-hidden">
          <div className="bg-indigo-600 h-2 transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {blocks?.map((block) => {
        const isPracticing = activePracticeBlock === block.block_number;
        const isCompleted = completedBlocks[block.block_number];
        const skill = getSkillBadge(block.title);
        const { cleanContent, scriptText, quizData } = parseBlockContent(block.content, simpleMode);
        const targetDrillPhrase =
          skill.label === 'Speaking'
            ? 'When adjusting to a new culture, clarity and active listening build genuine rapport.'
            : cleanContent.slice(0, 80);

        return (
          <div
            key={block.block_number}
            className={`bg-white dark:bg-zinc-900 p-6 rounded-2xl border transition space-y-4 ${
              isCompleted ? 'border-emerald-300 dark:border-emerald-900/50' : 'border-zinc-200 dark:border-zinc-800 shadow-sm'
            }`}
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => toggleBlockCompletion(block.block_number)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border ${
                      isCompleted ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600'
                    }`}
                  >
                    {isCompleted ? 'Completed' : 'Mark Done'}
                  </button>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${skill.bg}`}>
                    {skill.label}
                  </span>
                  <span className="text-xs font-mono uppercase px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded">
                    Block {block.block_number}
                  </span>
                </div>
                <h3 className="text-md font-semibold text-zinc-900 dark:text-zinc-100">{block.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{cleanContent}</p>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                {skill.label === 'Listening' && scriptText && (
                  <button
                    onClick={() => speakText(scriptText)}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl"
                  >
                    Play Audio
                  </button>
                )}
                {skill.label === 'Speaking' && (
                  <button
                    onClick={() => speakText(targetDrillPhrase)}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl"
                  >
                    Listen Model
                  </button>
                )}
                <button
                  onClick={() => setActivePracticeBlock(isPracticing ? null : block.block_number)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isPracticing ? 'Close Lab' : 'Open Lab'}
                </button>
              </div>
            </div>

            {isPracticing && (
              <BlockPracticeDrawer
                blockNumber={block.block_number}
                skillLabel={skill.label}
                scriptText={scriptText}
                quizData={quizData}
                targetDrillPhrase={targetDrillPhrase}
                slowAudio={slowAudio}
                onSpeak={speakText}
              />
            )}
          </div>
        );
      })}

      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3 text-center">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Rate your confidence with this session's British RP focus
        </h4>
        <div className="flex items-center justify-center gap-3">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => {
                setConfidenceScore(star);
                localStorage.setItem(`session_${session.id}_confidence`, String(star));
              }}
              className={`w-10 h-10 rounded-xl text-sm font-bold border ${
                confidenceScore === star
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200'
              }`}
            >
              {star}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}