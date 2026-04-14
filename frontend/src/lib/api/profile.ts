import { UserProfile, PrivacySettings, PublicProfile } from '@/types/profile'

// API Base URL - замените на ваш реальный endpoint
const API_BASE_URL = '/api'

/**
 * Get current user's profile
 */
export async function getUserProfile(): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error('Failed to fetch user profile')
    }

    return response.json()
}

/**
 * Update user profile
 */
export async function updateUserProfile(data: Partial<UserProfile>): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })

    if (!response.ok) {
        throw new Error('Failed to update user profile')
    }

    return response.json()
}

/**
 * Upload profile photo
 */
export async function uploadProfilePhoto(file: File): Promise<{ url: string }> {
    const formData = new FormData()
    formData.append('photo', file)

    const response = await fetch(`${API_BASE_URL}/profile/photo`, {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        throw new Error('Failed to upload profile photo')
    }

    return response.json()
}

/**
 * Get privacy settings
 */
export async function getPrivacySettings(): Promise<PrivacySettings> {
    const response = await fetch(`${API_BASE_URL}/profile/privacy`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error('Failed to fetch privacy settings')
    }

    return response.json()
}

/**
 * Update privacy settings
 */
export async function updatePrivacySettings(settings: PrivacySettings): Promise<PrivacySettings> {
    const response = await fetch(`${API_BASE_URL}/profile/privacy`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
    })

    if (!response.ok) {
        throw new Error('Failed to update privacy settings')
    }

    return response.json()
}

/**
 * Get public profiles (with pagination)
 */
export async function getPublicProfiles(params?: {
    page?: number
    limit?: number
    search?: string
}): Promise<{ profiles: PublicProfile[], total: number }> {
    const queryParams = new URLSearchParams()
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.search) queryParams.append('search', params.search)

    const response = await fetch(`${API_BASE_URL}/profiles?${queryParams}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error('Failed to fetch public profiles')
    }

    return response.json()
}

/**
 * Get a specific public profile by ID
 */
export async function getPublicProfile(userId: string): Promise<PublicProfile> {
    const response = await fetch(`${API_BASE_URL}/profiles/${userId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error('Failed to fetch public profile')
    }

    return response.json()
}

/**
 * Export user data (GDPR compliance)
 */
export async function exportUserData(): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/profile/export`, {
        method: 'GET',
    })

    if (!response.ok) {
        throw new Error('Failed to export user data')
    }

    return response.blob()
}

/**
 * Delete user account
 */
export async function deleteAccount(password: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
    })

    if (!response.ok) {
        throw new Error('Failed to delete account')
    }
}