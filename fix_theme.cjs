const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('src');
files.forEach(file => {
    const original = fs.readFileSync(file, 'utf8');
    let content = original;
    
    // Backgrounds
    content = content.replace(/\bbg-slate-950\b/g, 'bg-slate-50 dark:bg-slate-950');
    content = content.replace(/\bbg-slate-900\b/g, 'bg-white dark:bg-slate-900');
    content = content.replace(/\bbg-slate-800\b/g, 'bg-slate-100 dark:bg-slate-800');
    
    // Borders
    content = content.replace(/\bborder-slate-800\b/g, 'border-slate-200 dark:border-slate-800');
    content = content.replace(/\bborder-slate-700\b/g, 'border-slate-300 dark:border-slate-700');
    
    // Text
    content = content.replace(/\btext-slate-200\b/g, 'text-slate-800 dark:text-slate-200');
    content = content.replace(/\btext-slate-300\b/g, 'text-slate-700 dark:text-slate-300');
    content = content.replace(/\btext-slate-400\b/g, 'text-slate-500 dark:text-slate-400');
    
    // Fix double darks
    content = content.replace(/dark:bg-slate-50 dark:bg-slate-950/g, 'dark:bg-slate-950');
    content = content.replace(/dark:bg-white dark:bg-slate-900/g, 'dark:bg-slate-900');
    content = content.replace(/dark:bg-slate-100 dark:bg-slate-800/g, 'dark:bg-slate-800');
    content = content.replace(/dark:border-slate-200 dark:border-slate-800/g, 'dark:border-slate-800');
    content = content.replace(/dark:border-slate-300 dark:border-slate-700/g, 'dark:border-slate-700');
    content = content.replace(/dark:text-slate-800 dark:text-slate-200/g, 'dark:text-slate-200');
    content = content.replace(/dark:text-slate-700 dark:text-slate-300/g, 'dark:text-slate-300');
    content = content.replace(/dark:text-slate-500 dark:text-slate-400/g, 'dark:text-slate-400');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated', file);
    }
});
