'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    User, Settings, Eye, EyeOff, Info, AlertTriangle, Lock, Globe,
    Mail, Phone, MapPin, Calendar, Camera, Save, Shield, Users,
    ArrowLeft, Bell, Search, ChevronRight, DollarSign, Heart
} from 'lucide-react'

type PrivacySetting = {
    visible: boolean
    warning: boolean
    warningText?: string
}

type PrivacySettings = {
    [key: string]: PrivacySetting
}

export default function ProfilePage() {
    const [activeTab, setActiveTab] = useState<'own' | 'public'>('own')
    const [isEditMode, setIsEditMode] = useState(false)

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            {/* Header */}
            {/* <ProfileHeader activeTab={activeTab} setActiveTab={setActiveTab} /> */}

            {/* Content */}
            <div className="container mx-auto px-6 py-6">
                <AnimatePresence mode="wait">
                    {activeTab === 'own' ? (
                        <OwnProfile
                            key="own"
                            isEditMode={isEditMode}
                            setIsEditMode={setIsEditMode}
                        />
                    ) : (
                        <PublicProfiles key="public" />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

// Header Component
function ProfileHeader({ activeTab, setActiveTab }: {
    activeTab: 'own' | 'public'
    setActiveTab: (tab: 'own' | 'public') => void
}) {
    return (
        <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 bg-[#1a1b26]/80 backdrop-blur-xl border-b border-[#2a2b36]"
        >
            <div className="container mx-auto px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Left - Back to Platform */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Platform
                    </Button>

                    {/* Center - Tabs */}
                    <div className="flex items-center gap-2 bg-[#0f0f1a] rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('own')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'own'
                                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            <User className="h-4 w-4 inline mr-2" />
                            My Profile
                        </button>
                        <button
                            onClick={() => setActiveTab('public')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'public'
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            <Users className="h-4 w-4 inline mr-2" />
                            Public Profiles
                        </button>
                    </div>

                    {/* Right - Notifications & Settings */}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                        </Button>
                        <Button variant="ghost" size="icon">
                            <Settings className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </motion.header>
    )
}

// Own Profile Component
function OwnProfile({ isEditMode, setIsEditMode }: {
    isEditMode: boolean
    setIsEditMode: (value: boolean) => void
}) {
    const [userData, setUserData] = useState({
        name: 'Иван',
        surname: 'Петров',
        birth_date: '1995-06-15',
        email: 'ivan.petrov@example.com',
        phone: '+998901234567',
        location: 'Ташкент, Узбекистан',
        timezone: 'Asia/Tashkent',
        initial_balance: 50000000,
    })

    const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
        name: { visible: true, warning: false },
        surname: { visible: true, warning: false },
        birth_date: { visible: false, warning: true, warningText: 'Дата рождения может быть использована для восстановления аккаунтов' },
        email: { visible: false, warning: true, warningText: 'Email может быть использован для спама или фишинга' },
        phone: { visible: false, warning: true, warningText: 'Номер телефона может привести к нежелательным звонкам' },
        location: { visible: true, warning: true, warningText: 'Точное местоположение может быть использовано для отслеживания' },
        initial_balance: { visible: false, warning: true, warningText: 'Финансовая информация может привлечь мошенников' },
        goals: { visible: true, warning: false },
        habits: { visible: true, warning: false },
        skills: { visible: true, warning: false },
        projects: { visible: true, warning: false },
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
        setIsEditMode(false)
        // TODO: Интеграция с API
        console.log('Saving profile...', userData, privacySettings)
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
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
                                <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-4xl font-bold text-white">
                                    {userData.name[0]}{userData.surname[0]}
                                </div>
                                <button className="absolute bottom-0 right-0 bg-white text-blue-600 rounded-full p-2 shadow-lg hover:bg-gray-100 transition">
                                    <Camera size={16} />
                                </button>
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-white mb-2">
                                    {userData.name} {userData.surname}
                                </h1>
                                <p className="text-white/80 flex items-center gap-2">
                                    <MapPin size={16} />
                                    {userData.location}
                                </p>
                            </div>
                        </div>

                        <Button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className="bg-white/20 backdrop-blur hover:bg-white/30 text-white border-none"
                        >
                            <Settings size={18} className="mr-2" />
                            {isEditMode ? 'Cancel' : 'Edit Profile'}
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side - Personal Info & Privacy */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Personal Information */}
                    <PersonalInfoSection
                        userData={userData}
                        setUserData={setUserData}
                        isEditMode={isEditMode}
                        privacySettings={privacySettings}
                    />

                    {/* Privacy Settings */}
                    <PrivacySettingsSection
                        privacySettings={privacySettings}
                        togglePrivacy={togglePrivacy}
                    />

                    {/* Save Button */}
                    {isEditMode && (
                        <div className="flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setIsEditMode(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="bg-gradient-to-r from-blue-500 to-cyan-500"
                            >
                                <Save size={18} className="mr-2" />
                                Save Changes
                            </Button>
                        </div>
                    )}
                </div>

                {/* Right Side - Stats & Quick Info */}
                <div className="space-y-6">
                    <ProfileStatsCard />
                    <QuickActionsCard />
                </div>
            </div>
        </motion.div>
    )
}

// Personal Info Section
function PersonalInfoSection({ userData, setUserData, isEditMode, privacySettings }: {
    userData: any
    setUserData: (data: any) => void
    isEditMode: boolean
    privacySettings: PrivacySettings
}) {
    const fields = [
        { key: 'email', icon: Mail, label: 'Email', value: userData.email, type: 'email' },
        { key: 'phone', icon: Phone, label: 'Phone', value: userData.phone, type: 'tel' },
        { key: 'birth_date', icon: Calendar, label: 'Birth Date', value: new Date(userData.birth_date).toLocaleDateString('ru-RU'), type: 'date' },
        { key: 'location', icon: MapPin, label: 'Location', value: userData.location, type: 'text' },
    ]

    return (
        <Card className="bg-[#1a1b26] border-[#2a2b36]">
            <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <User size={22} className="text-blue-500" />
                    Personal Information
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map(field => (
                        <div key={field.key} className="bg-[#0f0f1a] border border-[#2a2b36] rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <field.icon size={16} />
                                    <span>{field.label}</span>
                                </div>
                                {privacySettings[field.key]?.warning && (
                                    <div className="group relative">
                                        <AlertTriangle size={16} className="text-amber-500 cursor-help" />
                                        <div className="absolute right-0 top-6 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl">
                                            <div className="flex gap-2">
                                                <Info size={14} className="flex-shrink-0 mt-0.5" />
                                                <span>{privacySettings[field.key].warningText}</span>
                                            </div>
                                            <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {isEditMode ? (
                                <Input
                                    type={field.type}
                                    value={field.key === 'birth_date' ? userData.birth_date : field.value}
                                    onChange={(e) => setUserData({ ...userData, [field.key]: e.target.value })}
                                    className="bg-[#1a1b26] border-[#2a2b36] text-white"
                                />
                            ) : (
                                <span className="font-medium text-white">{field.value}</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    )
}

// Privacy Settings Section
function PrivacySettingsSection({ privacySettings, togglePrivacy }: {
    privacySettings: PrivacySettings
    togglePrivacy: (field: string) => void
}) {
    const fieldLabels: { [key: string]: string } = {
        name: 'Name',
        surname: 'Surname',
        birth_date: 'Birth Date',
        email: 'Email',
        phone: 'Phone',
        location: 'Location',
        initial_balance: 'Initial Balance',
        goals: 'Goals',
        habits: 'Habits',
        skills: 'Skills',
        projects: 'Projects',
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
                                    className={`w-12 h-6 rounded-full transition relative ${setting.visible ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-[#2a2b36]'
                                        }`}
                                >
                                    <div className={`absolute w-4 h-4 bg-white rounded-full top-1 transition-all ${setting.visible ? 'left-7' : 'left-1'
                                        }`} />
                                </button>

                                <div className="flex items-center gap-2">
                                    {setting.visible ? (
                                        <Eye size={18} className="text-blue-500" />
                                    ) : (
                                        <EyeOff size={18} className="text-gray-500" />
                                    )}
                                    <span className="font-medium text-white">
                                        {fieldLabels[key]}
                                    </span>
                                </div>

                                <span className={`text-xs px-3 py-1 rounded-full ${setting.visible
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                    {setting.visible ? (
                                        <span className="flex items-center gap-1">
                                            <Globe size={12} />
                                            Public
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <Lock size={12} />
                                            Hidden
                                        </span>
                                    )}
                                </span>
                            </div>

                            {setting.warning && (
                                <div className="group relative">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center cursor-help ${setting.visible ? 'bg-amber-500/20' : 'bg-gray-500/20'
                                        }`}>
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

// Profile Stats Card
function ProfileStatsCard() {
    return (
        <Card className="bg-[#1a1b26] border-[#2a2b36]">
            <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">Profile Stats</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400">Profile Views</span>
                        <span className="text-white font-bold">128</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400">Connections</span>
                        <span className="text-white font-bold">45</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400">Posts</span>
                        <span className="text-white font-bold">23</span>
                    </div>
                </div>
            </div>
        </Card>
    )
}

// Quick Actions Card
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

// Public Profiles Component
function PublicProfiles() {
    const profiles = [
        { name: 'Мария', surname: 'Иванова', location: 'Москва, Россия', goals: 2, skills: 5 },
        { name: 'Алексей', surname: 'Смирнов', location: 'Санкт-Петербург, Россия', goals: 3, skills: 4 },
        { name: 'Екатерина', surname: 'Козлова', location: 'Киев, Украина', goals: 5, skills: 6 },
    ]

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-6xl mx-auto"
        >
            <div className="mb-6">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search users..."
                        className="pl-10 bg-[#1a1b26] border-[#2a2b36] text-white"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles.map((profile, idx) => (
                    <PublicProfileCard key={idx} profile={profile} index={idx} />
                ))}
            </div>
        </motion.div>
    )
}

// Public Profile Card
function PublicProfileCard({ profile, index }: { profile: any, index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
        >
            <Card className="bg-[#1a1b26] border-[#2a2b36] hover:border-[#3a3b46] transition-all cursor-pointer group">
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white">
                            {profile.name[0]}{profile.surname[0]}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                                {profile.name} {profile.surname}
                            </h3>
                            <p className="text-sm text-gray-400 flex items-center gap-1">
                                <MapPin size={14} />
                                {profile.location}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pt-4 border-t border-[#2a2b36]">
                        <div className="text-center">
                            <div className="text-lg font-bold text-white">{profile.goals}</div>
                            <div className="text-xs text-gray-400">Goals</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-white">{profile.skills}</div>
                            <div className="text-xs text-gray-400">Skills</div>
                        </div>
                    </div>

                    <Button className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500">
                        View Profile
                    </Button>
                </div>
            </Card>
        </motion.div>
    )
}