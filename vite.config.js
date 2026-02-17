import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Replace base with your exact GitHub repo name
  base: '/Task-Manager-Kanban-style/',
})
