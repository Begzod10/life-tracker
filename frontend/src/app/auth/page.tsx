'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { useLogin, useRegister } from '@/lib/hooks/use-auth'
import {
    Mail, Lock, User, Eye, EyeOff, Loader2, ArrowRight, Sparkles
} from 'lucide-react'

type AuthMode = 'login' | 'register'
type formDataType = {
    name: string,
    surname: string,
    email: string,
    password: string,
    confirmPassword: string
}

export default function AuthPage() {
    const register = useRegister()
    const login = useLogin()
    const router = useRouter()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    const [mode, setMode] = useState<AuthMode>('login')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isOAuthLoading, setIsOAuthLoading] = useState<'google' | 'yandex' | 'github' | null>(null)

    const [formData, setFormData] = useState<formDataType>({
        name: '',
        surname: '',
        email: '',
        password: '',
        confirmPassword: '',
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (mode === "register") {
            if (formData.password !== formData.confirmPassword) {
                setError('Пароли не совпадают')
                return
            }
            if (formData.password.length < 8) {
                setError('Пароль должен быть минимум 8 символов')
                return
            }
            if (!formData.name || !formData.surname) {
                setError('Заполните все поля')
                return
            }

            register.mutate(
                {
                    name: `${formData.name} ${formData.surname}`,
                    email: formData.email,
                    password: formData.password,
                    confirm_password: formData.confirmPassword,
                    timezone
                },
                {
                    onSuccess: () => {
                        // Backend set httpOnly auth cookies on the response.
                        router.push('/platform')
                    },
                    onError: (err: any) => {
                        setError(err.message)
                    }
                }
            )

        } else {
            login.mutate(
                {
                    email: formData.email,
                    password: formData.password
                },
                {
                    onSuccess: () => {
                        router.push('/platform')
                    },
                    onError: (err: any) => {
                        setError(err.message)
                    }
                }
            )
        }
    }

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setError(null)
    }

    // OAuth логин через NextAuth
    const handleOAuthLogin = async (provider: 'google' | 'yandex' | 'github') => {
        try {
            setIsOAuthLoading(provider)
            setError(null)

            // NextAuth signIn с callback URL
            const result = await signIn(provider, {
                callbackUrl: '/platform',
                redirect: true,
            })

            if (result?.error) {
                setError('OAuth authentication failed')
                setIsOAuthLoading(null)
            }
        } catch (error) {
            console.error('OAuth error:', error)
            setError('OAuth authentication failed')
            setIsOAuthLoading(null)
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-md"
            >
                <Card className="bg-[#1a1b26] border-[#2a2b36] overflow-hidden">
                    {/* Header */}
                    <div className="relative bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
                        <div className="absolute inset-0 bg-black/20" />
                        <div className="relative">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2 }}
                                className="w-12 h-12 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-3"
                            >
                                <Sparkles className="w-6 h-6 text-white" />
                            </motion.div>
                            <h1 className="text-2xl font-bold text-white mb-1">
                                {mode === 'login' ? 'Welcome Back' : 'Get Started'}
                            </h1>
                            <p className="text-white/80 text-sm">
                                {mode === 'login'
                                    ? 'Sign in to continue'
                                    : 'Create your account'}
                            </p>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="p-6">
                        {/* Mode Switcher */}
                        <div className="flex gap-2 mb-4 bg-[#0f0f1a] rounded-lg p-1">
                            <button
                                onClick={() => setMode('login')}
                                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'login'
                                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Login
                            </button>
                            <button
                                onClick={() => setMode('register')}
                                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'register'
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Register
                            </button>
                        </div>

                        {/* Alert Messages */}
                        <AnimatePresence mode="wait">
                            {error && (
                                <div className="mb-4">
                                    <Alert
                                        variant="error"
                                        message={error}
                                        onClose={() => setError(null)}
                                    />
                                </div>
                            )}
                        </AnimatePresence>

                        {/* OAuth кнопки - компактный размер */}
                        <div className="mb-4">
                            <div className="grid grid-cols-3 gap-2">
                                {/* Google */}
                                <button
                                    onClick={() => handleOAuthLogin('google')}
                                    disabled={!!isOAuthLoading}
                                    className="flex items-center justify-center p-2 bg-[#0f0f1a] border border-[#2a2b36] rounded-lg hover:border-[#3a3b46] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Sign in with Google"
                                >
                                    {isOAuthLoading === "google" ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    ) : (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                    )}
                                </button>

                                {/* Yandex */}
                                <button
                                    onClick={() => handleOAuthLogin('yandex')}
                                    disabled={!!isOAuthLoading}
                                    className="flex items-center justify-center p-2 bg-[#0f0f1a] border border-[#2a2b36] rounded-lg hover:border-[#3a3b46] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Sign in with Yandex"
                                >
                                    {isOAuthLoading === "yandex" ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    ) : (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                                            <path fill="#FF0000" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.923 16.615h-2.308l-2.077-5.077h-.077v5.077H10.23V7.385h2.77c1.923 0 3.23.923 3.23 2.692 0 1.154-.615 2-.154 2.539l2.846 4z" />
                                            <path fill="#FF0000" d="M13.308 11.231c.846 0 1.385-.539 1.385-1.308 0-.846-.539-1.307-1.385-1.307h-.846v2.615h.846z" />
                                        </svg>
                                    )}
                                </button>

                                {/* GitHub */}
                                <button
                                    onClick={() => handleOAuthLogin('github')}
                                    disabled={!!isOAuthLoading}
                                    className="flex items-center justify-center p-2 bg-[#0f0f1a] border border-[#2a2b36] rounded-lg hover:border-[#3a3b46] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Sign in with GitHub"
                                >
                                    {isOAuthLoading === "github" ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    ) : (
                                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* Разделитель */}
                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-[#2a2b36]"></div>
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="px-2 bg-[#1a1b26] text-gray-500">or continue with email</span>
                                </div>
                            </div>
                        </div>

                        {/* Email/Password Form */}
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <AnimatePresence mode="wait">
                                {mode === 'register' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-3"
                                    >
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="name" className="text-gray-300 text-sm">
                                                    First Name
                                                </Label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                    <Input
                                                        id="name"
                                                        type="text"
                                                        value={formData.name}
                                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                                        placeholder="Иван"
                                                        className="pl-10 bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="surname" className="text-gray-300 text-sm">
                                                    Last Name
                                                </Label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                    <Input
                                                        id="surname"
                                                        type="text"
                                                        value={formData.surname}
                                                        onChange={(e) => handleInputChange('surname', e.target.value)}
                                                        placeholder="Петров"
                                                        className="pl-10 bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-gray-300 text-sm">
                                    Email
                                </Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        placeholder="you@example.com"
                                        className="pl-10 bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-gray-300 text-sm">
                                    Password
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => handleInputChange('password', e.target.value)}
                                        placeholder="••••••••"
                                        className="pl-10 pr-10 bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                {mode === 'register' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-1.5"
                                    >
                                        <Label htmlFor="confirmPassword" className="text-gray-300 text-sm">
                                            Confirm Password
                                        </Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                            <Input
                                                id="confirmPassword"
                                                type={showPassword ? 'text' : 'password'}
                                                value={formData.confirmPassword}
                                                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                                                placeholder="••••••••"
                                                className="pl-10 bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500"
                                                required
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {mode === 'login' && (
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        Forgot password?
                                    </button>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={register.isPending || login.isPending}
                                className={`w-full ${mode === 'login'
                                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                                    : 'bg-gradient-to-r from-purple-500 to-pink-500'
                                    } hover:opacity-90 transition-opacity`}
                            >
                                {(register.isPending || login.isPending) ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        {mode === 'login' ? 'Sign In' : 'Create Account'}
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </form>

                        {/* Footer */}
                        <div className="mt-4 text-center">
                            <p className="text-sm text-gray-400">
                                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                                <button
                                    onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                >
                                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                                </button>
                            </p>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </div>
    )
}

// 'use client'

// import { motion, AnimatePresence } from 'framer-motion'
// import { useState } from 'react'
// import { useRouter } from 'next/navigation'
// import { Button } from '@/components/ui/button'
// import { Input } from '@/components/ui/input'
// import { Label } from '@/components/ui/label'
// import {
//     Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle,
//     CheckCircle2, ArrowRight, Sparkles, ShieldCheck
// } from 'lucide-react'

// type AuthMode = 'login' | 'register'

// export default function AuthPage() {
//     const [activeMode, setActiveMode] = useState<AuthMode>('login')
//     const [showPassword, setShowPassword] = useState(false)
//     const [isLoading, setIsLoading] = useState(false)
//     const [error, setError] = useState<string | null>(null)
//     const [success, setSuccess] = useState<string | null>(null)
//     const router = useRouter()

//     const [loginData, setLoginData] = useState({
//         email: '',
//         password: '',
//     })

//     const [registerData, setRegisterData] = useState({
//         name: '',
//         surname: '',
//         email: '',
//         password: '',
//         confirmPassword: '',
//     })

//     const handleSubmit = async (mode: AuthMode) => {
//         setError(null)
//         setSuccess(null)
//         setIsLoading(true)

//         try {
//             if (mode === 'register') {
//                 if (registerData.password !== registerData.confirmPassword) {
//                     throw new Error('Пароли не совпадают')
//                 }
//                 if (registerData.password.length < 8) {
//                     throw new Error('Пароль должен быть минимум 8 символов')
//                 }

//                 const response = await fetch('/api/auth/register', {
//                     method: 'POST',
//                     headers: { 'Content-Type': 'application/json' },
//                     body: JSON.stringify({
//                         name: registerData.name,
//                         surname: registerData.surname,
//                         email: registerData.email,
//                         password: registerData.password,
//                     }),
//                 })

//                 if (!response.ok) {
//                     const data = await response.json()
//                     throw new Error(data.error || 'Ошибка регистрации')
//                 }

//                 setSuccess('Регистрация успешна! Перенаправление...')
//                 setTimeout(() => router.push('/platform'), 1500)
//             } else {
//                 const response = await fetch('/api/auth/login', {
//                     method: 'POST',
//                     headers: { 'Content-Type': 'application/json' },
//                     body: JSON.stringify({
//                         email: loginData.email,
//                         password: loginData.password,
//                     }),
//                 })

//                 if (!response.ok) {
//                     const data = await response.json()
//                     throw new Error(data.error || 'Ошибка входа')
//                 }

//                 setSuccess('Вход выполнен! Перенаправление...')
//                 setTimeout(() => router.push('/platform'), 1500)
//             }
//         } catch (err: any) {
//             setError(err.message)
//         } finally {
//             setIsLoading(false)
//         }
//     }

//     return (
//         <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden flex items-center justify-center p-4">
//             {/* Animated Background - Optimized */}
//             <div className="absolute inset-0 overflow-hidden pointer-events-none">
//                 {/* Gradient Orbs - Reduced opacity for better performance */}
//                 <motion.div
//                     animate={{
//                         scale: [1, 1.2, 1],
//                         opacity: [0.02, 0.03, 0.02],
//                     }}
//                     transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
//                     className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"
//                     style={{ willChange: 'transform, opacity' }}
//                 />
//                 <motion.div
//                     animate={{
//                         scale: [1, 1.3, 1],
//                         opacity: [0.015, 0.025, 0.015],
//                     }}
//                     transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
//                     className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"
//                     style={{ willChange: 'transform, opacity' }}
//                 />

//                 {/* Grid Pattern - Static for better performance */}
//                 <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:50px_50px]" />
//             </div>

//             {/* Alert Messages */}
//             <AnimatePresence>
//                 {(error || success) && (
//                     <motion.div
//                         initial={{ opacity: 0, y: -50 }}
//                         animate={{ opacity: 1, y: 0 }}
//                         exit={{ opacity: 0, y: -50 }}
//                         className="absolute top-8 left-1/2 -translate-x-1/2 z-50"
//                     >
//                         {error && (
//                             <div className="px-6 py-4 bg-red-500/10 backdrop-blur-xl border border-red-500/20 rounded-xl flex items-center gap-3 shadow-2xl">
//                                 <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
//                                 <span className="text-sm text-red-300">{error}</span>
//                             </div>
//                         )}
//                         {success && (
//                             <div className="px-6 py-4 bg-green-500/10 backdrop-blur-xl border border-green-500/20 rounded-xl flex items-center gap-3 shadow-2xl">
//                                 <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
//                                 <span className="text-sm text-green-300">{success}</span>
//                             </div>
//                         )}
//                     </motion.div>
//                 )}
//             </AnimatePresence>

//             {/* Main Container */}
//             <div className="relative w-full max-w-7xl h-[700px]">
//                 {/* Background Glow - Optimized */}
//                 <motion.div
//                     animate={{
//                         background: activeMode === 'login'
//                             ? 'radial-gradient(circle at 35% 50%, rgba(59, 130, 246, 0.12), transparent 50%)'
//                             : 'radial-gradient(circle at 65% 50%, rgba(168, 85, 247, 0.12), transparent 50%)',
//                     }}
//                     transition={{ duration: 0.6 }}
//                     className="absolute inset-0 blur-3xl pointer-events-none"
//                 />

//                 {/* Forms Container */}
//                 <div className="relative w-full h-full flex items-center justify-center">
//                     {/* Login Form - Left Side */}
//                     <motion.div
//                         animate={{
//                             x: activeMode === 'login' ? -200 : -100,
//                             scale: activeMode === 'login' ? 1 : 0.85,
//                             opacity: activeMode === 'login' ? 1 : 0.3,
//                         }}
//                         transition={{
//                             duration: 0.5,
//                             ease: [0.22, 1, 0.36, 1],
//                         }}
//                         onClick={() => setActiveMode('login')}
//                         className="absolute left-1/2 cursor-pointer w-[500px] h-full"
//                         style={{
//                             willChange: 'transform, opacity',
//                             // Clip-path: обрезаем правую часть за линией
//                             clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)',
//                         }}
//                     >
//                         <div
//                             className={`relative w-full h-full bg-[#1a1b26]/50 backdrop-blur-xl border rounded-2xl overflow-hidden transition-all duration-500 ${activeMode === 'login'
//                                     ? 'border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.4)]'
//                                     : 'border-[#2a2b36]/30'
//                                 }`}
//                             style={{
//                                 filter: activeMode === 'login' ? 'blur(0px)' : 'blur(2px)',
//                                 willChange: 'filter',
//                             }}
//                         >
//                             {/* Header */}
//                             <div className={`relative p-8 transition-all duration-500 ${activeMode === 'login'
//                                     ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20'
//                                     : 'bg-[#0f0f1a]/30'
//                                 }`}>
//                                 <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/50">
//                                     <ShieldCheck className="w-7 h-7 text-white" />
//                                 </div>
//                                 <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
//                                 <p className="text-gray-400 text-sm">Sign in to your account</p>
//                             </div>

//                             {/* Form */}
//                             <form
//                                 onSubmit={(e) => {
//                                     e.preventDefault()
//                                     handleSubmit('login')
//                                 }}
//                                 className="p-8 space-y-6"
//                             >
//                                 <div className="space-y-2">
//                                     <Label className="text-gray-300">Email</Label>
//                                     <div className="relative">
//                                         <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
//                                         <Input
//                                             type="email"
//                                             value={loginData.email}
//                                             onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
//                                             placeholder="you@example.com"
//                                             className="pl-11 bg-[#0f0f1a] border-[#2a2b36] text-white focus:border-blue-500 transition-colors h-12"
//                                             required
//                                             disabled={activeMode !== 'login'}
//                                         />
//                                     </div>
//                                 </div>

//                                 <div className="space-y-2">
//                                     <Label className="text-gray-300">Password</Label>
//                                     <div className="relative">
//                                         <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
//                                         <Input
//                                             type={showPassword ? 'text' : 'password'}
//                                             value={loginData.password}
//                                             onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
//                                             placeholder="••••••••"
//                                             className="pl-11 pr-11 bg-[#0f0f1a] border-[#2a2b36] text-white focus:border-blue-500 transition-colors h-12"
//                                             required
//                                             disabled={activeMode !== 'login'}
//                                         />
//                                         <button
//                                             type="button"
//                                             onClick={() => setShowPassword(!showPassword)}
//                                             className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
//                                         >
//                                             {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
//                                         </button>
//                                     </div>
//                                 </div>

//                                 <div className="flex justify-end">
//                                     <button
//                                         type="button"
//                                         className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
//                                     >
//                                         Forgot password?
//                                     </button>
//                                 </div>

//                                 <Button
//                                     type="submit"
//                                     disabled={isLoading || activeMode !== 'login'}
//                                     className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 h-12 text-base font-semibold shadow-lg shadow-blue-500/50 transition-all"
//                                 >
//                                     {isLoading && activeMode === 'login' ? (
//                                         <>
//                                             <Loader2 className="w-5 h-5 mr-2 animate-spin" />
//                                             Signing in...
//                                         </>
//                                     ) : (
//                                         <>
//                                             Sign In
//                                             <ArrowRight className="w-5 h-5 ml-2" />
//                                         </>
//                                     )}
//                                 </Button>
//                             </form>
//                         </div>
//                     </motion.div>

//                     {/* Central Divider Line "/" */}
//                     <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-1 z-20 pointer-events-none">
//                         <motion.div
//                             animate={{
//                                 background: activeMode === 'login'
//                                     ? 'linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.6), transparent)'
//                                     : 'linear-gradient(to bottom, transparent, rgba(168, 85, 247, 0.6), transparent)',
//                             }}
//                             transition={{ duration: 0.6 }}
//                             className="absolute inset-0 rotate-12 origin-center"
//                             style={{
//                                 boxShadow: activeMode === 'login'
//                                     ? '0 0 40px rgba(59, 130, 246, 0.8)'
//                                     : '0 0 40px rgba(168, 85, 247, 0.8)',
//                             }}
//                         />
//                     </div>

//                     {/* Register Form - Right Side */}
//                     <motion.div
//                         animate={{
//                             x: activeMode === 'register' ? 200 : 100,
//                             scale: activeMode === 'register' ? 1 : 0.85,
//                             opacity: activeMode === 'register' ? 1 : 0.3,
//                         }}
//                         transition={{
//                             duration: 0.5,
//                             ease: [0.22, 1, 0.36, 1],
//                         }}
//                         onClick={() => setActiveMode('register')}
//                         className="absolute right-1/2 cursor-pointer w-[500px] h-full"
//                         style={{
//                             willChange: 'transform, opacity',
//                             // Clip-path: обрезаем левую часть за линией
//                             clipPath: 'polygon(8% 0, 100% 0, 100% 100%, 0 100%)',
//                         }}
//                     >
//                         <div
//                             className={`relative w-full h-full bg-[#1a1b26]/50 backdrop-blur-xl border rounded-2xl overflow-hidden transition-all duration-500 ${activeMode === 'register'
//                                     ? 'border-purple-500/50 shadow-[0_0_40px_rgba(168,85,247,0.4)]'
//                                     : 'border-[#2a2b36]/30'
//                                 }`}
//                             style={{
//                                 filter: activeMode === 'register' ? 'blur(0px)' : 'blur(2px)',
//                                 willChange: 'filter',
//                             }}
//                         >
//                             {/* Header */}
//                             <div className={`relative p-8 transition-all duration-500 ${activeMode === 'register'
//                                     ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20'
//                                     : 'bg-[#0f0f1a]/30'
//                                 }`}>
//                                 <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-purple-500/50">
//                                     <Sparkles className="w-7 h-7 text-white" />
//                                 </div>
//                                 <h2 className="text-3xl font-bold text-white mb-2">Get Started</h2>
//                                 <p className="text-gray-400 text-sm">Create your account</p>
//                             </div>

//                             {/* Form */}
//                             <form
//                                 onSubmit={(e) => {
//                                     e.preventDefault()
//                                     handleSubmit('register')
//                                 }}
//                                 className="p-8 space-y-5"
//                             >
//                                 <div className="grid grid-cols-2 gap-4">
//                                     <div className="space-y-2">
//                                         <Label className="text-gray-300">First Name</Label>
//                                         <div className="relative">
//                                             <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
//                                             <Input
//                                                 type="text"
//                                                 value={registerData.name}
//                                                 onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
//                                                 placeholder="Иван"
//                                                 className="pl-10 bg-[#0f0f1a] border-[#2a2b36] text-white focus:border-purple-500 transition-colors"
//                                                 required
//                                                 disabled={activeMode !== 'register'}
//                                             />
//                                         </div>
//                                     </div>
//                                     <div className="space-y-2">
//                                         <Label className="text-gray-300">Last Name</Label>
//                                         <div className="relative">
//                                             <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
//                                             <Input
//                                                 type="text"
//                                                 value={registerData.surname}
//                                                 onChange={(e) => setRegisterData({ ...registerData, surname: e.target.value })}
//                                                 placeholder="Петров"
//                                                 className="pl-10 bg-[#0f0f1a] border-[#2a2b36] text-white focus:border-purple-500 transition-colors"
//                                                 required
//                                                 disabled={activeMode !== 'register'}
//                                             />
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <div className="space-y-2">
//                                     <Label className="text-gray-300">Email</Label>
//                                     <div className="relative">
//                                         <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
//                                         <Input
//                                             type="email"
//                                             value={registerData.email}
//                                             onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
//                                             placeholder="you@example.com"
//                                             className="pl-11 bg-[#0f0f1a] border-[#2a2b36] text-white focus:border-purple-500 transition-colors h-12"
//                                             required
//                                             disabled={activeMode !== 'register'}
//                                         />
//                                     </div>
//                                 </div>

//                                 <div className="space-y-2">
//                                     <Label className="text-gray-300">Password</Label>
//                                     <div className="relative">
//                                         <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
//                                         <Input
//                                             type={showPassword ? 'text' : 'password'}
//                                             value={registerData.password}
//                                             onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
//                                             placeholder="••••••••"
//                                             className="pl-11 pr-11 bg-[#0f0f1a] border-[#2a2b36] text-white focus:border-purple-500 transition-colors h-12"
//                                             required
//                                             disabled={activeMode !== 'register'}
//                                         />
//                                         <button
//                                             type="button"
//                                             onClick={() => setShowPassword(!showPassword)}
//                                             className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
//                                         >
//                                             {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
//                                         </button>
//                                     </div>
//                                     <p className="text-xs text-gray-500">Минимум 8 символов</p>
//                                 </div>

//                                 <div className="space-y-2">
//                                     <Label className="text-gray-300">Confirm Password</Label>
//                                     <div className="relative">
//                                         <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
//                                         <Input
//                                             type={showPassword ? 'text' : 'password'}
//                                             value={registerData.confirmPassword}
//                                             onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
//                                             placeholder="••••••••"
//                                             className="pl-11 bg-[#0f0f1a] border-[#2a2b36] text-white focus:border-purple-500 transition-colors h-12"
//                                             required
//                                             disabled={activeMode !== 'register'}
//                                         />
//                                     </div>
//                                 </div>

//                                 <Button
//                                     type="submit"
//                                     disabled={isLoading || activeMode !== 'register'}
//                                     className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 h-12 text-base font-semibold shadow-lg shadow-purple-500/50 transition-all"
//                                 >
//                                     {isLoading && activeMode === 'register' ? (
//                                         <>
//                                             <Loader2 className="w-5 h-5 mr-2 animate-spin" />
//                                             Creating account...
//                                         </>
//                                     ) : (
//                                         <>
//                                             Create Account
//                                             <ArrowRight className="w-5 h-5 ml-2" />
//                                         </>
//                                     )}
//                                 </Button>
//                             </form>
//                         </div>
//                     </motion.div>
//                 </div>

//                 {/* Bottom Text */}
//                 <motion.p
//                     initial={{ opacity: 0 }}
//                     animate={{ opacity: 1 }}
//                     transition={{ delay: 0.5 }}
//                     className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center text-sm text-gray-500 whitespace-nowrap"
//                 >
//                     By continuing, you agree to our{' '}
//                     <a href="#" className="text-gray-400 hover:text-gray-300 underline transition-colors">Terms</a>
//                     {' '}and{' '}
//                     <a href="#" className="text-gray-400 hover:text-gray-300 underline transition-colors">Privacy Policy</a>
//                 </motion.p>
//             </div>
//         </div>
//     )
// }

// "use client"

// export default function page() {
//     return <div></div>
// }
