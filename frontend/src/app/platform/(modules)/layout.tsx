import { Sidebar } from '@/components/layouts/sidebar'
import { Header } from '@/components/layouts/header'

export default function ModulesLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="dark min-h-screen">
            <Sidebar />
            <div className="ml-64 flex flex-col">
                <Header />
                <main className="flex-1 bg-background">
                    {children}
                </main>
            </div>
        </div>
    )
}