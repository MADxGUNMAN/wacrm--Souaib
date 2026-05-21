const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  const colors = ['violet', 'amber', 'red', 'blue', 'emerald', 'green', 'indigo', 'cyan', 'rose', 'orange', 'yellow', 'slate', 'gray', 'zinc', 'neutral', 'stone'];
  
  colors.forEach(color => {
    // Text light -> dark
    content = content.replace(new RegExp(`\\btext-${color}-200\\b`, 'g'), `text-${color}-800`);
    content = content.replace(new RegExp(`\\btext-${color}-300\\b`, 'g'), `text-${color}-700`);
    content = content.replace(new RegExp(`\\btext-${color}-400\\b`, 'g'), `text-${color}-600`);
    content = content.replace(new RegExp(`\\btext-${color}-100\\/80\\b`, 'g'), `text-${color}-700`);
    
    // Background dark -> light
    content = content.replace(new RegExp(`\\bbg-${color}-950\\/40\\b`, 'g'), `bg-${color}-50`);
    content = content.replace(new RegExp(`\\bbg-${color}-950\\/10\\b`, 'g'), `bg-${color}-50`);
    content = content.replace(new RegExp(`\\bbg-${color}-950\\b`, 'g'), `bg-${color}-50`);
    content = content.replace(new RegExp(`\\bbg-${color}-900\\b`, 'g'), `bg-${color}-100`);
    content = content.replace(new RegExp(`\\bhover:bg-${color}-950\\/40\\b`, 'g'), `hover:bg-${color}-50`);
    
    // Borders dark -> light
    content = content.replace(new RegExp(`\\bborder-${color}-900\\b`, 'g'), `border-${color}-200`);
    content = content.replace(new RegExp(`\\bborder-${color}-800\\b`, 'g'), `border-${color}-200`);
    content = content.replace(new RegExp(`\\bborder-${color}-600\\/40\\b`, 'g'), `border-${color}-200`);
    content = content.replace(new RegExp(`\\bborder-${color}-500\\/30\\b`, 'g'), `border-${color}-200`);
    
    // data-active specific (like tabs)
    content = content.replace(new RegExp(`data-active:text-${color}-400`, 'g'), `data-active:text-${color}-700`);
  });

  // Fix specific structural issues
  content = content.replace(/\bbg-card\/40\b/g, 'bg-card shadow-sm');
  content = content.replace(/\bbg-card\/60\b/g, 'bg-muted');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated contrast: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));
console.log('Contrast replace Done.');
