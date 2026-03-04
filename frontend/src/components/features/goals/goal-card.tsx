'use client'

import { Goal } from '@/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MoreVertical, Calendar, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'

interface GoalCardProps {
    goal: Goal
}

export function GoalCard({ goal }: GoalCardProps) {
    const progressPercentage = goal.target_value
        ? (goal.current_value / goal.target_value) * 100
        : 0

    const priorityColors = {
        high: 'bg-red-500/10 text-red-500 border-red-500/20',
        medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        low: 'bg-green-500/10 text-green-500 border-green-500/20',
    }

    return (
        <Card className="group hover:border-primary/50 transition-all duration-200 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg mb-1 truncate">{goal.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                            {goal.description}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Progress */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                            {Math.round(progressPercentage)}%
                        </span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{goal.current_value} {goal.unit}</span>
                        <span>{goal.target_value} {goal.unit}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className={priorityColors[goal.priority]}>
                            {goal.priority}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                            {goal.category}
                        </Badge>
                    </div>

                    {goal.target_date && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(goal.target_date), 'MMM dd')}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}