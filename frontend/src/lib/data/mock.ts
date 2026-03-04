
import { ProgressLog } from '@/types'

export const mockProgressLogs: ProgressLog[] = [
    {
        id: 1,
        goal_id: 1,
        value_logged: 5,
        notes: "Great session today!",
        mood: "good",
        energy_level: 8,
        log_date: "2024-02-15T10:00:00Z",
        created_at: "2024-02-15T10:00:00Z"
    },
    {
        id: 2,
        goal_id: 1,
        value_logged: 3,
        notes: "Felt a bit tired but pushed through.",
        mood: "neutral",
        energy_level: 5,
        log_date: "2024-02-16T14:30:00Z",
        created_at: "2024-02-16T14:30:00Z"
    },
    {
        id: 3,
        goal_id: 2,
        value_logged: 10,
        notes: "Finished the chapter.",
        mood: "great",
        energy_level: 9,
        log_date: "2024-02-17T09:00:00Z",
        created_at: "2024-02-17T09:00:00Z"
    }
]

export const mockMilestones = [
    {
        id: 1,
        name: "Complete Module 1",
        target_date: "2024-03-01",
        completed: true,
        progress: 100
    },
    {
        id: 2,
        name: "Build prototype",
        target_date: "2024-03-15",
        completed: false,
        progress: 60
    },
    {
        id: 3,
        name: "User testing",
        target_date: "2024-04-01",
        completed: false,
        progress: 0
    }
]
