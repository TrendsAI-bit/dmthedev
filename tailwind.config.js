/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#87CEEB',    // Sky Blue
        secondary: '#E6E6FA',  // Soft Purple
        accent: '#FFFACD',     // Light Yellow
        'text-primary': '#333333',
        'text-secondary': '#666666',
      },
      fontFamily: {
        'comic': ['Comic Neue', 'sans-serif'],
      },
      animation: {
        'wiggle': 'wiggle 1s ease-in-out infinite',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-5deg)' },
          '75%': { transform: 'rotate(5deg)' },
        }
      },
      borderRadius: {
        'bubble': '15px',
      },
      boxShadow: {
        'cartoon': '3px 3px 0 #333333',
        'cartoon-hover': '5px 5px 0 #333333',
      }
    },
  },
  plugins: [],
} 