// Run with: node web/guide.test.js
const assert = require('node:assert');
const { parseData, getDecks, buildPivot, unbalanced } = require('./guide.js');

const matrix = [
  'md\tsb\tExample\tStasis\tElves\t\tGoblins',
  '1\t2\tAbeyance\t2\t\t\t-1',
  '4\t\tSwords to Plowshares\t-4',
  '\t4\tMeddling Mage\t+2*\t\t\t1',
  '\t\tTotal\t0\t\t0',
].join('\n');

const records = parseData(matrix);
assert.deepStrictEqual(getDecks(records), ['Example']);

const pivot = buildPivot(records, 'Example');
assert.deepStrictEqual(pivot.faces, [['Stasis', 'Elves'], ['Goblins']]);
assert.deepStrictEqual(pivot.cards, ['1 Abeyance', '4 Swords to Plowshares', '2 Abeyance', '4 Meddling Mage']);
assert.strictEqual(pivot.firstSideboard, 2);
assert.deepStrictEqual(pivot.data.Stasis, {
  '2 Abeyance': '+2', '4 Swords to Plowshares': '-4', '4 Meddling Mage': '+2*',
});
assert.deepStrictEqual(pivot.data.Goblins, { '1 Abeyance': '-1', '4 Meddling Mage': '+1' });

assert.deepStrictEqual(unbalanced(records, 'Example'), []);
assert.deepStrictEqual(unbalanced(parseData('md\tsb\tX\tElves\tAluren\n4\t\tIsland\t-1\t+1'), 'X'), ['Aluren +1']);

const long = parseData('deck\topponent\tcard\tmaindeck\tdelta\nDnT\tDelver\tPath\t0\t+1');
assert.deepStrictEqual(buildPivot(long, 'DnT').cards, ['Path']);

console.log('ok');
