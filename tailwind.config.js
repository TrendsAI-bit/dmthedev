/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
        comic: ['Comic Neue', 'Comic Sans MS', 'cursive'],
      },
      animation: {
        'wobble': 'wobble 0.5s ease-in-out infinite',
        'bounce-light': 'bounce 0.5s ease infinite',
      },
      keyframes: {
        wobble: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(1deg)' },
          '75%': { transform: 'rotate(-1deg)' },
        },
      },
      borderRadius: {
        'bubble': '15px',
      },
      boxShadow: {
        'cartoon': '3px 3px 0 #333333',
        'cartoon-hover': '5px 5px 0 #333333',
      },
      borderWidth: {
        '3': '3px',
      }
    },
  },
  plugins: [],
} 