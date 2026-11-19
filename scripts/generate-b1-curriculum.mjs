import { mkdir, writeFile } from 'node:fs/promises';

const modules = [
  ['Identity, Lifestyle & Habits', ['Present simple vs. continuous', 'State verbs', 'Question forms'], ['Personality adjectives', 'Daily routines', 'Collocations with make/do'], 'Initiate, maintain, and close simple conversations about lifestyle and personal background.', 'Write a personal profile or informal email introducing yourself and describing daily habits.'],
  ['Past Experiences & Storytelling', ['Past simple', 'Used to', 'Past continuous'], ['Story connectors', 'Life events', 'Time expressions'], 'Tell a clear story about a past event, change, or memorable experience.', 'Write a connected narrative or email about a past experience.'],
  ['Travel, Places & Transport', ['Comparatives and superlatives', 'Articles', 'Direction language'], ['Travel arrangements', 'Transport', 'Places in a town'], 'Describe and compare places and solve routine travel problems.', 'Write a travel review or practical email requesting or giving information.'],
  ['Work, Study & Future Plans', ['Present perfect', 'Going to', 'Will and shall'], ['Work and study', 'Qualifications', 'Career collocations'], 'Discuss work or study and explain plans and intentions.', 'Write a formal or semi-formal message about study, work, or plans.'],
  ['Health, Wellbeing & Daily Choices', ['Quantifiers', 'Modal verbs for advice', 'Imperatives'], ['Health symptoms', 'Lifestyle choices', 'Advice phrases'], 'Explain a health issue, give advice, and make recommendations.', 'Write advice or describe a personal wellbeing routine.'],
  ['Relationships, Opinions & Conflict', ['Second conditional', 'Reported speech', 'Relative clauses'], ['Feelings', 'Relationship language', 'Opinion discourse'], 'Express and justify opinions, discuss hypothetical situations, and handle disagreement politely.', 'Write an opinion piece or personal account involving a disagreement.'],
  ['Media, Technology & Information', ['Passive voice', 'Question tags', 'Present perfect continuous'], ['Digital habits', 'News language', 'Technology collocations'], 'Discuss an online issue, present factual information, and respond to questions.', 'Summarise information or write an opinion message about media and technology.'],
  ['Culture, Environment & the Future', ['First and second conditional', 'Future continuous', 'Causative structures'], ['Environment', 'Culture', 'Sustainable choices'], 'Discuss local or global issues, predict outcomes, and suggest solutions.', 'Write a structured proposal about a cultural or environmental issue.'],
];
const stages = [
  { name: 'Input & Context', duration: 18 },
  { name: 'Grammar & Mechanics', duration: 18 },
  { name: 'Guided Fluency Drills', duration: 20 },
  { name: 'CEFR Can-Do Checkpoint', duration: 20 },
];
const skills = ['Listening', 'Reading', 'Spoken Interaction', 'Spoken Production', 'Writing'];
const suffix = { Listening: 'L', Reading: 'R', 'Spoken Interaction': 'SI', 'Spoken Production': 'SP', Writing: 'WR' };
const course = {
  course_id: 'cefr_b1_64h', level: 'B1', total_hours: 64,
  modules: modules.map(([title, grammar, vocabulary, interaction, writing], index) => {
    const n = index + 1;
    const objectives = skills.map((skill) => ({ id: `B1_M${n}_${suffix[skill]}`, skill, can_do: skill === 'Spoken Interaction' ? interaction : skill === 'Writing' ? writing : `${skill} can-do activities about ${title.toLowerCase()}.` }));
    const lessons = stages.flatMap((stage, stageIndex) => Array.from({ length: 8 }, (_, offset) => {
      const number = stageIndex * 8 + offset + 1;
      const selectedSkills = stageIndex === 0 ? ['Listening', 'Reading'] : stageIndex === 1 ? ['Reading', 'Spoken Production'] : stageIndex === 2 ? ['Spoken Interaction', 'Spoken Production'] : skills;
      return {
        lesson_number: number,
        course_hour: Math.ceil(number / 4),
        stage: stage.name,
        title: number === 32 ? `${title}: Can-Do Checkpoint` : `${title}: ${stage.name} ${offset + 1}`,
        duration_minutes: stage.duration,
        objective_ids: objectives.filter((objective) => selectedSkills.includes(objective.skill)).map((objective) => objective.id),
        grammar, vocabulary,
        type: stageIndex === 0 && offset === 0 ? 'dialogue' : stageIndex === 3 ? 'ai_roleplay' : 'guided_practice',
      };
    }));
    return {
      module_number: n, title, estimated_hours: 8, cefr_objectives: objectives,
      target_grammar: grammar, target_vocabulary: vocabulary, lessons,
      checkpoint_task: { type: 'ai_roleplay', prompt: `Complete an unscripted conversation about ${title.toLowerCase()}, using target grammar and vocabulary naturally.`, min_duration_seconds: 120, rubric_criteria: ['task_achievement', 'grammar_control', 'lexical_range', 'fluency'] },
    };
  }),
};
await mkdir('content/curriculum', { recursive: true });
await writeFile('content/curriculum/b1-64h.json', `${JSON.stringify(course, null, 2)}\n`);
console.log(`Generated ${course.modules.length} modules and ${course.modules.reduce((total, module) => total + module.lessons.length, 0)} lessons.`);
