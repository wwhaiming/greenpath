export const IP_BANK = {
  'Marriage-based adjustment of status (I-485)': [
    'How did you and your spouse first meet?',
    'When and where did you get married?',
    'Who proposed, and how did it happen?',
    'Who lives in your household right now?',
    'Walk me through a typical weekday morning at home.',
    'How do you handle finances — joint accounts, rent, bills?',
    'Has either of you been married before?',
    'When did you last see each other’s families?',
    'What did you do together last weekend?',
    'What are your plans as a couple for the next few years?',
  ],
  'Family-based petition (I-130)': [
    'What is your relationship to the petitioner?',
    'When did the petitioner become a U.S. citizen or permanent resident?',
    'When did you last see the petitioner in person?',
    'How often are you in contact, and how — calls, visits, messages?',
    'Who else lives in the petitioner’s household?',
    'Has the petitioner sponsored anyone else before?',
    'List your addresses for the past five years.',
    'Has anything changed since the petition was filed — marriage, children, moves?',
  ],
  'Employment-based green card': [
    'Describe your current job and your main responsibilities.',
    'How were you recruited for this position?',
    'What degrees, licenses, or experience qualify you for this role?',
    'Walk me through your employment for the past five years.',
    'What does your employer do, and who are its main clients?',
    'Where will you physically work, and who supervises you?',
    'Has your job title, salary, or location changed since the petition was filed?',
    'Have you maintained valid immigration status while working in the U.S.?',
  ],
  'Naturalization / citizenship (N-400)': [
    'How many days have you spent outside the United States in the last five years?',
    'Have you taken any single trip longer than six months?',
    'Have you filed federal tax returns every year you were required to?',
    'What is your marital status, and who lives with you?',
    'Have you ever been arrested, cited, or detained by any officer?',
    'Can you name one branch of the U.S. government?',
    'What does the Constitution do?',
    'Why do you want to become a U.S. citizen?',
    'List your addresses and employers for the past five years.',
    'Are you willing to take the Oath of Allegiance?',
  ],
  'Asylum interview': [
    'In your own words, why did you leave your home country?',
    'When did you decide you could not return?',
    'Describe the specific incident that made you fear for your safety — what happened, when, and where?',
    'Who harmed or threatened you, and why you specifically?',
    'Did you report what happened to any authorities? What was the result?',
    'Could you have moved to a safer part of your country? Why not?',
    'Is there anyone who can corroborate your account?',
    'What do you believe would happen if you returned today?',
  ],
}

export function exampleFor(caseType) {
  const bank = IP_BANK[caseType]
  return bank ? bank[0] : 'Please explain your current address history.'
}
