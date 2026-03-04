'use client'


import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter, usePathname } from "next/navigation"
import { motion } from "framer-motion"
import {
    ArrowLeft, Bell, Search, User
} from 'lucide-react'

export function Header() {
    const router = useRouter()
    const location = usePathname()

    console.log(location, "location");


    return (
        // <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
        //     {/* Search */}
        //     <div className="flex-1 max-w-md">
        //         <div className="relative">
        //             <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        //             <Input
        //                 type="search"
        //                 placeholder="Search goals, tasks, expenses..."
        //                 className="pl-10 bg-muted/50"
        //             />
        //         </div>
        //     </div>

        //     {/* Actions */}
        //     <div className="flex items-center gap-2">
        //         <Button variant="ghost" size="icon" className="relative">
        //             <Bell className="h-5 w-5" />
        //             <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
        //         </Button>
        //         <Button variant="ghost" size="icon">
        //             <User className="h-5 w-5" />
        //         </Button>
        //     </div>
        // </header>
        <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 bg-[#1a1b26]/80 backdrop-blur-xl border-b border-[#2a2b36]"
        >
            <div className="container mx-auto px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                    AA life tracking
                    {/* Left - Back Button */}
                    {/* Left - Back Button */}
                    {(location !== '/platform' && location !== '/') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.back()}
                            className="gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                    )}

                    {/* Center - Search */}
                    {/* <div className="flex-1 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder={`Search ${category.title.toLowerCase()}...`}
                                className="pl-10 bg-[#0f0f1a] border-[#2a2b36]"
                            />
                        </div>
                    </div> */}

                    {/* Right - Notifications & Profile */}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/profile')}
                        >
                            <User className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </motion.header>
    )
}