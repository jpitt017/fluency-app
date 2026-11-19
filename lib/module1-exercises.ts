export type Question = { prompt: string; options: string[]; answer: string; explanation?: string };

type LessonBase = { lesson: number; title: string };
export type ModuleOneActivity =
  | (LessonBase & { type: 'reading_check'; passage: string; questions: Question[] })
  | (LessonBase & { type: 'notice'; examples: { phrase: string; answer: 'routine' | 'temporary' }[] })
  | (LessonBase & { type: 'match'; pairs: { term: string; definition: string }[] })
  | (LessonBase & { type: 'sort'; items: { phrase: string; answer: 'make' | 'do' }[] })
  | (LessonBase & { type: 'listening'; script: string; questions: Question[] })
  | (LessonBase & { type: 'gap_fill'; items: { prompt: string; answer: string; explanation: string }[] })
  | (LessonBase & { type: 'error_correction'; items: { sentence: string; answer: string; isCorrect: boolean }[] })
  | (LessonBase & { type: 'reorder'; items: { tiles: string[]; answer: string }[] })
  | (LessonBase & { type: 'transform'; items: { prompt: string; answer: string; keyword: string }[] })
  | (LessonBase & { type: 'timed_speaking'; prompt: string; durationSeconds: number; targets: string[] })
  | (LessonBase & { type: 'roleplay'; opening: string; followUps: string[] })
  | (LessonBase & { type: 'checkpoint_reading'; advert: string; voicemail: string; questions: Question[] })
  | (LessonBase & { type: 'checkpoint_speaking'; skill: 'Spoken Interaction' | 'Spoken Production'; prompt: string; followUps: string[]; durationSeconds: number })
  | (LessonBase & { type: 'checkpoint_writing'; prompt: string; minWords: number; maxWords: number });

const passage = "Hi, I'm Callum, and I live in a flat in Bristol. Normally, I work as a graphic designer, so I spend most mornings at my desk. I'm quite reliable and organised, though my flatmate says I'm a bit stubborn when I'm tired! Usually, I make breakfast at half past seven and walk to the studio. However, this week I'm working from home because the builders are renovating our office. I don't mind—it means I can do the laundry during my lunch break and I'm saving money on the bus.";

