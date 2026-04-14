import { Goal } from '@/types'
import { mockGoals, delay } from './mock-data'

// Когда бэкенд будет готов, заменишь на реальные fetch запросы
export const goalsApi = {
   // Получить все цели
   getAll: async (): Promise<Goal[]> => {
      await delay(500) // имитация сетевой задержки
      return mockGoals
   },

   // Получить одну цель
   getById: async (id: string): Promise<Goal | null> => {
      await delay(300)
      return mockGoals.find(goal => goal.id === id) || null
   },

   // Создать цель
   create: async (data: Omit<Goal, 'id' | 'created_at' | 'updated_at'>): Promise<Goal> => {
      await delay(500)
      const newGoal: Goal = {
         ...data,
         id: Math.random().toString(36).substr(2, 9),
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString(),
      }
      mockGoals.push(newGoal)
      return newGoal
   },

   // Обновить цель
   update: async (id: string, data: Partial<Goal>): Promise<Goal> => {
      await delay(500)
      const index = mockGoals.findIndex(g => g.id === id)
      if (index === -1) throw new Error('Goal not found')

      mockGoals[index] = {
         ...mockGoals[index],
         ...data,
         updated_at: new Date().toISOString(),
      }
      return mockGoals[index]
   },

   // Удалить цель
   delete: async (id: string): Promise<void> => {
      await delay(500)
      const index = mockGoals.findIndex(g => g.id === id)
      if (index === -1) throw new Error('Goal not found')
      mockGoals.splice(index, 1)
   },
}