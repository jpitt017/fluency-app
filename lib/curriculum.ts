export type CefrSkill = 'Listening' | 'Reading' | 'Spoken Interaction' | 'Spoken Production' | 'Writing';
export type CurriculumStage = 'Input & Context' | 'Grammar & Mechanics' | 'Guided Fluency Drills' | 'CEFR Can-Do Checkpoint';

export interface CefrObjective {
  id: string;
  skill: CefrSkill;
  can_do: string;
}

export interface CurriculumLesson {
  lesson_number: number;
  course_hour: number;
  stage: CurriculumStage;
  title: string;
  duration_minutes: number;
  objective_ids: string[];
  grammar: string[];
  vocabulary: string[];
  type: 'dialogue' | 'guided_practice' | 'ai_roleplay';
}

export interface CurriculumModule {
  module_number: number;
  title: string;
  estimated_hours: number;
  cefr_objectives: CefrObjective[];
  target_grammar: string[];
  target_vocabulary: string[];
  lessons: CurriculumLesson[];
  checkpoint_task: {
    type: 'ai_roleplay';
    prompt: string;
    min_duration_seconds: number;
    rubric_criteria: string[];
  };
}

export interface B1Curriculum {
  course_id: string;
  level: 'B1';
  total_hours: number;
  modules: CurriculumModule[];
}

const moduleSeeds = [
  { title: 'Identity, Lifestyle & Habits', grammar: ['Present simple vs. continuous', 'State verbs', 'Question forms'], vocabulary: ['Personality adjectives', 'Daily routines', 'Collocations with make/do'], interaction: 'Initiate, maintain, and close simple conversations about lifestyle and personal background.', writing: 'Write a personal profile or informal email introducing yourself and describing daily habits.' },
  { title: 'Past Experiences & Storytelling', grammar: ['Past simple', 'Used to', 'Past continuous'], vocabulary: ['Story connectors', 'Life events', 'Time expressions'], interaction: 'Tell a clear story about a past event, change, or memorable experience.', writing: 'Write a connected narrative or email about a past experience.' },
  { title: 'Travel, Places & Transport', grammar: ['Comparatives and superlatives', 'Articles', 'Direction language'], vocabulary: ['Travel arrangements', 'Transport', 'Places in a town'], interaction: 'Describe and compare places and solve routine travel problems.', writing: 'Write a travel review or practical email requesting or giving information.' },
  { title: 'Work, Study & Future Plans', grammar: ['Present perfect', 'Going to', 'Will and shall'], vocabulary: ['Work and study', 'Qualifications', 'Career collocations'], interaction: 'Discuss work or study and explain plans and intentions.', writing: 'Write a formal or semi-formal message about study, work, or plans.' },
  { title: 'Health, Wellbeing & Daily Choices', grammar: ['Quantifiers', 'Modal verbs for advice', 'Imperatives'], vocabulary: ['Health symptoms', 'Lifestyle choices', 'Advice phrases'], interaction: 'Explain a health issue, give advice, and make reasonable recommendations.', writing: 'Write advice or a description of a personal wellbeing routine.' },
  { title: 'Relationships, Opinions & Conflict', grammar: ['Second conditional', 'Reported speech', 'Relative clauses'], vocabulary: ['Feelings', 'Relationship language', 'Opinion discourse'], interaction: 'Express and justify opinions, discuss hypothetical situations, and handle disagreement politely.', writing: 'Write an opinion piece or personal account involving a disagreement.' },
  { title: 'Media, Technology & Information', grammar: ['Passive voice', 'Question tags', 'Present perfect continuous'], vocabulary: ['Digital habits', 'News language', 'Technology collocations'], interaction: 'Discuss an online issue, present factual information, and respond to questions.', writing: 'Summarise information or write a short opinion message about media and technology.' },
  { title: 'Culture, Environment & the Future', grammar: ['First and second conditional', 'Future continuous', 'Causative structures'], vocabulary: ['Environment', 'Culture', 'Sustainable choices'], interaction: 'Discuss local or global issues, predict outcomes, and suggest solutions.', writing: 'Write a structured proposal or persuasive text about a cultural or environmental issue.' },
] as const;

