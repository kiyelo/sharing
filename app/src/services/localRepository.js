const STORAGE_KEY = 'kkiu-react-0.7'
const LEGACY_KEYS = ['kkiu-react-0.6', 'kkiu-react-0.5', 'kkiu-react-0.1']

const normalize = (value, fallback) => {
  if (!value || typeof value !== 'object') return fallback
  return {
    ...fallback,
    ...value,
    personal: Array.isArray(value.personal) ? value.personal : fallback.personal,
    circles: Array.isArray(value.circles) ? value.circles.map((circle) => ({ members: [], tasks: [], unread: 0, memberUnread: {}, ...circle })) : fallback.circles,
    settings: { ...fallback.settings, ...(value.settings || {}) },
  }
}

export function loadLocalData(fallback) {
  try {
    const direct = localStorage.getItem(STORAGE_KEY)
    if (direct) return normalize(JSON.parse(direct), fallback)
    for (const key of LEGACY_KEYS) {
      const saved = localStorage.getItem(key)
      if (saved) {
        const migrated = normalize(JSON.parse(saved), fallback)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        return migrated
      }
    }
    return fallback
  } catch { return fallback }
}

export function saveLocalData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }
export const localRepository = { load: loadLocalData, save: saveLocalData }
