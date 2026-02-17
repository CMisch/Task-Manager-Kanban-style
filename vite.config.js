import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Replace 'cybersec-task-manager' with your exact GitHub repo name
  base: '/cybersec-task-manager/',
})