export const moduleOneActivities: Record<number, ModuleOneActivity> = {
  1: { lesson: 1, title: 'A Day in Callum’s Life', type: 'reading_check', passage, questions: [
    { prompt: 'Callum works from home every week.', options: ['True', 'False', 'Not Given'], answer: 'False', explanation: 'He says he is working from home this week because the office is being renovated.' },
    { prompt: 'Callum thinks he is unreliable.', options: ['True', 'False', 'Not Given'], answer: 'False', explanation: 'He describes himself as reliable and organised.' },
    { prompt: 'He normally walks to his workplace.', options: ['True', 'False', 'Not Given'], answer: 'True' },
    { prompt: 'He enjoys doing housework in the evening.', options: ['True', 'False', 'Not Given'], answer: 'Not Given', explanation: 'The passage says he does laundry at lunchtime, not whether he enjoys evening chores.' },
  ] },
  2: { lesson: 2, title: 'Notice the Tense', type: 'notice', examples: [
    { phrase: 'I work as a graphic designer.', answer: 'routine' }, { phrase: 'I spend most mornings at my desk.', answer: 'routine' },
    { phrase: 'I make breakfast at half past seven.', answer: 'routine' }, { phrase: 'This week I’m working from home.', answer: 'temporary' },
    { phrase: 'The builders are renovating our office.', answer: 'temporary' }, { phrase: 'I’m saving money on the bus.', answer: 'temporary' },
  ] },
  3: { lesson: 3, title: 'Personality Adjectives in Context', type: 'match', pairs: [
    { term: 'easy-going', definition: 'relaxed and not easily upset' }, { term: 'ambitious', definition: 'determined to be successful' },
    { term: 'sociable', definition: 'enjoys spending time with other people' }, { term: 'sensible', definition: 'has good judgement and practical sense' },
    { term: 'moody', definition: 'often becomes unhappy or annoyed' },
  ] },
  4: { lesson: 4, title: 'Choose the Right Adjective', type: 'gap_fill', items: [
    { prompt: 'A person who enjoys meeting people is ____.', answer: 'sociable', explanation: 'Sociable describes someone who enjoys other people’s company.' },
    { prompt: 'Someone with practical judgement is ____.', answer: 'sensible', explanation: 'Sensible means showing good judgement.' },
    { prompt: 'A person determined to succeed is ____.', answer: 'ambitious', explanation: 'Ambitious describes someone with a strong wish to achieve.' },
  ] },
  5: { lesson: 5, title: 'Make or Do? Sort the Collocations', type: 'sort', items: [
    ...['an effort', 'a decision', 'a mistake', 'progress', 'a fuss', 'arrangements'].map((phrase) => ({ phrase: `____ ${phrase}`, answer: 'make' as const })),
    ...['the washing-up', 'your best', 'a favour', 'research', 'the shopping', 'exercise'].map((phrase) => ({ phrase: `____ ${phrase}`, answer: 'do' as const })),
  ] },
  6: { lesson: 6, title: 'Make/Do Collocation Check', type: 'gap_fill', items: [
    { prompt: 'Please ____ your best in the interview.', answer: 'do', explanation: 'The collocation is “do your best”.' },
    { prompt: 'We need to ____ a decision today.', answer: 'make', explanation: 'The collocation is “make a decision”.' },
    { prompt: 'I usually ____ the shopping on Saturday.', answer: 'do', explanation: 'The collocation is “do the shopping”.' },
    { prompt: 'She wants to ____ progress with her English.', answer: 'make', explanation: 'The collocation is “make progress”.' },
  ] },
  7: { lesson: 7, title: 'Tea-Break Conversation', type: 'listening', script: 'Maya: How often do you go to that new gym near the station, Leo? Leo: Normally three times a week, after I finish work. Why are you asking? Are you thinking of joining? Maya: Yes, I need to do more exercise. Who do you usually go with?', questions: [
    { prompt: 'How often does Leo normally go to the gym?', options: ['Once a week', 'Three times a week', 'Every day'], answer: 'Three times a week' },
    { prompt: 'What is Maya thinking about doing?', options: ['Changing jobs', 'Joining the gym', 'Moving house'], answer: 'Joining the gym' },
    { prompt: 'What does Maya ask Leo about?', options: ['Who he goes with', 'What he eats', 'Where he works'], answer: 'Who he goes with' },
  ] },
  8: { lesson: 8, title: 'Listening for Routine and Intention', type: 'listening', script: 'Maya: How often do you go to that new gym near the station, Leo? Leo: Normally three times a week, after I finish work. Why are you asking? Are you thinking of joining? Maya: Yes, I need to do more exercise. Who do you usually go with?', questions: [
    { prompt: 'Which word signals Leo’s usual routine?', options: ['Normally', 'This week', 'At the moment'], answer: 'Normally' },
    { prompt: 'Which question asks about a current intention?', options: ['How often do you go?', 'Are you thinking of joining?', 'Who do you usually go with?'], answer: 'Are you thinking of joining?' },
  ] },
  9: { lesson: 9, title: 'Present Simple or Continuous?', type: 'gap_fill', items: [
    { prompt: 'Maya usually ____ (take) the train.', answer: 'takes', explanation: 'Use present simple for a routine.' },
    { prompt: 'Today she ____ (drive) because of the rail strike.', answer: 'is driving', explanation: 'Use present continuous for a temporary situation.' },
    { prompt: 'I ____ (try) to cut down on coffee at the moment.', answer: 'am trying', explanation: '“At the moment” describes a current, temporary change.' },
  ] },
  10: { lesson: 10, title: 'Routines and Temporary Changes', type: 'gap_fill', items: [
    { prompt: 'Look at Sam—why ____ he ____ (wear) a suit?', answer: 'is wearing', explanation: 'Ask about what is happening now: “is he wearing”.' },
    { prompt: 'He never ____ (wear) smart clothes.', answer: 'wears', explanation: '“Never” describes a usual habit.' },
    { prompt: 'This month, I ____ (stay) with my sister.', answer: 'am staying', explanation: 'A temporary arrangement uses present continuous.' },
  ] },
  11: { lesson: 11, title: 'Choose the Natural Tense', type: 'gap_fill', items: [
    { prompt: 'My flatmate usually ____ (make) dinner, but tonight I ____ (cook).', answer: 'makes; am cooking', explanation: 'Use simple for the usual routine and continuous for tonight’s arrangement.' },
    { prompt: 'We ____ (look) for a new flat at the moment.', answer: 'are looking', explanation: '“At the moment” signals a temporary activity.' },
  ] },
  12: { lesson: 12, title: 'State Verbs: Spot and Correct', type: 'error_correction', items: [
    { sentence: 'I’m not understanding what you mean.', answer: 'I don’t understand what you mean.', isCorrect: false },
    { sentence: 'This flat is belonging to my aunt.', answer: 'This flat belongs to my aunt.', isCorrect: false },
    { sentence: 'She’s having a shower right now.', answer: 'Correct as written.', isCorrect: true },
    { sentence: 'She’s having two brothers and a sister.', answer: 'She has two brothers and a sister.', isCorrect: false },
  ] },
  13: { lesson: 13, title: 'Stative or Dynamic?', type: 'error_correction', items: [
    { sentence: 'I prefer tea to coffee.', answer: 'Correct as written.', isCorrect: true },
    { sentence: 'I’m knowing my new neighbours.', answer: 'I know my new neighbours.', isCorrect: false },
    { sentence: 'We’re having lunch at the moment.', answer: 'Correct as written.', isCorrect: true },
    { sentence: 'This room is seeming quite small.', answer: 'This room seems quite small.', isCorrect: false },
  ] },
  14: { lesson: 14, title: 'Build Questions About Routines', type: 'reorder', items: [
    { tiles: ['you', 'do', 'how', 'relax', 'at', 'weekends'], answer: 'How do you relax at weekends?' },
    { tiles: ['what', 'time', 'does', 'she', 'get', 'up'], answer: 'What time does she get up?' },
  ] },
  15: { lesson: 15, title: 'Subject and Object Questions', type: 'reorder', items: [
    { tiles: ['who', 'is', 'making', 'that', 'noise'], answer: 'Who is making that noise?' },
    { tiles: ['what', 'kind', 'of', 'music', 'does', 'she', 'like'], answer: 'What kind of music does she like?' },
  ] },
  16: { lesson: 16, title: 'Question Word Order', type: 'reorder', items: [
    { tiles: ['how', 'long', 'does', 'it', 'take', 'to', 'get', 'ready'], answer: 'How long does it take to get ready?' },
    { tiles: ['who', 'usually', 'does', 'the', 'washing-up'], answer: 'Who usually does the washing-up?' },
  ] },
  17: { lesson: 17, title: 'Transform with USUALLY', type: 'transform', items: [
    { prompt: 'It’s my habit to wake up at 6:30 am.', keyword: 'USUALLY', answer: 'I usually wake up at 6:30 am.' },
    { prompt: 'It is normal for him to walk to work.', keyword: 'USUALLY', answer: 'He usually walks to work.' },
  ] },
  18: { lesson: 18, title: 'Transform with THINK', type: 'transform', items: [
    { prompt: 'What is your opinion of your new flatmate?', keyword: 'THINK', answer: 'What do you think of your new flatmate?' },
    { prompt: 'What is her opinion of the new gym?', keyword: 'THINK', answer: 'What does she think of the new gym?' },
  ] },
  19: { lesson: 19, title: 'Use AT THE MOMENT', type: 'transform', items: [
    { prompt: 'He is currently learning how to cook.', keyword: 'AT THE MOMENT', answer: 'He is learning how to cook at the moment.' },
    { prompt: 'I am currently looking for a flat.', keyword: 'AT THE MOMENT', answer: 'I am looking for a flat at the moment.' },
  ] },
  20: { lesson: 20, title: '45-Second Speaking: Weekday Routine', type: 'timed_speaking', prompt: 'Describe your typical weekday routine, then explain two things you are doing differently this month.', durationSeconds: 45, targets: ['Use present simple for routines', 'Use present continuous for temporary changes'] },
  21: { lesson: 21, title: '45-Second Speaking: A Close Friend', type: 'timed_speaking', prompt: 'Describe a close friend using at least three personality adjectives and explain why you get on well.', durationSeconds: 45, targets: ['Use three personality adjectives', 'Give reasons and examples'] },
  22: { lesson: 22, title: '45-Second Speaking: Household Chores', type: 'timed_speaking', prompt: 'Talk about household chores: which do you do yourself and which do you try to avoid?', durationSeconds: 45, targets: ['do the washing-up', 'do the ironing', 'make the bed'] },
  23: { lesson: 23, title: 'Flatmate Q&A Roleplay', type: 'roleplay', opening: 'You have just met a prospective flatmate. Answer the questions in full sentences, then ask two questions of your own.', followUps: ['What is your usual weekday routine?', 'How do you like to spend weekends?', 'How tidy are you at home?', 'What are you doing differently this month?'] },
  24: { lesson: 24, title: 'Keep the Conversation Going', type: 'roleplay', opening: 'Continue a friendly conversation about routines and lifestyle. Answer each question and ask at least two follow-up questions.', followUps: ['How often do you cook at home?', 'Who do you usually spend time with?', 'What new habit are you trying to build?', 'What do you enjoy doing after work?'] },
  25: { lesson: 25, title: 'Reading and Listening: Flatshare Checkpoint', type: 'checkpoint_reading', advert: 'A friendly, organised professional is looking for a considerate flatmate to share a two-bedroom flat in Bristol. The room is furnished and available from the first of next month. The current tenant, Sophie, works at a local design studio and usually leaves home at eight. She enjoys cooking together twice a week, but often works late on Tuesdays. At weekends she likes seeing friends or walking in the park. The flat is quiet after ten on weekdays. Bills are shared equally, and everyone takes a turn cleaning the kitchen. The new flatmate should be sociable but also happy to have quiet evenings. No smoking, please. The flat is a ten-minute walk from the station and close to a supermarket and gym.', voicemail: 'Hello, Sophie, it’s Alex calling about the room. I’m a nurse and I normally work four long shifts each week, so my days off change. I’m quite easy-going and sensible about sharing chores. I usually cook at home, although I’m trying to learn a few vegetarian recipes at the moment. I’m sociable, but I also need a quiet place to sleep after night shifts. I could visit on Thursday afternoon. Could you tell me whether overnight guests are allowed and how you organise the cleaning?', questions: [
    { prompt: 'When is the room available?', options: ['Immediately', 'From the first of next month', 'In three months'], answer: 'From the first of next month' },
    { prompt: 'When does Sophie often work late?', options: ['Monday', 'Tuesday', 'Thursday'], answer: 'Tuesday' },
    { prompt: 'How often does Sophie enjoy cooking together?', options: ['Every day', 'Twice a week', 'Once a month'], answer: 'Twice a week' },
    { prompt: 'Why do Alex’s days off change?', options: ['Alex works shifts', 'Alex studies at college', 'Alex travels for work'], answer: 'Alex works shifts' },
    { prompt: 'What is Alex currently trying to learn?', options: ['Vegetarian recipes', 'The bus timetable', 'Graphic design'], answer: 'Vegetarian recipes' },
    { prompt: 'Which possible compatibility issue should they discuss?', options: ['Quiet after 10 and sleeping after night shifts', 'Whether the flat has a garden', 'Whether Sophie likes the gym'], answer: 'Quiet after 10 and sleeping after night shifts' },
  ] },
  26: { lesson: 26, title: 'Checkpoint Review: Flatshare Fit', type: 'checkpoint_reading', advert: 'A friendly, organised professional is looking for a considerate flatmate to share a two-bedroom flat in Bristol. The room is furnished and available from the first of next month. The current tenant, Sophie, works at a local design studio and usually leaves home at eight. She enjoys cooking together twice a week, but often works late on Tuesdays. At weekends she likes seeing friends or walking in the park. The flat is quiet after ten on weekdays. Bills are shared equally, and everyone takes a turn cleaning the kitchen. The new flatmate should be sociable but also happy to have quiet evenings. No smoking, please. The flat is a ten-minute walk from the station and close to a supermarket and gym.', voicemail: 'Hello, Sophie, it’s Alex calling about the room. I’m a nurse and I normally work four long shifts each week, so my days off change. I’m quite easy-going and sensible about sharing chores. I usually cook at home, although I’m trying to learn a few vegetarian recipes at the moment. I’m sociable, but I also need a quiet place to sleep after night shifts. I could visit on Thursday afternoon. Could you tell me whether overnight guests are allowed and how you organise the cleaning?', questions: [
    { prompt: 'How long is the walk to the station?', options: ['Ten minutes', 'Twenty minutes', 'Half an hour'], answer: 'Ten minutes' },
    { prompt: 'How are the bills shared?', options: ['By room size', 'Equally', 'Sophie pays them all'], answer: 'Equally' },
    { prompt: 'When could Alex visit?', options: ['Tuesday morning', 'Thursday afternoon', 'Saturday evening'], answer: 'Thursday afternoon' },
    { prompt: 'What kind of evenings does the new flatmate need to accept?', options: ['Quiet evenings', 'Parties every night', 'No evenings at home'], answer: 'Quiet evenings' },
    { prompt: 'What does Alex ask about?', options: ['Guests and cleaning', 'The gym membership', 'Sophie’s work'], answer: 'Guests and cleaning' },
    { prompt: 'What is a sensible topic for their interview?', options: ['How night shifts fit with quiet hours', 'Which design software Sophie uses', 'What Alex’s school marks were'], answer: 'How night shifts fit with quiet hours' },
  ] },
  27: { lesson: 27, title: 'Spoken Interaction Checkpoint', type: 'checkpoint_speaking', skill: 'Spoken Interaction', prompt: 'Take part in a simulated flatmate interview. Explain your daily schedule, tidiness, and weekend habits. Ask at least two questions about the flat rules.', followUps: ['What is your usual daily schedule?', 'How do you share household chores?', 'What do you normally do at weekends?', 'What flat rule would you like to ask about?'], durationSeconds: 120 },
  28: { lesson: 28, title: 'Flatmate Interview: Follow-Up', type: 'checkpoint_speaking', skill: 'Spoken Interaction', prompt: 'Respond naturally to a flatmate’s questions and ask at least two relevant questions about guests, quiet hours, bills, or cleaning.', followUps: ['Would you say you are tidy?', 'How often do you have friends over?', 'What are you currently trying to improve at home?', 'Ask two questions about the household rules.'], durationSeconds: 120 },
  29: { lesson: 29, title: 'Spoken Production Checkpoint', type: 'checkpoint_speaking', skill: 'Spoken Production', prompt: 'Give a connected 90-second account of your lifestyle: describe your personality, normal routine, one new habit you are currently building, and a goal you are making an effort to achieve.', followUps: ['Include at least three personality adjectives.', 'Use present simple for routines and present continuous for current changes.', 'Include two make/do collocations.'], durationSeconds: 90 },
  30: { lesson: 30, title: 'Lifestyle Monologue: Try Again or Improve', type: 'checkpoint_speaking', skill: 'Spoken Production', prompt: 'Give a connected spoken account of your lifestyle, personality, daily routine, temporary changes, and one personal goal.', followUps: ['Use at least three personality adjectives.', 'Use accurate present simple and present continuous forms.', 'Include two make/do collocations.'], durationSeconds: 90 },
  31: { lesson: 31, title: 'Writing Checkpoint: Informal Email', type: 'checkpoint_writing', prompt: 'Write an informal email to a British host family or new flatmate introducing yourself, describing your personality and daily routine, and asking two or three questions about life in their household.', minWords: 100, maxWords: 130 },
  32: { lesson: 32, title: 'Module 1 Can-Do Writing Checkpoint', type: 'checkpoint_writing', prompt: 'Write a 100–130 word informal email to a British host family or new flatmate. Introduce yourself, describe your personality and routine, explain a temporary change or new habit, and ask two or three questions about the household.', minWords: 100, maxWords: 130 },
};

export const moduleOneRubric = [
  'Uses present simple for routines and present continuous for current or temporary plans.',
  'Avoids continuous forms with stative verbs.',
  'Includes at least three personality adjectives and two make/do collocations.',
  'Uses accurate question forms and a natural British English register.',
];
