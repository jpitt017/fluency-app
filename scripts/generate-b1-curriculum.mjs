import { mkdir, writeFile } from 'node:fs/promises';

const modules = [
  {
    title: 'Identity, Lifestyle & Habits',
    grammar: ['Present simple vs. continuous', 'State verbs', 'Question forms'],
    vocabulary: ['Personality adjectives', 'Daily routines', 'Collocations with make/do'],
    spoken: 'Initiate, maintain, and close simple face-to-face conversations about lifestyle and personal background.',
    writing: 'Write a personal profile or informal email introducing oneself and describing daily habits.',
  },
  {
    title: 'Past Experiences & Storytelling',
    grammar: ['Past simple', 'Used to', 'Past continuous'],
    vocabulary: ['Story connectors', 'Life events', 'Time expressions'],
    spoken: 'Tell a clear story about a past event, change, or memorable experience.',
    writing: 'Write a connected narrative or email about a past experience.',
  },
  {
    title: 'Travel, Places & Transport',
    grammar: ['Comparatives and superlatives', 'Articles', 'Direction language'],
    vocabulary: ['Travel arrangements', 'Transport', 'Places in a town'],
    spoken: 'Describe and compare places and solve routine travel problems.',
    writing: 'Write a travel review or practical email requesting or giving information.',
  },
  {
    title: 'Work, Study & Future Plans',
    grammar: ['Present perfect', 'Going to', 'Will and shall'],
    vocabulary: ['Work and study', 'Qualifications', 'Career collocations'],
    spoken: 'Discuss work or study and explain plans and intentions.',
    writing: 'Write a formal or semi-formal message about study, work, or plans.',
  },
  {
    title: 'Health, Wellbeing & Daily Choices',
    grammar: ['Quantifiers', 'Modal verbs for advice', 'Imperatives'],
    vocabulary: ['Health symptoms', 'Lifestyle choices', 'Advice phrases'],
    spoken: 'Explain a health issue, give advice, and make reasonable recommendations.',
    writing: 'Write advice or a description of a personal wellbeing routine.',
  },
  {
    title: 'Relationships, Opinions & Conflict',
    grammar: ['Second conditional', 'Reported speech', 'Relative clauses'],
    vocabulary: ['Feelings', 'Relationship language', 'Opinion discourse'],
    spoken: 'Express and justify opinions, discuss hypothetical situations, and handle disagreement politely.',
    writing: 'Write an opinion piece or personal account involving a disagreement.',
  },
  {
    title: 'Media, Technology & Information',
    grammar: ['Passive voice', 'Question tags', 'Present perfect continuous'],
    vocabulary: ['Digital habits', 'News language', 'Technology collocations'],
    spoken: 'Discuss an online issue, present factual information, and respond to questions.',
    writing: 'Summarise information or write a short opinion message about media and technology.',
  },
  {
    title: 'Culture, Environment & the Future',
    grammar: ['First and second conditional', 'Future continuous', 'Causative structures'],
    vocabulary: ['Environment', 'Culture', 'Sustainable choices'],
    spoken: 'Discuss local or global issues, predict outcomes, and suggest solutions.',
    writing: 'Write a structured proposal or persuasive text about a cultural or environmental issue.',
  },
];

const stages = [
  { name: 'Input & Context', startHour: 1, lessonStart: 1, lessonEnd: 8, durationMinutes: 18 },
  { name: 'Grammar & Mechanics', startHour: 3, lessonStart: 9, lessonEnd: 16, durationMinutes: 18 },
  { name: 'Guided Fluency Drills', startHour: 5, lessonStart: 17, lessonEnd: 24, durationMinutes: 20 },
  { name: 'CEFR Can-Do Checkpoint', startHour: 7, lessonStart: 25, lessonEnd: 32, durationMinutes: 20 },
];

const curriculum = {
  course_id: 'cefr_b1_64h',
  level: 'B1',
  total_hours: 64,
  modules: modules.map((module, index) => {
    const moduleNumber = index + 1;
    const lessons = stages.flatMap((stage) =>
      Array.from({ length: 8 }, (_, offset) => {
        const lessonNumber = stage.lessonStart + offset;
        const checkpoint = stage.name === 'CEFR Can-Do Checkpoint';
        return {
          lesson_number: lessonNumber,
          course_hour: stage.startHour + Math.floor(offset / 4),
          stage: stage.name,
          title: checkpoint
            ? `Module ${moduleNumber} Can-Do Checkpoint ${offset + 1}`
            : `${module.title}: Practice ${lessonNumber}`,
          duration_minutes: stage.durationMinutes,
          objective_ids: [`B1_M${moduleNumber}_SI`, `B1_M${moduleNumber}_SP`],
          grammar: module.grammar,
          vocabulary: module.vocabulary,
          type: checkpoint ? 'ai_roleplay' : offset % 4 === 0 ? 'dialogue' : 'guided_practice',
        };
      }),
    );

    return {
      module_number: moduleNumber,
      title: module.title,
      estimated_hours: 8,
      cefr_objectives: [
        { id: `B1_M${moduleNumber}_SI`, skill: 'Spoken Interaction', can_do: module.spoken },
        { id: `B1_M${moduleNumber}_WR`, skill: 'Writing', can_do: module.writing },
        { id: `B1_M${moduleNumber}_SP`, skill: 'Spoken Production', can_do: `Prepare and deliver a connected spoken account about ${module.title.toLowerCamelCase()}.` },
      ],
      target_grammar: module.grammar,
      target_vocabulary: module.vocabulary,
      lessons,
      checkpoint_task: {
        type: 'ai_roleplay',
        prompt: `Complete an unscripted conversation about ${module.title.toLowerCamelCase()}, using the target grammar and vocabulary naturally.`,
        min_duration_seconds: 120,
        rubric_criteria: ['task_achievement', 'grammar_control', 'lexical_range', 'fluency'],
      },
    };
  }),
};

String.prototype.toLowerCamelCase = function () {
  return String(this).replace(/\b\w/g, (letter) => letter.toLowerCase());
};

await mkdir('content/curriculum', { recursive: true });
await writeFile('content/curriculum/b1-64h.json', `${JSON.stringify(curriculum, null, 2)}\n`);
console.log(`Generated ${curriculum.modules.length} modules and ${curriculum.modules.reduce((sum, module) => sum + module.lessons.length, 0)} lessons.`);
