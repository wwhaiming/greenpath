export const IP_BANK = {
  'Marriage-based adjustment of status (I-485)': [
    'How did you and your spouse first meet?',
    'When and where did you get married?',
    'Who lives in your household, and what is your typical morning routine together?',
    'Please explain your current address history.',
    'Has either of you been married before?',
  ],
  'Family-based petition (I-130)': [
    'What is your relationship to the petitioner?',
    'When did the petitioner become a U.S. citizen or permanent resident?',
    'Please explain your current address history.',
    'How often are you in contact with your relative?',
  ],
  'Employment-based green card': [
    'Describe your current job and your main responsibilities.',
    'How were you recruited for this position?',
    'What are your qualifications for this role?',
    'Please explain your employment history over the past five years.',
  ],
  'Naturalization / citizenship (N-400)': [
    'How many days have you spent outside the United States in the last five years?',
    'Have you paid your federal taxes?',
    'Can you name one branch of the U.S. government?',
    'Please explain your current address history.',
  ],
  'Asylum interview': [
    'Please describe, in your own words, why you left your home country.',
    'When did you decide you could not return?',
    'Did you report what happened to any authorities?',
    'Is there anyone who can corroborate your account?',
  ],
}

export function exampleFor(caseType) {
  const bank = IP_BANK[caseType]
  return bank ? bank[0] : 'Please explain your current address history.'
}
