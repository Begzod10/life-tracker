// Profile Types
export type UserProfile = {
    id: string
    name: string
    surname: string
    birth_date: string
    email: string
    phone: string
    location: string
    timezone: string
    profile_photo?: string | null
    initial_balance: number
    created_at: string
    updated_at: string
}

export type PrivacySetting = {
    visible: boolean
    warning: boolean
    warningText?: string
}

export type PrivacySettings = {
    name: PrivacySetting
    surname: PrivacySetting
    birth_date: PrivacySetting
    email: PrivacySetting
    phone: PrivacySetting
    location: PrivacySetting
    initial_balance: PrivacySetting
    goals: PrivacySetting
    habits: PrivacySetting
    skills: PrivacySetting
    projects: PrivacySetting
    health: PrivacySetting
    expenses: PrivacySetting
}

export type PublicProfile = {
    id: string
    name: string
    surname: string
    location?: string
    profile_photo?: string | null
    goals?: string[]
    habits?: string[]
    skills?: string[]
    projects?: string[]
    stats?: {
        goals_count: number
        habits_count: number
        skills_count: number
        projects_count: number
    }
}

// Privacy Field Configuration
export const PRIVACY_FIELD_CONFIG: Record<string, {
    label: string
    warning: boolean
    warningText?: string
}> = {
    name: {
        label: 'Name',
        warning: false,
    },
    surname: {
        label: 'Surname',
        warning: false,
    },
    birth_date: {
        label: 'Birth Date',
        warning: true,
        warningText: 'Дата рождения может быть использована для восстановления аккаунтов',
    },
    email: {
        label: 'Email',
        warning: true,
        warningText: 'Email может быть использован для спама или фишинга',
    },
    phone: {
        label: 'Phone',
        warning: true,
        warningText: 'Номер телефона может привести к нежелательным звонкам',
    },
    location: {
        label: 'Location',
        warning: true,
        warningText: 'Точное местоположение может быть использовано для отслеживания',
    },
    initial_balance: {
        label: 'Initial Balance',
        warning: true,
        warningText: 'Финансовая информация может привлечь мошенников',
    },
    goals: {
        label: 'Goals',
        warning: false,
    },
    habits: {
        label: 'Habits',
        warning: false,
    },
    skills: {
        label: 'Skills',
        warning: false,
    },
    projects: {
        label: 'Projects',
        warning: false,
    },
    health: {
        label: 'Health Records',
        warning: true,
        warningText: 'Медицинские данные - конфиденциальная информация',
    },
    expenses: {
        label: 'Expenses',
        warning: true,
        warningText: 'Финансовые данные могут быть использованы против вас',
    },
}

// Default Privacy Settings
export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
    name: { visible: true, warning: false },
    surname: { visible: true, warning: false },
    birth_date: { visible: false, warning: true },
    email: { visible: false, warning: true },
    phone: { visible: false, warning: true },
    location: { visible: true, warning: true },
    initial_balance: { visible: false, warning: true },
    goals: { visible: true, warning: false },
    habits: { visible: true, warning: false },
    skills: { visible: true, warning: false },
    projects: { visible: true, warning: false },
    health: { visible: false, warning: true },
    expenses: { visible: false, warning: true },
}