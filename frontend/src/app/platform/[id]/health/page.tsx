'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
    ArrowLeft,
    Scale,
    TrendingUp,
    TrendingDown,
    Dumbbell,
    Heart,
    Activity,
    Calendar,
    Moon,
    Droplets,
    Flame,
    Edit,
    Trash2,
    Clock,
    Utensils,
    Plus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'

type HealthData = {
    id: number
    record_date: string
    weight: number
    height: number
    body_fat_percentage: number
    muscle_mass: number
    bmi: number
    blood_pressure_systolic: number
    blood_pressure_diastolic: number
    heart_rate_resting: number
    sleep_hours: number
    water_intake: number
    steps_count: number
    notes: string
    created_at: string
}

const useHealthProfile = (id: string) => {
    return {
        data: {
            id: Number(id),
            record_date: '2026-02-18T08:00:00Z',
            weight: 72.5,
            height: 178,
            body_fat_percentage: 18.2,
            muscle_mass: 34.1,
            bmi: 22.9,
            blood_pressure_systolic: 118,
            blood_pressure_diastolic: 76,
            heart_rate_resting: 68,
            sleep_hours: 7.5,
            water_intake: 2.1,
            steps_count: 8420,
            notes: 'Feeling great after morning workout.',
            created_at: '2026-01-01T00:00:00Z',
        },
        isLoading: false,
        error: null,
    }
}

