/** ألوان وخطوط AuraFolio نفسها حرفياً */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['IBM Plex Sans Arabic', 'sans-serif'], display: ['Cairo', 'sans-serif'] },
      colors: { cosmic: '#F8F6F1', coral: '#A87350', amberx: '#C4A47E', card: '#FFFFFF' }
    }
  },
  plugins: []
};
