#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

try {
  const coveragePath = path.join(__dirname, '..', 'coverage', 'index.html');
  const html = fs.readFileSync(coveragePath, 'utf8');

  // Extract detailed file coverage table
  const tableMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (tableMatch) {
    console.log('\n===============================| Coverage report |===============================');
    console.log('File                   | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s');
    console.log('------------------------|---------|----------|---------|---------|-------------------');

    const rows = tableMatch[1].match(/<tr>([\s\S]*?)<\/tr>/g) || [];
    rows.forEach(row => {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      if (cells.length >= 9) {
        const filePath = cells[0].replace(/<[^>]*>/g, '').trim();
        const stmts = cells[2].replace(/<[^>]*>/g, '').trim();
        const branches = cells[4].replace(/<[^>]*>/g, '').trim();
        const funcs = cells[6].replace(/<[^>]*>/g, '').trim();
        const lines = cells[8].replace(/<[^>]*>/g, '').trim();

        console.log(`${filePath.padEnd(22)} | ${stmts.padStart(7)} | ${branches.padStart(8)} | ${funcs.padStart(7)} | ${lines.padStart(7)} |`);
      }
    });
    console.log('------------------------|---------|----------|---------|---------|-------------------');
  }

  // Extract overall summary
  const match = html.match(/<span class="strong">[\d.]+% <\/span>\s*<span class="quiet">\w+<\/span>/g);
  if (match) {
    const summaryData = {};
    match.forEach(m => {
      const [, percent, type] = m.match(/<span class="strong">([\d.]+)% <\/span>\s*<span class="quiet">(\w+)<\/span>/);
      summaryData[type] = percent;
    });

    console.log(`All files              | ${summaryData.Statements.padStart(7)} | ${summaryData.Branches.padStart(8)} | ${summaryData.Functions.padStart(7)} | ${summaryData.Lines.padStart(7)} |`);
    console.log('===============================| Coverage report |===============================\n');
  }
} catch (error) {
  console.error('Error reading coverage report:', error.message);
}