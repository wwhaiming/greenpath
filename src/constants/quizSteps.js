import { ALL_COUNTRIES } from './countries.js'

export const STEPS = [
  {
    label: 'Current location',
    q: 'Where do you currently live?',
    hint: 'This helps determine whether you would adjust status or use consular processing.',
    tip: '"Adjustment of status" means applying while inside the U.S.',
    options: ['Inside the United States', 'Outside the United States'],
  },
  {
    label: 'Country of birth',
    q: 'What is your country of birth?',
    hint: 'Some countries have longer waits due to per-country caps.',
    tip: 'Birth country — not citizenship — usually sets your visa category.',
    options: ALL_COUNTRIES,
  },
  {
    label: 'Immigration status',
    q: 'What best describes your current immigration status?',
    hint: 'You can ask questions in your own words.',
    tip: 'Explains unfamiliar terms simply.',
    options: [
      'U.S. visa holder (work or student)',
      'Temporary protected / humanitarian status',
      'No current status',
      'Not sure',
    ],
  },
  {
    label: 'Family relationships',
    q: 'Do you have a close family member who can sponsor you?',
    hint: 'A spouse, parent, or child who is a citizen or green-card holder may open a pathway.',
    tip: '"LPR" means Lawful Permanent Resident — a green-card holder.',
    options: [
      'Spouse is a U.S. citizen',
      'Parent or child is a citizen / LPR',
      'Sibling is a U.S. citizen',
      'No qualifying family member',
    ],
  },
  {
    label: 'Employment situation',
    q: 'What is your employment situation?',
    hint: 'A job offer or employer sponsorship can support an employment-based pathway.',
    tip: 'Employer sponsorship often involves a labor certification step.',
    options: [
      'I have an employer willing to sponsor me',
      'I have specialized skills or an advanced degree',
      'Self-employed / investor',
      'No U.S. job offer',
    ],
  },
  {
    label: 'Special circumstances',
    q: 'Do any special circumstances apply to you?',
    hint: 'These can change which pathway and protections are available.',
    tip: 'Several of these route you to specialized, authorized help.',
    options: [
      'Asylum or refugee situation',
      'Survivor of abuse or a serious crime',
      'Selected in the Diversity Visa lottery',
      'None of these apply',
    ],
  },
]

export function pathwayResult(answers) {
  if (answers[0] === 'Asylum or refugee situation' || answers[5] === 'Asylum or refugee situation')
    return ['Humanitarian pathway', 'Your answers point toward a humanitarian (asylum or refugee) pathway. These cases are highly individual — GreenPath would connect you with an authorized support organization.']
  if (answers[5] === 'Survivor of abuse or a serious crime')
    return ['Protective pathway', 'Your situation may qualify for special protections. This is a sensitive area best handled directly with an authorized advocate, which GreenPath would help you find.']
  if (answers[5] === 'Selected in the Diversity Visa lottery')
    return ['Diversity Visa pathway', 'Being selected in the Diversity Visa lottery opens a specific, time-sensitive process. GreenPath would help you track its strict deadlines.']
  if (answers[3] && answers[3] !== 'No qualifying family member')
    return ['Family-based pathway', 'Based on your family relationship, a family-based pathway looks possible. GreenPath would break it into stages: petition, processing, biometrics, interview, and decision.']
  if (answers[4] && answers[4] !== 'No U.S. job offer')
    return ['Employment-based pathway', 'Your employment situation suggests an employment-based pathway may apply. GreenPath would map the petition, priority-date, and filing steps for you.']
  return ["Let's explore options together", "Your answers don't point to one clear pathway yet. GreenPath would ask a few more questions and, where helpful, suggest authorized organizations that can review your case."]
}
