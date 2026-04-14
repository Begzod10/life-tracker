'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
    User, Settings, Eye, EyeOff, Info, AlertTriangle, Lock, Globe,
    Mail, Camera, Save, Shield, ChevronRight, BadgeCheck, LogOut
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfile, useProfileUpdate } from '@/lib/hooks/use-profile'
import { useLogout } from '@/lib/hooks/use-auth'

const TIMEZONES = [
    { value: 'UTC', label: 'UTC' },
    { value: 'Europe/Moscow', label: 'Moscow (UTC+3)' },
    { value: 'Asia/Tashkent', label: 'Tashkent (UTC+5)' },
    { value: 'Asia/Almaty', label: 'Almaty (UTC+5)' },
    { value: 'Asia/Bishkek', label: 'Bishkek (UTC+6)' },
    { value: 'Asia/Tbilisi', label: 'Tbilisi (UTC+4)' },
    { value: 'Asia/Baku', label: 'Baku (UTC+4)' },
    { value: 'Asia/Yerevan', label: 'Yerevan (UTC+4)' },
    { value: 'Europe/Istanbul', label: 'Istanbul (UTC+3)' },
    { value: 'Europe/Kiev', label: 'Kyiv (UTC+2)' },
    { value: 'Europe/London', label: 'London (UTC+0)' },
    { value: 'Europe/Berlin', label: 'Berlin (UTC+1)' },
    { value: 'Europe/Paris', label: 'Paris (UTC+1)' },
    { value: 'America/New_York', label: 'New York (UTC-5)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8)' },
    { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (UTC+8)' },
]

type PrivacySetting = {
    visible: boolean
    warning: boolean
    warningText?: string
}

type PrivacySettings = {
    [key: string]: PrivacySetting
}

export default function ProfilePage() {
    const { data: profile, isLoading, isError } = useProfile()
    const [isEditMode, setIsEditMode] = useState(false)

    if (isLoading) return <ProfileSkeleton />
    if (isError || !profile) return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
            <p className="text-gray-400">Failed to load profile</p>
        </div>
    )

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            <div className="container mx-auto px-6 py-6">
                <OwnProfile profile={profile} isEditMode={isEditMode} setIsEditMode={setIsEditMode} />
            </div>
        </div>
    )
}

