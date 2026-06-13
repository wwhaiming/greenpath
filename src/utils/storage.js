const PREFIX = 'gp-'

export function saveData(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch (_) {}
}

export function loadData(key, defaultValue) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return defaultValue
    return JSON.parse(raw) ?? defaultValue
  } catch (_) {
    return defaultValue
  }
}

// PathwayFinder
export const savePathwayData = (data) => saveData('pathway', data)
export const loadPathwayData = () => loadData('pathway', { intake: '', result: null })

// DocumentReview
export const saveDocumentReviewData = (data) => saveData('document-review', data)
export const loadDocumentReviewData = () => loadData('document-review', { formType: 'I-485', inputText: '' })

// Language
export const saveLanguage = (lang) => saveData('language', lang)
export const loadLanguage = () => loadData('language', 'English')
