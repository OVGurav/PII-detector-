import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Setting the base explicitly helps Vite resolve the path to index.html correctly.
  // This is the key fix for the 404 error you were encountering.
  base: '/', 
});