function ProfileSkeleton() {
    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            <div className="container mx-auto px-6 py-6 space-y-6">
                <Skeleton className="h-40 w-full rounded-xl" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Skeleton className="h-64 w-full rounded-xl" />
                        <Skeleton className="h-96 w-full rounded-xl" />
                    </div>
                    <div className="space-y-6">
                        <Skeleton className="h-40 w-full rounded-xl" />
                        <Skeleton className="h-40 w-full rounded-xl" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function OwnProfile({ profile, isEditMode, setIsEditMode }: {
    profile: NonNullable<ReturnType<typeof useProfile>['data']>
    isEditMode: boolean
    setIsEditMode: (value: boolean) => void
}) {
    const { mutate: updateProfile, isPending } = useProfileUpdate()
    const { mutate: logout, isPending: isLoggingOut } = useLogout()

    const [editData, setEditData] = useState({
        name: profile.name,
        email: profile.email,
        timezone: profile.timezone,
    })

    // Sync editData when profile refetches after save
    useEffect(() => {
        setEditData({ name: profile.name, email: profile.email, timezone: profile.timezone })
    }, [profile.name, profile.email, profile.timezone])

    const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
        name: { visible: true, warning: false },
        email: { visible: false, warning: true, warningText: 'Email может быть использован для спама или фишинга' },
        timezone: { visible: true, warning: false },
        goals: { visible: true, warning: false },
        habits: { visible: true, warning: false },
        health: { visible: false, warning: true, warningText: 'Медицинские данные - конфиденциальная информация' },
        expenses: { visible: false, warning: true, warningText: 'Финансовые данные могут быть использованы против вас' },
    })

    const togglePrivacy = (field: string) => {
        setPrivacySettings(prev => ({
            ...prev,
            [field]: { ...prev[field], visible: !prev[field].visible }
        }))
    }

    const handleSave = () => {
        updateProfile(editData, { onSuccess: () => setIsEditMode(false) })
    }

    const initials = profile.name
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || '?'

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-6xl mx-auto space-y-6"
        >
            {/* Profile Hero */}
            <Card className="bg-gradient-to-r from-blue-500 to-cyan-500 border-none relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24" />

                <div className="relative p-8">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-6">
                            <div className="relative">
                                {profile.profile_photo_url?.trim() ? (
                                    <img
                                        src={profile.profile_photo_url}
                                        alt={profile.name}
                                        className="w-24 h-24 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-4xl font-bold text-white">
                                        {initials}
                                    </div>
                                )}
                                <button className="absolute bottom-0 right-0 bg-white text-blue-600 rounded-full p-2 shadow-lg hover:bg-gray-100 transition">
                                    <Camera size={16} />
                                </button>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h1 className="text-3xl font-bold text-white">{profile.name}</h1>
                                    {profile.is_verified && (
                                        <BadgeCheck size={24} className="text-white/90" />
                                    )}
                                </div>
                                <p className="text-white/80 flex items-center gap-2">
                                    <Mail size={16} />
                                    {profile.email}
                                </p>
                                <p className="text-white/60 text-sm mt-1">{profile.timezone}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className="bg-white/20 backdrop-blur hover:bg-white/30 text-white border-none"
                            >
                                <Settings size={18} className="mr-2" />
                                {isEditMode ? 'Cancel' : 'Edit Profile'}
                            </Button>
                            <Button
                                onClick={() => logout()}
                                disabled={isLoggingOut}
                                className="bg-red-500/30 backdrop-blur hover:bg-red-500/50 text-white border-none"
                            >
                                <LogOut size={18} className="mr-2" />
                                {isLoggingOut ? 'Logging out...' : 'Log Out'}
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {isEditMode && (
                        <Card className="bg-[#1a1b26] border-[#2a2b36]">
                            <div className="p-6 space-y-4">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <User size={22} className="text-blue-500" />
                                    Edit Profile
                                </h2>
                                <div>
                                    <label className="text-sm text-gray-400 mb-1 block">Name</label>
                                    <Input
                                        value={editData.name}
                                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                        className="bg-[#0f0f1a] border-[#2a2b36] text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 mb-1 block">Email</label>
                                    <Input
                                        type="email"
                                        value={editData.email}
                                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                        className="bg-[#0f0f1a] border-[#2a2b36] text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 mb-1 block">Timezone</label>
                                    <Select
                                        value={editData.timezone}
                                        onValueChange={(val) => setEditData({ ...editData, timezone: val })}
                                    >
                                        <SelectTrigger className="bg-[#0f0f1a] border-[#2a2b36] text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1a1b26] border-[#2a2b36] text-white max-h-64">
                                            {TIMEZONES.map(tz => (
                                                <SelectItem key={tz.value} value={tz.value}>
                                                    {tz.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <Button variant="outline" onClick={() => setIsEditMode(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleSave}
                                        disabled={isPending}
                                        className="bg-gradient-to-r from-blue-500 to-cyan-500"
                                    >
                                        <Save size={18} className="mr-2" />
                                        {isPending ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    <PrivacySettingsSection
                        privacySettings={privacySettings}
                        togglePrivacy={togglePrivacy}
                    />
                </div>

                <div className="space-y-6">
                    <ProfileInfoCard profile={profile} />
                    <QuickActionsCard />
                </div>
            </div>
        </motion.div>
    )
}

function formatDate(value: string | null | undefined) {
    if (!value) return '—'
    const d = new Date(value)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU')
}

function ProfileInfoCard({ profile }: { profile: NonNullable<ReturnType<typeof useProfile>['data']> }) {
    return (
        <Card className="bg-[#1a1b26] border-[#2a2b36]">
            <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">Account Info</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Status</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${profile.is_verified ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {profile.is_verified ? 'Verified' : 'Unverified'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Member since</span>
                        <span className="text-white text-sm">{formatDate(profile.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Last updated</span>
                        <span className="text-white text-sm">{formatDate(profile.updated_at)}</span>
                    </div>
                </div>
            </div>
        </Card>
    )
}

function PrivacySettingsSection({ privacySettings, togglePrivacy }: {
    privacySettings: PrivacySettings
    togglePrivacy: (field: string) => void
}) {
    const fieldLabels: { [key: string]: string } = {
        name: 'Name',
        email: 'Email',
        timezone: 'Timezone',
        goals: 'Goals',
        habits: 'Habits',
        health: 'Health Records',
        expenses: 'Expenses',
    }

    return (
        <Card className="bg-[#1a1b26] border-[#2a2b36]">
            <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Shield size={22} className="text-blue-500" />
                    Privacy Settings
                </h2>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3 mb-6">
                    <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-200">
                        <p className="font-semibold mb-1">Important!</p>
                        <p className="text-amber-300/80">
                            Be careful sharing personal information. Enabled fields will be visible to other users.
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    {Object.entries(privacySettings).map(([key, setting]) => (
                        <motion.div
                            key={key}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center justify-between p-4 bg-[#0f0f1a] border border-[#2a2b36] rounded-lg hover:border-[#3a3b46] transition-all"
                        >
                            <div className="flex items-center gap-3 flex-1">
                                <button
                                    onClick={() => togglePrivacy(key)}
                                    className={`w-12 h-6 rounded-full transition relative ${setting.visible ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-[#2a2b36]'}`}
                                >
                                    <div className={`absolute w-4 h-4 bg-white rounded-full top-1 transition-all ${setting.visible ? 'left-7' : 'left-1'}`} />
                                </button>

                                <div className="flex items-center gap-2">
                                    {setting.visible ? (
                                        <Eye size={18} className="text-blue-500" />
                                    ) : (
                                        <EyeOff size={18} className="text-gray-500" />
                                    )}
                                    <span className="font-medium text-white">{fieldLabels[key]}</span>
                                </div>

                                <span className={`text-xs px-3 py-1 rounded-full ${setting.visible ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                    {setting.visible ? (
                                        <span className="flex items-center gap-1"><Globe size={12} />Public</span>
                                    ) : (
                                        <span className="flex items-center gap-1"><Lock size={12} />Hidden</span>
                                    )}
                                </span>
                            </div>

                            {setting.warning && (
                                <div className="group relative">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center cursor-help ${setting.visible ? 'bg-amber-500/20' : 'bg-gray-500/20'}`}>
                                        <Info size={16} className={setting.visible ? 'text-amber-500' : 'text-gray-500'} />
                                    </div>
                                    <div className="absolute right-0 top-10 w-72 bg-gray-900 text-white text-sm rounded-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl">
                                        <div className="flex gap-2">
                                            <AlertTriangle size={18} className="flex-shrink-0 text-amber-400" />
                                            <div>
                                                <p className="font-semibold mb-1">Security Warning</p>
                                                <p className="text-gray-300">{setting.warningText}</p>
                                            </div>
                                        </div>
                                        <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45" />
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </Card>
    )
}

function QuickActionsCard() {
    const actions = [
        { label: 'Export Data', icon: ChevronRight },
        { label: 'Delete Account', icon: ChevronRight },
        { label: 'Privacy Policy', icon: ChevronRight },
    ]

    return (
        <Card className="bg-[#1a1b26] border-[#2a2b36]">
            <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                <div className="space-y-2">
                    <a
                        href="https://t.me/life_tracker_off_bot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-between p-3 bg-[#0f0f1a] rounded-lg hover:bg-[#2a2b36] transition-colors text-left"
                    >
                        <span className="text-blue-400 font-medium flex items-center gap-2">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.1 13.126l-2.94-.918c-.64-.203-.653-.64.136-.954l11.49-4.43c.533-.194 1.001.131.828.396z"/>
                            </svg>
                            Telegram Bot
                        </span>
                        <ChevronRight size={16} className="text-gray-500" />
                    </a>
                    {actions.map((action, idx) => (
                        <button
                            key={idx}
                            className="w-full flex items-center justify-between p-3 bg-[#0f0f1a] rounded-lg hover:bg-[#2a2b36] transition-colors text-left"
                        >
                            <span className="text-gray-300">{action.label}</span>
                            <action.icon size={16} className="text-gray-500" />
                        </button>
                    ))}
                </div>
            </div>
        </Card>
    )
}
