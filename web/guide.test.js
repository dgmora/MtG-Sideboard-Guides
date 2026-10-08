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
assert.deepStrictEqual(getDecks(records), ['Example (1/2)', 'Example (2/2)']);

const stasis = buildPivot(records, 'Example (1/2)');
assert.deepStrictEqual(stasis.cards, ['4 Swords to Plowshares', '2 Abeyance', '4 Meddling Mage']);
assert.deepStrictEqual(stasis.decks, ['Stasis', 'Elves']);
assert.strictEqual(stasis.firstSideboard, 1);
assert.deepStrictEqual(stasis.data.Stasis, {
  '2 Abeyance': '+2', '4 Swords to Plowshares': '-4', '4 Meddling Mage': '+2*',
});
assert.deepStrictEqual(buildPivot(records, 'Example (2/2)').cards, ['1 Abeyance', '4 Meddling Mage']);

assert.deepStrictEqual(unbalanced(records, 'Example (1/2)'), []);
assert.deepStrictEqual(unbalanced(parseData('md\tsb\tX\tElves\n4\t\tIsland\t-1'), 'X'), ['Elves -1']);

const long = parseData('deck\topponent\tcard\tmaindeck\tdelta\nDnT\tDelver\tPath\t0\t+1');
assert.deepStrictEqual(buildPivot(long, 'DnT').cards, ['Path']);

console.log('ok');
