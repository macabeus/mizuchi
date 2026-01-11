import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, '**/*.{js,ts,jsx,tsx}')],
  theme: {
    extend: {},
  },
  plugins: [],
};