function getBMIStatus(bmi: number) {
    if (bmi < 18.5) return { label: 'Underweight', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
    if (bmi < 25) return { label: 'Normal', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
    if (bmi < 30) return { label: 'Overweight', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    return { label: 'Obese', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
}

function getHeartRateColor(hr: number) {
    if (hr >= 60 && hr <= 100) return 'text-green-400'
    return 'text-yellow-400'
}

function getIdealWeightRange(height: number) {
    const heightInMeters = height / 100
    const min = (18.5 * heightInMeters * heightInMeters).toFixed(1)
    const max = (24.9 * heightInMeters * heightInMeters).toFixed(1)
    return { min: parseFloat(min), max: parseFloat(max) }
}

function HealthProfilePage() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string
    const { data, isLoading, error } = useHealthProfile(id)
    const [isDeleting, setIsDeleting] = useState(false)

    const idealWeight = useMemo(() => getIdealWeightRange(data?.height || 0), [data?.height])
    const bmiStatus = useMemo(() => getBMIStatus(data?.bmi || 0), [data?.bmi])

    if (isLoading) {
        return (
            <div className="min-h-screen">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Skeleton className="h-12 w-48 mb-8" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-64 rounded-lg" />
                            ))}
                        </div>
                        <div className="space-y-6">
                            <Skeleton className="h-48 rounded-lg" />
                            <Skeleton className="h-64 rounded-lg" />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Card className="bg-[#1a1b26] border-[#2a2b36] max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <p className="text-gray-400 mb-6">Record Not Found</p>
                        <Button onClick={() => router.push('/platform')} variant="outline">
                            Go Back
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
            },
        },
    }

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.5 },
        },
    }

    const headerVariants = {
        hidden: { opacity: 0, y: -20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.5 },
        },
    }

    return (
        <div className="min-h-screen">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={headerVariants}
                    className="mb-8"
                >
                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={() => router.push('/platform')}
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-400" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-4xl font-bold text-white mb-2">Health Record</h1>
                            <p className="text-gray-400">
                                {format(new Date(data.record_date), 'MMMM d, yyyy')}
                            </p>
                            {data.notes && (
                                <p className="text-gray-400 text-sm mt-2">{data.notes}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge className={`border ${bmiStatus.color}`}>
                                {bmiStatus.label}
                            </Badge>
                            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                                <Edit className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Main Grid */}
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={containerVariants}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Body Metrics Card */}
                        <motion.div variants={itemVariants}>
                            <Card className="bg-[#1a1b26] border-[#2a2b36] border border-white/5 hover:border-white/10 transition-all">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Scale className="w-5 h-5" />
                                        Body Metrics
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* Weight */}
                                        <div className="bg-[#0f0f1a] rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Scale className="w-4 h-4 text-blue-400" />
                                                <span className="text-gray-400 text-sm">Weight</span>
                                            </div>
                                            <p className="text-2xl font-bold text-white">{data.weight} kg</p>
                                        </div>

                                        {/* Height */}
                                        <div className="bg-[#0f0f1a] rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <TrendingUp className="w-4 h-4 text-purple-400" />
                                                <span className="text-gray-400 text-sm">Height</span>
                                            </div>
                                            <p className="text-2xl font-bold text-white">{data.height} cm</p>
                                        </div>

                                        {/* Body Fat */}
                                        <div className="bg-[#0f0f1a] rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <TrendingDown className="w-4 h-4 text-orange-400" />
                                                <span className="text-gray-400 text-sm">Body Fat</span>
                                            </div>
                                            <p className="text-2xl font-bold text-white">{data.body_fat_percentage}%</p>
                                        </div>

                                        {/* Muscle Mass */}
                                        <div className="bg-[#0f0f1a] rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Dumbbell className="w-4 h-4 text-green-400" />
                                                <span className="text-gray-400 text-sm">Muscle Mass</span>
                                            </div>
                                            <p className="text-2xl font-bold text-white">{data.muscle_mass} kg</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Vitals Card */}
                        <motion.div variants={itemVariants}>
                            <Card className="bg-[#1a1b26] border-[#2a2b36] border border-white/5 hover:border-white/10 transition-all">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Activity className="w-5 h-5" />
                                        Vitals
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {/* Blood Pressure */}
                                        <div className="flex items-center justify-between py-3 border-b border-white/5">
                                            <div className="flex items-center gap-3">
                                                <Heart className="w-4 h-4 text-red-400" />
                                                <span className="text-gray-400">Blood Pressure</span>
                                            </div>
                                            <span className="text-white font-semibold">
                                                {data.blood_pressure_systolic}/{data.blood_pressure_diastolic} mmHg
                                            </span>
                                        </div>

                                        {/* Resting Heart Rate */}
                                        <div className="flex items-center justify-between py-3 border-b border-white/5">
                                            <div className="flex items-center gap-3">
                                                <Heart className="w-4 h-4 text-green-400" />
                                                <span className="text-gray-400">Resting Heart Rate</span>
                                            </div>
                                            <span className={`font-semibold ${getHeartRateColor(data.heart_rate_resting)}`}>
                                                {data.heart_rate_resting} bpm
                                            </span>
                                        </div>

                                        {/* BMI */}
                                        <div className="flex items-center justify-between py-3">
                                            <span className="text-gray-400">BMI</span>
                                            <Badge className={`border ${bmiStatus.color}`}>
                                                {data.bmi}
                                            </Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Daily Tracking Card */}
                        <motion.div variants={itemVariants}>
                            <Card className="bg-[#1a1b26] border-[#2a2b36] border border-white/5 hover:border-white/10 transition-all">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Calendar className="w-5 h-5" />
                                        Daily Tracking
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-6">
                                        {/* Sleep */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <Moon className="w-4 h-4 text-indigo-400" />
                                                    <span className="text-gray-400">Sleep</span>
                                                </div>
                                                <span className="text-white font-semibold">
                                                    {data.sleep_hours} / 8h
                                                </span>
                                            </div>
                                            <motion.div
                                                className="w-full h-2 bg-white/10 rounded-full overflow-hidden"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                            >
                                                <motion.div
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(data.sleep_hours / 8) * 100}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                                />
                                            </motion.div>
                                        </div>

                                        {/* Water */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <Droplets className="w-4 h-4 text-blue-400" />
                                                    <span className="text-gray-400">Water Intake</span>
                                                </div>
                                                <span className="text-white font-semibold">
                                                    {data.water_intake} / 2.5L
                                                </span>
                                            </div>
                                            <motion.div
                                                className="w-full h-2 bg-white/10 rounded-full overflow-hidden"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                            >
                                                <motion.div
                                                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(data.water_intake / 2.5) * 100}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                                />
                                            </motion.div>
                                        </div>

                                        {/* Steps */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <Flame className="w-4 h-4 text-orange-400" />
                                                    <span className="text-gray-400">Steps</span>
                                                </div>
                                                <span className="text-white font-semibold">
                                                    {data.steps_count} / 10,000
                                                </span>
                                            </div>
                                            <motion.div
                                                className="w-full h-2 bg-white/10 rounded-full overflow-hidden"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                            >
                                                <motion.div
                                                    className="h-full bg-gradient-to-r from-orange-500 to-yellow-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(data.steps_count / 10000) * 100}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                                />
                                            </motion.div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Recent Workouts Card */}
                        <motion.div variants={itemVariants} style={{ transitionDelay: '0.5s' }}>
                            <Card className="border border-white/5 bg-white/2.5 backdrop-blur-sm hover:border-white/10 transition-all p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <Dumbbell className="w-5 h-5 text-white" />
                                        <h3 className="text-lg font-semibold text-white">Recent Workouts</h3>
                                    </div>
                                    <Button variant="outline" size="sm" className="gap-1">
                                        <Plus className="w-4 h-4" />
                                        Add Workout
                                    </Button>
                                </div>
                                <div className="space-y-0">
                                    {[
                                        { name: 'Strength Training', date: 'Feb 18', icon: Dumbbell, color: 'text-blue-400', duration: '60 min', calories: 320 },
                                        { name: 'Morning Run', date: 'Feb 17', icon: Heart, color: 'text-red-400', duration: '35 min', calories: 280 },
                                        { name: 'Full Body', date: 'Feb 15', icon: Flame, color: 'text-orange-400', duration: '50 min', calories: 410 },
                                    ].map((workout, idx) => {
                                        const IconComponent = workout.icon
                                        return (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.5 + idx * 0.05 }}
                                                className="flex items-center justify-between py-3 hover:bg-white/5 rounded-lg px-2 transition-colors cursor-pointer"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <IconComponent className={`w-5 h-5 ${workout.color}`} />
                                                    <div>
                                                        <p className="text-white font-semibold">{workout.name}</p>
                                                        <p className="text-gray-400 text-sm">{workout.date}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 text-right">
                                                    <span className="text-gray-400">{workout.duration}</span>
                                                    <Badge className="bg-orange-500/10 text-orange-400 border-0">
                                                        {workout.calories} kcal
                                                    </Badge>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            </Card>
                        </motion.div>

                        {/* Today's Nutrition Card */}
                        <motion.div variants={itemVariants} style={{ transitionDelay: '0.6s' }}>
                            <Card className="border border-white/5 bg-white/2.5 backdrop-blur-sm hover:border-white/10 transition-all p-6">
                                <div className="mb-6">
                                    <div className="flex items-center gap-2">
                                        <Utensils className="w-5 h-5 text-white" />
                                        <h3 className="text-lg font-semibold text-white">Today's Nutrition</h3>
                                    </div>
                                </div>

                                {/* Nutrition Summary */}
                                <div className="grid grid-cols-4 gap-2 mb-6">
                                    <div className="bg-[#0f0f1a] rounded-lg p-3 text-center border border-white/5">
                                        <p className="text-amber-400 text-lg font-bold">1,840</p>
                                        <p className="text-gray-400 text-xs">kcal</p>
                                    </div>
                                    <div className="bg-[#0f0f1a] rounded-lg p-3 text-center border border-white/5">
                                        <p className="text-blue-400 text-lg font-bold">124g</p>
                                        <p className="text-gray-400 text-xs">Protein</p>
                                    </div>
                                    <div className="bg-[#0f0f1a] rounded-lg p-3 text-center border border-white/5">
                                        <p className="text-green-400 text-lg font-bold">210g</p>
                                        <p className="text-gray-400 text-xs">Carbs</p>
                                    </div>
                                    <div className="bg-[#0f0f1a] rounded-lg p-3 text-center border border-white/5">
                                        <p className="text-orange-400 text-lg font-bold">58g</p>
                                        <p className="text-gray-400 text-xs">Fats</p>
                                    </div>
                                </div>

                                {/* Meals List */}
                                <div className="space-y-0 mb-4">
                                    {[
                                        { emoji: '🌅', name: 'Breakfast', meal: 'Oatmeal with fruits', calories: 420 },
                                        { emoji: '☀️', name: 'Lunch', meal: 'Chicken rice bowl', calories: 680 },
                                        { emoji: '🌙', name: 'Dinner', meal: 'Salmon with vegetables', calories: 540 },
                                    ].map((item, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.6 + idx * 0.05 }}
                                            className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                                        >
                                            <div>
                                                <p className="text-white text-sm font-semibold">
                                                    {item.emoji} {item.name}
                                                </p>
                                                <p className="text-gray-400 text-xs">{item.meal}</p>
                                            </div>
                                            <span className="text-gray-400 text-sm">{item.calories} kcal</span>
                                        </motion.div>
                                    ))}
                                </div>

                                <Button variant="outline" className="w-full justify-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Log Meal
                                </Button>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6 lg:sticky lg:top-4 h-fit">
                        {/* Quick Actions */}
                        <motion.div variants={itemVariants}>
                            <Card className="bg-[#1a1b26] border-[#2a2b36] border border-white/5 hover:border-white/10 transition-all">
                                <CardHeader>
                                    <CardTitle className="text-white">Quick Actions</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start gap-2"
                                        >
                                            <Edit className="w-4 h-4" />
                                            Edit Record
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start gap-2 text-red-400 hover:text-red-400"
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? (
                                                <>
                                                    <Clock className="w-4 h-4 animate-spin" />
                                                    Deleting...
                                                </>
                                            ) : (
                                                <>
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete Record
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Statistics */}
                        <motion.div variants={itemVariants}>
                            <Card className="bg-[#1a1b26] border-[#2a2b36] border border-white/5 hover:border-white/10 transition-all">
                                <CardHeader>
                                    <CardTitle className="text-white">Statistics</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {/* Ideal Weight Range */}
                                        <div className="bg-white/5 rounded-lg p-4">
                                            <p className="text-gray-400 text-sm mb-1">Ideal Weight Range</p>
                                            <p className="text-lg font-bold text-green-400">
                                                {idealWeight.min} – {idealWeight.max} kg
                                            </p>
                                            <p className="text-gray-500 text-xs mt-1">
                                                Based on BMI 18.5–24.9
                                            </p>
                                        </div>

                                        {/* Current Weight Status */}
                                        <div className="bg-white/5 rounded-lg p-4">
                                            <p className="text-gray-400 text-sm mb-1">Current Weight</p>
                                            <p className="text-lg font-bold text-white">{data.weight} kg</p>
                                            {data.weight > idealWeight.max && (
                                                <p className="text-yellow-400 text-xs mt-1">
                                                    -{(data.weight - idealWeight.max).toFixed(1)} kg to ideal range
                                                </p>
                                            )}
                                            {data.weight < idealWeight.min && (
                                                <p className="text-blue-400 text-xs mt-1">
                                                    +{(idealWeight.min - data.weight).toFixed(1)} kg to ideal range
                                                </p>
                                            )}
                                            {data.weight >= idealWeight.min && data.weight <= idealWeight.max && (
                                                <p className="text-green-400 text-xs mt-1">
                                                    Within ideal range ✓
                                                </p>
                                            )}
                                        </div>

                                        {/* Record Date */}
                                        <div className="bg-white/5 rounded-lg p-4">
                                            <p className="text-gray-400 text-sm mb-1 flex items-center gap-2">
                                                <Calendar className="w-4 h-4" />
                                                Record Date
                                            </p>
                                            <p className="text-sm font-semibold text-white">
                                                {format(new Date(data.record_date), 'MMM d, yyyy')}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}

export default HealthProfilePage