export const curriculumStages: CurriculumStage[] = [
  'Input & Context', 'Grammar & Mechanics', 'Guided Fluency Drills', 'CEFR Can-Do Checkpoint',
];

const skills: CefrSkill[] = ['Listening', 'Reading', 'Spoken Interaction', 'Spoken Production', 'Writing'];

export const b1Curriculum: B1Curriculum = {
  course_id: 'cefr_b1_64h',
  level: 'B1',
  total_hours: 64,
  modules: moduleSeeds.map((seed, index) => {
    const moduleNumber = index + 1;
    const objectives: CefrObjective[] = skills.map((skill) => ({
      id: `B1_M${moduleNumber}_${{ Listening: 'L', Reading: 'R', 'Spoken Interaction': 'SI', 'Spoken Production': 'SP', Writing: 'WR' }[skill]}`,
      skill,
      can_do: skill === 'Spoken Interaction' ? seed.interaction
        : skill === 'Writing' ? seed.writing
          : skill === 'Listening' ? `Understand the main points and relevant details in clear speech about ${seed.title.toLowerCase()}.`
            : skill === 'Reading' ? `Understand short texts and identify useful information about ${seed.title.toLowerCase()}.`
              : `Give a connected spoken account related to ${seed.title.toLowerCase()}.`,
    }));

    const lessons = curriculumStages.flatMap((stage, stageIndex) =>
      Array.from({ length: 8 }, (_, offset) => {
        const lessonNumber = stageIndex * 8 + offset + 1;
        const objectiveSkills: CefrSkill[] = stageIndex === 0 ? ['Listening', 'Reading']
          : stageIndex === 1 ? ['Reading', 'Spoken Production']
            : stageIndex === 2 ? ['Spoken Interaction', 'Spoken Production']
              : skills;
        return {
          lesson_number: lessonNumber,
          course_hour: Math.ceil(lessonNumber / 4),
          stage,
          title: stageIndex === 3 && offset === 7 ? `${seed.title}: Can-Do Checkpoint` : `${seed.title}: ${stage} ${offset + 1}`,
          duration_minutes: stageIndex < 2 ? 18 : 20,
          objective_ids: objectives.filter((objective) => objectiveSkills.includes(objective.skill)).map((objective) => objective.id),
          grammar: [...seed.grammar],
          vocabulary: [...seed.vocabulary],
          type: stageIndex === 0 && offset === 0 ? 'dialogue' as const : stageIndex === 3 ? 'ai_roleplay' as const : 'guided_practice' as const,
        };
      }),
    );

    return {
      module_number: moduleNumber,
      title: seed.title,
      estimated_hours: 8,
      cefr_objectives: objectives,
      target_grammar: [...seed.grammar],
      target_vocabulary: [...seed.vocabulary],
      lessons,
      checkpoint_task: {
        type: 'ai_roleplay',
        prompt: `Complete an unscripted conversation about ${seed.title.toLowerCase()}. Use the target grammar and vocabulary naturally, ask and answer follow-up questions, and develop your ideas.`,
        min_duration_seconds: 120,
        rubric_criteria: ['task_achievement', 'grammar_control', 'lexical_range', 'fluency'],
      },
    };
  }),
};

export function getLessonActivity(stage: CurriculumStage, title: string) {
  switch (stage) {
    case 'Input & Context':
      return { instruction: `Read or listen to a short dialogue about ${title.toLowerCase()}. Identify the main idea, then practise the key expressions with the flashcards.`, task: 'Summarise the dialogue in your own words and note three useful expressions.' };
    case 'Grammar & Mechanics':
      return { instruction: 'Review the target language, then build your own examples. Say each sentence aloud and check word order and form.', task: 'Write two accurate examples using the target grammar.' };
    case 'Guided Fluency Drills':
      return { instruction: 'Prepare briefly, then speak without stopping. Reuse the target vocabulary and grammar while developing your answer.', task: 'Speak for 45 seconds about a relevant personal experience or opinion.' };
    case 'CEFR Can-Do Checkpoint':
      return { instruction: 'Complete an unscripted response. Your transcript will be assessed against task achievement, grammar control, lexical range, and fluency.', task: 'Submit at least two minutes of spoken content as a transcript. Retry with a targeted review deck if needed.' };
  }
}
